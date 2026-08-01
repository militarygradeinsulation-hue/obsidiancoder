// Obsidian Pocket — Studio/Cinematic provider calls.
//
// Two metered server functions:
//   • planPocketConcepts  — at most ONE compact concept-planning call
//   • critiquePocketBuild — at most ONE critique+repair call (Cinematic only)
//
// Both go through the SAME entitlement/usage accounting as every other paid
// operation. There is no unmetered backdoor. Both are cached so a retry or a
// repeated publish can never spend twice.

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requirePaidOperation, settleOperation } from "@/lib/credit-gate.server";
import type { EntitlementResult } from "@/lib/credit-gate.server";
import { creditsRequiredEnvelope } from "@/lib/credit-gate";
import { makeUsage, estimateUsdForCall, parseUsageFromChatJson } from "@/lib/usage-record";
import { newRequestId } from "@/lib/ai-errors";
import { isRouteLLMModel, stripRouteLLMPrefix } from "@/lib/models";
import { routellmKeys, lovableEquivalentFor } from "@/lib/routellm-keys";
import { POCKET_CRITIQUE_RUBRIC, POCKET_CRITIQUE_POLICY_VERSION, parseCritique } from "@/lib/pocket-prompt";

/* ------------------------- bounded caches ------------------------- */

const CACHE_MAX = 64;
function makeCache<T>() {
  const map = new Map<string, T>();
  return {
    get: (k: string) => map.get(k),
    set: (k: string, v: T) => {
      if (map.size >= CACHE_MAX) map.delete(map.keys().next().value as string);
      map.set(k, v);
    },
  };
}
const planCache = makeCache<{ rawJson: string; model: string }>();
const critiqueCache = makeCache<string>();

/* --------------------------- chat helper --------------------------- */

type ChatResult = { text: string; model: string; usage: ReturnType<typeof parseUsageFromChatJson> };

async function chatOnce(input: {
  model: string;
  system: string;
  user: string;
  maxCompletionTokens?: number;
}): Promise<ChatResult> {
  const body = (model: string) => ({
    model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    ...(input.model.startsWith("openai/gpt-5.6") ? { reasoning_effort: "none" as const } : {}),
  });

  // RouteLLM (Abacus) path — try each configured key, then fall back to the
  // Lovable-gateway equivalent so a dead key never breaks the flow.
  if (isRouteLLMModel(input.model)) {
    const upstream = stripRouteLLMPrefix(input.model);
    for (const key of routellmKeys()) {
      try {
        const res = await fetch("https://routellm.abacus.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify(body(upstream)),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = json.choices?.[0]?.message?.content?.trim() ?? "";
        if (text) return { text, model: input.model, usage: parseUsageFromChatJson(json) };
      } catch { /* try the next key */ }
    }
    return chatOnce({ ...input, model: lovableEquivalentFor(input.model) });
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI is not configured yet.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body(input.model)),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("Rate limit reached.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    throw new Error(`Provider failed (${res.status}).`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return {
    text: json.choices?.[0]?.message?.content?.trim() ?? "",
    model: input.model,
    usage: parseUsageFromChatJson(json),
  };
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}

async function settleSuccess(
  ent: EntitlementResult,
  operation: "enhance_prompt" | "generate_html",
  model: string,
  usage: ReturnType<typeof parseUsageFromChatJson>,
) {
  const est = estimateUsdForCall({
    model: usage?.model ?? model,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    providerUsed: true,
  });
  await settleOperation(ent, {
    kind: "success",
    usage: makeUsage({
      provider: "lovable",
      model: usage?.model ?? model,
      operation,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      actualCostUsd: null,
      estimatedCostUsd: est.usd,
      costBasis: est.basis,
      providerUsed: true,
      status: "committed",
    }),
  });
}

/* ------------------------- concept planning ------------------------- */

const planInput = z.object({
  cacheKey: z.string().min(1).max(200),
  model: z.string().min(1).max(120),
  plannerPrompt: z.string().min(1).max(6000),
});

export type PlanConceptsResult =
  | { ok: true; rawJson: string; model: string; cached: boolean }
  | { ok: false; reason: "provider_failed" }
  | { paywall: ReturnType<typeof creditsRequiredEnvelope> };

export const planPocketConcepts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => planInput.parse(d))
  .handler(async ({ data }): Promise<PlanConceptsResult> => {
    const cached = planCache.get(data.cacheKey);
    if (cached) return { ok: true, rawJson: cached.rawJson, model: cached.model, cached: true };

    const requestId = newRequestId();
    const ent = await requirePaidOperation(getRequest(), "enhance_prompt", requestId);
    if (ent.kind === "denied" && ent.denial) return { paywall: ent.denial };

    let providerUsed = false;
    try {
      const out = await chatOnce({
        model: data.model,
        system: "You return STRICT JSON only. No prose. No markdown fences.",
        user: data.plannerPrompt,
      });
      providerUsed = true;
      const raw = parseJsonLoose(out.text);
      await settleSuccess(ent, "enhance_prompt", out.model, out.usage);
      if (!raw) return { ok: false, reason: "provider_failed" };
      const rawJson = JSON.stringify(raw).slice(0, 40_000);
      planCache.set(data.cacheKey, { rawJson, model: out.model });
      return { ok: true, rawJson, model: out.model, cached: false };
    } catch {
      if (!providerUsed) {
        try { await settleOperation(ent, { kind: "no_provider", errorCode: "ai_internal" }); } catch { /* settled */ }
      }
      // Planner failure is never fatal — the caller falls back to the
      // deterministic three-concept plan.
      return { ok: false, reason: "provider_failed" };
    }
  });

/* ---------------------------- critique ---------------------------- */

const critiqueInput = z.object({
  cacheKey: z.string().min(1).max(200),
  model: z.string().min(1).max(120),
  html: z.string().min(1).max(400_000),
  dnaSummary: z.string().max(3000),
});

export type CritiqueResult =
  | { ok: true; critiqueJson: string; model: string; cached: boolean }
  | { ok: false; reason: "provider_failed" }
  | { paywall: ReturnType<typeof creditsRequiredEnvelope> };

export const critiquePocketBuild = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => critiqueInput.parse(d))
  .handler(async ({ data }): Promise<CritiqueResult> => {
    const cached = critiqueCache.get(data.cacheKey);
    if (cached) return { ok: true, critiqueJson: cached, model: "cache", cached: true };

    const requestId = newRequestId();
    const ent = await requirePaidOperation(getRequest(), "enhance_prompt", requestId);
    if (ent.kind === "denied" && ent.denial) return { paywall: ent.denial };

    let providerUsed = false;
    try {
      const out = await chatOnce({
        model: data.model,
        system: POCKET_CRITIQUE_RUBRIC,
        user: `DESIGN DNA:\n${data.dnaSummary}\n\nDOCUMENT:\n${data.html.slice(0, 240_000)}`,
      });
      providerUsed = true;
      await settleSuccess(ent, "enhance_prompt", out.model, out.usage);
      const raw = parseJsonLoose(out.text);
      if (!raw) return { ok: false, reason: "provider_failed" };
      const critique = parseCritique(raw);
      critique.policyVersion = POCKET_CRITIQUE_POLICY_VERSION;
      const critiqueJson = JSON.stringify(critique).slice(0, 120_000);
      critiqueCache.set(data.cacheKey, critiqueJson);
      return { ok: true, critiqueJson, model: out.model, cached: false };
    } catch {
      if (!providerUsed) {
        try { await settleOperation(ent, { kind: "no_provider", errorCode: "ai_internal" }); } catch { /* settled */ }
      }
      return { ok: false, reason: "provider_failed" };
    }
  });
