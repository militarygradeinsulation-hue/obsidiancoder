// Browser-binding cookie for the GitHub link flow. Pure helpers (no secrets),
// shared by the start server function, the callback route, and tests.
//
// __Host- prefix forces Secure, Path=/ and no Domain, so the cookie is bound to
// the exact origin that issued it and can't be planted by a sibling subdomain.

export const LINK_COOKIE = "__Host-obs_gh_link";
export const LINK_COOKIE_MAX_AGE_S = 600; // matches OAUTH_STATE_TTL_MS

const HEX64 = /^[0-9a-f]{64}$/;

export function isHex64(v: unknown): v is string {
  return typeof v === "string" && HEX64.test(v);
}

/** Read one cookie from a raw Cookie header. Returns null if absent or duplicated. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  let found: string | null = null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    if (found !== null) return null; // duplicated cookie → ambiguous → fail closed
    found = part.slice(i + 1).trim();
  }
  return found;
}

export function clearLinkCookieHeader(): string {
  return `${LINK_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export type CallbackPrecheck =
  | { ok: true; state: string; nonce: string }
  | { ok: false; code: "invalid_state" | "missing_binding" };

/**
 * Validate the callback inputs BEFORE touching the database. Missing or
 * malformed cookie fails closed, so a link opened in another browser never
 * reaches state consumption, code exchange, or token storage.
 */
export function precheckCallback(
  stateParam: string | null,
  cookieHeader: string | null,
): CallbackPrecheck {
  const state = stateParam ?? "";
  if (!isHex64(state)) return { ok: false, code: "invalid_state" };
  const nonce = readCookie(cookieHeader, LINK_COOKIE);
  if (!isHex64(nonce)) return { ok: false, code: "missing_binding" };
  return { ok: true, state, nonce };
}
