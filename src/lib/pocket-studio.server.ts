// Obsidian Pocket — Studio/Cinematic server-only helpers.
//
// Kept out of `pocket-studio.functions.ts` so that module stays a thin
// server-function wrapper (module scope = imports + exported server fns).

import { settleOperation } from "@/lib/credit-gate.server";
import type { EntitlementResult } from "@/lib/credit-gate.server";
import { makeUsage, estimateUsdForCall, MIN_CALL_COST_USD } from "@/lib/usage-record";
import { LruCache } from "@/lib/pocket-hardening";
import type { PocketChatOutcome, PocketProviderName } from "@/lib/pocket-studio-call";
import { POCKET_CRITIQUE_POLICY_VERSION } from "@/lib/pocket-prompt";
import { POCKET_CONCEPT_VERSION } from "@/lib/pocket-concept";

export const POCKET_CACHE_MAX = 64;

/** Bounded parsed decisions only — never raw HTML or prompts. */
export const planCache = new LruCache<{ rawJson: string; model: string }>(POCKET_CACHE_MAX);
export const critiqueCache = new LruCache<{ critiqueJson: string; model: string }>(POCKET_CACHE_MAX);

export const CONCEPT_POLICY_VERSION = `pocket-concept-v${POCKET_CONCEPT_VERSION}`;
export const CRITIQUE_POLICY_VERSION = POCKET_CRITIQUE_POLICY_VERSION;

export const PLAN_TIMEOUT_MS = 30_000;
export const CRITIQUE_TIMEOUT_MS = 45_000;
export const PLAN_MAX_OUTPUT_TOKENS = 2_000;
export const CRITIQUE_MAX_OUTPUT_TOKENS = 4_000;
export const CRITIQUE_HTML_LIMIT = 240_000;

export const PLAN_SYSTEM = "You return STRICT JSON only. No prose. No markdown fences.";

type PocketOperation = "enhance_prompt" | "generate_html";

export async function settlePocketSuccess(
  ent: EntitlementResult,
  operation: PocketOperation,
  provider: PocketProviderName,
  model: string,
  usage: Extract<PocketChatOutcome, { ok: true }>["usage"],
): Promise<void> {
  const est = estimateUsdForCall({
    model: usage?.model ?? model,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    providerUsed: true,
  });
  await settleOperation(ent, {
    kind: "success",
    usage: makeUsage({
      provider,
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

/**
 * `no_provider` is valid ONLY when nothing reached the wire. Anything that
 * dispatched settles as failed-with-usage at the per-call minimum.
 */
export async function settlePocketFailure(
  ent: EntitlementResult,
  operation: PocketOperation,
  outcome: Extract<PocketChatOutcome, { ok: false }>,
): Promise<void> {
  if (!outcome.providerStarted) {
    await settleOperation(ent, { kind: "no_provider", errorCode: outcome.errorCode });
    return;
  }
  await settleOperation(ent, {
    kind: "failed_with_usage",
    errorCode: outcome.errorCode,
    usage: makeUsage({
      provider: outcome.provider ?? "lovable",
      model: outcome.wireModel,
      operation,
      providerUsed: true,
      status: "failed",
      estimatedCostUsd: MIN_CALL_COST_USD,
      costBasis: "minimum",
      errorCode: outcome.errorCode,
      meta: { phase: "pocket_attempt" },
    }),
  });
}

/** Settlement must never mask the caller's real result. */
export async function settleQuietly(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    /* the pending row stays recoverable; never throw over the result */
  }
}
