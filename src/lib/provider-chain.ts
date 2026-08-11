/**
 * Shared provider fallback chain — Google, then healthy RouteLLM/Abacus
 * keys, then the Lovable gateway equivalent.
 *
 * Extracted so every non-streaming JSON-completion route (Patch, QA) can
 * share the exact same chain-building and advance-on-failure semantics
 * instead of each route re-implementing (and re-breaking) its own copy.
 * generate.ts's streaming path has its own inline version of this same
 * logic — its attempt shape and error handling are different enough
 * (SSE streams vs single JSON responses, per-attempt budget slicing tied
 * to a stream-reading loop) that forcing it through this same generic
 * runner would cost more in indirection than it saves. Both are meant to
 * implement the same three rules; if you change one, check the other:
 *
 *   1. Advance to the next attempt on ANY failure except a genuine client
 *      cancel — not just errors that look like billing exhaustion.
 *   2. A RouteLLM key is marked dead ONLY when the failure is genuine
 *      billing exhaustion, regardless of how liberally the chain advances.
 *   3. When every attempt fails, say so honestly: distinguish "every
 *      provider failed" from "credits ran out at one provider," and name
 *      the provider that failed last.
 */

import {
  healthyRouteLLMKeys,
  markRouteLLMKeyDead,
  isRouteLLMKeyExhausted,
  lovableEquivalentFor,
} from "./routellm-keys";
import { googleAiKey, googleModelFor, GOOGLE_OPENAI_CHAT_URL } from "./google-ai";
import { isRouteLLMModel, stripRouteLLMPrefix } from "./models";

export const ROUTELLM_CHAT_URL = "https://routellm.abacus.ai/v1/chat/completions";
export const LOVABLE_CHAT_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Floor for a single provider attempt inside a chain. Below this, a
 *  legitimate-but-slow provider gets timed out before it can possibly
 *  respond, which defeats the point of trying it at all. */
export const ATTEMPT_BUDGET_FLOOR_MS = 4_000;

/**
 * Per-attempt timeout for one entry in a provider fallback chain: whatever
 * is left of the overall deadline, divided across the attempts still to
 * come, never below a floor (below which a legitimate-but-slow provider
 * gets timed out before it can possibly respond) and never above the
 * caller's own budget ceiling for this call.
 *
 * Used by generate.ts's streaming attempt loop, which has its own inline
 * chain (different shape from runProviderChain — see the module comment
 * above) but shares this exact formula so both places slice a deadline
 * the same way. Pure and side-effect-free, so it's unit-testable without
 * a real clock or a real HTTP call.
 */
export function computeAttemptBudgetMs(
  remainingMs: number,
  attemptsLeft: number,
  floorMs: number,
  capMs: number,
): number {
  const safeAttemptsLeft = Math.max(1, attemptsLeft);
  return Math.max(floorMs, Math.min(capMs, Math.floor(remainingMs / safeAttemptsLeft)));
}

export interface ChainAttempt {
  key: string;
  url: string;
  wireModel: string;
  label: string;
  /** True for the Google direct-key attempt. */
  google?: boolean;
  /** True for a RouteLLM/Abacus attempt (the only kind ever marked dead). */
  routed?: boolean;
}

/**
 * Build the standard attempt order for a given requested model:
 * Google direct (if a key is configured) → every currently-healthy
 * RouteLLM key, in priority order → the Lovable gateway with the closest
 * equivalent model (if a Lovable key is available).
 *
 * `lovableApiKey` is passed in rather than read from the environment here
 * so callers that already resolved it once don't do it twice.
 */
/**
 * Map any requested model to the strongest sensible ChatLLM/RouteLLM wire
 * model, so a non-RouteLLM pick can still be served ChatLLM-first without
 * dropping quality tier.
 */
export function routellmEquivalentFor(model: string): string {
  if (isRouteLLMModel(model)) return stripRouteLLMPrefix(model);
  const m = model.toLowerCase();
  if (m.includes("nano") || m.includes("lite") || m.includes("haiku")) return "claude-haiku-4-5-20251001";
  if (m.includes("pro") || m.includes("gpt-5.5") || m.includes("sol") || m.includes("opus")) {
    return "claude-opus-4-1-20250805";
  }
  return "claude-sonnet-4-5-20250929";
}

/** The OpenAI-family model used for the second (OpenAI) link in the chain. */
export function openaiEquivalentFor(model: string): string {
  if (model.startsWith("openai/")) return model;
  const m = model.toLowerCase();
  if (m.includes("nano") || m.includes("lite") || m.includes("haiku")) return "openai/gpt-5.4-mini";
  if (m.includes("pro") || m.includes("gpt-5.5") || m.includes("sol") || m.includes("opus")) return "openai/gpt-5.5";
  return "openai/gpt-5.4";
}

export function buildProviderChain(model: string, lovableApiKey: string | undefined): ChainAttempt[] {
  const attempts: ChainAttempt[] = [];

  // 1. ChatLLM (Abacus RouteLLM) — every healthy key, in priority order.
  const rlWire = routellmEquivalentFor(model);
  for (const k of healthyRouteLLMKeys()) {
    attempts.push({ key: k, url: ROUTELLM_CHAT_URL, wireModel: rlWire, label: `routellm:${rlWire}`, routed: true });
  }

  // 2. OpenAI (via the Lovable gateway).
  if (lovableApiKey) {
    const oa = openaiEquivalentFor(model);
    attempts.push({ key: lovableApiKey, url: LOVABLE_CHAT_URL, wireModel: oa, label: `lovable:${oa}` });
    // Keep the originally requested gateway model reachable when it differs.
    const requested = isRouteLLMModel(model) ? lovableEquivalentFor(model) : model;
    if (requested !== oa && !requested.startsWith("google/")) {
      attempts.push({ key: lovableApiKey, url: LOVABLE_CHAT_URL, wireModel: requested, label: `lovable:${requested}` });
    }
  }

  // 3. Gemini (direct Google key) as the final safety net.
  const gKey = googleAiKey();
  if (gKey) {
    const gm = googleModelFor(model);
    attempts.push({ key: gKey, url: GOOGLE_OPENAI_CHAT_URL, wireModel: gm, label: `google:${gm}`, google: true });
  }

  return attempts;
}


/** A per-attempt outcome the caller reports back to the chain runner. */
export type ChainAttemptResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown; isClientCancel?: boolean };

export interface ChainOutcome<T> {
  ok: boolean;
  value: T | null;
  usedAttempt: ChainAttempt | null;
  /** The error from the last attempt tried, whether or not it was fatal. */
  lastError: unknown;
  /** True when the chain stopped because the requested model has no configured attempts at all. */
  noAttempts: boolean;
}

/**
 * Run a chain of attempts, advancing on any failure except a client
 * cancel, marking RouteLLM keys dead only for genuine billing exhaustion.
 *
 * `callOnce` performs the actual provider call for one attempt and reports
 * back a `ChainAttemptResult` — this function owns none of the HTTP or
 * parsing logic, only the advance/mark-dead/give-up decisions, so it's
 * fully unit-testable without a network.
 */
export async function runProviderChain<T>(
  attempts: ChainAttempt[],
  callOnce: (attempt: ChainAttempt) => Promise<ChainAttemptResult<T>>,
): Promise<ChainOutcome<T>> {
  if (attempts.length === 0) {
    return { ok: false, value: null, usedAttempt: null, lastError: null, noAttempts: true };
  }

  let lastError: unknown = null;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const result = await callOnce(attempt);
    if (result.ok) {
      return { ok: true, value: result.value, usedAttempt: attempt, lastError: null, noAttempts: false };
    }

    lastError = result.error;

    // A key is only ever marked dead for genuine billing exhaustion — this
    // is what the 30-minute dead-key skip in healthyRouteLLMKeys() is keyed
    // on, and it must stay accurate no matter how liberally the chain
    // advances below.
    const routeLLMDead = !!attempt.routed && isRouteLLMKeyExhausted(result.error);
    if (routeLLMDead) markRouteLLMKeyDead(attempt.key);

    const isLast = i === attempts.length - 1;
    if (result.isClientCancel) {
      // Stop immediately — the caller isn't waiting on this request
      // anymore, so burning through the rest of the chain wastes real
      // provider calls for nobody.
      return { ok: false, value: null, usedAttempt: null, lastError, noAttempts: false };
    }
    if (isLast) {
      return { ok: false, value: null, usedAttempt: null, lastError, noAttempts: false };
    }
    // Any other failure — timeout, 5xx, malformed body, circuit breaker,
    // billing exhaustion — advances to the next attempt.
  }

  return { ok: false, value: null, usedAttempt: null, lastError, noAttempts: false };
}

/**
 * Build the honest final-failure message: names the last provider tried
 * and distinguishes "every provider failed" from "credits ran out at one
 * provider" rather than surfacing a generic timeout either way.
 */
export function chainFailureMessage(
  outcome: ChainOutcome<unknown>,
  attempts: ChainAttempt[],
  detail: string,
): { billing: boolean; message: string } {
  const last = attempts[attempts.length - 1];
  const wasRouteLLM = !!last?.routed;
  const billing = wasRouteLLM && isRouteLLMKeyExhausted(outcome.lastError);
  if (billing) {
    return {
      billing: true,
      message: `AI provider credits exhausted at ${last.label}. Top up the ChatLLM account or use a Google/Lovable model.`,
    };
  }
  const prefix = attempts.length > 1 ? "Every configured AI provider failed" : "AI provider failed";
  const label = last?.label ?? "unknown provider";
  return { billing: false, message: `${prefix} — last error at ${label}: ${detail}` };
}
