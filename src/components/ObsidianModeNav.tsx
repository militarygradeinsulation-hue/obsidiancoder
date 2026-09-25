// Shared mode navigation: one product, one project — Pocket, Studio, Brain,
// Agent, plus links to the real Archive/Library (deploy + handoff live there
// and in Studio's GitHub/export tools).

import * as React from "react";
import { Link } from "@tanstack/react-router";
import { readCurrentProject, type CurrentProject } from "@/lib/current-project";

export function ObsidianModeNav({ showProject = false, className = "" }: { showProject?: boolean; className?: string }) {
  const [project, setProject] = React.useState<CurrentProject | null>(null);
  React.useEffect(() => {
    if (!showProject) return;
    setProject(readCurrentProject());
    const onStorage = () => setProject(readCurrentProject());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [showProject]);

  return (
    <nav className={`obs-modenav ${className}`} aria-label="Obsidian modes">
      <Link to="/pocket" title="Pocket — quick chat-to-build">Pocket</Link>
      <Link to="/" activeOptions={{ exact: true }} title="Studio — precision workspace">Studio</Link>
      <Link to="/brain" title="Brain — shared memory and learning">Brain</Link>
      <Link to="/agent" title="Agent — mission control">Agent</Link>
      <span className="obs-modenav-sep" aria-hidden />
      <Link to="/archive" className="obs-modenav-secondary" title="Every build — reopen, download, publish">Archive</Link>
      <Link to="/library" className="obs-modenav-secondary obs-modenav-label-long" title="Saved and published builds">Library</Link>
      {showProject && project && (
        <>
          <span className="obs-modenav-sep" aria-hidden />
          <span className="obs-modenav-secondary" style={{ fontSize: 11, padding: "0 8px", opacity: 0.75, whiteSpace: "nowrap" }} title={`Current project (${project.surface})`}>
            ◆ {project.title}
          </span>
        </>
      )}
    </nav>
  );
}
