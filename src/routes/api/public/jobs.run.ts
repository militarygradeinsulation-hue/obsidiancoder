import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { claimAndRunBuildJob } from "@/lib/run-build-job.server";

const bodySchema = z.object({ jobId: z.string().uuid() });

/**
 * Not truly "public" in the sense of open to browsers — protected by the
 * same apikey header Postgres already sends (build_job_kick's net.http_post
 * call embeds the project's own publishable/anon key). This route exists
 * specifically so a job can run completely independent of any browser
 * connection: triggered by the database, not by a live request from
 * whoever started the build. Always returns 200 (short of malformed input)
 * even when the job turns out to already be claimed or finished — that is
 * the normal, expected outcome most of the time, not an error condition
 * for the caller to react to.
 */
export const Route = createFileRoute("/api/public/jobs/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey");
        if (!expected || !provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "jobId is required" }, { status: 400 });
        }

        // Deliberately NOT awaited before responding. Postgres's own
        // net.http_post call (both build_job_kick and the sweep cron) has
        // a short timeout on its end — racing that against a generation
        // that can legitimately run for up to a few minutes would just
        // make Postgres log a false timeout for work that's actually
        // proceeding fine. Acknowledge receipt fast; if a retry or the
        // next sweep tick calls this again for the same jobId before this
        // one finishes claiming, build_job_claim's own atomic conditional
        // update in Postgres is what makes only one of them win, not any
        // ordering guarantee in this file.
        claimAndRunBuildJob(parsed.data.jobId).catch(() => {
          /* claimAndRunBuildJob already records failures on the job row itself */
        });

        return Response.json({ ok: true, accepted: true });
      },
    },
  },
});
