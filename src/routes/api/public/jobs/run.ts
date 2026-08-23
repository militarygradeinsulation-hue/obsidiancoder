// POST /api/public/jobs/run — the durable worker entry point.
//
// Called by Postgres (pg_net) when a job is created, and by the pg_cron
// sweeper for stale jobs. It is NOT called by the browser build flow, so the
// generation survives navigation, reload and tab close.
//
// Security: the caller must present the project's Supabase apikey (the same
// pattern used for every scheduled endpoint here). The body only names a job
// id; all build inputs come from the trusted `build_jobs` row.

import { createFileRoute } from "@tanstack/react-router";
import { runBuildJob } from "@/lib/job-runner.server";

function callerAllowed(request: Request): boolean {
  const key = request.headers.get("apikey") ?? "";
  const expected = [
    process.env["SUPABASE_ANON_KEY"],
    process.env["SUPABASE_PUBLISHABLE_KEY"],
    process.env["SUPABASE_SERVICE_ROLE_KEY"],
  ].filter(Boolean) as string[];
  return !!key && expected.includes(key);
}

export const Route = createFileRoute("/api/public/jobs/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!callerAllowed(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const body = (await request.json().catch(() => ({}))) as { jobId?: string };
        const jobId = (body.jobId ?? "").trim();
        if (!jobId) return Response.json({ ok: false, error: "jobId required" }, { status: 400 });

        const origin = new URL(request.url).origin;
        const result = await runBuildJob(jobId, origin);
        return Response.json(result);
      },
    },
  },
});
