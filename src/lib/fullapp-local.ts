// Full App local durability: IndexedDB is the durable local copy; localStorage
// keeps only a small hot snapshot for instant first paint. Cloud stays the
// cross-device source of truth — nothing here ever writes to the cloud.
// Browser storage is device-local, unencrypted and may be evicted.

import { idbGet, idbSet } from "@/lib/idb-storage";

export const HOT_SNAPSHOT_MAX_CHARS = 400_000;

export interface Stamped {
  updatedAt: number;
}
export interface LocalKV {
  get<T>(k: string): Promise<T | undefined>;
  set(k: string, v: unknown): Promise<boolean>;
}
export interface HotStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
export const idbKV: LocalKV = { get: idbGet, set: idbSet };

/** Browsers can throw SecurityError just from accessing localStorage. */
export function getHotStore(): HotStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Cheap size estimate without serializing the whole workspace. */
export function estimateChars(w: { sourceHtml?: string; files?: Record<string, string> }): number {
  let n = (w.sourceHtml?.length ?? 0) + 2_000;
  for (const v of Object.values(w.files ?? {})) n += (typeof v === "string" ? v.length : 0) + 64;
  return n;
}

export function newest<T extends Stamped>(...c: Array<T | null | undefined>): T | null {
  let best: T | null = null;
  for (const x of c)
    if (x && Number.isFinite(x.updatedAt) && (!best || x.updatedAt > best.updatedAt)) best = x;
  return best;
}

/** Hydrated IDB snapshot replaces the on-screen one only if same identity, no edits since mount, and strictly newer. */
export function shouldApplyHydrated(i: {
  keyAtStart: string;
  keyNow: string;
  editedSinceMount: boolean;
  current: Stamped | null;
  candidate: Stamped | null;
}): boolean {
  if (!i.candidate || i.keyAtStart !== i.keyNow || i.editedSinceMount) return false;
  return !i.current || i.candidate.updatedAt > i.current.updatedAt;
}

/** Autosave only after hydration and only once the user changed the initial snapshot. */
export function shouldPersist(i: { hydrated: boolean; current: unknown; initial: unknown }): boolean {
  return i.hydrated && i.current !== i.initial;
}

export function readHot<T>(
  store: HotStore | null,
  key: string,
  validate: (raw: unknown) => T | null,
): T | null {
  if (!store) return null;
  try {
    return validate(JSON.parse(store.getItem(key) || "null"));
  } catch {
    return null;
  }
}

export async function readDurable<T>(
  kv: LocalKV,
  key: string,
  validate: (raw: unknown) => T | null,
): Promise<T | null> {
  try {
    return validate(await kv.get(key));
  } catch {
    return null;
  }
}

export interface PersistResult {
  durable: boolean;
  hot: boolean;
  ok: boolean;
}

export async function persistWorkspace<
  T extends { sourceHtml?: string; files?: Record<string, string> },
>(w: T, key: string, kv: LocalKV, hot: HotStore | null): Promise<PersistResult> {
  let durable = false;
  try {
    durable = await kv.set(key, w);
  } catch {
    durable = false;
  }
  let hotOk = false;
  if (hot) {
    try {
      if (estimateChars(w) <= HOT_SNAPSHOT_MAX_CHARS) {
        hot.setItem(key, JSON.stringify(w));
        hotOk = true;
      }
      // Too large for a hot copy: drop any stale small one so it can't look newer.
      else if (durable) hot.removeItem(key);
    } catch {
      hotOk = false;
    }
  }
  return { durable, hot: hotOk, ok: durable || hotOk };
}
