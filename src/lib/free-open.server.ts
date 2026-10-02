// Server-only helpers for the free_open rate limit — Obsidian Pocket's
// genuinely free, no-sign-in, no-credit-check generation surface
// (entitlement kind "free_open" in generate.ts).
//
// Why this exists: generate.ts has granted free_open unconditionally since
// it was built — "no credits, no sign-in, no one-shot demo ledger" was the
// explicit, deliberate design (Pocket is meant to be more generous than the
// one-shot free-demo path, not identical to it). That's the right shape for
// a genuinely free tool, but it also means there was no backstop at all
// against a script hammering the endpoint — a real, live cost-exposure gap,
// not a theoretical one, and more relevant now that Pocket is the loudest
// call-to-action on the whole site. This adds a generous, rolling-window
// cap per fingerprint rather than a hard sign-in requirement, so the "try
// it free, no account" promise stays true while bounding the worst case.
//
// Deliberately NOT built on top of free-demo.server.ts's one-shot ledger —
// that table and its RPCs (claim_free_demo/release_free_demo) are a unique-
// insert, claim-once design; this needs multiple rows per fingerprint,
// counted over a trailing window. Kept fully independent (own cookie name,
// own copy of the fingerprinting logic) rather than refactoring proven,
// billing-adjacent code to share it.
//
// Fingerprint = SHA-256(cookieId + "|" + ipPrefixHash + "|" + uaClass).
// Raw IPs are NEVER stored; only the hashed /24 (v4) or /48 (v6) prefix.
// Any DB error → fail OPEN here, deliberately, unlike free-demo's fail-
// closed: free_open's whole premise is "don't make a real visitor sign in
// or get blocked by our own infrastructure hiccup." A transient DB error
// should not turn a free tool into a broken one; the cap is a backstop
// against sustained abuse, not a guarantee enforced against every possible
// outage.

import { createHash, randomBytes } from "node:crypto";
import type { Environment } from "@/lib/credit-gate.server";

const COOKIE_NAME = "obs-free-open";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

/** Generous on purpose — a real first-time visitor should never feel capped. */
export const FREE_OPEN_DAILY_CAP = 5;
export const FREE_OPEN_WINDOW_HOURS = 24;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function firstIp(header: string | null): string | null {
  if (!header) return null;
  const first = header.split(",")[0]?.trim() ?? "";
  return first || null;
}

function ipPrefix(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 3).join(":") + "::/48";
  }
  const octets = ip.split(".");
  if (octets.length !== 4) return null;
  return octets.slice(0, 3).join(".") + ".0/24";
}

function classifyUserAgent(ua: string | null): string {
  if (!ua) return "none";
  const s = ua.toLowerCase();
  if (s.includes("mobile")) return "mobile";
  if (s.includes("bot") || s.includes("crawler")) return "bot";
  return "desktop";
}

export interface FreeOpenCookieInfo {
  cookieId: string;
  setCookieHeader?: string;
  ipPrefixHash: string | null;
  uaClass: string;
}

/** Read the cookie or mint a new one. Never returns a raw IP. */
export function readOrMintFreeOpenCookie(request: Request): FreeOpenCookieInfo {
  const cookies = parseCookies(request.headers.get("cookie"));
  let cookieId = cookies[COOKIE_NAME];
  let setCookieHeader: string | undefined;
  if (!cookieId || cookieId.length < 32 || !/^[a-f0-9]+$/i.test(cookieId)) {
    cookieId = randomBytes(32).toString("hex");
    setCookieHeader =
      `${COOKIE_NAME}=${cookieId}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; ` +
      `Path=/; HttpOnly; Secure; SameSite=Lax`;
  }
  const ip = firstIp(
    request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip"),
  );
  const prefix = ipPrefix(ip);
  const ipPrefixHash = prefix ? sha256Hex(prefix).slice(0, 32) : null;
  const uaClass = classifyUserAgent(request.headers.get("user-agent"));
  return { cookieId, setCookieHeader, ipPrefixHash, uaClass };
}

/** Compose the ledger fingerprint. Non-reversible, server-only. */
export function fingerprintFromFreeOpenCookie(info: FreeOpenCookieInfo): string {
  return sha256Hex(`${info.cookieId}|${info.ipPrefixHash ?? "none"}|${info.uaClass}`);
}

export interface FreeOpenClaimResult {
  ok: boolean;
  reason?: "cap_reached" | "unavailable";
  setCookieHeader?: string;
}

/**
 * Atomic rate-limit check-and-claim. Fails OPEN on any DB error (see file
 * header) — a transient outage degrades to "unmetered for this request,"
 * not "the free tool is broken."
 */
export async function claimFreeOpen(
  request: Request,
  environment: Environment,
): Promise<FreeOpenClaimResult> {
  const info = readOrMintFreeOpenCookie(request);
  const fp = fingerprintFromFreeOpenCookie(info);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("claim_free_open" as never, {
      _fingerprint: fp,
      _environment: environment,
      _ip_prefix: info.ipPrefixHash,
      _daily_cap: FREE_OPEN_DAILY_CAP,
      _window_hours: FREE_OPEN_WINDOW_HOURS,
    } as never);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[free-open] claim RPC error — failing open", error.message);
      return { ok: true, setCookieHeader: info.setCookieHeader };
    }
    const allowed = data === true;
    return allowed
      ? { ok: true, setCookieHeader: info.setCookieHeader }
      : { ok: false, reason: "cap_reached", setCookieHeader: info.setCookieHeader };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[free-open] claim exception — failing open", err instanceof Error ? err.message : err);
    return { ok: true, setCookieHeader: info.setCookieHeader };
  }
}

/** Free-path image fills per fingerprint per rolling window (separate from builds). */
export const FREE_OPEN_IMAGE_DAILY_CAP = 5;

/**
 * Same rolling-window RPC as claimFreeOpen, scoped to its own ledger bucket
 * ("<env>:images") so image fills never consume a visitor's free builds and
 * vice versa. Unlike claimFreeOpen this fails CLOSED: a missing image is a
 * graceful degradation (the placeholder stays), while an unmetered image
 * call on an error path is real spend with no backstop.
 */
export async function claimFreeOpenImages(
  request: Request,
  environment: Environment,
): Promise<FreeOpenClaimResult> {
  const info = readOrMintFreeOpenCookie(request);
  const fp = fingerprintFromFreeOpenCookie(info);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("claim_free_open" as never, {
      _fingerprint: fp,
      _environment: `${environment}:images`,
      _ip_prefix: info.ipPrefixHash,
      _daily_cap: FREE_OPEN_IMAGE_DAILY_CAP,
      _window_hours: FREE_OPEN_WINDOW_HOURS,
    } as never);
    if (error) return { ok: false, reason: "unavailable", setCookieHeader: info.setCookieHeader };
    return data === true
      ? { ok: true, setCookieHeader: info.setCookieHeader }
      : { ok: false, reason: "cap_reached", setCookieHeader: info.setCookieHeader };
  } catch {
    return { ok: false, reason: "unavailable", setCookieHeader: info.setCookieHeader };
  }
}

/** Header the client already sends to opt into the free_open path. */
export const FREE_OPEN_REQUEST_HEADER = "x-obs-free";
