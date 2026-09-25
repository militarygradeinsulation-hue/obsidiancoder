// Server-only: durable background-generation job tracking.
//
// The DATABASE half of this was already built and has been running unused:
// the build_jobs table, build_job_claim (atomic claim-for-processing),
// build_job_kick (Postgres -> HTTP call back into this app via pg_net), and
// build_jobs_stale (find queued-too-long or lease-expired jobs) all already
// existed, and an active pg_cron job has been calling
// POST /api/public/jobs/sweep every single minute since before this file
// existed -- a route that returned 404 because nothing on the application
// side ever used any of this. This module is the missing application half.
//
// Why this exists at all: a generation that is only ever a live HTTP
// response streamed to one browser tab dies the instant that tab's
// connection goes away -- backgrounded on mobile, network blip, closed by
// accident. This gives every generation a durable row that survives all of
// that: the browser can leave and come back and find out what actually
// happened, and if the very process handling the request gets killed
// outright by the host the instant the client disconnects (the one thing
// this file cannot control), the cron sweep already running re-triggers it
// within about a minute via the exact infrastructure that was sitting idle.
//
// All access is via the service-role client -- RLS never applies here,
// matching the convention in cloud-projects.server.ts. Auth/ownership is
// enforced by the callers of this module (routes), not by RLS.

export type BuildJobStatus = "queued" | "running" | "complete" | "failed" | "cancelled";

export interface BuildJobRow {
  id: string;
  userId: string | null;
  anonId: string | null;
  libraryCode: string | null;
  sessionId: string | null;
  surface: string;
  title: string | null;
  prompt: string;
  status: BuildJobStatus;
  stage: string;
  progress: number;
  partialHtml: string | null;
  resultHtml: string | null;
  error: string | null;
  servedModel: string | null;
  cancelRequested: boolean;
  retryCount: number;
  leaseUntil: string | null;
  requestBody: unknown;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface CreateBuildJobInput {
  idempotencyKey: string;
  userId?: string | null;
  anonId?: string | null;
  libraryCode?: string | null;
  sessionId?: string | null;
  surface: "pocket" | "coder";
  title?: string | null;
  prompt: string;
  mode?: string;
  profile?: string;
  /** The FULL original request body, replayed verbatim when the job runs. */
  requestBody: unknown;
  environment?: "live" | "test" | string;
}

function rowFromDb(r: Record<string, unknown>): BuildJobRow {
  return {
    id: r.id as string,
    userId: (r.user_id as string) ?? null,
    anonId: (r.anon_id as string) ?? null,
    libraryCode: (r.library_code as string) ?? null,
    sessionId: (r.session_id as string) ?? null,
    surface: r.surface as string,
    title: (r.title as string) ?? null,
    prompt: r.prompt as string,
    status: r.status as BuildJobStatus,
    stage: r.stage as string,
    progress: (r.progress as number) ?? 0,
    partialHtml: (r.partial_html as string) ?? null,
    resultHtml: (r.result_html as string) ?? null,
    error: (r.error as string) ?? null,
    servedModel: (r.served_model as string) ?? null,
    cancelRequested: !!r.cancel_requested,
    retryCount: (r.retry_count as number) ?? 0,
    leaseUntil: (r.lease_until as string) ?? null,
    requestBody: r.request_body,
    createdAt: r.created_at as string,
    startedAt: (r.started_at as string) ?? null,
    completedAt: (r.completed_at as string) ?? null,
    updatedAt: r.updated_at as string,
  };
}

/** Create a new queued job. Returns the new job's id. */
export async function createBuildJob(input: CreateBuildJobInput): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("build_jobs")
    .insert({
      idempotency_key: input.idempotencyKey,
      user_id: input.userId ?? null,
      anon_id: input.anonId ?? null,
      library_code: input.libraryCode ?? null,
      session_id: input.sessionId ?? null,
      surface: input.surface,
      title: input.title ?? null,
      prompt: input.prompt.slice(0, 4000),
      mode: input.mode ?? "create",
      profile: input.profile ?? "fast",
      request_body: (input.requestBody ?? {}) as never,
      environment: input.environment ?? "live",
      status: "queued",
      stage: "queued",
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(`build_jobs insert failed: ${error.message}`);
  return (data as { id: string }).id;
}

/** Fetch one job by id. Returns null if not found. */
export async function getBuildJob(id: string): Promise<BuildJobRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("build_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`build_jobs select failed: ${error.message}`);
  if (!data) return null;
  return rowFromDb(data as Record<string, unknown>);
}

/**
 * Atomically claim a job for processing. Returns false if it was already
 * claimed (running with an unexpired lease), already finished, or has a
 * cancellation pending -- the caller should treat false as "someone else
 * has this, or it's done, do nothing."
 */
export async function claimBuildJob(id: string, leaseSeconds = 300): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("build_job_claim" as never, {
    _id: id,
    _lease_seconds: leaseSeconds,
  } as never);
  if (error) throw new Error(`build_job_claim failed: ${error.message}`);
  return data === true;
}

/** Renew the processing lease on a job this process is still actively working. */
export async function renewBuildJobLease(id: string, leaseSeconds = 300): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("build_jobs")
    .update({ lease_until: new Date(Date.now() + leaseSeconds * 1000).toISOString() } as never)
    .eq("id", id);
  if (error) throw new Error(`build_jobs lease renewal failed: ${error.message}`);
}

/** Write a progress snapshot. Best-effort by design -- callers should not let a failed progress write abort a generation. */
export async function updateBuildJobProgress(
  id: string,
  patch: { stage?: string; progress?: number; partialHtml?: string },
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const update: Record<string, unknown> = {};
  if (patch.stage !== undefined) update.stage = patch.stage;
  if (patch.progress !== undefined) update.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
  if (patch.partialHtml !== undefined) update.partial_html = patch.partialHtml;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabaseAdmin.from("build_jobs").update(update as never).eq("id", id);
  if (error) throw new Error(`build_jobs progress update failed: ${error.message}`);
}

/** Mark a job complete with its final result. */
export async function completeBuildJob(
  id: string,
  result: { resultHtml: string; servedModel?: string | null },
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("build_jobs")
    .update({
      status: "complete",
      stage: "complete",
      progress: 100,
      result_html: result.resultHtml,
      served_model: result.servedModel ?? null,
      completed_at: new Date().toISOString(),
    } as never)
    .eq("id", id);
  if (error) throw new Error(`build_jobs completion update failed: ${error.message}`);
}

/** Mark a job failed. */
export async function failBuildJob(id: string, errorMessage: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("build_jobs")
    .update({
      status: "failed",
      stage: "failed",
      error: errorMessage.slice(0, 500),
      completed_at: new Date().toISOString(),
    } as never)
    .eq("id", id);
  if (error) throw new Error(`build_jobs failure update failed: ${error.message}`);
}

/** Mark a job cancelled (the user explicitly stopped it). */
export async function cancelBuildJobRecord(id: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("build_jobs")
    .update({ status: "cancelled", stage: "cancelled", completed_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw new Error(`build_jobs cancel update failed: ${error.message}`);
}

/** Request cancellation. The running process checks this cooperatively; it does not stop anything by itself. */
export async function requestBuildJobCancel(id: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("build_jobs")
    .update({ cancel_requested: true } as never)
    .eq("id", id);
  if (error) throw new Error(`build_jobs cancel-request update failed: ${error.message}`);
}

/** Cheap poll for whether cancellation has been requested since claiming. */
export async function isBuildJobCancelRequested(id: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("build_jobs")
    .select("cancel_requested")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`build_jobs cancel-check failed: ${error.message}`);
  return !!(data as { cancel_requested?: boolean } | null)?.cancel_requested;
}

/** Jobs eligible for a retry sweep: queued too long, or running with an expired lease. */
export async function listStaleBuildJobs(limit = 5): Promise<Array<{ id: string; retryCount: number }>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("build_jobs_stale" as never, { _limit: limit } as never);
  if (error) throw new Error(`build_jobs_stale failed: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; retry_count: number }>).map((r) => ({
    id: r.id,
    retryCount: r.retry_count,
  }));
}
