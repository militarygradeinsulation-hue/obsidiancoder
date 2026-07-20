// Pure helpers for auth-redirect building. Keeping this a leaf module lets
// self-tests exercise the exact semantics used by /unlock and /auth without
// pulling any router/browser state.

export type AuthMode = "signup" | "signin";

/**
 * A path is a safe internal redirect target when it starts with a single "/"
 * (not "//" which would be protocol-relative) and does not contain control
 * characters. Query strings and fragments are allowed.
 */
export function isSafeInternalRedirect(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false; // protocol-relative
  if (path.startsWith("/\\")) return false; // backslash smuggling
  // Reject control chars, whitespace, and URL-embedded schemes/hosts.
  if (/[\s\u0000-\u001f\u007f]/.test(path)) return false;
  // Cheap sanity: no colon before first "/" that isn't part of a query.
  const hashless = path.split("#")[0];
  const qIdx = hashless.indexOf("?");
  const rawPath = qIdx >= 0 ? hashless.slice(0, qIdx) : hashless;
  if (/[:@]/.test(rawPath)) return false;
  return true;
}

/** Coerce an unknown redirect input into a safe internal path or fallback. */
export function safeRedirectOr(path: unknown, fallback: string): string {
  return isSafeInternalRedirect(path) ? path : fallback;
}

/** Build the /auth URL preserving mode + safe redirect. */
export function buildAuthUrl(mode: AuthMode, redirect: string): string {
  const safe = isSafeInternalRedirect(redirect) ? redirect : "/";
  const p = new URLSearchParams();
  p.set("mode", mode);
  p.set("redirect", safe);
  return `/auth?${p.toString()}`;
}

// ---------------------------------------------------------------------------
// OAuth handoff (sessionStorage)
// ---------------------------------------------------------------------------
// Google OAuth via lovable.auth.signInWithOAuth performs a full-page redirect,
// so any component state (including the sanitized `redirect` search param) is
// lost by the time we return. To preserve the intended internal destination
// (e.g. "/unlock?intent=buy&checkout=1"), we stash a *sanitized* path in
// sessionStorage before starting OAuth and consume it exactly once on return.
// Never trust the stored value blindly — always re-validate as a safe
// internal redirect on read.

export const OAUTH_HANDOFF_KEY = "obs.auth.oauthDest";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Persist a sanitized internal path so OAuth can resume it on return. */
export function stashOAuthDest(
  dest: unknown,
  storage: StorageLike | null | undefined = safeSessionStorage(),
): boolean {
  if (!storage) return false;
  if (!isSafeInternalRedirect(dest)) return false;
  try { storage.setItem(OAUTH_HANDOFF_KEY, dest); return true; }
  catch { return false; }
}

/** Read-and-clear the stashed path, re-validating before returning it. */
export function consumeOAuthDest(
  fallback: string,
  storage: StorageLike | null | undefined = safeSessionStorage(),
): string {
  const safeFallback = isSafeInternalRedirect(fallback) ? fallback : "/";
  if (!storage) return safeFallback;
  let raw: string | null = null;
  try { raw = storage.getItem(OAUTH_HANDOFF_KEY); } catch { raw = null; }
  try { storage.removeItem(OAUTH_HANDOFF_KEY); } catch { /* ignore */ }
  return isSafeInternalRedirect(raw) ? raw : safeFallback;
}

function safeSessionStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch { return null; }
}

