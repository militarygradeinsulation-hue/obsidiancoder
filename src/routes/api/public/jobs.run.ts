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

        // Hold this database-owned request until work and settlement finish.
        await claimAndRunBuildJob(parsed.data.jobId);

        return Response.json({ ok: true, accepted: true });
      },
    },
  },
});
