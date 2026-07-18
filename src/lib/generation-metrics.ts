// Structured result returned from the classify → execute → validate pipeline.
import type { Classification, ExecutionPath, Strategy, TaskType } from "./task-classifier";
import type { ValidationReport } from "./validation";

export type GenerationMetrics = {
  taskType: TaskType;
  executionPath: ExecutionPath;
  strategy: Strategy;
  usedAi: boolean;
  model: string | null;
  durationMs: number;
  summary: string;
  validation: ValidationReport;
  documentChanged: boolean;
  costEstimate: "none" | "low" | "advanced";
  reason: string;
  // Phase 2 telemetry
  patchOperationCount: number;
  patchOperationTypes: string[];
  patchOperationSummaries: string[];
  charactersAdded: number;
  charactersRemoved: number;
  fallbackUsed: boolean;
};

export function costEstimateFor(path: ExecutionPath, usedAi: boolean): GenerationMetrics["costEstimate"] {
  if (!usedAi) return "none";
  return path === "advanced-ai" ? "advanced" : "low";
}

export function metricsFromClassification(
  c: Classification,
  args: {
    usedAi: boolean;
    model: string | null;
    durationMs: number;
    summary: string;
    validation: ValidationReport;
    documentChanged: boolean;
    strategy?: Strategy;
    patchOperationCount?: number;
    patchOperationTypes?: string[];
    patchOperationSummaries?: string[];
    charactersAdded?: number;
    charactersRemoved?: number;
    fallbackUsed?: boolean;
  },
): GenerationMetrics {
  return {
    taskType: c.taskType,
    executionPath: c.executionPath,
    strategy: args.strategy ?? c.strategy,
    usedAi: args.usedAi,
    model: args.usedAi ? args.model : null,
    durationMs: args.durationMs,
    summary: args.summary,
    validation: args.validation,
    documentChanged: args.documentChanged,
    costEstimate: costEstimateFor(c.executionPath, args.usedAi),
    reason: c.reason,
    patchOperationCount: args.patchOperationCount ?? 0,
    patchOperationTypes: args.patchOperationTypes ?? [],
    patchOperationSummaries: args.patchOperationSummaries ?? [],
    charactersAdded: args.charactersAdded ?? 0,
    charactersRemoved: args.charactersRemoved ?? 0,
    fallbackUsed: args.fallbackUsed ?? false,
  };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
