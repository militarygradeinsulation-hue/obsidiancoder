// Structured result returned from the classify → execute → validate pipeline,
// plus the shape rendered in the UI's "last operation" panel.
import type { Classification, ExecutionPath, TaskType } from "./task-classifier";
import type { ValidationReport } from "./validation";

export type GenerationMetrics = {
  taskType: TaskType;
  executionPath: ExecutionPath;
  usedAi: boolean;
  model: string | null;      // null when no AI was used
  durationMs: number;
  summary: string;
  validation: ValidationReport;
  documentChanged: boolean;
  // Relative cost bucket — we do NOT invent token counts.
  costEstimate: "none" | "low" | "advanced";
  reason: string;            // why this path was chosen
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
  },
): GenerationMetrics {
  return {
    taskType: c.taskType,
    executionPath: c.executionPath,
    usedAi: args.usedAi,
    model: args.usedAi ? args.model : null,
    durationMs: args.durationMs,
    summary: args.summary,
    validation: args.validation,
    documentChanged: args.documentChanged,
    costEstimate: costEstimateFor(c.executionPath, args.usedAi),
    reason: c.reason,
  };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
