import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createBuildJob } from "@/lib/build-jobs.server";
import { claimAndRunBuildJob } from "@/lib/run-build-job.server";
import { isOwnerRequest, resolveUserFromRequest, OWNER_CODE_HEADER } from "@/lib/credit-gate.server";
import type { StoredJobRequest } from "@/lib/run-build-job.server";

// Deliberately light — the real validation gate is handleGenerate's own
// inputSchema.parse(), which runs when the job actually executes (either
// inline right after this call, or later via the sweep). This route only
// needs enough to satisfy build_jobs' own NOT NULL columns and to avoid
// queuing something too malformed to ever plausibly run.
const createSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  libraryCode: z.string().trim().max(64).optional(),
  surface: z.enum(["pocket", "coder"]).default("pocket"),
}).passthrough();

export const Route = createFileRoute("/api/jobs/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
        }

        // Identity check only — NOT a credit check or reservation. That
        // happens exactly once, naturally, inside handleGenerate itself
        // when the job actually runs (whether that's the immediate kick
        // below or a later sweep retry). Doing it twice here would mean
        // either double-charging or building a whole separate
        // reserve/release protocol for no real benefit. This check exists
        // only to keep a fully anonymous, unidentifiable caller from
        // queuing rows at all.
        const owner = await isOwnerRequest(request);
        const user = owner ? null : await resolveUserFromRequest(request);
        if (!owner && !user) {
          return Response.json(
            { error: "Sign in to use paid AI features. Local editing remains free." },
            { status: 401 },
          );
        }

        const stored: StoredJobRequest = {
          body: parsed.data,
          authorization: request.headers.get("authorization"),
          ownerCodeHeader: request.headers.get(OWNER_CODE_HEADER),
        };

        const jobId = await createBuildJob({
          idempotencyKey: crypto.randomUUID(),
          userId: user?.userId ?? null,
          libraryCode: parsed.data.libraryCode ?? null,
          surface: parsed.data.surface,
          prompt: parsed.data.prompt,
          requestBody: stored,
        });

        // Kick it once immediately, in-process — no need to go through
        // the HTTP /run route for this first attempt, since we're already
        // inside a trusted server route. Not awaited: the client gets its
        // jobId back right away and the live /api/generate call it's
        // about to make in parallel is the fast path for the common case
        // where the connection just stays up. This is the fallback that
        // makes the result recoverable even when it doesn't.
        claimAndRunBuildJob(jobId).catch(() => {
          /* claimAndRunBuildJob already records failures on the job row itself */
        });

        return Response.json({ jobId });
      },
    },
  },
});
