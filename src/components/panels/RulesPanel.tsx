// Rules panel — visible enable/disable toggles for the protected architecture
// rules engine. Runs deterministic checks over the current preview and shows
// live violations. Blocking violations should be enforced at the commit site.

import { useMemo, useState } from "react";
import { Shield, ChevronDown, ChevronRight } from "lucide-react";
import { DEFAULT_RULES, runRules, type Rule, type RuleSeverity } from "@/lib/rules-engine";
import { buildGraph } from "@/lib/knowledge-graph";

const SEV_COLOR: Record<RuleSeverity, string> = {
  blocking: "text-red-400",
  warning: "text-amber-300",
  info: "text-white/60",
};

export function RulesPanel(props: { html: string }) {
  const [rules, setRules] = useState<Rule[]>(DEFAULT_RULES);
  const [open, setOpen] = useState(false);

  const violations = useMemo(() => {
    if (!props.html) return [];
    return runRules(rules, props.html, buildGraph(props.html));
  }, [rules, props.html]);

  const blocking = violations.filter((v) => v.severity === "blocking").length;

  function toggle(id: string) {
    setRules((rs) => rs.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r));
  }

  return (
    <div className="obs-card">
      <button type="button" className="obs-card-head w-full" onClick={() => setOpen((v) => !v)}>
        <span className="obs-card-label flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Shield className="h-3.5 w-3.5" /> Protected architecture rules
        </span>
        <span className={"obs-node " + (blocking > 0 ? "text-red-400" : violations.length > 0 ? "text-amber-300" : "text-emerald-400")}>
          {blocking > 0 ? `${blocking} blocker` : violations.length > 0 ? `${violations.length} warn` : "clean"}
        </span>
      </button>
      {open && (
        <div className="obs-metrics" style={{ gap: 6, marginTop: 8 }}>
          {rules.map((r) => {
            const vs = violations.filter((v) => v.ruleId === r.id);
            return (
              <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={r.enabled} onChange={() => toggle(r.id)} />
                  <span className="text-xs">{r.label}</span>
                  <span className={"ml-auto text-[10px] uppercase " + SEV_COLOR[r.severity]}>{r.severity}</span>
                </label>
                <span className="opacity-60 text-[10px]">{r.description}</span>
                {vs.length > 0 && (
                  <ul className="obs-metric-issues">
                    {vs.slice(0, 4).map((v, i) => (
                      <li key={i} className={SEV_COLOR[v.severity]}>✗ {v.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
