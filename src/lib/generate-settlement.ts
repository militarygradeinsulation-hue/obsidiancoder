// Pure helpers for /api/generate settlement math. Testable without I/O.
//
// Contract:
//   - Every model request that begins produces a UsageRecord (minimum cost
//     when it fails before token usage returns).
//   - Fallback aggregates first-attempt + fallback-attempt into the same
//     final total.
//   - Failure settlement combines: stream usage + model-attempt usage +
//     image-planning usage + image-generation usage. If ANY provider request
//     started, the outcome is `failed_with_usage`. Only a truly no-provider
//     run refunds.

import type { Operation } from "./credit-gate";
import {
  MIN_CALL_COST_USD,
  estimateUsdForCall,
  makeUsage,
  mergeUsage,
  type UsageRecord,
} from "./usage-record";

export interface StreamUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model?: string;
}

/**
 * A conservative minimum UsageRecord for a model request that began but
 * failed before token usage was returned. Cost basis is "minimum" so we
 * only charge the per-call floor (see MIN_CALL_COST_USD).
 */
export function modelAttemptUsage(args: {
  model: string;
  operation: Operation;
  errorCode?: string;
}): UsageRecord {
  return makeUsage({
    provider: "lovable",
    model: args.model,
    operation: args.operation,
    providerUsed: true,
    status: "failed",
    // Carry the per-call floor explicitly so mergeUsage aggregates it into
    // the failed/fallback total instead of dropping to 0 USD.
    estimatedCostUsd: MIN_CALL_COST_USD,
    costBasis: "minimum",
    errorCode: args.errorCode,
    meta: { phase: "model_attempt" },
  });
}

/**
 * Build the LLM UsageRecord from a streaming snapshot (or a zero-usage
 * placeholder if the stream reported none). Returns null only when the
 * caller has no snapshot AND is failing — in that case model-attempt
 * records already carry the minimum cost.
 */
export function streamLlmUsage(args: {
  snapshot: StreamUsageSnapshot | null;
  model: string;
  operation: Operation;
  status: "committed" | "failed";
  errorCode?: string;
}): UsageRecord | null {
  const s = args.snapshot;
  if (args.status === "failed" && !s) return null;
  const est = estimateUsdForCall({
    model: s?.model ?? args.model,
    inputTokens: s?.inputTokens ?? 0,
    outputTokens: s?.outputTokens ?? 0,
    providerUsed: true,
  });
  return makeUsage({
    provider: "lovable",
    model: s?.model ?? args.model,
    operation: args.operation,
    inputTokens: s?.inputTokens ?? 0,
    outputTokens: s?.outputTokens ?? 0,
    totalTokens: s?.totalTokens ?? 0,
    estimatedCostUsd: est.usd,
    costBasis: est.basis,
    providerUsed: true,
    status: args.status,
    errorCode: args.errorCode,
  });
}

/**
 * Success total: streaming LLM usage + prior failed model attempts (fallback)
 * + image planning + per-image usage. Merged into ONE UsageRecord that we
 * hand to usage_finalize.
 */
export function combineSuccessUsage(args: {
  operation: Operation;
  model: string;
  streamSnapshot: StreamUsageSnapshot | null;
  modelAttempts: UsageRecord[];
  imageUsages: UsageRecord[];
}): UsageRecord {
  const llm = streamLlmUsage({
    snapshot: args.streamSnapshot,
    model: args.model,
    operation: args.operation,
    status: "committed",
  })!;
  const merged = mergeUsage(args.operation, [
    llm,
    ...args.modelAttempts,
    ...args.imageUsages,
  ]);
  // Force committed — mergeUsage may keep "failed" if all attempts failed,
  // but on the success path the LLM record is committed.
  return makeUsage({ ...merged, operation: args.operation, status: "committed" });
}

export type FailureSettlement =
  | { kind: "no_provider"; errorCode?: string }
  | { kind: "failed_with_usage"; usage: UsageRecord; errorCode?: string };

/**
 * Failure total. If ANY provider request began (stream got tokens, a model
 * attempt was recorded, or an image call ran), we owe `failed_with_usage`.
 * Otherwise refund.
 */
export function combineFailureSettlement(args: {
  operation: Operation;
  model: string;
  streamSnapshot: StreamUsageSnapshot | null;
  modelAttempts: UsageRecord[];
  imageUsages: UsageRecord[];
  errorCode?: string;
}): FailureSettlement {
  const anyProvider =
    !!args.streamSnapshot ||
    args.modelAttempts.length > 0 ||
    args.imageUsages.length > 0;
  if (!anyProvider) {
    return { kind: "no_provider", errorCode: args.errorCode };
  }
  const records: UsageRecord[] = [];
  const llm = streamLlmUsage({
    snapshot: args.streamSnapshot,
    model: args.model,
    operation: args.operation,
    status: "failed",
    errorCode: args.errorCode,
  });
  if (llm) records.push(llm);
  records.push(...args.modelAttempts, ...args.imageUsages);
  const merged = mergeUsage(args.operation, records);
  // Force failed — mergeUsage may return "committed" because image usages
  // are committed. On the failure path the overall row is failed.
  const failed = makeUsage({
    ...merged,
    operation: args.operation,
    status: "failed",
    errorCode: args.errorCode ?? merged.errorCode,
  });
  return { kind: "failed_with_usage", usage: failed, errorCode: args.errorCode };
}
