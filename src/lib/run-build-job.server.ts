// Server-only: claims a build_jobs row and actually runs it, by invoking
// the exact same handleGenerate() the live browser request path uses.
// No generation logic is duplicated here — this just constructs a faithful
// Request object from what was captured at job-creation time and lets
// handleGenerate's own finalize() (already jobId-aware) do the real work
// of writing progress and the final result to the row.
//
// Two callers use this: /api/public/jobs/run (a single job, triggered
// either by /api/jobs/create's initial kick or by build_job_kick's
// Postgres -> HTTP callback) and /api/public/jobs/sweep (the cron-driven
// safety net for anything that didn't finish through its original path).

import { claimBuildJob, getBuildJob, failBuildJob } from "@/lib/build-jobs.server";
import { OWNER_CODE_HEADER } from "@/lib/credit-gate.server";

/** The shape createBuildJob's caller stores in request_body — see jobs.create.ts. */
export interface StoredJobRequest {
  body: unknown;
  /**
   * The Authorization: Bearer <token> header from the original request —
   * this, not a cookie, is what resolveUserFromRequest actually reads for
   * a signed-in Pro user (see credit-gate.server.ts). authFetch already
   * attaches it to every request the client makes, so replaying it here
   * reuses the exact same identity resolution handleGenerate already
   * does for a live request, unchanged.
   *
   * Bearer tokens are short-lived (Supabase's default is about an hour).
   * In the ordinary case a job is picked up within a couple of minutes —
   * either it runs inline through its own original request, or the sweep
   * retries it on its next tick — well inside that window. A token that
   * expires in the narrow gap between creation and a delayed retry is a
   * real, known edge case this does not solve; it would surface as the
   * retried run failing auth rather than as data loss.
   */
  authorization: string | null;
  ownerCodeHeader: string | null;
}

/**
 * Claims the job (no-op if already claimed/finished/cancelled — that's the
 * normal, expected case for most sweep runs, since most jobs finish
 * through their original live request before ever going stale) and, if
 * claimed, reconstructs the original request and runs it for real.
 *
 * Never throws — a failure here is recorded on the job row itself via
 * failBuildJob, not surfaced to the caller, since both callers (run and
 * sweep) are fire-and-forget by nature: there is no live browser waiting
 * on this specific HTTP response.
 */
export async function claimAndRunBuildJob(jobId: string): Promise<void> {
  let claimed = false;
  try {
    claimed = await claimBuildJob(jobId);
  } catch {
    return; // Can't even claim — leave it for the next sweep to retry.
  }
  if (!claimed) return; // Already running elsewhere, already finished, or cancelled.

  try {
    const row = await getBuildJob(jobId);
    if (!row) return;
    const stored = row.requestBody as Partial<StoredJobRequest> | null;
    if (!stored || typeof stored !== "object" || !("body" in stored)) {
      await failBuildJob(jobId, "Job has no stored request to run.");
      return;
    }

    const headers = new Headers({ "content-type": "application/json" });
    if (stored.authorization) headers.set("authorization", stored.authorization);
    if (stored.ownerCodeHeader) headers.set(OWNER_CODE_HEADER, stored.ownerCodeHeader);

    // jobId travels INSIDE the body (inputSchema's own jobId field), not as
    // a header — handleGenerate reads it from the parsed body exactly like
    // it does for a live browser request that opted into job tracking.
    const bodyWithJobId = { ...(stored.body as Record<string, unknown>), jobId };

    const reconstructed = new Request("https://obsidianvibe.live/api/generate", {
      method: "POST",
      headers,
      body: JSON.stringify(bodyWithJobId),
      // Deliberately a fresh, never-aborted signal — there is no real
      // browser connection behind this invocation, and there shouldn't
      // need to be: handleGenerate's core generation path already runs on
      // its own server-owned abort controller (see generate.ts), not on
      // this request's signal. The optional enrichment phases DO still
      // read this signal, and an ordinary never-aborted one lets them
      // behave normally rather than being artificially skipped.
    });

    const { handleGenerate } = await import("@/routes/api/generate");
    const response = await handleGenerate(reconstructed);

    // Nobody is listening to this response live — drain it to completion
    // so the underlying stream actually runs to its end (and therefore
    // finalize() actually fires) rather than being abandoned mid-read.
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    }
  } catch (err) {
    try {
      await failBuildJob(jobId, err instanceof Error ? err.message : "Background run failed.");
    } catch {
      /* best-effort */
    }
  }
}
