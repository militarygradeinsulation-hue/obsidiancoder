// DeploymentReadinessPanel — read-only readiness snapshot. Never claims
// deployment state; only reports what the local pipeline observes.
import { Rocket, Download } from "lucide-react";
import { stripPreviewOnly } from "@/lib/clean-export";

export function DeploymentReadinessPanel({
  html,
  validationStatus,
  blockingRuleCount,
  runtimeErrorCount,
}: {
  html: string;
  validationStatus: "passed" | "warnings" | "failed" | "unknown";
  blockingRuleCount: number;
  runtimeErrorCount: number;
}) {
  const ready = !!html && validationStatus !== "failed" && blockingRuleCount === 0 && runtimeErrorCount === 0;
  const reasons: string[] = [];
  if (!html) reasons.push("no build yet");
  if (validationStatus === "failed") reasons.push("validation failed");
  if (blockingRuleCount) reasons.push(`${blockingRuleCount} blocking rule${blockingRuleCount === 1 ? "" : "s"}`);
  if (runtimeErrorCount) reasons.push(`${runtimeErrorCount} runtime error${runtimeErrorCount === 1 ? "" : "s"}`);

  function download() {
    const clean = stripPreviewOnly(html);
    const blob = new Blob([clean], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "obsidian-export.html"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="obs-card">
      <div className="obs-card-title"><Rocket size={12} /> Deployment</div>
      <div className="obs-empty">
        Status: <b style={{ color: ready ? "#7dd287" : "#f2c976" }}>{ready ? "Ready" : "Not ready"}</b>
        {reasons.length ? ` — ${reasons.join(", ")}` : ""}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" className="obs-chip" onClick={download} disabled={!html}>
          <Download size={11} /> Export clean HTML
        </button>
      </div>
    </div>
  );
}
