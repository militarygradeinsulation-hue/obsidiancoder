import { createFileRoute } from "@tanstack/react-router";
import { getBuildJob, requestBuildJobCancel } from "@/lib/build-jobs.server";
import { isOwnerRequest, resolveUserFromRequest } from "@/lib/credit-gate.server";

export const Route = createFileRoute("/api/jobs/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = params.id;
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
          return Response.json({ error: "Invalid job id" }, { status: 400 });
        }

        const owner = await isOwnerRequest(request);
        const user = owner ? null : await resolveUserFromRequest(request);
        if (!owner && !user && !request.headers.get("x-obs-job-token")) {
          return Response.json({ error: "Sign in required" }, { status: 401 });
        }

        const job = await getBuildJob(id);
        if (!job) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        // Owner can see any job (matches existing owner-has-full-access
        // convention elsewhere). A signed-in user can only see their own.
        if (!owner && !(user && job.userId === user.userId) && !(job.anonId && job.anonId === request.headers.get("x-obs-job-token"))) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        return Response.json({
          id: job.id,
          status: job.status,
          stage: job.stage,
          progress: job.progress,
          partialHtml: job.partialHtml,
          resultHtml: job.status === "complete" ? job.resultHtml : null,
          error: job.error,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          servedModel: job.servedModel,
        }, { headers: { "Cache-Control": "no-store" } });
      },
      DELETE: async ({ request, params }) => {
        const id = params.id;
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
          return Response.json({ error: "Invalid job id" }, { status: 400 });
        }
        const owner = await isOwnerRequest(request);
        const user = owner ? null : await resolveUserFromRequest(request);
        if (!owner && !user && !request.headers.get("x-obs-job-token")) return Response.json({ error: "Sign in required" }, { status: 401 });
        const job = await getBuildJob(id);
        if (!job || (!owner && !(user && job.userId === user.userId) && !(job.anonId && job.anonId === request.headers.get("x-obs-job-token")))) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        await requestBuildJobCancel(id);
        return Response.json({ ok: true });
      },
    },
  },
});
