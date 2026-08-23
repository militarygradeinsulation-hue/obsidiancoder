// Client controller for durable server-side build jobs.
//
// The browser is a VIEWER, not the worker. It creates a job, then polls it.
// Unmounting, navigating away, reloading or closing the tab does not cancel
// anything: the poll simply stops and reattaches later from the job id kept
// in localStorage. Only `cancel()` stops a build.

import * as React from "react";
import {
  activeJobKey,
  isTerminal,
  STAGE_LABEL,
  summarizeTimings,
  type BuildJobView,
} from "@/lib/build-jobs";

const POLL_MS = 1200;
const SLOW_POLL_MS = 3000;

export interface UseBuildJobOptions {
  scope: string;
  /** Same-origin fetch that attaches the Supabase bearer token. */
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
  onPartial?: (html: string) => void;
  onComplete?: (job: BuildJobView) => void;
  onFailed?: (job: BuildJobView) => void;
  onStage?: (label: string, job: BuildJobView) => void;
}

export interface StartJobInput {
  prompt: string;
  mode: "create" | "refine";
  profile: string;
  styleFamily?: string;
  model?: string;
  title?: string;
  libraryCode?: string;
  sessionId?: string;
  surface: "pocket" | "vibe";
  previousHtml?: string;
  memoryHit?: boolean;
  requestBody: Record<string, unknown>;
}

export function useBuildJob(opts: UseBuildJobOptions) {
  const { scope, authFetch } = opts;
  const cb = React.useRef(opts);
  cb.current = opts;

  const [job, setJob] = React.useState<BuildJobView | null>(null);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const activeId = React.useRef<string | null>(null);
  const lastPartial = React.useRef<string>("");
  const seenTerminal = React.useRef<string | null>(null);

  const storeKey = activeJobKey(scope);

  const clearStored = React.useCallback(() => {
    try {
      window.localStorage.removeItem(storeKey);
    } catch {
      /* private mode */
    }
  }, [storeKey]);

  const attach = React.useCallback(
    (id: string) => {
      activeId.current = id;
      setJobId(id);
      try {
        window.localStorage.setItem(storeKey, id);
      } catch {
        /* private mode */
      }
    },
    [storeKey],
  );

  // Poll loop. Runs while an id is attached; tolerates transient failures.
  React.useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let misses = 0;

    const tick = async () => {
      if (stopped) return;
      try {
        const res = await authFetch(`/api/jobs/${jobId}`, { method: "GET" });
        if (res.ok) {
          misses = 0;
          const data = (await res.json()) as { ok: boolean; job?: BuildJobView };
          const next = data.job;
          if (next && !stopped) {
            setJob(next);
            cb.current.onStage?.(STAGE_LABEL[next.stage] ?? next.stage, next);
            const partial = next.resultHtml ?? next.partialHtml;
            if (partial && partial !== lastPartial.current) {
              lastPartial.current = partial;
              cb.current.onPartial?.(partial);
            }
            if (isTerminal(next.status) && seenTerminal.current !== next.id) {
              seenTerminal.current = next.id;
              stopped = true;
              activeId.current = null;
              clearStored();
              if (next.status === "completed") cb.current.onComplete?.(next);
              else cb.current.onFailed?.(next);
              setJobId(null);
              return;
            }
          }
        } else if (res.status === 404 || res.status === 403) {
          stopped = true;
          clearStored();
          setJobId(null);
          return;
        } else {
          misses += 1;
        }
      } catch {
        misses += 1;
      }
      if (!stopped) {
        timer = setTimeout(tick, misses > 2 ? SLOW_POLL_MS : POLL_MS);
      }
    };

    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, authFetch, clearStored]);

  /** Reattach to a job that was running when the user left the page. */
  const resume = React.useCallback(() => {
    if (activeId.current) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(storeKey);
    } catch {
      stored = null;
    }
    if (stored) attach(stored);
  }, [attach, storeKey]);

  const start = React.useCallback(
    async (input: StartJobInput): Promise<{ ok: boolean; jobId?: string; envelope?: unknown; error?: string }> => {
      setError(null);
      lastPartial.current = "";
      const res = await authFetch("/api/jobs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; jobId?: string; error?: string; code?: string; message?: string }
        | null;
      if (!res.ok || !data?.ok || !data.jobId) {
        const msg = data?.message || data?.error || `Could not start the build (${res.status})`;
        setError(msg);
        return { ok: false, envelope: data, error: msg };
      }
      attach(data.jobId);
      return { ok: true, jobId: data.jobId };
    },
    [authFetch, attach],
  );

  const cancel = React.useCallback(async () => {
    const id = activeId.current ?? jobId;
    if (!id) return;
    try {
      await authFetch(`/api/jobs/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
    } catch {
      /* the server flag is best-effort */
    }
    activeId.current = null;
    clearStored();
    setJobId(null);
  }, [authFetch, jobId, clearStored]);

  return {
    job,
    jobId,
    error,
    running: !!jobId,
    stageLabel: job ? (STAGE_LABEL[job.stage] ?? job.stage) : "",
    progress: job?.progress ?? 0,
    timingSummary: summarizeTimings(job?.timings),
    start,
    cancel,
    resume,
    setError,
  };
}
