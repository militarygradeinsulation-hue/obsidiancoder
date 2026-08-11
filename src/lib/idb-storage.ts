// Minimal IndexedDB key/value store — no dependency, SSR-safe, never throws.
//
// `safe-storage.ts` caps at ~4.5 MB because localStorage does. The build
// archive and the component/template memory outgrow that quickly, so anything
// that needs headroom writes through to IndexedDB and keeps localStorage as
// the synchronous hot cache.
//
// Every export resolves rather than rejects: callers treat IndexedDB as a
// best-effort durability layer, never as a source of truth they must await.

const DB_NAME = "obsidian";
const STORE = "kv";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function available(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!available()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let settled = false;
    const done = (v: IDBDatabase | null) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        try {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        } catch { /* ignore */ }
      };
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
      // Private-mode Safari can hang the open request indefinitely.
      setTimeout(() => done(null), 3_000);
    } catch {
      done(null);
    }
  });
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore | null {
  try {
    return db.transaction(STORE, mode).objectStore(STORE);
  } catch {
    return null;
  }
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise<T | undefined>((resolve) => {
    const store = tx(db, "readonly");
    if (!store) return resolve(undefined);
    try {
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function idbSet(key: string, value: unknown): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    const store = tx(db, "readwrite");
    if (!store) return resolve(false);
    try {
      const req = store.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbRemove(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const store = tx(db, "readwrite");
  if (!store) return;
  try { store.delete(key); } catch { /* ignore */ }
}

/** Test seam — drops the cached connection so a fresh open is attempted. */
export function resetIdbConnection(): void {
  dbPromise = null;
}

/**
 * Fire-and-forget write-through. Callers keep their synchronous localStorage
 * write as the hot path and use this purely for durability past the 4.5 MB
 * localStorage ceiling.
 */
export function idbMirror(key: string, value: unknown): void {
  if (!available()) return;
  void idbSet(key, value).catch(() => false);
}
