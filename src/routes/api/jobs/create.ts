// POST /api/jobs/create — accept a durable build job.
//
// Fast path: meter ONCE (idempotency key), insert the row, ask Postgres to
// dispatch it, and return the job id. Target: < 500ms.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { newRequestId } from "@/lib/ai-errors";
import {
  requirePaidOperation,
  denialResponse,
  serverStripeEnv,
} from "@/lib/credit-gate.server";
import { idempotencyKeyFor } from "@/lib/build-jobs";
import { findJobByIdempotencyKey, insertJob, kickJob } from "@/lib/build-jobs.server";

const bodySchema = z.object({
  prompt: z.string().min(1).max(20_000),
  mode: z.enum(["create", "refine"]).default("create"),
  profile: z.enum(["fast", "studio", "cinematic"]).default("fast"),
  styleFamily: z.string().max(80).optional(),
  model: z.string().max(160).optional(),
  title: z.string().max(200).optional(),
  libraryCode: z.string().max(64).optional(),
  sessionId: z.string().max(120).optional(),
  projectId: z.string().uuid().optional(),
  surface: z.enum(["pocket", "vibe"]).default("pocket"),
  memoryHit: z.boolean().optional(),
  previousHtml: z.string().max(2_000_000).optional(),
  requestBody: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(4).max(120).optional(),
});

export const Route = createFileRoute("/api/jobs/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let input: z.infer<typeof bodySchema>;
        try {
          input = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ ok: false, error: "Invalid job request" }, { status: 400 });
        }

        const scope =
          input.libraryCode?.trim() || input.sessionId?.trim() || "anon";
        const key =
          input.idempotencyKey ||
          idempotencyKeyFor({
            scope,
            prompt: input.prompt,
            mode: input.mode,
            profile: input.profile,
            styleFamily: input.styleFamily ?? null,
            previousHtmlLength: input.previousHtml?.length ?? 0,
          });

        // Duplicate submit (double click, reload+resubmit) → same job, no
        // second charge.
        const existing = await findJobByIdempotencyKey(key);
        if (existing) {
          return Response.json({ ok: true, jobId: existing.id, duplicate: true });
        }

        const requestId = newRequestId();
        const ent = await requirePaidOperation(request, "generate_html", requestId);
        if (ent.kind === "denied" && ent.denial) {
          return denialResponse(ent.denial, requestId);
        }

        const origin = new URL(request.url).origin;
        try {
          const job = await insertJob({
            idempotency_key: key,
            user_id: ent.user?.userId ?? null,
            library_code: input.libraryCode ?? null,
            session_id: input.sessionId ?? null,
            project_id: input.projectId ?? null,
            surface: input.surface,
            title: input.title ?? null,
            prompt: input.prompt,
            mode: input.mode,
            profile: input.profile,
            style_family: input.styleFamily ?? null,
            model_request: input.model ?? null,
            previous_html: input.previousHtml ?? null,
            request_body: input.requestBody as Record<string, unknown>,
            memory_hit: !!input.memoryHit,
            environment: serverStripeEnv(),
            entitlement_kind: ent.kind,
            request_id: requestId,
            reservation_id: ent.reservation?.reservationId ?? null,
            reservation_credits: ent.reservation?.credits ?? null,
            reservation_cap: ent.reservation?.cap ?? null,
            status: "queued",
            stage: "queued",
          });
          if (!job) throw new Error("Job could not be created");

          // Durable dispatch from Postgres — independent of this browser.
          try {
            await kickJob(job.id, origin);
          } catch {
            /* the pg_cron sweeper picks it up within a minute */
          }

          return Response.json({ ok: true, jobId: job.id, duplicate: false });
        } catch (err) {
          return Response.json(
            {
              ok: false,
              error: err instanceof Error ? err.message.slice(0, 200) : "Job creation failed",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
