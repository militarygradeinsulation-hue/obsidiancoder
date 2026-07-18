// FileExplorerPanel — foundational read-mostly view of a project's files.
// Non-entry files are read-only for now; entry synchronizes with `html`.
import type { Project } from "@/lib/project-model";
import { FileCode, Lock, Play } from "lucide-react";

export function FileExplorerPanel({
  project,
  activeFileId,
  onSelect,
}: {
  project?: Project;
  activeFileId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="obs-card">
      <div className="obs-card-title">Files</div>
      {!project ? (
        <div className="obs-empty">No project yet. Files appear after the first build.</div>
      ) : (
        <ul className="obs-list">
          {project.files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className={`obs-list-item ${activeFileId === f.id ? "is-active" : ""}`}
                onClick={() => onSelect?.(f.id)}
                title={f.path}
              >
                <FileCode size={12} />
                <span className="obs-list-label">{f.path}</span>
                {f.executable ? <Play size={10} className="obs-list-icon" /> : null}
                {f.protected ? <Lock size={10} className="obs-list-icon" /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
