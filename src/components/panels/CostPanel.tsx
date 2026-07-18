// Cost panel — per-session accumulated cost/model snapshot. Estimates are
// explicitly labelled; there is no real billing here.

import { useState } from "react";
import { Coins, ChevronDown, ChevronRight } from "lucide-react";
import type { CostSnapshot } from "@/lib/cost-metrics";

export function CostPanel(props: { snapshot: CostSnapshot }) {
  const [open, setOpen] = useState(false);
  const c = props.snapshot;
  const models = Object.entries(c.byModel).sort((a, b) => b[1] - a[1]);

  return (
    <div className="obs-card">
      <button type="button" className="obs-card-head w-full" onClick={() => setOpen((v) => !v)}>
        <span className="obs-card-label flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Coins className="h-3.5 w-3.5" /> Cost · estimated
        </span>
        <span className="obs-node text-amber-300">~${c.estimatedCostUsd.toFixed(4)}</span>
      </button>
      {open && (
        <div className="obs-metrics" style={{ gap: 6, marginTop: 8 }}>
          <div className="obs-metric-row"><span>AI calls</span><b>{c.aiCalls}</b></div>
          <div className="obs-metric-row"><span>Deterministic edits</span><b>{c.deterministicEdits}</b></div>
          <div className="obs-metric-row"><span>Patch successes</span><b>{c.patchSuccesses}</b></div>
          <div className="obs-metric-row"><span>Repairs applied</span><b>{c.repairs}</b></div>
          <div className="obs-metric-row"><span>Rollbacks</span><b>{c.rollbacks}</b></div>
          <div className="obs-metric-row"><span>Restores</span><b>{c.restores}</b></div>
          <div className="obs-metric-row"><span>Est. tokens</span><b>~{c.estimatedTokens.toLocaleString()}</b></div>
          <div className="obs-metric-row"><span>Total duration</span><b>{(c.totalDurationMs / 1000).toFixed(1)}s</b></div>
          {models.length > 0 && (
            <div style={{ marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
              <div className="obs-metric-note" style={{ marginBottom: 4 }}>Model usage</div>
              {models.map(([m, n]) => (
                <div key={m} className="obs-metric-row"><span className="truncate">{m}</span><b>{n}</b></div>
              ))}
            </div>
          )}
          <div className="obs-metric-note" style={{ marginTop: 6 }}>
            ESTIMATED — computed locally from diff size × conservative per-tier rates. Not real billing.
          </div>
        </div>
      )}
    </div>
  );
}
