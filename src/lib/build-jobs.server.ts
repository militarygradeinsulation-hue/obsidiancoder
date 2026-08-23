// Server-only durable build-job store.
//
// Execution model (the browser is NOT the worker):
//   1. POST /api/jobs/create  → reserves credits ONCE (idempotency key) and
//      inserts a `build_jobs` row, then asks Postgres to dispatch it.
//   2. Postgres `build_job_kick` uses pg_net to POST /api/public/jobs/run.
//      That request originates from the database, so closing the tab,
//      navigating away or reloading cannot abort the generation.
//   3. pg_cron hits /api/public/jobs/sweep every minute and re-dispatches any
//      job that is still queued or whose worker lease expired.

import type { BuildJobStage, BuildJobStatus, BuildJobTimings } from "@/lib/build-jobs";
import { STAGE_PROGRESS } from "@/lib/build-jobs";
import type { Environment } from "@/lib/credit-gate.server";

export interface BuildJobRow {
  id: string;
  idempotency_key: string;
  user_id: string | null;
  anon_id: string | null;
  library_code: string | null;
  session_id: string | null;
  project_id: string | null;
  surface: string;
  title: string | null;
  prompt: string;
  mode: string;
  profile: string;
  style_family: string | null;
  model_request: string | null;
  dna: unknown;
  concept: unknown;
  memory: unknown;
  learning_brief: string | null;
  previous_html: string | null;
  request_body: Record<string, unknown>;
  status: BuildJobStatus;
  stage: BuildJobStage;
  progress: number;
  partial_html: string | null;
  result_html: string | null;
  error: string | null;
  served_model: string | null;
  memory_hit: boolean;
  provider_attempts: string[];
  timings: BuildJobTimings;
  cancel_requested: boolean;
  retry_count: number;
  environment: Environment;
  entitlement_kind: string | null;
  request_id: string | null;
  reservation_id: string | null;
  reservation_credits: number | null;
  reservation_cap: number | null;
  created_at: string;
  started_at: string | null;
  first_byte_at: string | null;
  first_preview_at: string | null;
  completed_at: string | null;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (t: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

export async function findJobByIdempotencyKey(key: string): Promise<BuildJobRow | null> {
  const db = await admin();
  const { data } = await db.from("build_jobs").select("*").eq("idempotency_key", key).maybeSingle();
  return (data as BuildJobRow) ?? null;
}

export async function getJob(id: string): Promise<BuildJobRow | null> {
  const db = await admin();
  const { data } = await db.from("build_jobs").select("*").eq("id", id).maybeSingle();
  return (data as BuildJobRow) ?? null;
}

export async function insertJob(row: Partial<BuildJobRow>): Promise<BuildJobRow | null> {
  const db = await admin();
  const { data, error } = await db.from("build_jobs").insert(row).select("*").maybeSingle();
  if (error) {
    // Unique violation on idempotency_key = a concurrent duplicate submit.
    const existing = row.idempotency_key
      ? await findJobByIdempotencyKey(row.idempotency_key)
      : null;
    if (existing) return existing;
    throw new Error(`build_jobs insert failed: ${error.message}`);
  }
  return (data as BuildJobRow) ?? null;
}

export async function patchJob(id: string, patch: Record<string, unknown>): Promise<void> {
  const db = await admin();
  await db.from("build_jobs").update(patch).eq("id", id);
}

export async function setStage(
  id: string,
  stage: BuildJobStage,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await patchJob(id, { stage, progress: STAGE_PROGRESS[stage], ...extra });
}

/** Atomic worker lease. Only one runner processes a job at a time. */
export async function claimJob(id: string, leaseSeconds = 300): Promise<boolean> {
  const db = await admin();
  const { data, error } = await db.rpc("build_job_claim", { _id: id, _lease_seconds: leaseSeconds });
  if (error) return false;
  return data === true;
}

export async function extendLease(id: string, seconds = 300): Promise<void> {
  await patchJob(id, { lease_until: new Date(Date.now() + seconds * 1000).toISOString() });
}

export async function isCancelled(id: string): Promise<boolean> {
  const db = await admin();
  const { data } = await db.from("build_jobs").select("cancel_requested").eq("id", id).maybeSingle();
  return !!(data as { cancel_requested?: boolean } | null)?.cancel_requested;
}

export async function requestCancel(id: string): Promise<void> {
  const db = await admin();
  await db
    .from("build_jobs")
    .update({
      cancel_requested: true,
      status: "cancelled",
      stage: "cancelled",
      progress: 100,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["queued", "running"]);
}

export async function staleJobIds(limit = 5): Promise<string[]> {
  const db = await admin();
  const { data, error } = await db.rpc("build_jobs_stale", { _limit: limit });
  if (error || !Array.isArray(data)) return [];
  return (data as Array<{ id: string }>).map((r) => r.id);
}

/**
 * Ask Postgres to dispatch the job. This is the durability boundary: the HTTP
 * request that runs the build is issued by the database, not by the browser.
 */
export async function kickJob(id: string, baseUrl: string): Promise<void> {
  const db = await admin();
  const apikey = process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
  await db.rpc("build_job_kick", { _id: id, _base_url: baseUrl.replace(/\/+$/, ""), _apikey: apikey });
}

/** Charge (or release) the reservation attached to a job — exactly once. */
export async function settleJob(
  row: BuildJobRow,
  outcome: "success" | "failed" | "no_provider",
  servedModel: string | null,
): Promise<void> {
  if (!row.request_id) return;
  if (row.entitlement_kind !== "pro" && row.entitlement_kind !== "owner") return;
  const { settleOperation } = await import("@/lib/credit-gate.server");
  const { makeUsage } = await import("@/lib/usage-record");
  const ent = {
    kind: row.entitlement_kind as "pro" | "owner",
    env: row.environment,
    requestId: row.request_id,
    ...(row.user_id ? { user: { userId: row.user_id, token: "" } } : {}),
    ...(row.reservation_id
      ? {
          reservation: {
            reservationId: row.reservation_id,
            credits: row.reservation_credits ?? 1,
            operation: "generate_html" as const,
            environment: row.environment,
            usedBefore: 0,
            remainingAfter: 0,
            idempotent: false,
            cap: row.reservation_cap ?? 1000,
          },
        }
      : {}),
  };
  if (outcome === "no_provider") {
    await settleOperation(ent as never, { kind: "no_provider", errorCode: "no_provider" });
    return;
  }
  const usage = makeUsage({
    provider: "obsidian-job",
    model: servedModel,
    operation: "generate_html",
    providerUsed: true,
    status: outcome === "success" ? "committed" : "failed",
    meta: { phase: "build_job" },
  });
  await settleOperation(
    ent as never,
    outcome === "success"
      ? { kind: "success", usage }
      : { kind: "failed_with_usage", usage, errorCode: "job_failed" },
  );
}
