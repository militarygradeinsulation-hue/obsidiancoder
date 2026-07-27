// Engineering Console — displays the Chief Engineer's multi-agent review.
// Purely presentational; the report is produced by src/lib/chief-engineer.ts.

import { useState } from "react";
import { Users, ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, ShieldX, Loader2 } from "lucide-react";
import type { AgentReview, EngineeringReport, AgentApproval } from "@/lib/chief-engineer";
import type { QaSessionStatus } from "@/lib/qa-status";
import { QaStatusRow } from "./QaStatusRow";

function approvalIcon(a: AgentApproval) {
  if (a === "approve") return <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />;
  if (a === "warn") return <ShieldAlert className="h-3.5 w-3.5 text-amber-300" />;
  return <ShieldX className="h-3.5 w-3.5 text-red-400" />;
}

function approvalTone(a: AgentApproval): string {
  return a === "approve" ? "text-emerald-400" : a === "warn" ? "text-amber-300" : "text-red-400";
}

export function EngineeringConsolePanel(props: {
  live: AgentReview[];
  report: EngineeringReport | null;
  running: boolean;
  bypass: boolean;
  onToggleBypass: (v: boolean) => void;
  currentStage?: string;
  qaStatus?: QaSessionStatus | null;
}) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const list = props.running ? props.live : props.report?.reviews ?? props.live;

  return (
    <div className="obs-card">
      <button type="button" className="obs-card-head w-full" onClick={() => setOpen((v) => !v)}>
        <span className="obs-card-label flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Users className="h-3.5 w-3.5" /> Engineering console
        </span>
        <span className="obs-node text-white/70">
          {props.running ? (
            <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {props.currentStage ?? "reviewing"}</span>
          ) : props.report ? (
            <span className={approvalTone(props.report.blocked && !props.report.bypassed ? "block" : props.report.blockingRoles.length ? "warn" : "approve")}>
              {props.report.readinessScore}/100
            </span>
          ) : "idle"}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <QaStatusRow status={props.qaStatus ?? null} />

          <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
            <input type="checkbox" checked={props.bypass} onChange={(e) => props.onToggleBypass(e.target.checked)} />
            Bypass QA / Security / Performance review
          </label>

          {list.length === 0 && !props.running && (
            <div className="obs-metric-note">No engineering reviews yet. Generate a build to run the crew.</div>
          )}

          <ul style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {list.map((r) => {
              const key = r.role;
              const isOpen = !!expanded[key];
              return (
                <li key={key} className="obs-metric-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                  <button type="button" className="flex items-center justify-between w-full text-left" onClick={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}>
                    <span className="flex items-center gap-1.5 text-xs">
                      {approvalIcon(r.approval)}
                      <span className="text-white/85">{r.label}</span>
                    </span>
                    <span className={"text-xs " + approvalTone(r.approval)}>{r.score}</span>
                  </button>
                  <div className="obs-metric-note" style={{ marginLeft: 20 }}>{r.summary}</div>
                  {isOpen && (
                    <div style={{ marginLeft: 20, marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                      {r.findings.slice(0, 6).map((f) => (
                        <div key={f.id} className="obs-metric-note">
                          <span className={f.severity === "critical" || f.severity === "high" ? "text-red-400" : f.severity === "medium" ? "text-amber-300" : "text-white/50"}>
                            [{f.severity}]
                          </span>{" "}
                          {f.message}
                        </div>
                      ))}
                      {r.recommendations.slice(0, 4).map((rec, i) => (
                        <div key={i} className="obs-metric-note text-white/60">→ {rec}</div>
                      ))}
                      {r.filesInfluenced.length > 0 && (
                        <div className="obs-metric-note text-white/40">files: {r.filesInfluenced.join(", ")}</div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {props.report && (
            <div className="obs-metrics" style={{ gap: 4, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 6 }}>
              <div className="obs-metric-row"><span>Readiness</span><b className={approvalTone(props.report.blocked && !props.report.bypassed ? "block" : "approve")}>{props.report.readinessScore}/100</b></div>
              <div className="obs-metric-row"><span>Status</span><b className={approvalTone(props.report.blocked && !props.report.bypassed ? "block" : props.report.blockingRoles.length ? "warn" : "approve")}>
                {props.report.bypassed ? "bypassed" : props.report.blocked ? "blocked" : props.report.blockingRoles.length ? "warned" : "approved"}
              </b></div>
              {props.report.risks.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div className="obs-card-label" style={{ fontSize: 10 }}>Top risks</div>
                  {props.report.risks.slice(0, 5).map((r, i) => (
                    <div key={i} className="obs-metric-note text-red-300/80">• {r}</div>
                  ))}
                </div>
              )}
              {props.report.tradeoffs.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div className="obs-card-label" style={{ fontSize: 10 }}>Tradeoffs (Architect)</div>
                  {props.report.tradeoffs.map((r, i) => (
                    <div key={i} className="obs-metric-note text-amber-300/80">• {r}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
