// Rich version metadata attached to every saved build. Callers persist this
// alongside the HTML snapshot; the shape is intentionally serializable.

import type { Classification } from "./task-classifier";
import type { Tier } from "./model-router";
import type { ValidationReport } from "./validation";
import type { EngineeringSummary } from "./chief-engineer";

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
  taskType: Classification["taskType"];
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
  /**
   * Per-stage server timings from the OBS_TIMING stream trailer, preserved so
   * a build can be timed retrospectively after the terminal buffer is gone.
   * Keys: compact_ms, image_ms, first_byte_ms, stream_ms, total_ms, plus any
   * additional markers the route emits.
   */
  stageTimings?: Record<string, number | string | boolean>;
  /** Deterministic quality-contract repairs applied at commit time. */
  contractFixes?: string[];
  /** Font families the document names that could not be loaded. */
  unloadableFonts?: string[];
  // ---- Core 4.2: operation provenance (all optional; older versions omit) ----
  operationId?: string;
  requestedModel?: string;      // what the picker/router asked for
  actualModel?: string;         // what the server actually served (post-fallback)
  providerChain?: string[];     // e.g. ["leonardo","gemini"] or ["openai/gpt-5.5-fallback"]
  imageProviders?: string;      // raw X-Obs-Image-Providers header if any
  imageCount?: number;
  runtimeErrors?: number;
  rollbackId?: string;          // the version id this build can be rolled back TO
  learningSignals?: string[];   // signalsUsed from the RoutingDecision
  engineering?: EngineeringSummary;  // Chief Engineer multi-agent review
  // ---- Phase B: QA provenance (all optional; older versions omit) ----
  /** Deterministic assessedHash of the FINAL committed artifact. */
  qaAssessedHash?: string;
  /** State from QaSessionStatus after commit. */
  qaState?: "stale" | "checking" | "clean" | "repaired" | "claude-repaired" | "blocked";
  qaSource?: "deterministic" | "claude" | "cache" | "publish" | "runtime" | "-";
  qaDeterministicRepairCount?: number;
  qaClaudeInvoked?: boolean;
  qaClaudeFromCache?: boolean;
  qaModel?: string | null;
  qaParityOk?: boolean;
  qaBlockers?: string[];
  qaPolicyVersion?: string;
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
    m.providerChain && m.providerChain.length ? `via ${m.providerChain.join("→")}` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}
