// Rich version metadata attached to every saved build. Callers persist this
// alongside the HTML snapshot; the shape is intentionally serializable.

import type { Classification } from "./task-classifier";
import type { Tier } from "./model-router";
import type { ValidationReport } from "./validation";

export type ExecutionStrategy =
  | "deterministic"
  | "ai-patch"
  | "full-generation"
  | "advisory";

export type ContextTier = "A-minimal" | "B-expanded" | "C-full-sections" | "D-full-document" | "none";

export type RepairAttempt = {
  kind: "deterministic" | "ai";
  fixes: string[];
  usedCredits: boolean;
};

export type VersionMetadata = {
  id: string;
  createdAt: number;
  name?: string;
  protected?: boolean;
  request: string;
  taskType: Classification["type"];
  strategy: ExecutionStrategy;
  model: string;
  tier: Tier;
  estimatedCostUsd?: number;
  durationMs: number;
  contextTier: ContextTier;
  contextChars: number;
  patchOperations?: number;
  charsAdded: number;
  charsRemoved: number;
  changed: boolean;
  validation: {
    status: ValidationReport["status"];
    summary: string;
    blocking: number;
    warnings: number;
    info: number;
  };
  repairAttempts: RepairAttempt[];
};

export function summarizeMetadata(m: VersionMetadata): string {
  const bits = [
    `${m.strategy}`,
    m.patchOperations ? `${m.patchOperations} ops` : null,
    `${m.charsAdded}+/${m.charsRemoved}-`,
    `${m.durationMs}ms`,
    m.contextTier !== "none" ? `ctx ${m.contextTier}` : null,
    m.validation.status,
    m.repairAttempts.length ? `repair×${m.repairAttempts.length}` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}
