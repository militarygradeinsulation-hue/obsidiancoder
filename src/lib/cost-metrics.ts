// Live cost/model metrics accumulated per session. Estimates are explicitly
// labelled — no real billing. Pure aggregation.

import type { GenerationMetrics } from "./generation-metrics";

export type CostSnapshot = {
  deterministicEdits: number;
  aiCalls: number;
  fullGenerationsAvoided: number;
  contextCharsAvoided: number;
  estimatedTokens: number;      // rough: chars/4
  estimatedCostUsd: number;     // rough per-tier multiplier
  patchSuccesses: number;
  repairs: number;
  rollbacks: number;
  restores: number;
  totalDurationMs: number;
  byModel: Record<string, number>;
};

export const EMPTY_COST: CostSnapshot = {
  deterministicEdits: 0, aiCalls: 0, fullGenerationsAvoided: 0, contextCharsAvoided: 0,
  estimatedTokens: 0, estimatedCostUsd: 0, patchSuccesses: 0, repairs: 0, rollbacks: 0, restores: 0,
  totalDurationMs: 0, byModel: {},
};

// Rough $/1K tokens estimates by tier — deliberately conservative.
const TIER_PRICE_PER_KTOK: Record<GenerationMetrics["costEstimate"], number> = {
  none: 0, low: 0.0005, advanced: 0.005,
};

export function foldMetrics(prev: CostSnapshot, m: GenerationMetrics, opts?: { contextCharsAvoided?: number }): CostSnapshot {
  const tok = Math.round(((m.charactersAdded ?? 0) + (m.charactersRemoved ?? 0)) / 4);
  const usd = (tok / 1000) * TIER_PRICE_PER_KTOK[m.costEstimate];
  const byModel = { ...prev.byModel };
  if (m.model) byModel[m.model] = (byModel[m.model] || 0) + 1;
  return {
    ...prev,
    deterministicEdits: prev.deterministicEdits + (m.usedAi ? 0 : (m.documentChanged ? 1 : 0)),
    aiCalls: prev.aiCalls + (m.usedAi ? 1 : 0),
    fullGenerationsAvoided: prev.fullGenerationsAvoided + (m.strategy === "ai-patch" || m.strategy === "deterministic" ? 1 : 0),
    contextCharsAvoided: prev.contextCharsAvoided + (opts?.contextCharsAvoided ?? 0),
    estimatedTokens: prev.estimatedTokens + tok,
    estimatedCostUsd: +(prev.estimatedCostUsd + usd).toFixed(4),
    patchSuccesses: prev.patchSuccesses + ((m.patchOperationCount ?? 0) > 0 && m.documentChanged ? 1 : 0),
    repairs: prev.repairs + (m.fallbackUsed ? 1 : 0),
    rollbacks: prev.rollbacks + (m.documentChanged ? 0 : (m.strategy === "ai-patch" ? 1 : 0)),
    restores: prev.restores,
    totalDurationMs: prev.totalDurationMs + (m.durationMs ?? 0),
    byModel,
  };
}

export function recordRestore(prev: CostSnapshot): CostSnapshot {
  return { ...prev, restores: prev.restores + 1 };
}

export function formatCostSnapshot(c: CostSnapshot): string {
  return `${c.aiCalls} AI · ${c.deterministicEdits} deterministic · ~$${c.estimatedCostUsd.toFixed(4)} est · ${c.restores} restores`;
}
