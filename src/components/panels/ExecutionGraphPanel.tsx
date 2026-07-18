// Execution graph — shows the pipeline stages of the current or most recent
// operation. Populated from real pipeline state; missing fields are shown
// blank rather than fabricated.

import { useState } from "react";
import { GitBranch, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Circle, Clock } from "lucide-react";
import type { StageName } from "@/lib/pipeline";
import type { GenerationMetrics } from "@/lib/generation-metrics";

const ALL_STAGES: { id: StageName; label: string }[] = [
  { id: "classify", label: "Inspect" },
  { id: "plan", label: "Plan" },
  { id: "context", label: "Context" },
  { id: "execute", label: "Execute" },
  { id: "validate", label: "Validate" },
  { id: "repair", label: "Repair" },
  { id: "finalize", label: "Finalize" },
];

export function ExecutionGraphPanel(props: {
  currentStage: StageName | null;
  stageDetail: string;
  loading: boolean;
  lastMetrics: GenerationMetrics | null;
}) {
  const [open, setOpen] = useState(false);
  const currentIdx = props.currentStage ? ALL_STAGES.findIndex((s) => s.id === props.currentStage) : -1;
  const m = props.lastMetrics;

  return (
    <div className="obs-card">
      <button type="button" className="obs-card-head w-full" onClick={() => setOpen((v) => !v)}>
        <span className="obs-card-label flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <GitBranch className="h-3.5 w-3.5" /> Execution graph
        </span>
        <span className="obs-node text-white/70">
          {props.loading ? props.currentStage ?? "running" : m ? m.strategy : "idle"}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <ul className="obs-metric-issues" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {ALL_STAGES.map((s, i) => {
              const isCurrent = props.loading && i === currentIdx;
              const isPast = currentIdx > i || (!props.loading && m && i <= (m.fallbackUsed ? 5 : 4));
              const Icon = isCurrent ? Loader2 : isPast ? CheckCircle2 : Circle;
              return (
                <li key={s.id} className={isCurrent ? "text-amber-300" : isPast ? "text-emerald-400/80" : "text-white/40"} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon className={"h-3 w-3 " + (isCurrent ? "animate-spin" : "")} />
                  <span className="text-xs">{s.label}</span>
                  {isCurrent && props.stageDetail && <span className="obs-metric-note ml-1">· {props.stageDetail}</span>}
                </li>
              );
            })}
          </ul>
          {m && (
            <div className="obs-metrics" style={{ marginTop: 8, gap: 4 }}>
              <div className="obs-metric-row"><span>Strategy</span><b>{m.strategy}</b></div>
              <div className="obs-metric-row"><span>Task</span><b>{m.taskType}</b></div>
              {m.model && <div className="obs-metric-row"><span>Model</span><b className="truncate">{m.model}</b></div>}
              {m.durationMs != null && <div className="obs-metric-row"><span>Duration</span><b><Clock className="inline h-3 w-3 mr-1" />{Math.round(m.durationMs)}ms</b></div>}
              <div className="obs-metric-row"><span>Cost tier</span><b>{m.costEstimate}</b></div>
              <div className="obs-metric-row"><span>Validation</span><b className={m.validation?.status === "passed" ? "text-emerald-400" : m.validation?.status === "warn" ? "text-amber-300" : "text-red-400"}>{m.validation?.status ?? "—"}</b></div>
              <div className="obs-metric-row"><span>Doc changed</span><b>{m.documentChanged ? "yes" : "no"}</b></div>
              {m.patchOperationCount != null && <div className="obs-metric-row"><span>Patch ops</span><b>{m.patchOperationCount}</b></div>}
              {(m.charactersAdded != null || m.charactersRemoved != null) && (
                <div className="obs-metric-row"><span>Diff</span><b>+{m.charactersAdded ?? 0} / -{m.charactersRemoved ?? 0}</b></div>
              )}
              {m.fallbackUsed && (
                <div className="obs-metric-row"><span>Repair</span><b className="text-amber-300"><XCircle className="inline h-3 w-3 mr-1" />auto-repaired</b></div>
              )}
            </div>
          )}
          {!m && !props.loading && (
            <div className="obs-metric-note" style={{ marginTop: 8 }}>No operations yet this session.</div>
          )}
        </div>
      )}
    </div>
  );
}
