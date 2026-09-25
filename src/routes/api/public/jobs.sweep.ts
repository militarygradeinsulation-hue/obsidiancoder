import { createFileRoute } from "@tanstack/react-router";
import { listStaleBuildJobs } from "@/lib/build-jobs.server";
import { claimAndRunBuildJob } from "@/lib/run-build-job.server";

/**
 * Same apikey protection as jobs.run.ts. This is the route the ALREADY
 * ACTIVE pg_cron job "obsidian-build-job-sweep" has been calling every
 * single minute since before this route existed (it was 404ing). It picks
 * up anything build_jobs_stale() considers eligible for a retry — queued
 * too long with nobody ever having claimed it, or claimed but with an
 * expired lease, meaning whatever was processing it died without
 * finishing — and re-triggers each one.
 *
 * This is the real safety net for the one thing application code can't
 * fully control: if the hosting platform ever does kill a request's
 * execution the instant its client disconnects, a job stuck at
 * status='running' with a stale lease surfaces here within about a
 * minute and gets a genuine retry, independent of any browser.
 */
export const Route = createFileRoute("/api/public/jobs/sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey");
        if (!expected || !provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let stale: Array<{ id: string; retryCount: number }> = [];
        try {
          stale = await listStaleBuildJobs(5);
        } catch {
          // A failed lookup this minute is not an emergency — the cron
          // runs again in 60 seconds.
          return Response.json({ ok: true, kicked: 0 });
        }

        for (const job of stale) {
          claimAndRunBuildJob(job.id).catch(() => {
            /* claimAndRunBuildJob already records failures on the job row itself */
          });
        }

        return Response.json({ ok: true, kicked: stale.length });
      },
    },
  },
});
