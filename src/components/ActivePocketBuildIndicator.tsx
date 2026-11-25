import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Loader2, CheckCircle2, AlertTriangle, Hammer } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

type PendingMarker = {
  key: string;
  jobId: string;
  startedAt: number;
};

type JobState = {
  status: string;
  stage?: string;
  progress?: number;
  error?: string | null;
};

const PREFIX = "pocket.pendingJob.";

function newestPendingMarker(): PendingMarker | null {
  if (typeof window === "undefined") return null;
  let newest: PendingMarker | null = null;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const value = JSON.parse(raw) as Partial<{ jobId: string; startedAt: number }>;
      if (!value.jobId || typeof value.startedAt !== "number") continue;
      if (!newest || value.startedAt > newest.startedAt) {
        newest = { key, jobId: value.jobId, startedAt: value.startedAt };
      }
    }
  } catch {
    return null;
  }
  return newest;
}

export function ActivePocketBuildIndicator() {
  const location = useLocation();
  const [marker, setMarker] = React.useState<PendingMarker | null>(null);
  const [job, setJob] = React.useState<JobState | null>(null);

  React.useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (disposed) return;
      const nextMarker = newestPendingMarker();
      setMarker(nextMarker);

      if (!nextMarker) {
        setJob(null);
        timer = setTimeout(tick, 3_000);
        return;
      }

      try {
        const response = await authFetch(`/api/jobs/${nextMarker.jobId}`);
        if (response.ok) {
          const nextJob = await response.json() as JobState;
          if (!disposed) setJob(nextJob);
        } else if (response.status === 404) {
          // A stale marker should not create a permanent global banner.
          try { window.localStorage.removeItem(nextMarker.key); } catch { /* ignore */ }
          if (!disposed) {
            setMarker(null);
            setJob(null);
          }
        }
      } catch {
        // Network/auth interruptions do not own or cancel the durable build.
      }

      if (!disposed) timer = setTimeout(tick, 3_500);
    };

    void tick();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Pocket already has richer in-workspace build progress. The global status
  // exists specifically so navigation elsewhere never makes the build appear
  // to have stopped.
  if (location.pathname === "/forge" || !marker || !job) return null;

  const running = job.status === "queued" || job.status === "running";
  const complete = job.status === "complete";
  const failed = job.status === "failed" || job.status === "cancelled";
  const progress = typeof job.progress === "number"
    ? Math.max(0, Math.min(100, Math.round(job.progress)))
    : 0;

  return (
    <aside
      className="fixed bottom-4 right-4 z-[90] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#DB861F]/35 bg-[#100F14]/95 text-white shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop-blur-xl"
      aria-live="polite"
      aria-label="Pocket background build status"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#DB861F]/25 bg-[#DB861F]/10 text-[#DB861F]">
          {running ? <Loader2 size={17} className="animate-spin" /> : complete ? <CheckCircle2 size={17} /> : failed ? <AlertTriangle size={17} /> : <Hammer size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">
            {running ? "Pocket is building in the background" : complete ? "Pocket build finished" : failed ? "Pocket build needs attention" : "Pocket build"}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-white/55">
            {running
              ? `${progress}%${job.stage && job.stage !== "running" ? ` · ${job.stage}` : ""} · you can keep working here`
              : complete
                ? "Open Pocket to load the completed project."
                : job.error || job.status}
          </p>
        </div>
        <Link
          to="/forge"
          className="shrink-0 rounded-lg border border-[#DB861F]/30 bg-[#DB861F]/10 px-2.5 py-1.5 text-[10px] font-semibold text-[#DB861F] transition hover:bg-[#DB861F]/15"
        >
          Open Pocket
        </Link>
      </div>
      {running && (
        <div className="h-1 bg-white/[0.06]">
          <div
            className="h-full bg-[#DB861F] transition-[width] duration-500"
            style={{ width: `${Math.max(3, progress)}%` }}
          />
        </div>
      )}
    </aside>
  );
}
