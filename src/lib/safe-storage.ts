// Safe localStorage wrapper — SSR-safe, quota-tolerant, size-capped.
// Never throws; returns undefined on any failure so callers can fall back.

const HARD_CAP = 4_500_000; // ~4.5MB, well under 5MB browser limit

function ok() {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function safeGet<T>(key: string): T | undefined {
  if (!ok()) return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function safeSet(key: string, value: unknown): boolean {
  if (!ok()) return false;
  try {
    const s = JSON.stringify(value);
    if (s.length > HARD_CAP) return false;
    window.localStorage.setItem(key, s);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(key: string): void {
  if (!ok()) return;
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

// ---- sessionStorage variants (per-tab, cleared when the tab closes) ----
function sok() {
  return typeof window !== "undefined" && !!window.sessionStorage;
}
export function sessionSafeGet<T>(key: string): T | undefined {
  if (!sok()) return undefined;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw == null) return undefined;
    return JSON.parse(raw) as T;
  } catch { return undefined; }
}
export function sessionSafeSet(key: string, value: unknown): boolean {
  if (!sok()) return false;
  try {
    const s = JSON.stringify(value);
    if (s.length > HARD_CAP) return false;
    window.sessionStorage.setItem(key, s);
    return true;
  } catch { return false; }
}

/** Sanitize user-facing error text — no stack, no URLs, no secrets. */
export function sanitizeErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (!err) return fallback;
  const raw = typeof err === "string" ? err : (err as Error)?.message ?? fallback;
  return raw
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, "[redacted-key]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240) || fallback;
}

// ---- Dual-write helpers: sessionStorage primary, localStorage backup ----
// Used for IDE sessions so non-signed-in users don't lose work on tab close.
// Reads always prefer sessionStorage; localStorage is the cold fallback.

const LOCAL_BACKUP_PREFIX = "obs.backup.";
const BACKUP_CAP = 3_000_000; // 3 MB — leave headroom for other localStorage use

export function dualSafeSet(key: string, value: unknown): boolean {
  const s = (() => { try { return JSON.stringify(value); } catch { return null; } })();
  if (!s) return false;
  // Always try sessionStorage first.
  const sessionOk = sessionSafeSet(key, value);
  // Mirror to localStorage as backup, within the tighter cap.
  if (s.length <= BACKUP_CAP) {
    try {
      window.localStorage.setItem(LOCAL_BACKUP_PREFIX + key, s);
    } catch { /* quota — skip backup silently */ }
  }
  return sessionOk;
}

export function dualSafeGet<T>(key: string): T | undefined {
  // Prefer sessionStorage (fresh tab or hydrated from prior session).
  const fromSession = sessionSafeGet<T>(key);
  if (fromSession !== undefined) return fromSession;
  // Cold start fallback: read from localStorage backup.
  try {
    const raw = window.localStorage.getItem(LOCAL_BACKUP_PREFIX + key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch { return undefined; }
}

export function dualSafeRemove(key: string): void {
  try { window.sessionStorage.removeItem(key); } catch { /* ignore */ }
  try { window.localStorage.removeItem(LOCAL_BACKUP_PREFIX + key); } catch { /* ignore */ }
}
