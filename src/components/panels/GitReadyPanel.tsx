// GitReadyPanel — local diff summary + generated commit message. Explicit:
// GitHub is not connected here; this is copy/export only.
import { GitBranch, Copy } from "lucide-react";
import { diffSummary } from "@/lib/diff-summary";

export function GitReadyPanel({
  previousHtml,
  currentHtml,
  lastRequest,
}: {
  previousHtml: string;
  currentHtml: string;
  lastRequest?: string;
}) {
  const d = diffSummary(previousHtml, currentHtml);
  const changed = currentHtml !== previousHtml;
  const msg = changed
    ? `chore(preview): ${(lastRequest || "update").slice(0, 60)} (+${d.charsAdded} / -${d.charsRemoved})`
    : "No local changes.";

  return (
    <div className="obs-card">
      <div className="obs-card-title"><GitBranch size={12} /> Git-ready</div>
      <div className="obs-empty">Local only — GitHub not connected.</div>
      <div style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.85, marginTop: 6 }}>{msg}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          type="button"
          className="obs-chip"
          onClick={() => { void navigator.clipboard?.writeText(msg); }}
          disabled={!changed}
        >
          <Copy size={11} /> Copy message
        </button>
      </div>
    </div>
  );
}
