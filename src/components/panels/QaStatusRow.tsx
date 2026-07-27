// Compact per-session QA status row — presentational only. Consumes a
// QaSessionStatus (see src/lib/qa-status.ts) and renders one line with a
// tone-tinted state chip, the source (deterministic/claude/cache/publish/
// runtime), and a short message. Zero AI calls.

import { ShieldCheck, Wrench, Cpu, Database, AlertOctagon, Clock, Loader2, Globe } from "lucide-react";
import type { QaSessionStatus, QaState, QaStatusSource } from "@/lib/qa-status";

const STATE_TONE: Record<QaState, string> = {
  "stale": "text-white/50",
  "checking": "text-amber-300",
  "clean": "text-emerald-400",
  "repaired": "text-emerald-300",
  "claude-repaired": "text-amber-300",
  "blocked": "text-red-400",
};

const STATE_LABEL: Record<QaState, string> = {
  "stale": "Stale",
  "checking": "Checking",
  "clean": "Clean",
  "repaired": "Repaired",
  "claude-repaired": "Claude QA",
  "blocked": "Blocked",
};

function StateIcon({ state }: { state: QaState }) {
  const cls = "h-3.5 w-3.5 " + STATE_TONE[state];
  if (state === "clean") return <ShieldCheck className={cls} />;
  if (state === "repaired") return <Wrench className={cls} />;
  if (state === "claude-repaired") return <Cpu className={cls} />;
  if (state === "blocked") return <AlertOctagon className={cls} />;
  if (state === "checking") return <Loader2 className={cls + " animate-spin"} />;
  return <Clock className={cls} />;
}

function SourceIcon({ source }: { source: QaStatusSource }) {
  if (source === "cache") return <Database className="h-3 w-3 text-white/50" />;
  if (source === "runtime") return <Globe className="h-3 w-3 text-white/50" />;
  return null;
}

export function QaStatusRow({ status }: { status: QaSessionStatus | null | undefined }) {
  if (!status) return null;
  return (
    <div className="obs-metric-row" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6, gap: 6 }}>
      <span className="flex items-center gap-1.5 text-xs">
        <StateIcon state={status.state} />
        <span className={STATE_TONE[status.state]}>{STATE_LABEL[status.state]}</span>
        <SourceIcon source={status.source} />
      </span>
      <span className="obs-metric-note text-white/60 truncate" style={{ maxWidth: 200 }} title={status.message}>
        {status.message}
      </span>
    </div>
  );
}
