// Failure learning. Records restore/reject events locally and produces routing
// hints (per-task-type model preference). Never mutates locks or rules.

import type { TaskType } from "./task-classifier";

export type FeedbackEvent = {
  ts: number;
  taskType: TaskType;
  strategy: string;
  model: string | null;
  validationStatus: "passed" | "warnings" | "failed" | "unknown";
  runtimeErrors: number;
  reason?: string;
  outcome: "restored" | "rejected" | "kept";
};

export type ModelStats = { attempts: number; kept: number; rejected: number; restored: number };
export type RoutingStats = Partial<Record<TaskType, Record<string, ModelStats>>>;

export function record(events: FeedbackEvent[], next: FeedbackEvent): FeedbackEvent[] {
  const trimmed = events.length >= 200 ? events.slice(-199) : events;
  return [...trimmed, next];
}

export function buildRoutingStats(events: FeedbackEvent[]): RoutingStats {
  const out: RoutingStats = {};
  for (const e of events) {
    if (!e.model) continue;
    const t = out[e.taskType] ??= {};
    const s = t[e.model] ??= { attempts: 0, kept: 0, rejected: 0, restored: 0 };
    s.attempts++;
    if (e.outcome === "kept") s.kept++;
    else if (e.outcome === "rejected") s.rejected++;
    else if (e.outcome === "restored") s.restored++;
  }
  return out;
}

/** Preferred model for a task type, or null if no signal. Simple keep-ratio ranking with a 3-attempt floor. */
export function preferredModel(stats: RoutingStats, taskType: TaskType): string | null {
  const bucket = stats[taskType];
  if (!bucket) return null;
  let best: { model: string; ratio: number } | null = null;
  for (const [model, s] of Object.entries(bucket)) {
    if (s.attempts < 3) continue;
    const ratio = s.kept / s.attempts;
    if (!best || ratio > best.ratio) best = { model, ratio };
  }
  return best && best.ratio > 0.5 ? best.model : null;
}
