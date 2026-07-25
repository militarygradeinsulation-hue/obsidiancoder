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
          const snap: EntitlementSnapshot = {
            mode: "free", authed: true, subStatus: "none", environment: env,
            periodStart: null, periodEnd: null,
            used: 0, reserved: 0, cap: 0, remaining: 0,
          };
          return new Response(JSON.stringify(snap), { headers: NO_STORE });
        }
        // Active Pro — pull the subscription-window balance from usage_balance.
        let periodStart: string | null = null;
        let periodEnd: string | null = null;
        let used = 0, reserved = 0, remaining = 0;
        let subStatus: string | null = "active";
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
            _user_id: user.userId, _env: env, _cap: CAP_PRO_MONTHLY,
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
        const snap: EntitlementSnapshot = {
          mode: "pro", authed: true, subStatus, environment: env,
          periodStart, periodEnd, used, reserved, cap: CAP_PRO_MONTHLY, remaining,
        };

        return new Response(JSON.stringify(snap), { headers: NO_STORE });
      },
    },
  },
});
