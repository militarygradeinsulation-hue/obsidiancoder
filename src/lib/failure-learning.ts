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

// ---------------------------------------------------------------------------
// Concrete defect learning (Obsidian QA)
// ---------------------------------------------------------------------------
// The routing stats above track which model to prefer. This section tracks
// WHAT KIND of defect keeps recurring so future generations can be primed
// with a compact, deterministic hint. No raw HTML, no user text, no PII —
// only stable defect codes, safe labels, and task-type attribution.

export type DefectCategory =
  | "nav-creator-route"
  | "nav-external"
  | "nav-target-blank"
  | "nav-window-open"
  | "nav-missing-anchor"
  | "nav-placeholder-hash"
  | "publish-content-loss"
  | "publish-scripts-dropped"
  | "publish-empty"
  | "runtime-error"
  | "mobile-overflow";

export type DefectEvent = {
  ts: number;
  taskType: TaskType;
  strategy: string;
  model: string | null;
  buildHash: string;
  category: DefectCategory;
  /** Safe short label (control text, section id) — max 80 chars, no PII. */
  label?: string;
  /** How many visible chars were lost (publish-content-loss). */
  charsLost?: number;
  deterministicRepairFixed: boolean;
  claudeQaInvoked: boolean;
  claudeQaFixed: boolean;
  outcome: "kept" | "blocked" | "restored" | "published";
};

const SAFE_LABEL = /[^\w\s\-.,:;!?()#'"/]/g;
function safeLabel(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return s.replace(SAFE_LABEL, "").replace(/\s+/g, " ").trim().slice(0, 80) || undefined;
}

export function recordDefect(events: DefectEvent[], next: Omit<DefectEvent, "ts"> & { ts?: number }): DefectEvent[] {
  const clean: DefectEvent = {
    ts: next.ts ?? Date.now(),
    taskType: next.taskType,
    strategy: next.strategy,
    model: next.model,
    buildHash: String(next.buildHash).slice(0, 32),
    category: next.category,
    label: safeLabel(next.label),
    charsLost: typeof next.charsLost === "number" ? Math.max(0, Math.floor(next.charsLost)) : undefined,
    deterministicRepairFixed: !!next.deterministicRepairFixed,
    claudeQaInvoked: !!next.claudeQaInvoked,
    claudeQaFixed: !!next.claudeQaFixed,
    outcome: next.outcome,
  };
  const trimmed = events.length >= 500 ? events.slice(-499) : events;
  return [...trimmed, clean];
}

export type BuildFailureHint = { category: DefectCategory; taskType: TaskType; count: number; hint: string };

const HINT_TEXT: Record<DefectCategory, string> = {
  "nav-creator-route": "Never emit href/action targeting /, /dashboard, /gallery, /demos, /unlock, /auth, /checkout, /admin, obsidianvibe.live, or *.lovable.app. Use in-page anchors or local handlers.",
  "nav-external": "Do not emit http(s):// navigation from generated controls. Keep interactions same-document.",
  "nav-target-blank": "Do not use target=_blank in generated buttons or links.",
  "nav-window-open": "Do not call window.open in generated code.",
  "nav-missing-anchor": "Anchor hrefs (#foo) must point to an element that actually exists on the page.",
  "nav-placeholder-hash": "Avoid href=\"#\" placeholders. Bind a real handler or omit the link.",
  "publish-content-loss": "Preserve content-producing <script> blocks during export; do not embed creator URLs inside rendering scripts.",
  "publish-scripts-dropped": "Keep rendering scripts self-contained. Do not mix navigation to the creator app with content generation logic in the same script.",
  "publish-empty": "The publish artifact came out empty. Ensure meaningful content is rendered server-side, not only injected after navigation.",
  "runtime-error": "Prior builds threw runtime errors — validate JS before returning.",
  "mobile-overflow": "Prior builds overflowed on mobile — respect viewport width, avoid fixed pixel widths >100vw.",
};

/**
 * Build a bounded set of hints from recorded defects. A hint is emitted
 * only after ≥2 events for the same (taskType, category) — noisy singletons
 * are ignored so learning stays confident.
 */
export function buildFailureHints(events: DefectEvent[], forTaskType: TaskType): BuildFailureHint[] {
  const grouped = new Map<string, BuildFailureHint>();
  for (const e of events) {
    if (e.taskType !== forTaskType) continue;
    const key = `${e.taskType}|${e.category}`;
    const cur = grouped.get(key);
    if (cur) cur.count++;
    else grouped.set(key, { taskType: e.taskType, category: e.category, count: 1, hint: HINT_TEXT[e.category] });
  }
  return [...grouped.values()]
    .filter((h) => h.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

export function renderHintsPrompt(hints: BuildFailureHint[]): string {
  if (!hints.length) return "";
  const lines = hints.map((h) => `- (${h.count}x) ${h.hint}`);
  return `\n\nPrior recurring defects on this task type — do not repeat:\n${lines.join("\n")}`.slice(0, 800);
}
