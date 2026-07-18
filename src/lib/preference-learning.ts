// Preference learning — derives high-confidence user/project preferences
// from repeated evidence in the adaptive ledger. Locked project memory
// always wins over any learned preference.
//
// Rules:
// - A single observation NEVER becomes a preference.
// - Threshold: >= 3 consistent observations, OR 1 explicit user confirmation.
// - Every learned preference is reversible: dismiss, edit, lock, forget.

import { safeGet, safeSet } from "./safe-storage";
import type { LedgerEvent } from "./adaptive-ledger";

export const PREFS_KEY = "obs.core4.v1.prefs";
export const PROMOTION_THRESHOLD = 3;

export type PreferenceScope = "user" | "session" | "project";

export type PreferenceStatus = "observed" | "confirmed" | "locked" | "dismissed";

export interface LearnedPreference {
  id: string;
  key: string;              // e.g. "editing.strategy", "visual.density"
  value: string;            // opaque scalar
  scope: PreferenceScope;
  status: PreferenceStatus;
  evidenceCount: number;
  confidence: number;       // 0..1
  firstObserved: number;
  lastObserved: number;
  sources: string[];        // ledger event kinds that fed this preference
}

function makeId(): string {
  try { return globalThis.crypto?.randomUUID?.() ?? `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
  catch { return `p_${Date.now().toString(36)}`; }
}

function isPref(v: unknown): v is LearnedPreference {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.key === "string" && typeof o.value === "string";
}

export function loadPreferences(): LearnedPreference[] {
  const raw = safeGet<unknown>(PREFS_KEY);
  if (!Array.isArray(raw)) return [];
  const clean = raw.filter(isPref);
  if (clean.length < raw.length * 0.5 && raw.length > 4) { safeSet(PREFS_KEY, []); return []; }
  return clean;
}

export function savePreferences(prefs: LearnedPreference[]): void {
  safeSet(PREFS_KEY, prefs);
}

/** Merge a new observation. Bumps counts; auto-promotes above threshold. */
export function observe(
  prefs: LearnedPreference[],
  input: { key: string; value: string; scope?: PreferenceScope; source: string; now?: number },
): LearnedPreference[] {
  const now = input.now ?? Date.now();
  const existing = prefs.find((p) => p.key === input.key && p.value === input.value && p.status !== "dismissed");
  if (existing) {
    if (existing.status === "locked") return prefs; // locked wins
    existing.evidenceCount++;
    existing.lastObserved = now;
    if (!existing.sources.includes(input.source)) existing.sources.push(input.source);
    existing.confidence = Math.min(1, existing.evidenceCount / (PROMOTION_THRESHOLD * 2));
    if (existing.status === "observed" && existing.evidenceCount >= PROMOTION_THRESHOLD) {
      existing.status = "confirmed";
    }
    return [...prefs];
  }
  const conflicting = prefs.filter((p) => p.key === input.key && p.value !== input.value && p.status !== "locked");
  for (const c of conflicting) c.confidence = Math.max(0, c.confidence - 0.15);
  const next: LearnedPreference = {
    id: makeId(),
    key: input.key,
    value: input.value,
    scope: input.scope ?? "project",
    status: "observed",
    evidenceCount: 1,
    confidence: 1 / (PROMOTION_THRESHOLD * 2),
    firstObserved: now,
    lastObserved: now,
    sources: [input.source],
  };
  return [...prefs, next];
}

/** User-driven state changes. Explicit confirm/lock overrides thresholds. */
export function confirmPreference(prefs: LearnedPreference[], id: string): LearnedPreference[] {
  return prefs.map((p) => p.id === id ? { ...p, status: "confirmed", confidence: 1 } : p);
}
export function lockPreference(prefs: LearnedPreference[], id: string): LearnedPreference[] {
  return prefs.map((p) => p.id === id ? { ...p, status: "locked", confidence: 1 } : p);
}
export function dismissPreference(prefs: LearnedPreference[], id: string): LearnedPreference[] {
  return prefs.map((p) => p.id === id ? { ...p, status: "dismissed", confidence: 0 } : p);
}
export function forgetPreference(prefs: LearnedPreference[], id: string): LearnedPreference[] {
  return prefs.filter((p) => p.id !== id);
}

export function preferenceFor(prefs: LearnedPreference[], key: string): LearnedPreference | undefined {
  return prefs
    .filter((p) => p.key === key && (p.status === "confirmed" || p.status === "locked"))
    .sort((a, b) => b.confidence - a.confidence)[0];
}

export function isAppliedPreference(p: LearnedPreference): boolean {
  return p.status === "confirmed" || p.status === "locked";
}

/** Rebuild preferences from a ledger (used by tests and Reset+Import flows). */
export function derivePreferencesFromLedger(events: LedgerEvent[]): LearnedPreference[] {
  let prefs: LearnedPreference[] = [];
  for (const e of events) {
    if (e.kind === "strategy-selected" && e.strategy && e.outcome === "kept") {
      prefs = observe(prefs, { key: `strategy.${e.taskType ?? "any"}`, value: e.strategy, source: e.kind });
    }
    if (e.kind === "model-selected" && e.model && e.outcome === "kept") {
      prefs = observe(prefs, { key: `model.${e.taskType ?? "any"}`, value: e.model, source: e.kind });
    }
  }
  return prefs;
}
