// Account code = the access code a person enters at /unlock.
// It doubles as their personal library code so every saved project is scoped
// to them across browsers. Stored in both sessionStorage (per-tab, existing
// builder convention) and localStorage (persistent) so all surfaces agree.

const KEY = "obs.library_code";

/** Accepts 4-64 chars, letters/digits/dash/underscore only. */
export function isValidAccountCode(code: string): boolean {
  const c = code.trim();
  return c.length >= 4 && c.length <= 64 && /^[A-Za-z0-9_-]+$/.test(c);
}

export function getAccountCode(): string {
  if (typeof window === "undefined") return "";
  try {
    const v =
      window.sessionStorage.getItem(KEY) || window.localStorage.getItem(KEY) || "";
    return isValidAccountCode(v) ? v.trim() : "";
  } catch {
    return "";
  }
}

export function setAccountCode(code: string): boolean {
  if (typeof window === "undefined") return false;
  const c = code.trim();
  if (!isValidAccountCode(c)) return false;
  try {
    window.sessionStorage.setItem(KEY, c);
    window.localStorage.setItem(KEY, c);
  } catch {
    /* storage unavailable — non-fatal */
  }
  return true;
}

export function clearAccountCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Codes granting full admin/publish access across the coder and Pocket. */
export const FULL_ACCESS_CODES = ["9822", "963169"] as const;

export function isFullAccessCode(code: string | null | undefined): boolean {
  return FULL_ACCESS_CODES.includes((code ?? "").trim() as (typeof FULL_ACCESS_CODES)[number]);
}
