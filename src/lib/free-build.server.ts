// Server-only: daily free build entitlement for signed-in free-tier users.
//
// Contract:
//   - One AI generation (generate_html) per calendar day (UTC) per verified user.
//   - Tracked in `public.free_build_ledger` via `claim_free_build` RPC.
//     The RPC inserts atomically (UNIQUE on user_id + date); duplicate = already used.
//   - `release_free_build` deletes within a 10-min safety window so we can
//     refund a claim if provider work never started.
//   - Only `generate_html` is granted; patches, images, deploy stay Pro-only.
//   - Owner sessions bypass this path entirely (handled upstream).
//   - Pro sessions bypass this path entirely (handled upstream).
//
// Why daily instead of monthly?
//   - Lower barrier: every day is a new chance to see value.
//   - Conversion pressure: user hits the limit and sees the upgrade prompt every day.
//   - Cost is bounded: 10 credits max per user per day (~$0.05).

import type { Environment } from "@/lib/credit-gate.server";
import type { AuthedUser } from "@/lib/credit-gate.server";

/** Only this operation is granted on the free daily path. */
export const FREE_DAILY_OPERATION = "generate_html" as const;

export interface FreeBuildClaimResult {
  ok: boolean;
  reason?: "already_used" | "unavailable" | "not_today";
}

/**
 * Atomically claim today's free build for a verified signed-in user.
 * Uses UTC date so the reset is predictable regardless of user timezone.
 * Returns ok=true once per user per UTC day, false every time after.
 */
export async function claimFreeBuild(
  user: AuthedUser,
  environment: Environment,
): Promise<FreeBuildClaimResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const todayUtc = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const { data, error } = await supabaseAdmin.rpc("claim_free_build" as never, {
      _user_id: user.userId,
      _date: todayUtc,
      _environment: environment,
    } as never);
    if (error) {
      console.warn("[free-build] claim RPC error", error.message);
      return { ok: false, reason: "unavailable" };
    }
    // RPC returns true on fresh insert, false on duplicate
    return data === true
      ? { ok: true }
      : { ok: false, reason: "already_used" };
  } catch (err) {
    console.warn("[free-build] claim exception", err instanceof Error ? err.message : err);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Refund a very recent free build claim (10-min safety window enforced by SQL).
 * Called from settleOperation when kind === "free_build" and outcome === no_provider.
 */
export async function releaseFreeBuild(
  user: AuthedUser,
  environment: Environment,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const todayUtc = new Date().toISOString().slice(0, 10);
    await supabaseAdmin.rpc("release_free_build" as never, {
      _user_id: user.userId,
      _date: todayUtc,
      _environment: environment,
    } as never);
  } catch {
    /* best-effort refund; safety window bounds the exposure */
  }
}

/**
 * Read-only check: has this user already used their free build today?
 * Used by the status endpoint and the client to show the upgrade prompt.
 */
export async function isFreeBuildUsed(
  user: AuthedUser,
  environment: Environment,
): Promise<{ used: boolean; unavailable?: boolean }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const todayUtc = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabaseAdmin.rpc("free_build_used" as never, {
      _user_id: user.userId,
      _date: todayUtc,
      _environment: environment,
    } as never);
    if (error) return { used: false, unavailable: true };
    return { used: data === true };
  } catch {
    return { used: false, unavailable: true };
  }
}
