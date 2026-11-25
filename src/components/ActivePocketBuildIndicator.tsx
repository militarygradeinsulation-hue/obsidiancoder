import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Loader2, CheckCircle2, AlertTriangle, Hammer, Code2 } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

type PendingMarker = { key: string; jobId: string; startedAt: number };
type JobState = { status: string; stage?: string; progress?: number; error?: string | null };
type VibeState = { count: number; startedAt: number };

const POCKET_PREFIX = "pocket.pendingJob.";
const VIBE_KEY = "obs.vibe.activeBuilds.v1";
const VIBE_STALE_MS = 30 * 60_000;

function newestPocketMarker(): PendingMarker | null {
  if (typeof window === "undefined") return null;
  let newest: PendingMarker | null = null;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(POCKET_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const value = JSON.parse(raw) as Partial<{ jobId: string; startedAt: number }>;
      if (!value.jobId || typeof value.startedAt !== "number") continue;
      if (!newest || value.startedAt > newest.startedAt) newest = { key, jobId: value.jobId, startedAt: value.startedAt };
    }
  } catch { return null; }
  return newest;
}

function activeVibeBuilds(): VibeState | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(VIBE_KEY) || "{}") as Record<string, { startedAt: number }>;
    const now = Date.now();
    const clean = Object.fromEntries(Object.entries(parsed).filter(([, value]) =>
      value && typeof value.startedAt === "number" && now - value.startedAt < VIBE_STALE_MS,
    ));
    if (Object.keys(clean).length !== Object.keys(parsed).length) {
      if (Object.keys(clean).length) localStorage.setItem(VIBE_KEY, JSON.stringify(clean));
      else localStorage.removeItem(VIBE_KEY);
    }
    const values = Object.values(clean);
    if (!values.length) return null;
    return { count: values.length, startedAt: Math.min(...values.map((value) => value.startedAt)) };
  } catch { return null; }
}

export function ActivePocketBuildIndicator() {
  const location = useLocation();
  const [marker, setMarker] = React.useState<PendingMarker | null>(null);
  const [job, setJob] = React.useState<JobState | null>(null);
  const [vibe, setVibe] = React.useState<VibeState | null>(null);
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (disposed) return;
      setNow(Date.now());
      setVibe(activeVibeBuilds());

      const nextMarker = newestPocketMarker();
      setMarker(nextMarker);
      if (!nextMarker) {
        setJob(null);
      } else {
        try {
          const response = await authFetch(`/api/jobs/${nextMarker.jobId}`);
          if (response.ok) {
            const nextJob = await response.json() as JobState;
            if (!disposed) setJob(nextJob);
          } else if (response.status === 404) {
            try { localStorage.removeItem(nextMarker.key); } catch { /* ignore */ }
            if (!disposed) { setMarker(null); setJob(null); }
          }
        } catch {
          // Observation failure never owns or cancels the server-side build.
        }
      }
      if (!disposed) timer = setTimeout(tick, 3_000);
    };

    void tick();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const showPocket = location.pathname !== "/forge" && !!marker && !!job;
  const showVibe = location.pathname !== "/" && !!vibe;
  if (!showPocket && !showVibe) return null;

  const pocketRunning = job?.status === "queued" || job?.status === "running";
  const pocketComplete = job?.status === "complete";
  const pocketFailed = job?.status === "failed" || job?.status === "cancelled";
  const progress = typeof job?.progress === "number" ? Math.max(0, Math.min(100, Math.round(job.progress))) : 0;
  const vibeSeconds = vibe ? Math.max(0, Math.floor((now - vibe.startedAt) / 1000)) : 0;
  const vibeElapsed = vibeSeconds < 60 ? `${vibeSeconds}s` : `${Math.floor(vibeSeconds / 60)}m ${vibeSeconds % 60}s`;

  const card = "w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#DB861F]/35 bg-[#100F14]/95 text-white shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop-blur-xl";

  return (
    <div className="fixed bottom-4 right-4 z-[90] flex flex-col items-end gap-2" aria-live="polite">
      {showVibe && vibe && (
        <aside className={card} aria-label="Vibe background build status">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#DB861F]/10 text-[#DB861F]"><Loader2 size={17} className="animate-spin" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">{vibe.count === 1 ? "Vibe is building in the background" : `${vibe.count} Vibe builds are running`}</p>
              <p className="mt-0.5 text-[10px] text-white/55">{vibeElapsed} · keep working here</p>
            </div>
            <Link to="/" className="shrink-0 rounded-lg border border-[#DB861F]/30 bg-[#DB861F]/10 px-2.5 py-1.5 text-[10px] font-semibold text-[#DB861F]"><Code2 size={11} className="mr-1 inline" />Open Vibe</Link>
          </div>
        </aside>
      )}

      {showPocket && job && (
        <aside className={card} aria-label="Pocket background build status">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#DB861F]/10 text-[#DB861F]">
              {pocketRunning ? <Loader2 size={17} className="animate-spin" /> : pocketComplete ? <CheckCircle2 size={17} /> : pocketFailed ? <AlertTriangle size={17} /> : <Hammer size={17} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">{pocketRunning ? "Pocket is building in the background" : pocketComplete ? "Pocket build finished" : pocketFailed ? "Pocket build needs attention" : "Pocket build"}</p>
              <p className="mt-0.5 truncate text-[10px] text-white/55">
                {pocketRunning ? `${progress}%${job.stage && job.stage !== "running" ? ` · ${job.stage}` : ""} · keep working here` : pocketComplete ? "Open Pocket to load the completed project." : job.error || job.status}
              </p>
            </div>
            <Link to="/forge" className="shrink-0 rounded-lg border border-[#DB861F]/30 bg-[#DB861F]/10 px-2.5 py-1.5 text-[10px] font-semibold text-[#DB861F]">Open Pocket</Link>
          </div>
          {pocketRunning && <div className="h-1 bg-white/[0.06]"><div className="h-full bg-[#DB861F] transition-[width] duration-500" style={{ width: `${Math.max(3, progress)}%` }} /></div>}
        </aside>
      )}
    </div>
  );
}
