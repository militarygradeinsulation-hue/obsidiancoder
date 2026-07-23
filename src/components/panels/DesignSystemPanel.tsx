// Design system panel — visible tokens + deterministic global actions.
// Every action generates a new version if it changes the document; it does NOT
// call AI. Caller controls commit semantics (validation + version metadata).

import { useMemo, useState } from "react";
import { Palette, Wand2 } from "lucide-react";
import { extractDesignTokens, replaceColor, setCssVariable } from "@/lib/design-system";

type ActionResult = { html: string; label: string; changes: number };

function normalizeHex(v: string): string {
  const s = (v || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const [r, g, b] = [s[1], s[2], s[3]];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return "";
}

export function DesignSystemPanel(props: {
  html: string;
  disabled?: boolean;
  onApply: (result: ActionResult) => void;
}) {
  const tokens = useMemo(() => extractDesignTokens(props.html || ""), [props.html]);
  const [fromColor, setFromColor] = useState("");
  const [toColor, setToColor] = useState("");
  const [varName, setVarName] = useState("");
  const [varValue, setVarValue] = useState("");
  const [note, setNote] = useState<string | null>(null);

  function runReplace() {
    if (!props.html || !fromColor.trim() || !toColor.trim()) { setNote("Provide both colors."); return; }
    const r = replaceColor(props.html, fromColor.trim(), toColor.trim());
    if (r.changes === 0) { setNote(`No occurrences of ${fromColor}.`); return; }
    setNote(`Replaced ${r.changes} occurrence(s).`);
    props.onApply({ html: r.html, label: `Recolor: ${fromColor} → ${toColor}`, changes: r.changes });
  }
  function runSetVar() {
    if (!props.html || !varName.trim() || !varValue.trim()) { setNote("Provide variable name and value."); return; }
    const r = setCssVariable(props.html, varName.trim(), varValue.trim());
    if (!r.changed) { setNote("Could not set variable."); return; }
    setNote(`Set --${varName.replace(/^--/, "")}.`);
    props.onApply({ html: r.html, label: `Set --${varName.replace(/^--/, "")}: ${varValue}`, changes: 1 });
  }

  const empty = !props.html;

  return (
    <div className="obs-card">
      <div className="obs-card-head">
        <span className="obs-card-label"><Palette className="h-3.5 w-3.5 inline mr-1" /> Design System</span>
        <span className="obs-node">{tokens.colors.length}c · {tokens.fonts.length}f</span>
      </div>
      {empty ? (
        <p className="obs-history-empty">Build something to extract tokens.</p>
      ) : (
        <div className="obs-metrics" style={{ gap: 8 }}>
          <div>
            <div className="opacity-70 text-[10px] uppercase tracking-wider mb-1">Colors</div>
            <div className="flex flex-wrap gap-1.5">
              {tokens.colors.slice(0, 14).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="obs-chip"
                  onClick={() => setFromColor(c)}
                  title={`Use ${c} as the 'from' color`}
                  style={{ padding: "2px 6px" }}
                >
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: c, marginRight: 4, border: "1px solid rgba(255,255,255,0.1)" }} />
                  <span className="text-[10px]">{c}</span>
                </button>
              ))}
            </div>
          </div>
          {tokens.fonts.length > 0 && (
            <div>
              <div className="opacity-70 text-[10px] uppercase tracking-wider mb-1">Fonts</div>
              <div className="text-[11px] opacity-80">{tokens.fonts.slice(0, 5).map((f) => f.split(",")[0].trim()).join(" · ")}</div>
            </div>
          )}
          {tokens.radii.length > 0 && (
            <div className="obs-metric-row"><span>Radii</span><b>{tokens.radii.slice(0, 3).join(", ")}</b></div>
          )}
          {tokens.shadows.length > 0 && (
            <div className="obs-metric-row"><span>Shadows</span><b>{tokens.shadows.length}</b></div>
          )}

          <div className="mt-1 pt-2 border-t border-white/5">
            <div className="opacity-70 text-[10px] uppercase tracking-wider mb-1.5">Global recolor</div>
            <div className="flex gap-1.5 items-center">
              <input
                type="color"
                value={normalizeHex(fromColor) || "#c9953d"}
                onChange={(e) => setFromColor(e.target.value)}
                className="obs-color-swatch"
                aria-label="From color picker"
                title="From color"
              />
              <input value={fromColor} onChange={(e) => setFromColor(e.target.value)} placeholder="#c9953d" className="obs-memory-input flex-1" style={{ fontSize: 11 }} />
              <span className="opacity-50 text-[11px]">→</span>
              <input
                type="color"
                value={normalizeHex(toColor) || "#e0b34a"}
                onChange={(e) => setToColor(e.target.value)}
                className="obs-color-swatch"
                aria-label="To color picker"
                title="To color"
              />
              <input value={toColor} onChange={(e) => setToColor(e.target.value)} placeholder="#e0b34a" className="obs-memory-input flex-1" style={{ fontSize: 11 }} />
              <button type="button" className="obs-chip obs-chip-gold" onClick={runReplace} disabled={props.disabled || !fromColor || !toColor}>
                <Wand2 className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div>
            <div className="opacity-70 text-[10px] uppercase tracking-wider mb-1.5">Set CSS variable</div>
            <div className="flex gap-1.5 items-center">
              <input value={varName} onChange={(e) => setVarName(e.target.value)} placeholder="--brand" className="obs-memory-input" style={{ width: 90, fontSize: 11 }} />
              <input
                type="color"
                value={normalizeHex(varValue) || "#0f172a"}
                onChange={(e) => setVarValue(e.target.value)}
                className="obs-color-swatch"
                aria-label="Variable color picker"
                title="Pick a color"
              />
              <input value={varValue} onChange={(e) => setVarValue(e.target.value)} placeholder="#0f172a" className="obs-memory-input flex-1" style={{ fontSize: 11 }} />
              <button type="button" className="obs-chip" onClick={runSetVar} disabled={props.disabled || !varName || !varValue}>Set</button>
            </div>
          </div>

          {note && <div className="text-[10px] opacity-70 italic">{note}</div>}
        </div>
      )}
    </div>
  );
}
