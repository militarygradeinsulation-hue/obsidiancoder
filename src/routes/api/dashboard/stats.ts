// GET /api/dashboard/stats — server-aggregated KPIs for the dashboard.
// Returns: cloud project count, published (deployed) build count, AI build
// count in last 30 days, total credits used in last 30 days.
// Auth: Bearer JWT required. Owner session returns owner-level data.

import { createFileRoute } from "@tanstack/react-router";
import {
  resolveUserFromRequest,
  isOwnerSession,
  serverStripeEnv,
} from "@/lib/credit-gate.server";

export const Route = createFileRoute("/api/dashboard/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ownerSession = await isOwnerSession();
        const user = ownerSession ? null : await resolveUserFromRequest(request);
        if (!ownerSession && !user) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        const userId = user?.userId ?? null;
        const env = serverStripeEnv();
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Run all four queries in parallel.
          const [cloudRes, deployRes, buildsRes, creditsRes] = await Promise.all([
            // Cloud projects count
            userId
              ? supabaseAdmin.from("builds" as never)
                  .select("id", { count: "exact", head: true })
                  .eq("user_id", userId)
                  .eq("is_cloud", true)
              : Promise.resolve({ count: 0, error: null }),

            // Published/deployed builds
            userId
              ? supabaseAdmin.from("builds" as never)
                  .select("id", { count: "exact", head: true })
                  .eq("user_id", userId)
                  .eq("is_public", true)
              : Promise.resolve({ count: 0, error: null }),

            // AI generate_html calls last 30 days
            userId
              ? supabaseAdmin.from("ai_usage" as never)
                  .select("id", { count: "exact", head: true })
                  .eq("user_id", userId)
                  .eq("operation", "generate_html")
                  .eq("status", "committed")
                  .eq("environment", env)
                  .gte("created_at", since30d)
              : Promise.resolve({ count: 0, error: null }),

            // Total credits charged last 30 days
            userId
              ? supabaseAdmin.from("ai_usage" as never)
                  .select("credits_charged")
                  .eq("user_id", userId)
                  .eq("status", "committed")
                  .eq("environment", env)
                  .gte("created_at", since30d)
              : Promise.resolve({ data: [], error: null }),
          ]) as [
            { count: number | null; error: unknown },
            { count: number | null; error: unknown },
            { count: number | null; error: unknown },
            { data: Array<{ credits_charged: number }> | null; error: unknown },
          ];

          const totalCredits = (creditsRes.data ?? []).reduce(
            (s, r) => s + (r.credits_charged ?? 0), 0
          );

          return new Response(JSON.stringify({
            ok: true,
            cloudProjects: Number(cloudRes.count ?? 0),
            deployedBuilds: Number(deployRes.count ?? 0),
            aiBuilds30d: Number(buildsRes.count ?? 0),
            credits30d: totalCredits,
          }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        } catch (err) {
          return new Response(JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message.slice(0, 120) : "Stats failed",
          }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});
