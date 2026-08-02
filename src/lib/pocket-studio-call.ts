// Obsidian Pocket — Studio/Cinematic provider call core.
//
// HARD CONTRACT: exactly ONE physical provider dispatch per invocation.
// There is no key fan-out and no cross-provider retry inside a single call,
// so one logical planning/critique call can never become several paid
// attempts. Route selection happens BEFORE dispatch; whatever route is
// chosen is the only one that runs.

import { aiFetch } from "./ai-fetch";
import { readGuarded } from "./upstream-guard";
import { isRouteLLMModel, stripRouteLLMPrefix } from "./models";
import { routellmKeys, lovableEquivalentFor } from "./routellm-keys";
import { parseUsageFromChatJson } from "./usage-record";

export type PocketProviderName = "routellm" | "lovable";

export interface PocketRoute {
  provider: PocketProviderName;
  url: string;
  key: string;
  /** The id actually put on the wire. Reported as the served model. */
  wireModel: string;
  breakerKey: string;
}

export interface PocketRouteEnv {
  routellmKey?: string | undefined;
  lovableKey?: string | undefined;
}

export const LOVABLE_CHAT_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const ROUTELLM_CHAT_URL = "https://routellm.abacus.ai/v1/chat/completions";

/**
 * Pick exactly one route. A RouteLLM model uses the highest-priority
 * configured RouteLLM key; if no RouteLLM key exists at all we degrade —
 * before any dispatch — to the Lovable-equivalent model. We never dispatch
 * to RouteLLM and then dispatch again to Lovable.
 */
export function chooseRoute(model: string, env: PocketRouteEnv, tag: string): PocketRoute | null {
  if (isRouteLLMModel(model)) {
    if (env.routellmKey) {
      const wireModel = stripRouteLLMPrefix(model);
      return {
        provider: "routellm",
        url: ROUTELLM_CHAT_URL,
        key: env.routellmKey,
        wireModel,
        breakerKey: `routellm/${tag}:${wireModel}`,
      };
    }
    if (env.lovableKey) {
      const wireModel = lovableEquivalentFor(model);
      return {
        provider: "lovable",
        url: LOVABLE_CHAT_URL,
        key: env.lovableKey,
        wireModel,
        breakerKey: `lovable/${tag}:${wireModel}`,
      };
    }
    return null;
  }
  if (!env.lovableKey) return null;
  return {
    provider: "lovable",
    url: LOVABLE_CHAT_URL,
    key: env.lovableKey,
    wireModel: model,
    breakerKey: `lovable/${tag}:${model}`,
  };
}

/** Read the configured environment. Server-only; called inside handlers. */
export function pocketRouteEnv(): PocketRouteEnv {
  return {
    routellmKey: routellmKeys()[0],
    lovableKey: process.env.LOVABLE_API_KEY,
  };
}

/**
 * Bounded, JSON-only chat body. Output-token field follows what the target
 * model documents: OpenAI ids on the Lovable gateway take
 * `max_completion_tokens`, everything else takes `max_tokens`.
 */
export function buildChatBody(input: {
  route: PocketRoute;
  system: string;
  user: string;
  maxOutputTokens: number;
}): Record<string, unknown> {
  const { route } = input;
  const isOpenAi = route.provider === "lovable" && route.wireModel.startsWith("openai/");
  const cap = Math.max(256, Math.min(8192, Math.floor(input.maxOutputTokens)));
  return {
    model: route.wireModel,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    response_format: { type: "json_object" },
    ...(isOpenAi ? { max_completion_tokens: cap } : { max_tokens: cap }),
    ...(route.provider === "lovable" && route.wireModel.startsWith("openai/gpt-5.6")
      ? { reasoning_effort: "none" as const }
      : {}),
  };
}

export type PocketChatOutcome =
  | {
      ok: true;
      text: string;
      provider: PocketProviderName;
      wireModel: string;
      usage: ReturnType<typeof parseUsageFromChatJson>;
      /** Always true on success — a dispatch happened. */
      providerStarted: true;
    }
  | {
      ok: false;
      /** false ONLY when nothing was ever put on the wire. */
      providerStarted: boolean;
      provider: PocketProviderName | null;
      wireModel: string | null;
      errorCode: string;
    };

export interface PocketChatInput {
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  timeoutMs: number;
  requestId: string;
  /** "pocket_plan" | "pocket_critique" — used for breaker keys. */
  tag: string;
  env?: PocketRouteEnv;
  /** Test seam: keeps self-tests from tripping the shared circuit breaker. */
  breakerKeyOverride?: string;
}

/**
 * ONE physical attempt. Any failure — no route, transport error, timeout,
 * non-OK status, guarded-read rejection, malformed JSON — is reported with an
 * explicit `providerStarted` flag so the caller can settle correctly.
 */
export async function runSinglePocketChat(input: PocketChatInput): Promise<PocketChatOutcome> {
  const env = input.env ?? pocketRouteEnv();
  const route = chooseRoute(input.model, env, input.tag);
  if (!route) {
    return {
      ok: false,
      providerStarted: false,
      provider: null,
      wireModel: null,
      errorCode: "ai_unauthorized",
    };
  }

  const body = buildChatBody({
    route,
    system: input.system,
    user: input.user,
    maxOutputTokens: input.maxOutputTokens,
  });

  let providerStarted = false;
  try {
    providerStarted = true; // the dispatch begins on the next statement
    const res = await aiFetch(
      route.url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${route.key}` },
        body: JSON.stringify(body),
      },
      {
        breakerKey: input.breakerKeyOverride ?? route.breakerKey,
        stage: "generate",
        requestId: input.requestId,
        maxAttempts: 1,
        attemptTimeoutMs: input.timeoutMs,
        totalTimeoutMs: input.timeoutMs,
      },
    );

    const guarded = await readGuarded(res.response, { expected: "application/json" });
    if (!guarded.ok) {
      return {
        ok: false,
        providerStarted,
        provider: route.provider,
        wireModel: route.wireModel,
        errorCode: `upstream_${guarded.reason}`,
      };
    }

    let json: { choices?: Array<{ message?: { content?: string } }> };
    try {
      json = JSON.parse(guarded.text) as typeof json;
    } catch {
      return {
        ok: false,
        providerStarted,
        provider: route.provider,
        wireModel: route.wireModel,
        errorCode: "upstream_malformed_json",
      };
    }

    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      return {
        ok: false,
        providerStarted,
        provider: route.provider,
        wireModel: route.wireModel,
        errorCode: "upstream_empty_choice",
      };
    }

    return {
      ok: true,
      text,
      provider: route.provider,
      wireModel: route.wireModel,
      usage: parseUsageFromChatJson(json),
      providerStarted: true,
    };
  } catch (err) {
    const code =
      typeof err === "object" &&
      err &&
      "code" in err &&
      typeof (err as { code?: unknown }).code === "string"
        ? (err as { code: string }).code
        : "ai_internal";
    return {
      ok: false,
      providerStarted,
      provider: route.provider,
      wireModel: route.wireModel,
      errorCode: code,
    };
  }
}

/** Tolerant JSON extraction for models that wrap output in fences. */
export function parseJsonLoose(text: string): unknown {
  const cleaned = text
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
