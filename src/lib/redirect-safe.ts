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
