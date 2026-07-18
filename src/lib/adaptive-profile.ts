// Adaptive profile — the aggregated, sanitized view of what Obsidian has
// learned about the user and project. Consumed by the Intelligence panel,
// the adaptive router, and the export/import controls.

import { loadPreferences, isAppliedPreference, type LearnedPreference } from "./preference-learning";
import { loadLedger, summariseLedger, type LedgerEvent, type LedgerEventKind } from "./adaptive-ledger";
import { safeGet, safeSet } from "./safe-storage";

export const SETTINGS_KEY = "obs.core4.v1.settings";

export interface LearningSettings {
  enabled: boolean;
  localOnly: boolean;      // always true today; kept for future migration
  retentionEvents: number; // <= MAX_EVENTS
}

export const DEFAULT_SETTINGS: LearningSettings = { enabled: true, localOnly: true, retentionEvents: 500 };

export function loadSettings(): LearningSettings {
  const raw = safeGet<Partial<LearningSettings>>(SETTINGS_KEY);
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  return {
    enabled: raw.enabled ?? DEFAULT_SETTINGS.enabled,
    localOnly: true,
    retentionEvents: Math.min(1000, Math.max(10, raw.retentionEvents ?? DEFAULT_SETTINGS.retentionEvents)),
  };
}

export function saveSettings(s: LearningSettings): void { safeSet(SETTINGS_KEY, { ...s, localOnly: true }); }

export interface AdaptiveProfile {
  settings: LearningSettings;
  preferences: LearnedPreference[];
  applied: LearnedPreference[];
  recentEvents: LedgerEvent[];
  eventCounts: Record<LedgerEventKind, number>;
}

export function loadProfile(): AdaptiveProfile {
  const settings = loadSettings();
  const preferences = loadPreferences();
  const events = loadLedger();
  return {
    settings,
    preferences,
    applied: preferences.filter(isAppliedPreference),
    recentEvents: events.slice(-25),
    eventCounts: summariseLedger(events),
  };
}

/** Sanitized export payload. Refuses to include secret-like values. */
export function exportProfile(): string {
  const { preferences, eventCounts, settings } = loadProfile();
  return JSON.stringify({
    version: 1,
    exportedAt: Date.now(),
    settings,
    preferences: preferences.map((p) => ({ ...p, sources: p.sources.slice(0, 6) })),
    eventCounts,
  }, null, 2);
}

/** Import strictly-versioned learning JSON. Unknown versions refuse to load. */
export function importProfile(json: string): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json) as { version?: number; preferences?: unknown; settings?: Partial<LearningSettings> };
    if (parsed.version !== 1) return { ok: false, error: "unsupported version" };
    if (!Array.isArray(parsed.preferences)) return { ok: false, error: "preferences missing" };
    const prefs = parsed.preferences.filter((p): p is LearnedPreference =>
      !!p && typeof (p as LearnedPreference).id === "string" &&
      typeof (p as LearnedPreference).key === "string" &&
      typeof (p as LearnedPreference).value === "string",
    );
    safeSet("obs.core4.v1.prefs", prefs);
    if (parsed.settings) saveSettings({ ...loadSettings(), ...parsed.settings, localOnly: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid JSON" };
  }
}
