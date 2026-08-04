// Cloud Memory — shared per-build data store primitives.
//
// Pure, isomorphic helpers used by both the server route and the self-test
// suite. No database access, no node-only imports (Web Crypto only), so this
// module is safe to import from anywhere.
//
// Security model:
//   • Each build gets its own team code. Only its SHA-256 hash (salted with
//     the project id) is ever stored or compared.
//   • A verified code mints a short-lived HMAC token scoped to ONE project and
//     to DATA operations only. A token can never touch build content.

export const TEAM_CODE_MIN = 4;
export const TEAM_CODE_MAX = 64;
export const DEFAULT_TEAM_CODE = "9822";

export const MEMORY_KEY_MAX = 200;
export const MEMORY_VALUE_MAX_BYTES = 32_000;
export const MEMORY_MAX_ENTRIES = 2000;

export const TEAM_TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const enc = new TextEncoder();

/* ------------------------------------------------------------------ codes */

/** Trim + bound a team code. Returns null when unusable. */
export function normalizeTeamCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim();
  if (code.length < TEAM_CODE_MIN || code.length > TEAM_CODE_MAX) return null;
  return code;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Salted hash of a team code. The raw code is never stored. */
export async function hashTeamCode(projectId: string, code: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    enc.encode(`obs.team.v1:${projectId}:${code}`),
  );
  return toHex(digest);
}

/** Constant-time-ish comparison of two hex digests. */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyTeamCode(
  projectId: string,
  code: unknown,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!storedHash) return false;
  const norm = normalizeTeamCode(code);
  if (!norm) return false;
  return safeEqual(await hashTeamCode(projectId, norm), storedHash);
}

/* ----------------------------------------------------------------- tokens */

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array | null {
  try {
    const pad = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64url(new Uint8Array(sig));
}

export interface TeamTokenPayload {
  /** Project this token may read/write DATA for. */
  p: string;
  /** Expiry, epoch ms. */
  e: number;
  /** Scope — always "data". Present so a future scope can't be forged. */
  s: "data";
}

/** Mint a signed, project-scoped, data-only team token. */
export async function signTeamToken(
  secret: string,
  projectId: string,
  now = Date.now(),
  ttlMs = TEAM_TOKEN_TTL_MS,
): Promise<string> {
  const payload: TeamTokenPayload = { p: projectId, e: now + ttlMs, s: "data" };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}

/** Verify a team token. Returns the project id, or null when invalid/expired. */
export async function verifyTeamToken(
  secret: string,
  token: unknown,
  now = Date.now(),
): Promise<string | null> {
  if (typeof token !== "string" || token.length > 2000) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, await hmac(secret, body))) return null;
  const raw = unb64url(body);
  if (!raw) return null;
  let payload: TeamTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw)) as TeamTokenPayload;
  } catch {
    return null;
  }
  if (!payload || payload.s !== "data") return null;
  if (typeof payload.p !== "string" || payload.p.length < 10) return null;
  if (typeof payload.e !== "number" || payload.e <= now) return null;
  return payload.p;
}

/* ------------------------------------------------------------ record caps */

export function validMemoryKey(key: unknown): key is string {
  return typeof key === "string"
    && key.trim().length > 0
    && key.length <= MEMORY_KEY_MAX
    // eslint-disable-next-line no-control-regex
    && !/[\x00-\x1f\x7f]/.test(key);
}

export function memoryValueBytes(value: unknown): number {
  try {
    return enc.encode(JSON.stringify(value ?? null)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function validMemoryValue(value: unknown): boolean {
  if (value === undefined) return false;
  return memoryValueBytes(value) <= MEMORY_VALUE_MAX_BYTES;
}

/* ---------------------------------------------------------- rate limiting */

export interface RateState { hits: number[] }

/**
 * Sliding-window limiter. Mutates `store` in place; pure with respect to
 * `now`, so the self-test suite can drive it deterministically.
 */
export function checkRate(
  store: Map<string, RateState>,
  key: string,
  now: number,
  limit = 60,
  windowMs = 60_000,
): boolean {
  const entry = store.get(key) ?? { hits: [] };
  entry.hits = entry.hits.filter((t) => now - t < windowMs);
  if (entry.hits.length >= limit) {
    store.set(key, entry);
    return false;
  }
  entry.hits.push(now);
  store.set(key, entry);
  if (store.size > 5000) {
    for (const [k, v] of store) {
      if (v.hits.every((t) => now - t >= windowMs)) store.delete(k);
      if (store.size <= 4000) break;
    }
  }
  return true;
}

/* -------------------------------------------------------- device labeling */

export function shortDeviceLabel(input: unknown): string {
  const s = typeof input === "string" ? input.trim() : "";
  return s.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 80) || "teammate";
}
