// Project Memory panel v2 — all fields, lock/unlock, per-field clear,
// deterministic Extract from current outline + design tokens.

import { Lock, Unlock, X, Wand2 } from "lucide-react";
import { extractOutline } from "@/lib/document-outline";
import { extractDesignTokens } from "@/lib/design-system";
import { mergeMemory, type ProjectMemory } from "@/lib/project-memory";

const FIELDS: { key: keyof ProjectMemory; label: string; hint?: string }[] = [
  { key: "purpose", label: "Purpose" },
  { key: "audience", label: "Audience" },
  { key: "design", label: "Design direction" },
  { key: "brandColors", label: "Brand colors" },
  { key: "fonts", label: "Fonts" },
  { key: "layout", label: "Layout" },
  { key: "framework", label: "Framework" },
  { key: "dependencies", label: "Dependencies" },
  { key: "deploymentTarget", label: "Deployment target" },
  { key: "constraints", label: "Technical constraints" },
  { key: "doNotChange", label: "Do NOT change" },
  { key: "protectedElements", label: "Protected elements" },
  { key: "knownWarnings", label: "Known warnings" },
  { key: "workingFeatures", label: "Working features" },
];

export function MemoryPanel(props: {
  memory: ProjectMemory;
  html: string;
  onChange: (next: ProjectMemory) => void;
}) {
  const { memory, html, onChange } = props;
  const locks = memory.locked ?? {};

  function set(key: keyof ProjectMemory, val: string) {
    if (locks[key as string]) return;
    onChange({ ...memory, [key]: val.slice(0, 500) });
  }
  function toggleLock(key: keyof ProjectMemory) {
    const next = { ...(memory.locked ?? {}) };
    if (next[key as string]) delete next[key as string]; else next[key as string] = true;
    onChange({ ...memory, locked: next });
  }
  function clearField(key: keyof ProjectMemory) {
    if (locks[key as string]) return;
    onChange({ ...memory, [key]: "" });
  }
  function extract() {
    if (!html) return;
    const outline = extractOutline(html);
    const tokens = extractDesignTokens(html);
    const incoming: Partial<ProjectMemory> = {
      purpose: outline.title || memory.purpose,
      brandColors: tokens.colors.slice(0, 6).join(", "),
      fonts: tokens.fonts.slice(0, 3).map((f) => f.split(",")[0].trim()).join(", "),
      layout: outline.headings.slice(0, 4).map((h) => h.text).join(" · "),
    };
    onChange(mergeMemory(memory, incoming)); // locked keys preserved
  }

  return (
    <div className="obs-card">
      <div className="obs-card-head">
        <span className="obs-card-label">Project memory</span>
        <button type="button" className="obs-chip" onClick={extract} disabled={!html} title="Extract from current preview (respects locks)">
          <Wand2 className="h-3 w-3" /> Extract
        </button>
      </div>
      <div className="obs-metrics" style={{ gap: 6, maxHeight: 320, overflowY: "auto" }}>
        {FIELDS.map(({ key, label }) => {
          const locked = !!locks[key as string];
          const val = (memory[key] as string) ?? "";
          return (
            <div key={key as string} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div className="flex items-center justify-between">
                <span className="opacity-70 text-[10px] uppercase tracking-wider">{label}</span>
                <div className="flex items-center gap-0.5">
                  <button type="button" className="obs-icon-btn" onClick={() => clearField(key)} aria-label={`Clear ${label}`} disabled={locked || !val}>
                    <X className="h-3 w-3" />
                  </button>
                  <button type="button" className="obs-icon-btn" onClick={() => toggleLock(key)} aria-label={locked ? "Unlock" : "Lock"} title={locked ? "Locked — click to unlock" : "Lock to prevent agent overwrite"}>
                    {locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3 opacity-50" />}
                  </button>
                </div>
              </div>
              <textarea
                value={val}
                onChange={(e) => set(key, e.target.value)}
                rows={1}
                disabled={locked}
                className="obs-memory-input"
                placeholder={locked ? "(locked)" : "(none)"}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
