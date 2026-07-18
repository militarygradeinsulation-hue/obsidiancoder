// InspectorPanel — foundational. Displays sanitized selection info when the
// preview bridge emits a selection event. Actions are deferred until the
// preview-side inspector script is wired; the panel makes the contract explicit.
import { MousePointer2 } from "lucide-react";

export type InspectorSelection = {
  tag: string;
  id?: string;
  classes: string[];
  selector: string;
  text?: string;
  parentSelector?: string;
} | null;

export function InspectorPanel({
  selection,
  enabled,
  onToggle,
}: {
  selection: InspectorSelection;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="obs-card">
      <div className="obs-card-title">
        <MousePointer2 size={12} /> Inspector
        <button
          type="button"
          className={`obs-chip ${enabled ? "is-on" : ""}`}
          onClick={() => onToggle(!enabled)}
          style={{ marginLeft: "auto" }}
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>
      {!selection ? (
        <div className="obs-empty">
          {enabled
            ? "Selection mode active. Click an element in the preview."
            : "Toggle on to enable visual selection (preview bridge required)."}
        </div>
      ) : (
        <div className="obs-inspect">
          <div><b>Tag:</b> {selection.tag}</div>
          {selection.id ? <div><b>ID:</b> {selection.id}</div> : null}
          {selection.classes.length ? <div><b>Classes:</b> {selection.classes.join(" ")}</div> : null}
          <div><b>Selector:</b> <code>{selection.selector}</code></div>
          {selection.text ? <div><b>Text:</b> {selection.text.slice(0, 80)}</div> : null}
        </div>
      )}
    </div>
  );
}
