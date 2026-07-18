// Unified Trust dashboard — evidence-based. All values computed deterministically
// from the current preview HTML. Zero AI calls.

import { useMemo, useState } from "react";
import { Shield, Eye, Zap, Search, Activity, ChevronDown, ChevronRight } from "lucide-react";
import { buildGraph } from "@/lib/knowledge-graph";
import { scanAll, type ScanReport, type Severity } from "@/lib/scanners";
import { computeConfidence } from "@/lib/confidence";
import { validateHtml } from "@/lib/validation";

const SEV_COLOR: Record<Severity, string> = {
  critical: "text-red-400",
  high: "text-red-300",
  medium: "text-amber-300",
  low: "text-amber-200/80",
  info: "text-white/60",
};

function SectionCard(props: { title: string; icon: React.ComponentType<{ className?: string }>; report: ScanReport }) {
  const [open, setOpen] = useState(false);
  const Icon = props.icon;
  const bad = props.report.findings.filter((f) => f.severity === "critical" || f.severity === "high").length;
  return (
    <div className="obs-card" style={{ padding: 10 }}>
      <button type="button" className="obs-card-head w-full" onClick={() => setOpen((v) => !v)} style={{ marginBottom: open ? 8 : 0 }}>
        <span className="flex items-center gap-2 obs-card-label">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Icon className="h-3.5 w-3.5" /> {props.title}
        </span>
        <span className={"obs-node " + (props.report.score >= 80 ? "text-emerald-400" : props.report.score >= 60 ? "text-amber-300" : "text-red-400")}>
          {props.report.score} {bad > 0 ? `· ${bad} blocker` : ""}
        </span>
      </button>
      {open && (
        <ul className="obs-metric-issues" style={{ maxHeight: 200, overflowY: "auto" }}>
          {props.report.findings.length === 0 && <li className="text-emerald-400">✓ No issues detected</li>}
          {props.report.findings.slice(0, 20).map((f) => (
            <li key={f.id} className={SEV_COLOR[f.severity]}>
              [{f.severity}] {f.message}
              {f.fix && <div className="opacity-60 text-[10px] ml-3">→ {f.fix}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TrustDashboard(props: { html: string; runtimeErrors?: number }) {
  const analysis = useMemo(() => {
    if (!props.html) return null;
    const g = buildGraph(props.html);
    const scans = scanAll(props.html, g);
    const validation = validateHtml(props.html);
    const confidence = computeConfidence({
      validation,
      security: scans.security,
      accessibility: scans.accessibility,
      performance: scans.performance,
      detective: scans.detective,
      runtimeErrors: props.runtimeErrors,
    });
    return { g, scans, validation, confidence };
  }, [props.html, props.runtimeErrors]);

  if (!analysis) {
    return (
      <div className="obs-card">
        <div className="obs-card-head">
          <span className="obs-card-label">Trust dashboard</span>
          <span className="obs-node opacity-60">no build</span>
        </div>
        <div className="obs-metric-note">Build something to see evidence-based confidence, security, accessibility, performance, and detective scans.</div>
      </div>
    );
  }

  const { g, scans, confidence } = analysis;

  return (
    <div className="obs-card">
      <div className="obs-card-head">
        <span className="obs-card-label flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Trust · evidence-based</span>
        <span className={"obs-node " + (confidence.score >= 80 ? "text-emerald-400" : confidence.score >= 60 ? "text-amber-300" : "text-red-400")}>
          {confidence.score} · {confidence.grade}
        </span>
      </div>
      <div className="obs-metrics" style={{ gap: 6 }}>
        <div className="obs-metric-row"><span>Files</span><b>1 HTML · {g.nodeCount} nodes</b></div>
        <div className="obs-metric-row"><span>Integrations</span><b>{g.integrations.join(", ") || "none"}</b></div>
        <div className="obs-metric-row"><span>Endpoints</span><b>{g.endpoints.length}</b></div>
        <div className="obs-metric-row"><span>Dependencies</span><b>{g.dependencies.length}</b></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        <SectionCard title="Security" icon={Shield} report={scans.security} />
        <SectionCard title="Accessibility" icon={Eye} report={scans.accessibility} />
        <SectionCard title="Performance" icon={Zap} report={scans.performance} />
        <SectionCard title="Detective" icon={Search} report={scans.detective} />
      </div>
      <div className="obs-metric-note" style={{ marginTop: 8 }}>
        Confidence weights validation 25%, security 20%, a11y 15%, perf 15%, detective 10%, runtime 10%, self-tests 5%. All deterministic — no AI self-report.
      </div>
    </div>
  );
}
