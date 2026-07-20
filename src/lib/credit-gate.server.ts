// Server-only credit gate. Never import from client bundles.
// Handles: bearer auth resolution, Pro entitlement, atomic credit
// reservation, commit-on-success / refund-on-failure, and owner
// (SITE_PASSWORD) bypass with a private usage log.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  CAP_PRO_MONTHLY,
  costForOperation,
  creditsRequiredEnvelope,
  type CreditsRequiredEnvelope,
  type Operation,
} from "./credit-gate";

export type Environment = "sandbox" | "live";

export function serverStripeEnv(): Environment {
  // Live only when both live secrets are configured. Otherwise sandbox.
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
        // Preserve the user bearer we set above.
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export interface AuthedUser { userId: string; email?: string; token: string }

/** Parses "Authorization: Bearer <jwt>" from a Request. Returns null when missing/invalid shape. */
export function extractBearer(request: Request): string | null {
  const h = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!h) return null;
  if (!/^Bearer\s+/i.test(h)) return null;
  const tok = h.replace(/^Bearer\s+/i, "").trim();
  if (!tok || tok.split(".").length !== 3) return null;
  return tok;
}

/**
 * Resolves the signed-in user from a request. Never throws — returns null on
 * missing/invalid tokens so callers can decide 401 vs. 402 vs. owner-bypass.
 */
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

/** Returns true if the caller has the private site session cookie unlocked. */
export async function isOwnerSession(): Promise<boolean> {
  try {
    const { isUnlockedServer } = await import("./gate.server");
    return await isUnlockedServer();
  } catch {
    return false;
  }
}

/** Records owner-bypass usage into the private owner_usage table. Best-effort. */
export async function logOwnerUsage(operation: Operation, credits: number, requestId?: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("log_owner_usage" as never, {
      _operation: operation,
      _credits: credits,
      _request_id: requestId ?? null,
    } as never);
  } catch {
    /* private log is best-effort */
  }
}

/** Checks active Pro subscription for the user (RLS-safe: query own row). */
export async function hasActivePro(user: AuthedUser, env: Environment): Promise<boolean> {
  try {
    const sb = userClient(user.token);
    const { data } = await sb.rpc("has_active_pro" as never, {
      user_uuid: user.userId,
      check_env: env,
    } as never);
    return !!data;
  } catch {
    return false;
  }
}

export interface Reservation {
  reservationId: string;
  credits: number;
  operation: Operation;
  environment: Environment;
  usedBefore: number;
  remainingAfter: number;
}

export interface EntitlementResult {
  kind: "owner" | "pro" | "denied";
  user?: AuthedUser;
  reservation?: Reservation;
  denial?: CreditsRequiredEnvelope;
  env: Environment;
}

/**
 * Atomically reserves credits for `operation`. Uses the security-definer
 * SQL `reserve_credits` RPC which holds an advisory lock for the caller's
 * (user, env) key so concurrent reservations cannot jointly exceed the cap.
 */
export async function reserveCredits(
  user: AuthedUser,
  operation: Operation,
  env: Environment,
): Promise<Reservation | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const credits = costForOperation(operation);
  const { data, error } = await supabaseAdmin.rpc("reserve_credits" as never, {
    _user_id: user.userId,
    _amount: credits,
    _cap: CAP_PRO_MONTHLY,
    _env: env,
    _operation: operation,
  } as never);
  if (error) throw new Error(`reserve_credits failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { reservation_id: string; used_before: number; remaining_after: number }
    | null
    | undefined;
  if (!row || !row.reservation_id) return null;
  return {
    reservationId: row.reservation_id,
    credits,
    operation,
    environment: env,
    usedBefore: Number(row.used_before ?? 0),
    remainingAfter: Number(row.remaining_after ?? 0),
  };
}

export async function commitReservation(id: string, requestId?: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("commit_credits" as never, {
      _reservation_id: id,
      _request_id: requestId ?? null,
    } as never);
  } catch {
    /* commit failure surfaces via balance drift; do not fail the user request */
  }
}

export async function refundReservation(id: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("refund_credits" as never, { _reservation_id: id } as never);
  } catch {
    /* best-effort */
  }
}

// EntitlementResult is declared above (with Reservation) so callers can name it.

/**
 * One-call entitlement check. Owner session bypasses charge and only logs.
 * Otherwise: bearer → Pro entitlement → reserve credits. Never charges
 * unless the reservation succeeds; caller must commit or refund.
 */
export async function requirePaidOperation(
  request: Request,
  operation: Operation,
): Promise<EntitlementResult> {
  const env = serverStripeEnv();

  // 1. Owner bypass (site-password session).
  if (await isOwnerSession()) {
    return { kind: "owner", env };
  }

  // 2. Signed-in user required.
  const user = await resolveUserFromRequest(request);
  if (!user) {
    return {
      kind: "denied",
      env,
      denial: creditsRequiredEnvelope({
        code: "auth_required",
        operation,
        message: "Sign in to use paid AI features. Local editing remains free.",
      }),
    };
  }

  // 3. Active Pro entitlement.
  const pro = await hasActivePro(user, env);
  if (!pro) {
    return {
      kind: "denied",
      env,
      user,
      denial: creditsRequiredEnvelope({
        code: "not_pro",
        operation,
        message: "This feature requires Obsidian Pro. Local editing remains free.",
      }),
    };
  }

  // 4. Reserve credits atomically.
  const reservation = await reserveCredits(user, operation, env);
  if (!reservation) {
    // Cap already reached this month.
    return {
      kind: "denied",
      env,
      user,
      denial: creditsRequiredEnvelope({
        code: "credits_required",
        operation,
        used: CAP_PRO_MONTHLY,
        cap: CAP_PRO_MONTHLY,
        needed: costForOperation(operation),
      }),
    };
  }
  return { kind: "pro", env, user, reservation };
}

/** JSON 402 response for denial envelopes. */
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

/**
 * Convenience commit/refund pair that also emits an owner-usage log for the
 * bypass path. Safe to call with an owner EntitlementResult (no reservation).
 */
export async function settle(
  ent: EntitlementResult,
  outcome: "commit" | "refund",
  requestId?: string,
): Promise<void> {
  if (ent.kind === "owner") {
    // Log owner usage on the successful path only.
    if (outcome === "commit") {
      const first = requestId ?? undefined;
      await logOwnerUsage("generate_html", 0, first); // caller can override by calling logOwnerUsage directly
    }
    return;
  }
  if (ent.kind === "pro" && ent.reservation) {
    if (outcome === "commit") await commitReservation(ent.reservation.reservationId, requestId);
    else await refundReservation(ent.reservation.reservationId);
  }
}
