// Performance model — deterministic per-project statistics derived from the
// adaptive ledger. Feeds the adaptive router with local, private evidence.

import type { LedgerEvent } from "./adaptive-ledger";

export interface Bucket {
  attempts: number;
  kept: number;
  restored: number;
  rejected: number;
  validationPassed: number;
  runtimeFailures: number;
  totalDurationMs: number;
  totalCostUsd: number;
}

function empty(): Bucket {
  return { attempts: 0, kept: 0, restored: 0, rejected: 0, validationPassed: 0, runtimeFailures: 0, totalDurationMs: 0, totalCostUsd: 0 };
}

export type PerfKey = string; // `${taskType}|${strategy}|${model}|${contextTier}`

export interface PerformanceModel {
  buckets: Record<PerfKey, Bucket>;
}

function keyOf(e: Pick<LedgerEvent, "taskType" | "strategy" | "model" | "contextTier">): PerfKey {
  return `${e.taskType ?? "any"}|${e.strategy ?? "any"}|${e.model ?? "any"}|${e.contextTier ?? "any"}`;
}

export function buildPerformanceModel(events: LedgerEvent[]): PerformanceModel {
  const buckets: Record<PerfKey, Bucket> = {};
  const seen = new Set<string>(); // dedupe: one attempt per event id
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const isTerminal =
      e.kind === "deterministic-accepted" ||
      e.kind === "patch-accepted" ||
      e.kind === "fullgen-accepted" ||
      e.kind === "change-rejected" ||
      e.kind === "version-restored";
    if (!isTerminal) continue;
    const k = keyOf(e);
    const b = buckets[k] ??= empty();
    b.attempts++;
    if (e.outcome === "kept" || e.kind.endsWith("accepted")) b.kept++;
    if (e.outcome === "restored" || e.kind === "version-restored") b.restored++;
    if (e.outcome === "rejected" || e.kind === "change-rejected") b.rejected++;
    if (e.validationStatus === "passed") b.validationPassed++;
    b.runtimeFailures += e.runtimeErrors ?? 0;
    b.totalDurationMs += e.durationMs ?? 0;
    b.totalCostUsd += e.costUsd ?? 0;
  }
  return { buckets };
}

export interface Score {
  key: PerfKey;
  successRate: number;
  restoreRate: number;
  validationRate: number;
  avgLatencyMs: number;
  avgCostUsd: number;
  attempts: number;
  confidence: number; // 0..1, ramps with attempts
}

export function scoreAll(model: PerformanceModel): Score[] {
  const out: Score[] = [];
  for (const [key, b] of Object.entries(model.buckets)) {
    if (b.attempts === 0) continue;
    out.push({
      key,
      attempts: b.attempts,
      successRate: b.kept / b.attempts,
      restoreRate: b.restored / b.attempts,
      validationRate: b.validationPassed / b.attempts,
      avgLatencyMs: b.totalDurationMs / b.attempts,
      avgCostUsd: b.totalCostUsd / b.attempts,
      confidence: Math.min(1, b.attempts / 6),
    });
  }
  return out.sort((a, b) => b.successRate - a.successRate);
}

export function best(scores: Score[], filter?: (s: Score) => boolean): Score | undefined {
  const eligible = scores.filter((s) => s.confidence >= 0.5 && (!filter || filter(s)));
  return eligible[0];
}
