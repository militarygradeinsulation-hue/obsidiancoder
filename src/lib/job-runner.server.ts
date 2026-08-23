// Durable build-job runner. Executes ONE job to completion inside a
// server request that was dispatched by Postgres (pg_net), so the browser's
// lifecycle is irrelevant: navigating away, reloading or closing the tab
// cannot stop it.
//
// Latency contract (Fast profile):
//   • no AI concept planner — the job carries a deterministic/proven direction
//   • one fast strong model first; escalation only as repair
//   • the first structurally valid document is persisted immediately as the
//     first preview; QA/polish happen AFTER that
//   • partial HTML is persisted on a throttle (never per token)

import { safePartial, shouldPersistPartial, type BuildJobTimings } from "@/lib/build-jobs";
import {
  claimJob,
  extendLease,
  getJob,
  isCancelled,
  patchJob,
  setStage,
  settleJob,
  type BuildJobRow,
} from "@/lib/build-jobs.server";
import { checkDesignFloor } from "@/lib/design-floor";
import { regenerateForQuality } from "@/lib/quality-retry";
import { finalizeCandidate } from "@/lib/finalize-candidate";

const CLEAN = (str: string) =>
  str
    .replace(/\s*<!--OBS_(?:TIMING|PLACEHOLDERS):[\s\S]*?-->\s*$/g, "")
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/```\s*$/i, "");

/** Parse the OBS_TIMING trailer the generate route appends. */
export function readTimingTrailer(raw: string): Record<string, number> {
  const m = /<!--OBS_TIMING:([\s\S]*?)-->/.exec(raw);
  if (!m) return {};
  try {
    const parsed = JSON.parse(m[1]!.trim()) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function readServedModel(headers: Headers, fallback: string): string {
  return (
    headers.get("x-obs-model") ||
    headers.get("x-obs-served-model") ||
    headers.get("x-model") ||
    fallback
  );
}

export interface RunResult {
  ok: boolean;
  jobId: string;
  reason?: string;
}

export async function runBuildJob(jobId: string, origin: string): Promise<RunResult> {
  const claimed = await claimJob(jobId);
  if (!claimed) return { ok: false, jobId, reason: "not_claimable" };

  const job = await getJob(jobId);
  if (!job) return { ok: false, jobId, reason: "missing" };

  const t0 = Date.now();
  const createdMs = job.created_at ? new Date(job.created_at).getTime() : t0;
  const timings: BuildJobTimings = {
    ...(job.timings ?? {}),
    queuedMs: Math.max(0, t0 - createdMs),
    memoryHit: !!job.memory_hit,
  };
  const attempts: string[] = [];

  const genHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    // Metering already happened when the job was accepted; the worker call
    // must not charge a second time.
    "x-obsidian-owner-code": process.env["SITE_PASSWORD"] ?? "",
    "x-obs-internal-job": jobId,
  };
  const fetcher = (path: string, init: RequestInit) =>
    fetch(`${origin}${path}`, init);

  try {
    await setStage(jobId, "generating");
    const res = await fetcher("/api/generate", {
      method: "POST",
      headers: genHeaders,
      body: JSON.stringify(job.request_body ?? {}),
    });

    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (ctype.includes("application/json")) {
      const envelope = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(envelope?.message || `Generation failed (${res.status})`);
    }
    if (!res.ok || !res.body) throw new Error(`Generation failed (${res.status})`);

    const servedModelHeader = readServedModel(res.headers, job.model_request ?? "auto");
    attempts.push(servedModelHeader);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = "";
    let lastPersist = 0;
    let firstByteAt = 0;
    let firstPreviewAt = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!firstByteAt) {
        firstByteAt = Date.now();
        timings.firstByteMs = firstByteAt - t0;
        await patchJob(jobId, { first_byte_at: new Date(firstByteAt).toISOString() });
      }
      acc += decoder.decode(value, { stream: true });

      const now = Date.now();
      if (shouldPersistPartial(lastPersist, now)) {
        lastPersist = now;
        if (await isCancelled(jobId)) {
          try { await reader.cancel(); } catch { /* stream already closing */ }
          await settleJob(job, "failed", servedModelHeader);
          return { ok: false, jobId, reason: "cancelled" };
        }
        const partial = safePartial(acc);
        if (partial) {
          const first = !firstPreviewAt;
          if (first) {
            firstPreviewAt = now;
            timings.firstPreviewMs = now - t0;
          }
          await patchJob(jobId, {
            partial_html: partial,
            stage: first ? "first_preview" : "generating",
            progress: first ? 55 : 35,
            ...(first ? { first_preview_at: new Date(now).toISOString() } : {}),
          });
        }
        await extendLease(jobId);
      }
    }

    const streamEnd = Date.now();
    timings.streamMs = streamEnd - t0;
    const trailer = readTimingTrailer(acc);
    if (trailer["ttfb"]) timings.providerSelectMs = trailer["ttfb"];
    let finalHtml = CLEAN(acc).trim();
    if (finalHtml.length < 40) throw new Error("The model returned an empty document.");

    // Persist the first structurally valid draft BEFORE any improvement pass,
    // so a retry can never hide a usable result from the user.
    if (!firstPreviewAt) {
      firstPreviewAt = Date.now();
      timings.firstPreviewMs = firstPreviewAt - t0;
      await patchJob(jobId, {
        partial_html: finalHtml,
        stage: "first_preview",
        progress: 55,
        first_preview_at: new Date(firstPreviewAt).toISOString(),
      });
    }

    // ---- Improvement pass (background, after the first preview) -----------
    const floor = checkDesignFloor(finalHtml);
    const isRefine = job.mode === "refine";
    const worthRetry =
      floor.incomplete ||
      (!isRefine && (floor.blockers.includes("no-css") || floor.blockers.includes("thin-css")));
    if (!floor.ok && worthRetry && !(await isCancelled(jobId))) {
      await setStage(jobId, "polishing");
      const retryStart = Date.now();
      const retry = await regenerateForQuality({
        fetcher: fetcher as never,
        body: job.request_body ?? {},
        report: floor,
        headers: genHeaders,
      });
      timings.polishMs = Date.now() - retryStart;
      if (retry) {
        attempts.push(retry.model);
        if (retry.improved || retry.report.blockers.length < floor.blockers.length) {
          finalHtml = retry.html;
        } else if (retry.html.length > finalHtml.length) {
          finalHtml = retry.html;
        }
      }
    }

    // ---- Deterministic safety/quality contract ----------------------------
    await setStage(jobId, "validating");
    const valStart = Date.now();
    const fin = await finalizeCandidate(
      {
        candidateHtml: finalHtml,
        stableHtml: job.previous_html ?? "",
        themeCss: null,
        themeName: null,
        // Server worker never dispatches the metered Claude QA call — QA that
        // is not required for safety runs client-side after first preview.
        demoMode: true,
        userRequest: job.prompt,
        strategy: "full-generation",
      },
      async () => null,
    );
    timings.validationMs = Date.now() - valStart;

    if (!fin.ok) {
      timings.totalMs = Date.now() - t0;
      await patchJob(jobId, {
        status: "failed",
        stage: "failed",
        progress: 100,
        error: `Blocked by the safety gate: ${fin.blockers.slice(0, 3).join(" · ")}`,
        timings,
        provider_attempts: attempts,
        served_model: servedModelHeader,
        completed_at: new Date().toISOString(),
      });
      await settleJob(job, "failed", servedModelHeader);
      return { ok: false, jobId, reason: "gate_blocked" };
    }

    finalHtml = fin.finalHtml;
    await setStage(jobId, "saving");
    timings.totalMs = Date.now() - t0;

    await patchJob(jobId, {
      status: "completed",
      stage: "completed",
      progress: 100,
      result_html: finalHtml,
      partial_html: null,
      served_model: servedModelHeader,
      provider_attempts: attempts,
      timings,
      error: null,
      completed_at: new Date().toISOString(),
    });
    await settleJob(job, "success", servedModelHeader);
    return { ok: true, jobId };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "Build failed";
    timings.totalMs = Date.now() - t0;
    await patchJob(jobId, {
      status: "failed",
      stage: "failed",
      progress: 100,
      error: message,
      timings,
      provider_attempts: attempts,
      completed_at: new Date().toISOString(),
    });
    await settleJob(job, attempts.length ? "failed" : "no_provider", attempts[0] ?? null);
    return { ok: false, jobId, reason: message };
  }
}
