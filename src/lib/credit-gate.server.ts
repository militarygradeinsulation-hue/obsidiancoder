// Server-only credit gate. Never import from client bundles.
//
// Runtime flow (as of the usage-ledger conversion):
//   1. requirePaidOperation(request, op, requestId)
//        → owner cookie OR bearer → active Pro → reserve_credits_v2(requestId)
//        → returns EntitlementResult { kind, reservation?, denial? }.
//   2. Caller does the work, then builds a UsageRecord.
//   3. settleOperation(ent, requestId, outcome) commits, refunds, or logs
//      owner activity as appropriate and writes a row to `ai_usage`.
//
// Legacy `reserve_credits` / `commit_credits` RPCs are NEVER called from
// runtime paths anymore — only `reserve_credits_v2`, `finalize_credits`, and
// `refund_credits`. The pure JS ReservationLedger in `credit-gate.ts` still
// mirrors the SQL contract for unit tests.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  CAP_PRO_MONTHLY,
  costForOperation,
  creditsRequiredEnvelope,
  type CreditsRequiredEnvelope,
  type Operation,
} from "./credit-gate";
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

export async function hasActivePro(user: AuthedUser, env: Environment): Promise<boolean> {
  try {
    const sb = userClient(user.token);
    const { data } = await sb.rpc("has_active_pro" as never, {
      user_uuid: user.userId,
      check_env: env,
    } as never);
    return !!data;
  } catch { return false; }
}

export interface Reservation {
  reservationId: string;
  credits: number;              // credits held on the reservation (per-op fixed cost)
  operation: Operation;
  environment: Environment;
  usedBefore: number;
  remainingAfter: number;
  idempotent: boolean;          // true when reserve_credits_v2 returned an existing row
}

export interface EntitlementResult {
  kind: "owner" | "pro" | "denied";
  user?: AuthedUser;
  reservation?: Reservation;
  denial?: CreditsRequiredEnvelope;
  env: Environment;
  requestId: string;
}

/**
 * Atomic, idempotent reservation via `reserve_credits_v2`. The same
 * `requestId` returns the same reservation row without double-charging —
 * the SQL enforces the invariant, we just carry the id through.
 */
async function reserveCreditsV2(
  user: AuthedUser,
  operation: Operation,
  env: Environment,
  requestId: string,
): Promise<Reservation | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const amount = costForOperation(operation);
  const { data, error } = await supabaseAdmin.rpc("reserve_credits_v2" as never, {
    _user_id: user.userId,
    _amount: amount,
    _cap: CAP_PRO_MONTHLY,
    _env: env,
    _operation: operation,
    _request_id: requestId,
  } as never);
  if (error) throw new Error(`reserve_credits_v2 failed: ${error.message}`);
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
  };
}

/**
 * Finalize a reservation to `actualCredits`. Errors are surfaced — settlement
 * failures must never be silently swallowed (a swallowed finalize would leak
 * the reservation as pending forever).
 */
async function finalizeReservation(
  reservationId: string,
  actualCredits: number,
  requestId: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("finalize_credits" as never, {
    _reservation_id: reservationId,
    _actual_credits: Math.max(0, Math.floor(actualCredits)),
    _request_id: requestId,
  } as never);
  if (error) throw new Error(`finalize_credits failed: ${error.message}`);
  if (data === false) throw new Error("finalize_credits returned false (reservation missing or wrong state)");
}

async function refundReservation(reservationId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("refund_credits" as never, {
    _reservation_id: reservationId,
  } as never);
  if (error) throw new Error(`refund_credits failed: ${error.message}`);
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

/**
 * One-call entitlement check. Owner session bypasses charge and only logs.
 * Otherwise: bearer → Pro entitlement → reserve credits via v2 (idempotent
 * on requestId). Never charges unless the reservation succeeds; caller MUST
 * call settleOperation with the same requestId to release/finalize.
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
    return {
      kind: "denied", env, requestId, user,
      denial: creditsRequiredEnvelope({
        code: "not_pro", operation,
        message: "This feature requires Obsidian Pro. Local editing remains free.",
      }),
    };
  }

  const reservation = await reserveCreditsV2(user, operation, env, requestId);
  if (!reservation) {
    return {
      kind: "denied", env, requestId, user,
      denial: creditsRequiredEnvelope({
        code: "credits_required", operation,
        used: CAP_PRO_MONTHLY, cap: CAP_PRO_MONTHLY,
        needed: costForOperation(operation),
      }),
    };
  }
  return { kind: "pro", env, requestId, user, reservation };
}

export function denialResponse(denial: CreditsRequiredEnvelope, requestId?: string): Response {
  const status = denial.code === "auth_required" ? 401 : 402;
  return new Response(JSON.stringify(denial), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(requestId ? { "X-Request-Id": requestId } : {}),
    },
  });
}

/** Outcome shapes accepted by settleOperation. */
export type SettleOutcome =
  | { kind: "success"; usage: UsageRecord }
  | { kind: "failed_with_usage"; usage: UsageRecord; errorCode?: string }
  | { kind: "no_provider"; errorCode?: string };

/**
 * Commit / refund / log the reservation to durable storage in ONE call.
 *   - denied      → no-op (denial already returned to the caller).
 *   - owner       → writes an ai_usage row + owner_usage log (credits=0).
 *   - pro success → finalize_credits(actualCredits) + ai_usage(status=committed).
 *   - pro failed_with_usage → finalize_credits(actualCredits) + ai_usage(status=failed).
 *   - pro no_provider → refund_credits (no ai_usage row; nothing consumed).
 *
 * RPC errors are NOT swallowed. If Supabase rejects the settlement we throw so
 * the caller can log the drift — a swallowed failure means a stuck pending
 * reservation the user pays for forever.
 */
export async function settleOperation(
  ent: EntitlementResult,
  outcome: SettleOutcome,
): Promise<void> {
  if (ent.kind === "denied") return;

  if (ent.kind === "owner") {
    if (outcome.kind === "no_provider") {
      // Nothing metered for the owner either.
      return;
    }
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
    await refundReservation(res.reservationId);
    return;
  }

  const usage = outcome.usage;
  const charge = Math.max(0, Math.min(usage.credits, res.credits));
  await finalizeReservation(res.reservationId, charge, ent.requestId);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const status = outcome.kind === "success" ? "committed" : "failed";
  const errorCode = outcome.kind === "failed_with_usage" ? outcome.errorCode ?? usage.errorCode : usage.errorCode;

  const { error } = await supabaseAdmin.from("ai_usage" as never).insert({
    request_id: ent.requestId,
    user_id: ent.user?.userId ?? null,
    actor_type: "user",
    operation: usage.operation,
    provider: usage.provider,
    model: usage.model ?? null,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    total_tokens: usage.totalTokens,
    image_count: usage.imageCount,
    actual_cost_usd: usage.actualCostUsd ?? null,
    estimated_cost_usd: usage.estimatedCostUsd ?? null,
    cost_basis: usage.costBasis,
    credits_reserved: res.credits,
    credits_charged: charge,
    status,
    error_code: errorCode ?? null,
    environment: ent.env,
    meta: usage.meta ?? null,
  } as never);
  if (error) throw new Error(`ai_usage insert failed: ${error.message}`);
}

