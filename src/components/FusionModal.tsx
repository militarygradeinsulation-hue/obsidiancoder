// Project Fusion modal — select ≥2 projects, pick base + mode, review the
// plan (conflicts + operations), commit to a new session. Keyboard
// accessible; preserves black/gold IDE aesthetic via existing obs-* classes.
import { useMemo, useState } from "react";
import { X, Check, AlertTriangle, GitMerge, Layers, Loader2 } from "lucide-react";
import {
  fuseProjects,
  type FusionMode,
  type FusionProject,
  type FusionResult,
} from "@/lib/project-fusion";

export type FusionCommit = {
  html: string;
  title: string;
  result: FusionResult;
  sourceIds: string[];
};

export function FusionModal({
  open,
  projects,
  onClose,
  onCommit,
}: {
  open: boolean;
  projects: FusionProject[];
  onClose: () => void;
  onCommit: (c: FusionCommit) => void;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [baseId, setBaseId] = useState<string>("");
  const [mode, setMode] = useState<FusionMode>("module");
  const [busy, setBusy] = useState(false);

  const eligible = useMemo(
    () => projects.filter((p) => (p.html || "").trim().length > 0),
    [projects],
  );

  const chosen = useMemo(
    () => eligible.filter((p) => selected[p.id]),
    [eligible, selected],
  );

  const result: FusionResult | null = useMemo(() => {
    if (chosen.length < 2) return null;
    const base = chosen.some((p) => p.id === baseId) ? baseId : chosen[0].id;
    try {
      return fuseProjects(chosen, base, mode, { title: `Fusion (${mode}) — ${chosen.map((c) => c.title).join(" + ")}` });
    } catch {
      return null;
    }
  }, [chosen, baseId, mode]);

  if (!open) return null;

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
    if (!baseId) setBaseId(id);
  }

  function commit() {
    if (!result || !result.html) return;
    setBusy(true);
    try {
      onCommit({
        html: result.html,
        title: `Fusion · ${chosen.map((c) => c.title).join(" + ").slice(0, 60)}`,
        result,
        sourceIds: chosen.map((c) => c.id),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="obs-fusion-title"
      className="obs-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="obs-modal obs-fusion-modal">
        <header className="obs-modal-header">
          <div className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 obs-text-gold" />
            <h2 id="obs-fusion-title" className="obs-modal-title">Combine Projects</h2>
          </div>
          <button type="button" onClick={onClose} className="obs-icon-btn" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="obs-fusion-body">
          {/* 1 — select */}
          <section className="obs-fusion-section">
            <h3 className="obs-fusion-h">1 · Select projects (≥2)</h3>
            {eligible.length < 2 ? (
              <p className="obs-empty">
                Combine needs at least <b>two</b> projects that have been built.
                Open a new tab (+) and build another project, then come back here
                to merge them into one.
              </p>
            ) : chosen.length < 2 ? (
              <>
                <p className="obs-empty" style={{ marginBottom: 8 }}>
                  Tick <b>two or more</b> projects below to preview a fusion plan.
                </p>
                <ul className="obs-fusion-list">
                  {eligible.map((p) => (
                    <li key={p.id}>
                      <label className="obs-fusion-item">
                        <input
                          type="checkbox"
                          checked={!!selected[p.id]}
                          onChange={() => toggle(p.id)}
                          aria-label={`Include ${p.title}`}
                        />
                        <span className="obs-fusion-item-title">{p.title || "Untitled"}</span>
                        <span className="obs-fusion-item-size">{(p.html.length / 1024).toFixed(1)} KB</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ul className="obs-fusion-list">
                {eligible.map((p) => (
                  <li key={p.id}>
                    <label className="obs-fusion-item">
                      <input
                        type="checkbox"
                        checked={!!selected[p.id]}
                        onChange={() => toggle(p.id)}
                        aria-label={`Include ${p.title}`}
                      />
                      <span className="obs-fusion-item-title">{p.title || "Untitled"}</span>
                      <span className="obs-fusion-item-size">{(p.html.length / 1024).toFixed(1)} KB</span>
                      {selected[p.id] && (
                        <button
                          type="button"
                          className={"obs-chip " + (baseId === p.id ? "is-on" : "")}
                          onClick={(e) => { e.preventDefault(); setBaseId(p.id); }}
                          aria-pressed={baseId === p.id}
                        >
                          {baseId === p.id ? "Base ✓" : "Set base"}
                        </button>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 2 — mode */}
          <section className="obs-fusion-section">
            <h3 className="obs-fusion-h">2 · Fusion mode</h3>
            <div className="obs-fusion-modes">
              {(["module", "smart", "suite"] as FusionMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={"obs-fusion-mode " + (mode === m ? "is-on" : "")}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <strong>{m === "module" ? "Add as Module" : m === "smart" ? "Smart Merge" : "Unified Suite"}</strong>
                  <span>
                    {m === "module" && "Each project isolated as a namespaced section."}
                    {m === "smart" && "Dedupe shared components, styles, and utilities."}
                    {m === "suite" && "Shared shell, nav, and design tokens across projects."}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* 3 — plan preview */}
          <section className="obs-fusion-section">
            <h3 className="obs-fusion-h">3 · Fusion plan preview</h3>
            {!result ? (
              <p className="obs-empty">Select two or more projects to generate a plan.</p>
            ) : (
              <div className="obs-fusion-plan">
                <p className="obs-fusion-summary">{result.plan.summary}</p>
                <div className="obs-fusion-metrics">
                  <span>Projects: <b>{result.metrics.projectsCombined}</b></span>
                  <span>Sections: <b>{result.metrics.filesAdded}</b></span>
                  <span>Deduped: <b>{result.metrics.filesDeduplicated}</b></span>
                  <span>Auto-resolved: <b>{result.metrics.conflictsResolved}</b></span>
                  <span>Needs input: <b>{result.metrics.conflictsRequiringInput}</b></span>
                  <span>Routes: <b>{result.metrics.routesCreated}</b></span>
                  <span>Validated in: <b>{result.metrics.validationMs}ms</b></span>
                </div>
                <details open>
                  <summary>Operations ({result.plan.operations.length})</summary>
                  <ul className="obs-fusion-ops">
                    {result.plan.operations.map((op, i) => (
                      <li key={i}>
                        <span className={`obs-fusion-risk is-${op.risk}`}>{op.risk}</span>
                        <b>{op.op}</b> <code>{op.target}</code> — {op.note}
                      </li>
                    ))}
                  </ul>
                </details>
                {result.plan.conflicts.length > 0 && (
                  <details>
                    <summary>Conflicts ({result.plan.conflicts.length})</summary>
                    <ul className="obs-fusion-ops">
                      {result.plan.conflicts.map((c) => (
                        <li key={c.key}>
                          <span className={`obs-fusion-risk is-${c.severity === "high" ? "high" : c.severity === "medium" ? "medium" : "low"}`}>
                            <AlertTriangle className="h-3 w-3" /> {c.severity}
                          </span>
                          <b>{c.kind}</b> — {c.message}
                          {c.autoResolvable ? <em> · auto-resolved</em> : <em> · needs input</em>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {result.blockers.length > 0 && (
                  <p className="obs-error-text">Blockers: {result.blockers.join("; ")}</p>
                )}
              </div>
            )}
          </section>
        </div>

        <footer className="obs-modal-footer">
          <button type="button" className="obs-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="obs-btn obs-btn-primary"
            disabled={!result || !result.html || busy || (result && !result.ok)}
            onClick={commit}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Commit fusion to new session
          </button>
        </footer>
      </div>
    </div>
  );
}
