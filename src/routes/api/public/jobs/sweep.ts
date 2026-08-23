// POST /api/public/jobs/sweep — pg_cron safety net (every minute).
//
// Re-dispatches jobs that are still queued or whose worker lease expired
// (worker crash, cold start, dropped pg_net request). Bounded work per run:
// at most SWEEP_LIMIT jobs, one execution inline, the rest re-kicked.

import { createFileRoute } from "@tanstack/react-router";
import { kickJob, staleJobIds } from "@/lib/build-jobs.server";
import { runBuildJob } from "@/lib/job-runner.server";

const SWEEP_LIMIT = 3;

function callerAllowed(request: Request): boolean {
  const key = request.headers.get("apikey") ?? "";
  const expected = [
    process.env["SUPABASE_ANON_KEY"],
    process.env["SUPABASE_PUBLISHABLE_KEY"],
    process.env["SUPABASE_SERVICE_ROLE_KEY"],
  ].filter(Boolean) as string[];
  return !!key && expected.includes(key);
}

async function sweep(request: Request) {
  if (!callerAllowed(request)) return new Response("Unauthorized", { status: 401 });
  const origin = new URL(request.url).origin;
  const ids = await staleJobIds(SWEEP_LIMIT);
  if (!ids.length) return Response.json({ ok: true, swept: 0 });

  const [first, ...rest] = ids;
  const results: Array<{ jobId: string; ok: boolean; reason?: string }> = [];
  if (first) results.push(await runBuildJob(first, origin));
  for (const id of rest) {
    try {
      await kickJob(id, origin);
    } catch {
      /* next sweep retries */
    }
  }
  return Response.json({ ok: true, swept: ids.length, results });
}

export const Route = createFileRoute("/api/public/jobs/sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => sweep(request),
      GET: async ({ request }) => sweep(request),
    },
  },
});
