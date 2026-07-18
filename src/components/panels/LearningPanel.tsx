// Learning panel — the human-controllable view of everything Obsidian has
// learned. Confirm, lock, dismiss, forget, reset, export, import.

import * as React from "react";
import {
  loadPreferences, savePreferences,
  confirmPreference, lockPreference, dismissPreference, forgetPreference,
  type LearnedPreference,
} from "@/lib/preference-learning";
import { clearLedger, loadLedger } from "@/lib/adaptive-ledger";
import {
  loadSettings, saveSettings, exportProfile, importProfile,
  type LearningSettings,
} from "@/lib/adaptive-profile";
import { safeSet } from "@/lib/safe-storage";

export function LearningPanel({ onChange }: { onChange?: () => void }) {
  const [prefs, setPrefs] = React.useState<LearnedPreference[]>([]);
  const [settings, setSettings] = React.useState<LearningSettings>(loadSettings());
  const [importErr, setImportErr] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    setPrefs(loadPreferences());
    setSettings(loadSettings());
  }, []);
  React.useEffect(refresh, [refresh]);

  const mutate = (next: LearnedPreference[]) => {
    savePreferences(next); setPrefs(next); onChange?.();
  };

  const doExport = () => {
    try {
      const data = exportProfile();
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `obsidian-learning-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const doImport = (file: File) => {
    setImportErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      const r = importProfile(String(reader.result ?? ""));
      if (!r.ok) { setImportErr(r.error); return; }
      refresh(); onChange?.();
    };
    reader.readAsText(file);
  };

  const doResetAll = () => {
    if (typeof window !== "undefined" && !window.confirm("Reset all learning for this project?")) return;
    safeSet("obs.core4.v1.prefs", []);
    clearLedger();
    refresh(); onChange?.();
  };

  return (
    <div className="obs-card" id="rail-learning" data-testid="learning-panel">
      <div className="obs-card-head">
        <span>Learning</span>
        <span className="obs-card-meta">{prefs.length} items · {loadLedger().length} events</span>
      </div>
      <div className="obs-card-body" style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => { const s = { ...settings, enabled: e.target.checked }; saveSettings(s); setSettings(s); onChange?.(); }}
            data-testid="learning-enabled-toggle"
          />
          <span>Learning enabled (local only)</span>
        </label>
        {prefs.length === 0 ? (
          <div style={{ opacity: 0.6 }}>No preferences learned yet.</div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {prefs.slice(0, 20).map((p) => (
              <li key={p.id} style={{ padding: 6, border: "1px solid rgba(244,161,37,0.15)", borderRadius: 6 }}>
                <div>{p.key} → <b>{p.value}</b></div>
                <div style={{ opacity: 0.6, fontSize: 11 }}>{p.status} · {(p.confidence * 100).toFixed(0)}% · {p.evidenceCount} obs</div>
                <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                  <button className="obs-btn is-sm" onClick={() => mutate(confirmPreference(prefs, p.id))} data-testid={`pref-confirm-${p.id}`}>Confirm</button>
                  <button className="obs-btn is-sm" onClick={() => mutate(lockPreference(prefs, p.id))}>Lock</button>
                  <button className="obs-btn is-sm is-ghost" onClick={() => mutate(dismissPreference(prefs, p.id))}>Dismiss</button>
                  <button className="obs-btn is-sm is-ghost" onClick={() => mutate(forgetPreference(prefs, p.id))} data-testid={`pref-forget-${p.id}`}>Forget</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="obs-btn is-sm" onClick={doExport} data-testid="learning-export">Export</button>
          <label className="obs-btn is-sm" style={{ cursor: "pointer" }}>
            Import
            <input
              type="file" accept="application/json" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); }}
              data-testid="learning-import"
            />
          </label>
          <button className="obs-btn is-sm is-ghost" onClick={doResetAll} data-testid="learning-reset">Reset all</button>
        </div>
        {importErr && <div style={{ color: "#ff6b6b" }}>Import failed: {importErr}</div>}
      </div>
    </div>
  );
}
