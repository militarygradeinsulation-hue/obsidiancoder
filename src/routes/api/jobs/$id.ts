// GET  /api/jobs/:id — current job state (poll target for the Pocket client).
// POST /api/jobs/:id — { action: "cancel" } sets the server cancellation flag.
//
// Navigating away NEVER cancels; only an explicit call here does.

import { createFileRoute } from "@tanstack/react-router";
import { getJob, requestCancel } from "@/lib/build-jobs.server";
import { resolveUserFromRequest, isOwnerRequest } from "@/lib/credit-gate.server";
import type { BuildJobView } from "@/lib/build-jobs";

async function authorized(request: Request, job: { user_id: string | null; library_code: string | null }) {
  if (!job.user_id) return true; // anonymous/free job — scoped by unguessable id
  if (await isOwnerRequest(request)) return true;
  const user = await resolveUserFromRequest(request);
  return !!user && user.userId === job.user_id;
}

function toView(job: Awaited<ReturnType<typeof getJob>>): BuildJobView {
  const j = job!;
  return {
    id: j.id,
    status: j.status,
    stage: j.stage,
    progress: j.progress,
    partialHtml: j.partial_html,
    resultHtml: j.result_html,
    error: j.error,
    servedModel: j.served_model,
    memoryHit: j.memory_hit,
    timings: j.timings ?? {},
    createdAt: j.created_at,
    completedAt: j.completed_at,
    title: j.title,
    prompt: j.prompt,
    mode: j.mode,
  };
}

export const Route = createFileRoute("/api/jobs/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const job = await getJob(params.id);
        if (!job) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
        if (!(await authorized(request, job))) {
          return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }
        return new Response(JSON.stringify({ ok: true, job: toView(job) }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
      POST: async ({ request, params }) => {
        const job = await getJob(params.id);
        if (!job) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
        if (!(await authorized(request, job))) {
          return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }
        const body = (await request.json().catch(() => ({}))) as { action?: string };
        if (body.action !== "cancel") {
          return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
        }
        await requestCancel(params.id);
        return Response.json({ ok: true, cancelled: true });
      },
    },
  },
});
