// Build archive — the permanent shelf that houses EVERY build ever made on
// this device, whether it was explicitly saved to the cloud library or not.
//
// Design notes:
//  • Scoped per library code, so signing in with a different code shows that
//    account's shelf (an "anon" bucket holds builds made before signing in).
//  • Append-only from the app's point of view: a build lands here the moment
//    it finishes generating. Saving/publishing later just stamps the entry.
//  • Bounded: entries are capped by count AND by serialized bytes so a long
//    history can never blow the storage quota (which would silently lose
//    everything, not just the oldest build).

import { safeGet, safeSet, safeRemove } from "./safe-storage";

export const ARCHIVE_VERSION = 1 as const;
/** Hard cap on entries kept per library code. */
export const ARCHIVE_LIMIT = 150;
/** Hard cap on stored bytes per library code (well under quota). */
export const ARCHIVE_MAX_BYTES = 4_200_000;
/** Per-entry HTML cap — big enough for a real page, small enough to shelve many. */
export const ARCHIVE_HTML_MAX = 400_000;

export type ArchiveSurface = "pocket" | "vibe";

export interface ArchiveEntry {
  id: string;
  at: number;
  surface: ArchiveSurface;
  title: string;
  prompt: string;
  model: string;
  html: string;
  bytes: number;
  /** Set once the build has been saved to the cloud library. */
  cloudId?: string;
  shareSlug?: string;
  /** Design family/profile, when the build came from the creative pipeline. */
  family?: string;
  profile?: string;
}

export interface BuildArchive {
  v: typeof ARCHIVE_VERSION;
  entries: ArchiveEntry[];
}

const EMPTY: BuildArchive = { v: ARCHIVE_VERSION, entries: [] };

// Fallback store for environments without localStorage (SSR, private mode,
// quota-exceeded browsers). Keeps the archive coherent inside one runtime
// instead of silently reading back nothing.
const memStore = new Map<string, BuildArchive>();

export function archiveKey(libraryCode?: string): string {
  const code = (libraryCode ?? "").trim();
  return `obsidian.archive.v1.${code.length >= 4 ? code : "anon"}`;
}

function clean(value: unknown, max: number): string {
  return String(value ?? "")
    // Control characters break JSON round-trips in some browsers' storage.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeEntry(raw: unknown): ArchiveEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<ArchiveEntry>;
  const html = typeof e.html === "string" ? e.html : "";
  if (!html) return null;
  return {
    id: clean(e.id, 60) || `a_${Math.random().toString(36).slice(2, 10)}`,
    at: typeof e.at === "number" && Number.isFinite(e.at) ? e.at : Date.now(),
    surface: e.surface === "vibe" ? "vibe" : "pocket",
    title: clean(e.title, 140) || "Untitled build",
    prompt: clean(e.prompt, 1200),
    model: clean(e.model, 80),
    html: html.slice(0, ARCHIVE_HTML_MAX),
    bytes: typeof e.bytes === "number" && e.bytes > 0 ? Math.round(e.bytes) : html.length,
    ...(e.cloudId ? { cloudId: clean(e.cloudId, 60) } : {}),
    ...(e.shareSlug ? { shareSlug: clean(e.shareSlug, 40) } : {}),
    ...(e.family ? { family: clean(e.family, 40) } : {}),
    ...(e.profile ? { profile: clean(e.profile, 40) } : {}),
  };
}

export function readArchive(libraryCode?: string): BuildArchive {
  const key = archiveKey(libraryCode);
  const raw = safeGet<BuildArchive>(key) ?? memStore.get(key);
  if (!raw || !Array.isArray(raw.entries)) return { ...EMPTY, entries: [] };
  const entries = raw.entries
    .map(normalizeEntry)
    .filter((e): e is ArchiveEntry => e !== null)
    .sort((a, b) => b.at - a.at);
  return { v: ARCHIVE_VERSION, entries };
}

/**
 * Trim to the count cap, then drop oldest entries until the payload fits the
 * byte budget. Newest builds always survive.
 */
export function trimArchive(entries: readonly ArchiveEntry[]): ArchiveEntry[] {
  const sorted = [...entries].sort((a, b) => b.at - a.at).slice(0, ARCHIVE_LIMIT);
  while (sorted.length > 1) {
    const size = JSON.stringify({ v: ARCHIVE_VERSION, entries: sorted }).length;
    if (size <= ARCHIVE_MAX_BYTES) break;
    sorted.pop();
  }
  return sorted;
}

export function writeArchive(next: BuildArchive, libraryCode?: string): BuildArchive {
  const entries = trimArchive(next.entries);
  const value: BuildArchive = { v: ARCHIVE_VERSION, entries };
  const key = archiveKey(libraryCode);
  safeSet(key, value);
  memStore.set(key, value);
  return value;
}

export type ArchiveInput = {
  surface: ArchiveSurface;
  title: string;
  prompt?: string;
  model?: string;
  html: string;
  family?: string;
  profile?: string;
  cloudId?: string;
  shareSlug?: string;
};

/**
 * Shelve one build. A re-generation that produces byte-identical HTML with the
 * same title updates the existing entry instead of stacking duplicates.
 */
export function archiveBuild(
  input: ArchiveInput,
  libraryCode?: string,
  now = Date.now(),
): BuildArchive {
  const html = String(input.html ?? "");
  if (html.length < 40) return readArchive(libraryCode);

  const current = readArchive(libraryCode);
  const entry = normalizeEntry({
    id: `a_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: now,
    surface: input.surface,
    title: input.title,
    prompt: input.prompt,
    model: input.model,
    html,
    bytes: html.length,
    cloudId: input.cloudId,
    shareSlug: input.shareSlug,
    family: input.family,
    profile: input.profile,
  });
  if (!entry) return current;

  const dupe = current.entries.find(
    (e) => e.bytes === entry.bytes && e.title === entry.title && e.html === entry.html,
  );
  const rest = dupe ? current.entries.filter((e) => e.id !== dupe.id) : current.entries;
  const merged = dupe ? { ...dupe, at: entry.at, model: entry.model || dupe.model } : entry;
  return writeArchive({ v: ARCHIVE_VERSION, entries: [merged, ...rest] }, libraryCode);
}

export function renameArchiveEntry(id: string, title: string, libraryCode?: string): BuildArchive {
  const current = readArchive(libraryCode);
  const next = current.entries.map((e) =>
    e.id === id ? { ...e, title: clean(title, 140) || "Untitled build" } : e,
  );
  return writeArchive({ v: ARCHIVE_VERSION, entries: next }, libraryCode);
}

/** Stamp an entry once it reaches the cloud library, so the shelf shows it. */
export function markArchiveSaved(
  id: string,
  saved: { cloudId?: string; shareSlug?: string },
  libraryCode?: string,
): BuildArchive {
  const current = readArchive(libraryCode);
  const next = current.entries.map((e) =>
    e.id === id
      ? {
          ...e,
          ...(saved.cloudId ? { cloudId: clean(saved.cloudId, 60) } : {}),
          ...(saved.shareSlug ? { shareSlug: clean(saved.shareSlug, 40) } : {}),
        }
      : e,
  );
  return writeArchive({ v: ARCHIVE_VERSION, entries: next }, libraryCode);
}

/** Stamp the most recent entry — used right after a save/publish round-trip. */
export function markLatestArchiveSaved(
  saved: { cloudId?: string; shareSlug?: string },
  libraryCode?: string,
): BuildArchive {
  const current = readArchive(libraryCode);
  const newest = current.entries[0];
  if (!newest) return current;
  return markArchiveSaved(newest.id, saved, libraryCode);
}

export function deleteArchiveEntry(id: string, libraryCode?: string): BuildArchive {
  const current = readArchive(libraryCode);
  return writeArchive(
    { v: ARCHIVE_VERSION, entries: current.entries.filter((e) => e.id !== id) },
    libraryCode,
  );
}

export function clearArchive(libraryCode?: string): BuildArchive {
  const key = archiveKey(libraryCode);
  safeRemove(key);
  memStore.delete(key);
  return { v: ARCHIVE_VERSION, entries: [] };
}

/** Plain substring search across title, prompt and model. */
export function searchArchive(
  entries: readonly ArchiveEntry[],
  query: string,
): ArchiveEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter((e) =>
    `${e.title} ${e.prompt} ${e.model} ${e.family ?? ""} ${e.profile ?? ""}`
      .toLowerCase()
      .includes(q),
  );
}

/** Hand a build to Pocket or the Vibe Coder through a one-shot handoff slot. */
export const ARCHIVE_HANDOFF_KEY = "obsidian.archive.handoff";

export interface ArchiveHandoff {
  title: string;
  prompt: string;
  html: string;
  at: number;
}

let memHandoff: ArchiveHandoff | null = null;

export function stageArchiveHandoff(entry: ArchiveEntry): boolean {
  const payload: ArchiveHandoff = {
    title: entry.title,
    prompt: entry.prompt,
    html: entry.html,
    at: Date.now(),
  };
  memHandoff = payload;
  return safeSet(ARCHIVE_HANDOFF_KEY, payload);
}

/** Read and consume the handoff. Stale slots (over 5 minutes) are ignored. */
export function takeArchiveHandoff(maxAgeMs = 5 * 60_000, now = Date.now()): ArchiveHandoff | null {
  const raw = safeGet<ArchiveHandoff>(ARCHIVE_HANDOFF_KEY) ?? memHandoff;
  safeRemove(ARCHIVE_HANDOFF_KEY);
  memHandoff = null;
  if (!raw || typeof raw.html !== "string" || raw.html.length < 40) return null;
  if (typeof raw.at !== "number" || now - raw.at > maxAgeMs) return null;
  return { title: String(raw.title || "Untitled build"), prompt: String(raw.prompt || ""), html: raw.html, at: raw.at };
}
