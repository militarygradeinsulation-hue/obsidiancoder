// Typed generation pipeline — a shared vocabulary the UI can subscribe to.
// This module is UI-agnostic; the route calls advance() and subscribes to
// events via the returned emitter. No side effects at import time.

export type StageName =
  | "classify"
  | "plan"
  | "context"
  | "execute"
  | "validate"
  | "repair"
  | "finalize";

export type StageStatus = "pending" | "running" | "ok" | "skipped" | "failed";

export type StageState = {
  name: StageName;
  status: StageStatus;
  startedAt?: number;
  finishedAt?: number;
  detail?: string;
};

export const ALL_STAGES: StageName[] = [
  "classify",
  "plan",
  "context",
  "execute",
  "validate",
  "repair",
  "finalize",
];

export type PipelineListener = (snapshot: StageState[]) => void;

export function createPipeline(listener?: PipelineListener) {
  const stages: Record<StageName, StageState> = Object.fromEntries(
    ALL_STAGES.map((n) => [n, { name: n, status: "pending" as StageStatus }]),
  ) as Record<StageName, StageState>;

  const emit = () => listener?.(ALL_STAGES.map((n) => ({ ...stages[n] })));

  return {
    snapshot: () => ALL_STAGES.map((n) => ({ ...stages[n] })),
    start(name: StageName) {
      stages[name] = { name, status: "running", startedAt: Date.now() };
      emit();
    },
    ok(name: StageName, detail?: string) {
      const s = stages[name];
      stages[name] = { ...s, status: "ok", finishedAt: Date.now(), detail };
      emit();
    },
    skip(name: StageName, detail?: string) {
      stages[name] = { name, status: "skipped", finishedAt: Date.now(), detail };
      emit();
    },
    fail(name: StageName, detail: string) {
      const s = stages[name];
      stages[name] = { ...s, status: "failed", finishedAt: Date.now(), detail };
      emit();
    },
  };
}

export type Pipeline = ReturnType<typeof createPipeline>;
