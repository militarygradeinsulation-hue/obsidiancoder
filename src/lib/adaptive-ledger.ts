// Adaptive event ledger — bounded, typed, sanitized, browser-local. Records
// only safe metadata about meaningful build outcomes. Never records raw
// secrets, attachments, provider bodies, HTML content, or the unlock code.
//
// Storage: localStorage under "obs.core4.v1.ledger". Bounded to MAX_EVENTS
// events (~512KB cap enforced by safe-storage). Corruption recovery: any
// parse or shape mismatch resets to an empty ledger without throwing.

import { safeGet, safeSet } from "./safe-storage";

export const LEDGER_KEY = "obs.core4.v1.ledger";
export const MAX_EVENTS = 500;

export type LedgerEventKind =
  | "request-submitted"
  | "task-classified"
  | "strategy-selected"
  | "model-selected"
  | "deterministic-accepted"
  | "patch-accepted"
  | "fullgen-accepted"
  | "validation-passed"
  | "validation-failed"
  | "repair-used"
  | "runtime-error"
  | "version-restored"
  | "change-rejected"
  | "change-manually-edited"
  | "user-repeated-correction"
  | "rule-blocked"
  | "cost-observed";

export interface LedgerEvent {
  id: string;
  ts: number;
  kind: LedgerEventKind;
  taskType?: string;
  strategy?: string;
  model?: string;
  fileIds?: string[];      // opaque project file ids
  elementIds?: string[];   // safe DOM ids/anchors only
  outcome?: "ok" | "fail" | "restored" | "rejected" | "kept";
  durationMs?: number;
  contextTier?: string;
  costEstimate?: "none" | "low" | "advanced";
  costUsd?: number;
  validationStatus?: "passed" | "warnings" | "failed";
  runtimeErrors?: number;
  ruleId?: string;         // for rule-blocked
  reasonCode?: string;     // ONE of a small enum, never free text
  note?: string;           // sanitized short label, <= 120 chars
}

// Reason codes for restores/rejections — structured enum, no free text
// travels to the model or into the ledger.
export const RESTORE_REASONS = [
  "visual-too-different",
  "feature-broke",
  "wrong-interpretation",
  "too-expensive",
  "too-slow",
  "copy-tone-wrong",
  "mobile-issue",
  "accessibility-issue",
  "other",
] as const;
export type RestoreReason = (typeof RESTORE_REASONS)[number];

// Regexes for values we must never store.
const SECRET_PATTERNS = [
  /sk_(live|test)_[A-Za-z0-9]{16,}/g,
  /pk_(live|test)_[A-Za-z0-9]{16,}/g,
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /\b[A-Fa-f0-9]{32,}\b/g,
  // Anything that looks like an unlock/passcode value — scrubbed so private
  // codes cannot travel into the learning ledger.
  /\b(?:unlock|passcode|passphrase|pin|code)\s*[:=]?\s*\d{3,10}\b/gi,
];

function sanitizeNote(s: string | undefined): string | undefined {
  if (!s) return undefined;
  let out = String(s).slice(0, 200);
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[redacted]");
  out = out.replace(/https?:\/\/\S+/g, "[url]").replace(/\s+/g, " ").trim();
  return out.slice(0, 120) || undefined;
}

function makeId(): string {
  try { return globalThis.crypto?.randomUUID?.() ?? `e_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }
  catch { return `e_${Date.now().toString(36)}`; }
}

function isEvent(v: unknown): v is LedgerEvent {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.ts === "number" && typeof o.kind === "string";
}

export function loadLedger(): LedgerEvent[] {
  const raw = safeGet<unknown>(LEDGER_KEY);
  if (!Array.isArray(raw)) return [];
  const clean = raw.filter(isEvent);
  // Corruption recovery: if most items don't parse, reset.
  if (clean.length < raw.length * 0.5 && raw.length > 4) {
    safeSet(LEDGER_KEY, []);
    return [];
  }
  return clean;
}

export function saveLedger(events: LedgerEvent[]): void {
  // Trim head-first to fit MAX_EVENTS. safe-storage additionally enforces
  // its byte cap; if it refuses, we shrink and retry once.
  const trimmed = events.length > MAX_EVENTS ? events.slice(-MAX_EVENTS) : events;
  if (!safeSet(LEDGER_KEY, trimmed)) {
    safeSet(LEDGER_KEY, trimmed.slice(-Math.floor(MAX_EVENTS / 2)));
  }
}

export function appendEvent(partial: Omit<LedgerEvent, "id" | "ts"> & Partial<Pick<LedgerEvent, "id" | "ts">>): LedgerEvent {
  const event: LedgerEvent = {
    id: partial.id ?? makeId(),
    ts: partial.ts ?? Date.now(),
    kind: partial.kind,
    taskType: partial.taskType,
    strategy: partial.strategy,
    model: partial.model,
    fileIds: partial.fileIds?.slice(0, 20),
    elementIds: partial.elementIds?.slice(0, 20),
    outcome: partial.outcome,
    durationMs: partial.durationMs,
    contextTier: partial.contextTier,
    costEstimate: partial.costEstimate,
    costUsd: typeof partial.costUsd === "number" ? Number(partial.costUsd.toFixed(6)) : undefined,
    validationStatus: partial.validationStatus,
    runtimeErrors: partial.runtimeErrors,
    ruleId: partial.ruleId,
    reasonCode: partial.reasonCode,
    note: sanitizeNote(partial.note),
  };
  const current = loadLedger();
  current.push(event);
  saveLedger(current);
  return event;
}

export function clearLedger(): void { safeSet(LEDGER_KEY, []); }

export function exportLedger(): string {
  return JSON.stringify({ version: 1, exportedAt: Date.now(), events: loadLedger() }, null, 2);
}

/** Used by tests + Learning panel — count events by kind. */
export function summariseLedger(events: LedgerEvent[] = loadLedger()): Record<LedgerEventKind, number> {
  const out = {} as Record<LedgerEventKind, number>;
  for (const e of events) out[e.kind] = (out[e.kind] ?? 0) + 1;
  return out;
}
