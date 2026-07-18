// Runtime panel — bounded, sanitized runtime events from the preview iframe.
// All events are validated by parseRuntimeMessage host-side before storage.

import { useState } from "react";
import { Activity, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { RuntimeEvent } from "@/lib/runtime-bridge";

const KIND_COLOR: Record<RuntimeEvent["kind"], string> = {
  "ready": "text-emerald-400",
  "console-error": "text-red-400",
  "console-warn": "text-amber-300",
  "unhandled-error": "text-red-400",
  "unhandled-rejection": "text-red-300",
  "asset-failed": "text-amber-300",
  "fetch-failed": "text-amber-300",
  "navigation": "text-white/60",
};

const BLOCKER_KINDS = new Set<RuntimeEvent["kind"]>([
  "console-error", "unhandled-error", "unhandled-rejection",
]);

export function countRuntimeBlockers(events: RuntimeEvent[]): number {
  return events.filter((e) => BLOCKER_KINDS.has(e.kind)).length;
}

export function RuntimePanel(props: { events: RuntimeEvent[]; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const blockers = countRuntimeBlockers(props.events);
  const warns = props.events.filter((e) => e.kind === "console-warn" || e.kind === "fetch-failed" || e.kind === "asset-failed").length;

  return (
    <div className="obs-card">
      <button type="button" className="obs-card-head w-full" onClick={() => setOpen((v) => !v)}>
        <span className="obs-card-label flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Activity className="h-3.5 w-3.5" /> Runtime · live from preview
        </span>
        <span className={"obs-node " + (blockers > 0 ? "text-red-400" : warns > 0 ? "text-amber-300" : "text-emerald-400")}>
          {blockers > 0 ? `${blockers} err` : warns > 0 ? `${warns} warn` : "clean"}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className="obs-metric-note">{props.events.length} event{props.events.length === 1 ? "" : "s"}</span>
            <button type="button" className="obs-chip" onClick={props.onClear} title="Clear runtime log">
              <Trash2 className="h-3 w-3" /> Clear
            </button>
          </div>
          <ul className="obs-metric-issues" style={{ maxHeight: 220, overflowY: "auto" }}>
            {props.events.length === 0 && <li className="text-white/50">No events yet. Runtime events appear as the preview runs.</li>}
            {props.events.slice(-40).reverse().map((e, i) => (
              <li key={i} className={KIND_COLOR[e.kind]}>
                <b className="text-[10px] uppercase mr-1">{e.kind}</b>{e.message || "(no message)"}
                {e.url && <div className="opacity-60 text-[10px] ml-3 break-all">→ {e.url}{e.status ? ` (${e.status})` : ""}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
