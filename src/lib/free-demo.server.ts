// Server-only helpers for the one-shot free-demo entitlement.
//
// Contract:
//   - HttpOnly cookie `obs-free-demo` holds a stable browser id (256 bits).
//   - Fingerprint = SHA-256(cookieId + "|" + ipPrefixHash + "|" + uaClass).
//     Raw IPs are NEVER stored; we hash the /24 (v4) or /48 (v6) prefix.
//   - `public.claim_free_demo(fp, env, ip_prefix_hash)` inserts atomically
//     into `free_build_ledger`. Duplicate insert = already used.
//   - `public.release_free_demo(fp, env)` deletes ONLY within a 10-min
//     safety window so we can refund a claim if provider work never began.
//
// Any DB error → fail closed (`ok:false, reason:"unavailable"`).

import { createHash, randomBytes } from "node:crypto";
import type { Environment } from "@/lib/credit-gate.server";

const COOKIE_NAME = "obs-free-demo";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

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
    // IPv6 → /48
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

export interface DemoCookieInfo {
  cookieId: string;
  setCookieHeader?: string; // set only when we minted a new one
  ipPrefixHash: string | null; // sha256 of the /24 or /48 prefix (never raw)
  uaClass: string;
}

/** Read the cookie or mint a new one. Never returns a raw IP. */
export function readOrMintDemoCookie(request: Request): DemoCookieInfo {
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
export function fingerprintFromCookie(info: DemoCookieInfo): string {
  return sha256Hex(
    `${info.cookieId}|${info.ipPrefixHash ?? "none"}|${info.uaClass}`,
  );
}

export interface FreeDemoClaimResult {
  ok: boolean;
  reason?: "already_used" | "unavailable" | "bad_request";
  setCookieHeader?: string;
  fingerprint?: string;
}

/** Atomic INSERT via RPC. Returns ok=false if row already exists or on DB error. */
export async function claimFreeDemo(
  request: Request,
  environment: Environment,
): Promise<FreeDemoClaimResult> {
  const info = readOrMintDemoCookie(request);
  const fp = fingerprintFromCookie(info);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("claim_free_demo" as never, {
      _fingerprint: fp,
      _environment: environment,
      _ip_prefix: info.ipPrefixHash,
    } as never);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[free-demo] claim RPC error", error.message);
      return { ok: false, reason: "unavailable", setCookieHeader: info.setCookieHeader };
    }
    const inserted = data === true;
    return inserted
      ? { ok: true, fingerprint: fp, setCookieHeader: info.setCookieHeader }
      : { ok: false, reason: "already_used", setCookieHeader: info.setCookieHeader, fingerprint: fp };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[free-demo] claim exception", err instanceof Error ? err.message : err);
    return { ok: false, reason: "unavailable", setCookieHeader: info.setCookieHeader };
  }
}

/** Refund a very recent claim (10-min safety window enforced by SQL). */
export async function releaseFreeDemo(
  fingerprint: string,
  environment: Environment,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("release_free_demo" as never, {
      _fingerprint: fingerprint,
      _environment: environment,
    } as never);
  } catch {
    /* best-effort refund; safety window bounds the exposure */
  }
}

/** Read-only "already used?" check for the status endpoint. */
export async function isFreeDemoUsed(
  request: Request,
  environment: Environment,
): Promise<{ used: boolean; setCookieHeader?: string; unavailable?: boolean }> {
  const info = readOrMintDemoCookie(request);
  const fp = fingerprintFromCookie(info);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("free_demo_used" as never, {
      _fingerprint: fp,
      _environment: environment,
    } as never);
    if (error) return { used: false, setCookieHeader: info.setCookieHeader, unavailable: true };
    return { used: data === true, setCookieHeader: info.setCookieHeader };
  } catch {
    return { used: false, setCookieHeader: info.setCookieHeader, unavailable: true };
  }
}

/** Header name the client sends to explicitly request the free-demo path. */
export const DEMO_REQUEST_HEADER = "x-obs-demo";
