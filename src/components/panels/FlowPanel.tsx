// FlowPanel — DSL editor + parse feedback. Runner execution against the
// preview iframe is foundational and shipped as a follow-up; parsing and
// visualization is fully live here.
import { useState } from "react";
import { parseFlow, type FlowStep } from "@/lib/flow-parser";
import { Play } from "lucide-react";

export function FlowPanel() {
  const [dsl, setDsl] = useState(`open\nclick #cta\nassertText h1 "Welcome"\nassertNoConsoleErrors`);
  const parsed = parseFlow(dsl);

  return (
    <div className="obs-card">
      <div className="obs-card-title"><Play size={12} /> Flow Runner</div>
      <textarea
        value={dsl}
        onChange={(e) => setDsl(e.target.value)}
        rows={5}
        className="obs-textarea"
        spellCheck={false}
      />
      <div className="obs-empty" style={{ marginTop: 8 }}>
        Parsed {parsed.steps.length} step{parsed.steps.length === 1 ? "" : "s"}
        {parsed.errors.length ? `, ${parsed.errors.length} error${parsed.errors.length === 1 ? "" : "s"}` : ""}.
        Execution against the sandboxed preview is foundational — commands parse and validate locally.
      </div>
      {parsed.errors.length > 0 && (
        <ul className="obs-list">
          {parsed.errors.map((e, i) => (
            <li key={i} className="obs-list-item"><span style={{ color: "#f88" }}>line {e.line}:</span> {e.message}</li>
          ))}
        </ul>
      )}
      <ul className="obs-list">
        {parsed.steps.map((s: FlowStep, i) => {
          const detail = "selector" in s ? s.selector : "url" in s ? s.url : "ms" in s ? String(s.ms) : "";
          const value = "text" in s ? ` "${s.text}"` : "";
          return <li key={i} className="obs-list-item"><code>{s.op}</code> {detail}{value}</li>;
        })}
      </ul>
    </div>
  );
}
