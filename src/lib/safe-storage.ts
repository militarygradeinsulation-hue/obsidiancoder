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
