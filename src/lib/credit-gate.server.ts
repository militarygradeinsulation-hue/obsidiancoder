// Server-only credit gate. Never import from client bundles.
//
// Runtime flow (usage_* ledger — the ONLY runtime billing surface):
//   1. requirePaidOperation(request, op, requestId)
//        → owner cookie OR bearer → active Pro (real period) → usage_reserve(requestId)
//        → returns EntitlementResult { kind, reservation?, denial? }.
//   2. Caller does the work, then builds a UsageRecord.
//   3. settleOperation(ent, outcome) commits (usage_finalize), refunds
//      (usage_refund), or logs owner activity. usage_finalize UPDATES the
//      same pending ai_usage row — no second insert.
//
// Legacy `reserve_credits*` / `finalize_credits` / `refund_credits` RPCs
// are NOT called from any runtime path. The pure JS ReservationLedger in
// `credit-gate.ts` mirrors the SQL contract for unit tests.


import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  CAP_PRO_MONTHLY,
  reservationForOperation,
  creditsRequiredEnvelope,
  type CreditsRequiredEnvelope,
  type Operation,
} from "./credit-gate";
import { capForTier, tierForPriceId } from "./plans";
import { makeUsage, type UsageRecord } from "./usage-record";

export type Environment = "sandbox" | "live";

export function serverStripeEnv(): Environment {
  return process.env.STRIPE_LIVE_API_KEY && process.env.PAYMENTS_LIVE_WEBHOOK_SECRET
    ? "live"
    : "sandbox";
}

/** Supabase client bound to the caller's user JWT (RLS acts as that user). */
function userClient(token: string): SupabaseClient<Database> {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if ((key.startsWith("sb_") || key.startsWith("sb_publishable_"))
            && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export interface AuthedUser { userId: string; email?: string; token: string }

/** Parses "Authorization: Bearer <jwt>" from a Request. */
export function extractBearer(request: Request): string | null {
  const h = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!h) return null;
  if (!/^Bearer\s+/i.test(h)) return null;
  const tok = h.replace(/^Bearer\s+/i, "").trim();
  if (!tok || tok.split(".").length !== 3) return null;
  return tok;
}

export async function resolveUserFromRequest(request: Request): Promise<AuthedUser | null> {
  const token = extractBearer(request);
  if (!token) return null;
  try {
    const sb = userClient(token);
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return { userId: data.user.id, email: data.user.email ?? undefined, token };
  } catch {
    return null;
  }
}

export async function isOwnerSession(): Promise<boolean> {
  try {
    const { isUnlockedServer } = await import("./gate.server");
    return await isUnlockedServer();
  } catch { return false; }
}

/**
 * Pure predicate mirroring `public.has_active_pro`: an active/trialing
 * subscription row with a non-null current_period_start/end window
 * that contains `now`. Exported for deterministic unit tests.
 */
export function isActiveProRow(
  row: { status?: string | null; current_period_start?: string | null; current_period_end?: string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row) return false;
  if (row.status !== "active" && row.status !== "trialing") return false;
  if (!row.current_period_start || !row.current_period_end) return false;
  const start = Date.parse(row.current_period_start);
  const end = Date.parse(row.current_period_end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const t = now.getTime();
  return start <= t && end > t;
}

// Minimal client shape used by hasActiveProWithClient. Kept structural so
// tests can pass a fake without importing @supabase/supabase-js types.
export interface MinimalSubscriptionQueryClient {
  from(table: "subscriptions"): {
    select(cols: string): {
      eq(col: "user_id", val: string): {
        eq(col: "environment", val: string): {
          in(col: "status", vals: readonly string[]): {
            order(col: "created_at", opts: { ascending: boolean }): {
              limit(n: number): {
                maybeSingle(): Promise<{
                  data: { status: string | null; current_period_start: string | null; current_period_end: string | null } | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
  };
}

/**
 * Queries `public.subscriptions` directly with the passed client and
 * evaluates the exact-period predicate. The `userId` MUST come from a
 * verified source (`resolveUserFromRequest`) — never a browser-supplied
 * body/query value.
 */
export async function hasActiveProWithClient(
  client: MinimalSubscriptionQueryClient,
  userId: string,
  env: Environment,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const { data, error } = await client
      .from("subscriptions")
      .select("status, current_period_start, current_period_end")
      .eq("user_id", userId)
      .eq("environment", env)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return isActiveProRow(data, now);
  } catch { return false; }
}

export async function hasActivePro(user: AuthedUser, env: Environment): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const subActive = await hasActiveProWithClient(supabaseAdmin as unknown as MinimalSubscriptionQueryClient, user.userId, env);
  if (subActive) return true;
  // Try Pro 7-day trial fallback — paid one-time claim that hasn't expired.
  try {
    const { data } = await supabaseAdmin
      .from("trial_claims" as never)
      .select("paid, expires_at")
      .eq("user_id", user.userId)
      .eq("environment", env)
      .eq("paid", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as { paid?: boolean; expires_at?: string | null } | null;
    if (row?.paid && row.expires_at && Date.parse(row.expires_at) > Date.now()) return true;
  } catch { /* best-effort */ }
  return false;
}


/**
 * Resolve the caller's active monthly credit cap from their current
 * subscription's `price_id`. Falls back to CAP_PRO_MONTHLY when the tier
 * cannot be resolved (legacy rows, unknown price) so paying customers
 * are never denied service on a mapping gap.
 */
export async function capForUser(userId: string, env: Environment): Promise<number> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("price_id")
      .eq("user_id", userId)
      .eq("environment", env)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const tier = tierForPriceId(data?.price_id)?.id;
    const cap = tier ? capForTier(tier) : 0;
    return cap > 0 ? cap : CAP_PRO_MONTHLY;
  } catch {
    return CAP_PRO_MONTHLY;
  }
}


export interface Reservation {
  reservationId: string;
  credits: number;              // envelope credits temporarily held; final charge may be lower
  operation: Operation;
  environment: Environment;
  usedBefore: number;
  remainingAfter: number;
  idempotent: boolean;          // true when reserve_credits_v2 returned an existing row
  cap: number;                  // active monthly cap resolved from subscription tier
}

export interface EntitlementResult {
  // "free_trial" = homepage promise honoured for one lifetime generate_html
  // per browser+IP fingerprint. No reservation, no billing, no charge.
  kind: "owner" | "pro" | "denied" | "free_trial";
  user?: AuthedUser;
  reservation?: Reservation;
  denial?: CreditsRequiredEnvelope;
  env: Environment;
  requestId: string;
  // Populated when a free-build fingerprint cookie was newly issued this
  // request. The endpoint MUST attach this as a Set-Cookie response header
  // so subsequent visits from the same browser hit the same ledger row.
  setCookieHeader?: string;
}


/**
 * Atomic, idempotent reservation via `usage_reserve`. The same
 * `requestId` returns the same ai_usage row — SQL enforces the invariant.
 * Returns `{ reservation | null | "no_period" }`:
 *   - reservation: successful reservation (or the existing idempotent row)
 *   - null:        cap would be exceeded (no row created)
 *   - "no_period": subscription is missing / expired current period
 */
async function usageReserve(
  user: AuthedUser,
  operation: Operation,
  env: Environment,
  requestId: string,
  cap: number,
): Promise<Reservation | null | "no_period"> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const amount = reservationForOperation(operation);
  const { data, error } = await supabaseAdmin.rpc("usage_reserve" as never, {
    _user_id: user.userId,
    _amount: amount,
    _cap: cap,
    _env: env,
    _operation: operation,
    _request_id: requestId,
  } as never);
  if (error) {
    if (/no_active_subscription_period/.test(error.message)) return "no_period";
    throw new Error(`usage_reserve failed: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { reservation_id: string; credits: number; used_before: number; remaining_after: number; idempotent: boolean }
    | null
    | undefined;
  if (!row || !row.reservation_id) return null;
  return {
    reservationId: row.reservation_id,
    credits: Number(row.credits ?? amount),
    operation,
    environment: env,
    usedBefore: Number(row.used_before ?? 0),
    remainingAfter: Number(row.remaining_after ?? 0),
    idempotent: !!row.idempotent,
    cap,
  };
}

/**
 * Finalize a reservation in-place (usage_finalize UPDATEs the pending row
 * — no second insert). Idempotent for already-terminal rows.
 * Errors are surfaced; a swallowed failure would leak the reservation.
 */
async function usageFinalize(
  reservationId: string,
  actualCredits: number,
  requestId: string,
  status: "committed" | "failed",
  cap: number,
  usage?: UsageRecord,
  errorCode?: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Pass full actualCredits (not clamped to reservation) so the DB can perform
  // a cap-safe top-up when the provider consumed more than we envelope-reserved.
  // The single remaining SQL overload accepts _cap and enforces the monthly
  // ceiling atomically; charge above the reservation is allowed only when
  // (period_used_excluding_this_row + actual) <= _cap, otherwise the DB caps
  // the charge and sets meta.cap_limited=true.
  const { data, error } = await supabaseAdmin.rpc("usage_finalize" as never, {
    _reservation_id: reservationId,
    _actual_credits: Math.max(0, Math.floor(actualCredits)),
    _request_id: requestId,
    _status: status,
    _error_code: errorCode ?? usage?.errorCode ?? null,
    _provider: usage?.provider ?? null,
    _model: usage?.model ?? null,
    _input_tokens: usage?.inputTokens ?? 0,
    _output_tokens: usage?.outputTokens ?? 0,
    _total_tokens: usage?.totalTokens ?? 0,
    _image_count: usage?.imageCount ?? 0,
    _actual_cost_usd: usage?.actualCostUsd ?? null,
    _estimated_cost_usd: usage?.estimatedCostUsd ?? null,
    _cost_basis: usage?.costBasis ?? null,
    _meta: usage?.meta ?? null,
    _cap: cap,
  } as never);
  if (error) throw new Error(`usage_finalize failed: ${error.message}`);
  if (data === false) throw new Error("usage_finalize returned false (reservation missing)");
}

async function usageRefundReservation(reservationId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("usage_refund" as never, {
    _reservation_id: reservationId,
  } as never);
  if (error) throw new Error(`usage_refund failed: ${error.message}`);
}


export interface OwnerUsageMeta {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  imageCount?: number;
  actualCostUsd?: number;
  estimatedCostUsd?: number;
  costBasis?: "actual" | "estimated" | "minimum";
  environment?: Environment;
}

/**
 * Owner activity log — used both by settleOperation for owner outcomes and
 * by callers that want to record ad-hoc owner work. Best-effort on the
 * legacy owner_usage table; ai_usage insert throws on failure so we don't
 * lose ledger rows silently.
 */
export async function logOwnerUsage(
  operation: Operation,
  credits: number,
  requestId?: string,
  meta?: OwnerUsageMeta,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    await supabaseAdmin.rpc("log_owner_usage" as never, {
      _operation: operation,
      _credits: credits,
      _request_id: requestId ?? null,
    } as never);
  } catch { /* legacy private log — best-effort */ }
  if (!requestId) return;
  const { error } = await supabaseAdmin.from("ai_usage" as never).insert({
    request_id: requestId,
    user_id: null,
    actor_type: "owner",
    operation,
    provider: meta?.provider ?? null,
    model: meta?.model ?? null,
    input_tokens: meta?.inputTokens ?? 0,
    output_tokens: meta?.outputTokens ?? 0,
    total_tokens: meta?.totalTokens ?? ((meta?.inputTokens ?? 0) + (meta?.outputTokens ?? 0)),
    image_count: meta?.imageCount ?? 0,
    actual_cost_usd: meta?.actualCostUsd ?? null,
    estimated_cost_usd: meta?.estimatedCostUsd ?? null,
    cost_basis: meta?.costBasis ?? (meta?.actualCostUsd !== undefined ? "actual" : "estimated"),
    credits_reserved: 0,
    credits_charged: credits,
    status: "committed",
    environment: meta?.environment ?? serverStripeEnv(),
  } as never);
  if (error) throw new Error(`ai_usage insert (owner) failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Free-build ledger — delivers the homepage's "one free build" promise.
// ---------------------------------------------------------------------------
//
// Exactly ONE successful `generate_html` per browser+IP fingerprint, forever.
// Every subsequent generate call — and every edit / enhance / cloud save —
// still requires paid Pro. See `.lovable/plan.md`.

const FREE_BUILD_COOKIE = "obs_fb";
const FREE_BUILD_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2y

function readFreeBuildCookie(request: Request): string | null {
  const header = request.headers.get("cookie") || request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === FREE_BUILD_COOKIE) {
      const v = part.slice(eq + 1).trim();
      return v.length >= 8 && v.length <= 128 ? v : null;
    }
  }
  return null;
}

function firstForwardedIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || "0.0.0.0";
}

async function fingerprintFor(cookieValue: string, ip: string): Promise<string> {
  const secret = process.env.SESSION_SECRET || "obs_fb_fallback_secret";
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(`${cookieValue}|${ip}`).digest("hex");
}

function buildSetCookieHeader(value: string): string {
  return `${FREE_BUILD_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${FREE_BUILD_COOKIE_MAX_AGE}`;
}

/**
 * Attempts to consume the visitor's single free `generate_html` allowance.
 * On success returns `{ granted: true, setCookieHeader? }` — the caller MUST
 * forward `setCookieHeader` on its outgoing Response when present. On
 * exhaustion returns `{ granted: false, reason: "free_build_used" }`.
 * Any infrastructure error also returns `granted:false` so we never grant
 * a free build we can't record (would allow unlimited replays).
 */
export async function tryConsumeFreeBuild(
  request: Request,
  env: Environment,
): Promise<{ granted: boolean; setCookieHeader?: string; reason?: string }> {
  try {
    let cookieValue = readFreeBuildCookie(request);
    let setCookieHeader: string | undefined;
    if (!cookieValue) {
      cookieValue = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      setCookieHeader = buildSetCookieHeader(cookieValue);
    }
    const ip = firstForwardedIp(request);
    const fingerprint = await fingerprintFor(cookieValue, ip);
    const ipPrefix = ip.includes(":")
      ? ip.split(":").slice(0, 4).join(":")
      : ip.split(".").slice(0, 3).join(".");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("free_build_ledger" as never)
      .insert({ fingerprint, environment: env, ip_prefix: ipPrefix } as never);
    if (error) {
      // Postgres unique-violation → already redeemed.
      if ((error as { code?: string }).code === "23505"
          || /duplicate key value/i.test(error.message ?? "")) {
        return { granted: false, reason: "free_build_used", setCookieHeader };
      }
      return { granted: false, reason: "free_build_error" };
    }
    return { granted: true, setCookieHeader };
  } catch {
    return { granted: false, reason: "free_build_error" };
  }
}

/**
 * One-call entitlement check. Owner session bypasses charge and only logs.
 * Otherwise: bearer → Pro entitlement → reserve credits via v2 (idempotent
 * on requestId). Never charges unless the reservation succeeds; caller MUST
 * call settleOperation with the same requestId to release/finalize.
 *
 * SPECIAL CASE — `operation === "generate_html"`:
 * When the caller has no session or no Pro, we attempt the one-lifetime
 * free-build allowance BEFORE returning a denial. If granted we return
 * `kind: "free_trial"` (no reservation, no billing).
 */
export async function requirePaidOperation(
  request: Request,
  operation: Operation,
  requestId: string,
): Promise<EntitlementResult> {
  const env = serverStripeEnv();

  if (await isOwnerSession()) {
    return { kind: "owner", env, requestId };
  }

  const user = await resolveUserFromRequest(request);
  if (!user) {
    if (operation === "generate_html") {
      const free = await tryConsumeFreeBuild(request, env);
      if (free.granted) {
        return { kind: "free_trial", env, requestId, setCookieHeader: free.setCookieHeader };
      }
      return {
        kind: "denied", env, requestId,
        setCookieHeader: free.setCookieHeader,
        denial: creditsRequiredEnvelope({
          code: "auth_required", operation,
          message: "You've used your one free build. Sign in and upgrade to Obsidian Pro to keep building.",
        }),
      };
    }
    return {
      kind: "denied", env, requestId,
      denial: creditsRequiredEnvelope({
        code: "auth_required", operation,
        message: "Sign in to use paid AI features. Local editing remains free.",
      }),
    };
  }

  const pro = await hasActivePro(user, env);
  if (!pro) {
    if (operation === "generate_html") {
      const free = await tryConsumeFreeBuild(request, env);
      if (free.granted) {
        return { kind: "free_trial", env, requestId, user, setCookieHeader: free.setCookieHeader };
      }
      return {
        kind: "denied", env, requestId, user,
        setCookieHeader: free.setCookieHeader,
        denial: creditsRequiredEnvelope({
          code: "not_pro", operation,
          message: "Your free build is used. Upgrade to Obsidian Pro to keep building and editing.",
        }),
      };
    }
    return {
      kind: "denied", env, requestId, user,
      denial: creditsRequiredEnvelope({
        code: "not_pro", operation,
        message: "This feature requires Obsidian Pro. Local editing remains free.",
      }),
    };
  }

  const cap = await capForUser(user.userId, env);
  const reservation = await usageReserve(user, operation, env, requestId, cap);
  if (reservation === "no_period") {
    return {
      kind: "denied", env, requestId, user,
      denial: creditsRequiredEnvelope({
        code: "not_pro", operation,
        message: "Your Pro subscription has no active billing period. Renew or contact support.",
      }),
    };
  }
  if (!reservation) {
    return {
      kind: "denied", env, requestId, user,
      denial: creditsRequiredEnvelope({
        code: "credits_required", operation,
        used: cap, cap,
        needed: reservationForOperation(operation),
      }),
    };
  }
  return { kind: "pro", env, requestId, user, reservation };
}



export function denialResponse(
  denial: CreditsRequiredEnvelope,
  requestId?: string,
  setCookieHeader?: string,
): Response {
  const status = denial.code === "auth_required" ? 401 : 402;
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(requestId ? { "X-Request-Id": requestId } : {}),
  };
  if (setCookieHeader) headers["Set-Cookie"] = setCookieHeader;
  return new Response(JSON.stringify(denial), { status, headers });
}

/** Outcome shapes accepted by settleOperation. */
export type SettleOutcome =
  | { kind: "success"; usage: UsageRecord }
  | { kind: "failed_with_usage"; usage: UsageRecord; errorCode?: string }
  | { kind: "no_provider"; errorCode?: string };

/**
 * Commit / refund / log the reservation in ONE call.
 *   - denied      → no-op (denial already returned to the caller).
 *   - free_trial  → no-op (one-time free build; no reservation to settle).
 *   - owner       → writes an ai_usage row + owner_usage log (credits=0).
 *   - pro success → usage_finalize(charge, status='committed') — updates the pending row.
 *   - pro failed_with_usage → usage_finalize(charge, status='failed').
 *   - pro no_provider → usage_refund (releases the pending reservation).
 *
 * RPC errors are NOT swallowed. A swallowed failure would leave a stuck
 * pending reservation the user pays for forever.
 */
export async function settleOperation(
  ent: EntitlementResult,
  outcome: SettleOutcome,
): Promise<void> {
  if (ent.kind === "denied" || ent.kind === "free_trial") return;


  if (ent.kind === "owner") {
    if (outcome.kind === "no_provider") return;
    const usage = outcome.usage;
    await logOwnerUsage(usage.operation, 0, ent.requestId, {
      provider: usage.provider,
      model: usage.model ?? undefined,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      imageCount: usage.imageCount,
      actualCostUsd: usage.actualCostUsd ?? undefined,
      estimatedCostUsd: usage.estimatedCostUsd ?? undefined,
      costBasis: usage.costBasis,
      environment: ent.env,
    });
    return;
  }

  // Pro path — must have a reservation.
  const res = ent.reservation;
  if (!res) return;

  if (outcome.kind === "no_provider") {
    await usageRefundReservation(res.reservationId);
    return;
  }

  const usage = outcome.usage;
  // Pass full actual credits — do NOT clamp to reservation. The DB performs
  // cap-safe top-up (charge above the reservation is allowed only when the
  // period stays within CAP_PRO_MONTHLY) and reports back via meta.cap_limited.
  const charge = Math.max(0, Math.floor(usage.credits));
  const status = outcome.kind === "success" ? "committed" : "failed";
  const errorCode = outcome.kind === "failed_with_usage"
    ? (outcome.errorCode ?? usage.errorCode)
    : usage.errorCode;
  await usageFinalize(res.reservationId, charge, ent.requestId, status, res.cap, usage, errorCode);
}


