// ComponentLibraryPanel — local session-scoped component list. Insertion into
// the current build routes through the central commit gate at the call site.
import type { ComponentEntry } from "@/lib/component-library";
import { Layers, Trash2, Copy } from "lucide-react";

export function ComponentLibraryPanel({
  components,
  onDelete,
  onDuplicate,
  onInsert,
}: {
  components: ComponentEntry[];
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onInsert?: (id: string) => void;
}) {
  return (
    <div className="obs-card">
      <div className="obs-card-title"><Layers size={12} /> Components</div>
      {components.length === 0 ? (
        <div className="obs-empty">
          Save reusable pieces from the Inspector. Local to this session, private, no upload.
        </div>
      ) : (
        <ul className="obs-list">
          {components.map((c) => (
            <li key={c.id} className="obs-list-item">
              <span className="obs-list-label" title={c.name}>{c.name}</span>
              {onInsert && <button type="button" className="obs-chip" onClick={() => onInsert(c.id)}>Insert</button>}
              {onDuplicate && <button type="button" className="obs-icon-btn" onClick={() => onDuplicate(c.id)}><Copy size={11} /></button>}
              {onDelete && <button type="button" className="obs-icon-btn" onClick={() => onDelete(c.id)}><Trash2 size={11} /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
