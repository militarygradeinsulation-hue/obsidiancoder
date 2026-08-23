// Durable background build jobs — shared, client-safe contract.
//
// The browser is NO LONGER the worker. A Pocket build is a row in
// `public.build_jobs` that a server route executes to completion. This module
// holds only pure helpers + types shared by the client controller, the server
// runner and the self-tests.

export const BUILD_JOB_STAGES = [
  "queued",
  "memory_match",
  "generating",
  "first_preview",
  "validating",
  "polishing",
  "saving",
  "completed",
  "failed",
  "cancelled",
] as const;

export type BuildJobStage = (typeof BUILD_JOB_STAGES)[number];
export type BuildJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export const TERMINAL_STATUSES: readonly BuildJobStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

export function isTerminal(status: string | null | undefined): boolean {
  return TERMINAL_STATUSES.includes(status as BuildJobStatus);
}

/** Coarse progress per stage, for the orb / status line. */
export const STAGE_PROGRESS: Record<BuildJobStage, number> = {
  queued: 2,
  memory_match: 8,
  generating: 25,
  first_preview: 55,
  validating: 75,
  polishing: 88,
  saving: 94,
  completed: 100,
  failed: 100,
  cancelled: 100,
};

export const STAGE_LABEL: Record<BuildJobStage, string> = {
  queued: "Queued…",
  memory_match: "Checking proven memory…",
  generating: "Building…",
  first_preview: "First preview ready — refining…",
  validating: "Running safety checks…",
  polishing: "Polishing…",
  saving: "Saving…",
  completed: "Ready",
  failed: "Build failed",
  cancelled: "Cancelled",
};

export interface BuildJobTimings {
  queuedMs?: number;
  memoryLookupMs?: number;
  plannerMs?: number;
  providerSelectMs?: number;
  firstByteMs?: number;
  firstPreviewMs?: number;
  streamMs?: number;
  validationMs?: number;
  qaMs?: number;
  polishMs?: number;
  saveMs?: number;
  totalMs?: number;
  memoryHit?: boolean;
  providerAttempts?: string[];
}

export interface BuildJobView {
  id: string;
  status: BuildJobStatus;
  stage: BuildJobStage;
  progress: number;
  partialHtml: string | null;
  resultHtml: string | null;
  error: string | null;
  servedModel: string | null;
  memoryHit: boolean;
  timings: BuildJobTimings;
  createdAt: string | null;
  completedAt: string | null;
  title?: string | null;
  prompt?: string | null;
  mode?: string | null;
}

/** Throttle gate for persisting streaming partials (never per token). */
export function shouldPersistPartial(
  lastPersistAt: number,
  now: number,
  minIntervalMs = 2500,
): boolean {
  return now - lastPersistAt >= minIntervalMs;
}

/** Trim streamed HTML to the last safe tag boundary so partials render. */
export function safePartial(raw: string): string | null {
  const cleaned = raw
    .replace(/\s*<!--OBS_(?:TIMING|PLACEHOLDERS):[\s\S]*?-->\s*$/g, "")
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/```\s*$/i, "");
  const cut = cleaned.lastIndexOf(">");
  if (cut < 200) return null;
  return cleaned.slice(0, cut + 1);
}

/** Stable, dependency-free hash used for idempotency keys. */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/**
 * Idempotency key for a build request. Two identical submissions from the
 * same scope (double click, reload-then-resubmit) collapse onto ONE job and
 * therefore onto ONE credit charge.
 */
export function idempotencyKeyFor(args: {
  scope: string;             // library code / user id / anon id
  prompt: string;
  mode: string;
  profile: string;
  styleFamily?: string | null;
  previousHtmlLength?: number;
  bucketMs?: number;         // collapse window; default 60s
  now?: number;
}): string {
  const bucket = Math.floor((args.now ?? Date.now()) / (args.bucketMs ?? 60_000));
  return stableHash(
    [
      args.scope,
      args.mode,
      args.profile,
      args.styleFamily ?? "",
      String(args.previousHtmlLength ?? 0),
      String(bucket),
      args.prompt.trim(),
    ].join("\u0000"),
  );
}

function secs(ms: number | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** e.g. "first preview 5.2s · final 14.8s · memory hit" */
export function summarizeTimings(t: BuildJobTimings | null | undefined): string {
  if (!t) return "";
  const parts: string[] = [];
  const fp = secs(t.firstPreviewMs);
  if (fp) parts.push(`first preview ${fp}`);
  const total = secs(t.totalMs);
  if (total) parts.push(`final ${total}`);
  const tfb = secs(t.firstByteMs);
  if (tfb) parts.push(`first byte ${tfb}`);
  if (t.memoryHit) parts.push("memory hit");
  if (t.providerAttempts?.length) parts.push(t.providerAttempts.join(" → "));
  return parts.join(" · ");
}

/** localStorage key holding the active job id for a Pocket scope. */
export function activeJobKey(scope: string): string {
  return `obsidian.pocket.job.${(scope || "anon").trim() || "anon"}`;
}
