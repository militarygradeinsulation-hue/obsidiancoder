// Same-origin entitlement endpoint. Returns ONLY entitlement state; never any
// project content. Derives owner/pro/free server-side from the site-owner
// cookie and the caller's Supabase bearer.
import { createFileRoute } from "@tanstack/react-router";
import { CAP_PRO_MONTHLY } from "@/lib/credit-gate";
import {
  isOwnerSession,
  resolveUserFromRequest,
  serverStripeEnv,
  hasActivePro,
  pocketBuildUsage,
  capForUser,
} from "@/lib/credit-gate.server";

export type EntitlementMode = "owner" | "pro" | "free";
export interface EntitlementSnapshot {
  mode: EntitlementMode;
  authed: boolean;
  subStatus: string | null;
  environment: "sandbox" | "live";
  periodStart: string | null;
  periodEnd: string | null;
  used: number;
  reserved: number;
  cap: number;
  remaining: number;
  /** Active plan tier id (null when free / unresolved). */
  tier?: string | null;
  /** Pocket build allowance for this billing period (cap 0 when not on Pocket). */
  builds?: { used: number; cap: number; remaining: number };
  /** True when mode=free+authed and the daily free build has not been used yet. */
  freeBuildAvailable?: boolean;
}

const NO_STORE = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };

export const Route = createFileRoute("/api/public/entitlement")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = serverStripeEnv();
        // Owner bypass — no auth needed.
        if (await isOwnerSession()) {
          const snap: EntitlementSnapshot = {
            mode: "owner", authed: false, subStatus: null, environment: env,
            periodStart: null, periodEnd: null,
            used: 0, reserved: 0, cap: CAP_PRO_MONTHLY, remaining: CAP_PRO_MONTHLY,
          };
          return new Response(JSON.stringify(snap), { headers: NO_STORE });
        }
        const user = await resolveUserFromRequest(request);
        if (!user) {
          const snap: EntitlementSnapshot = {
            mode: "free", authed: false, subStatus: null, environment: env,
            periodStart: null, periodEnd: null,
            used: 0, reserved: 0, cap: 0, remaining: 0,
          };
          return new Response(JSON.stringify(snap), { headers: NO_STORE });
        }
        const pro = await hasActivePro(user, env);
        if (!pro) {
          // Free authenticated users get 1 generate_html per UTC day.
          // Check whether they've already used it today so the client can
          // show the right state (remaining: 1 = can build, remaining: 0 = used).
          let freeBuildUsed = false;
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const todayUtc = new Date().toISOString().slice(0, 10);
            const { data } = await supabaseAdmin.rpc("free_build_used" as never, {
              _user_id: user.userId,
              _date: todayUtc,
              _environment: env,
            } as never);
            freeBuildUsed = data === true;
          } catch { /* best-effort — default to not-used so we don't block */ }
          const snap: EntitlementSnapshot = {
            mode: "free", authed: true, subStatus: "none", environment: env,
            periodStart: new Date().toISOString().slice(0, 10),
            periodEnd: new Date().toISOString().slice(0, 10),
            used: freeBuildUsed ? 1 : 0,
            reserved: 0,
            cap: 1,
            remaining: freeBuildUsed ? 0 : 1,
            freeBuildAvailable: !freeBuildUsed,
          };
          return new Response(JSON.stringify(snap), { headers: NO_STORE });
        }
        // Active Pro — pull the subscription-window balance from usage_balance.
        let periodStart: string | null = null;
        let periodEnd: string | null = null;
        let used = 0, reserved = 0, remaining = 0;
        let subStatus: string | null = "active";
        // Resolve the caller's REAL tier cap once, up front, and use it for
        // both the ledger RPC's _cap and everything the snapshot reports.
        const resolvedCap = await capForUser(user.userId, env).catch(() => CAP_PRO_MONTHLY);
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: subRow } = await supabaseAdmin
            .from("subscriptions" as never)
            .select("status, current_period_start, current_period_end")
            .eq("user_id", user.userId)
            .eq("environment", env)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (subRow) {
            const r = subRow as { status: string; current_period_start: string | null; current_period_end: string | null };
            subStatus = r.status;
            periodStart = r.current_period_start;
            periodEnd = r.current_period_end;
          }
          const { data: bal } = await supabaseAdmin.rpc("usage_balance" as never, {
            _user_id: user.userId, _env: env, _cap: resolvedCap,
          } as never);
          const row = (Array.isArray(bal) ? bal[0] : bal) as
            | { used: number; reserved: number; cap: number; remaining: number; period_start: string | null; period_end: string | null; active: boolean }
            | null | undefined;
          if (row) {
            used = Number(row.used ?? 0);
            reserved = Number(row.reserved ?? 0);
            remaining = Number(row.remaining ?? 0);
            periodStart = row.period_start ?? periodStart;
            periodEnd = row.period_end ?? periodEnd;
          }
        } catch { /* best-effort */ }
        let tier: string | null = null;
        // Pocket is metered on the same shared credit ledger as every other
        // tier now, so `builds` mirrors the real ledger instead of the legacy
        // per-build counter, which promised headroom the gate never honored.
        try {
          tier = (await pocketBuildUsage(user.userId, env)).tier;
        } catch { /* best-effort */ }
        const builds = { used, cap: resolvedCap, remaining };

        const snap: EntitlementSnapshot = {
          mode: "pro", authed: true, subStatus, environment: env,
          periodStart, periodEnd, used, reserved, cap: resolvedCap, remaining,
          tier, builds,
        };

        return new Response(JSON.stringify(snap), { headers: NO_STORE });
      },
    },
  },
});
