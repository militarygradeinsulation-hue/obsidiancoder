import { createFileRoute } from "@tanstack/react-router";
import { getBuildJob, requestBuildJobCancel } from "@/lib/build-jobs.server";
import { isOwnerRequest, resolveUserFromRequest } from "@/lib/credit-gate.server";
import {
  fingerprintFromFreeOpenCookie,
  readOrMintFreeOpenCookie,
} from "@/lib/free-open.server";

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
        const freeInfo = !owner && !user ? readOrMintFreeOpenCookie(request) : null;
        const anonymousFingerprint =
          freeInfo && !freeInfo.setCookieHeader
            ? fingerprintFromFreeOpenCookie(freeInfo)
            : null;

        const job = await getBuildJob(id);
        if (!job) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        const authorized =
          owner ||
          (!!user?.userId && job.userId === user.userId) ||
          (!!anonymousFingerprint && job.anonId === anonymousFingerprint);
        if (!authorized) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        return Response.json({
          id: job.id,
          status: job.status,
          stage: job.stage,
          progress: job.progress,
          partialHtml: job.partialHtml,
          resultHtml: job.status === "complete" ? job.resultHtml : null,
          servedModel: job.servedModel,
          error: job.error,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
        });
      },
      DELETE: async ({ request, params }) => {
        const id = params.id;
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
          return Response.json({ error: "Invalid job id" }, { status: 400 });
        }
        const owner = await isOwnerRequest(request);
        const user = owner ? null : await resolveUserFromRequest(request);
        const freeInfo = !owner && !user ? readOrMintFreeOpenCookie(request) : null;
        const anonymousFingerprint =
          freeInfo && !freeInfo.setCookieHeader
            ? fingerprintFromFreeOpenCookie(freeInfo)
            : null;
        const job = await getBuildJob(id);
        const authorized =
          !!job && (
            owner ||
            (!!user?.userId && job.userId === user.userId) ||
            (!!anonymousFingerprint && job.anonId === anonymousFingerprint)
          );
        if (!authorized) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        await requestBuildJobCancel(id);
        return Response.json({ ok: true });
      },
    },
  },
});
