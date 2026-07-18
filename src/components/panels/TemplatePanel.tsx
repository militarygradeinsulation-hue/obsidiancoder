// TemplatePanel — save current preview as a local template; clone back into a
// fresh session. Templates strip preview-only scripts before persist.
import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { stripPreviewOnly } from "@/lib/clean-export";

export type Template = {
  id: string;
  name: string;
  html: string;
  createdAt: number;
};

export function TemplatePanel({
  html,
  templates,
  onSave,
  onClone,
  onDelete,
}: {
  html: string;
  templates: Template[];
  onSave: (t: Template) => void;
  onClone: (t: Template) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  function save() {
    if (!name.trim() || !html) return;
    const t: Template = {
      id: globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()),
      name: name.trim().slice(0, 60),
      html: stripPreviewOnly(html),
      createdAt: Date.now(),
    };
    onSave(t);
    setName("");
  }
  return (
    <div className="obs-card">
      <div className="obs-card-title"><FileText size={12} /> Templates</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
          className="obs-input"
        />
        <button type="button" className="obs-chip" onClick={save} disabled={!html || !name.trim()}>Save</button>
      </div>
      {templates.length === 0 ? (
        <div className="obs-empty">No saved templates. Cloning creates a fresh session from clean HTML.</div>
      ) : (
        <ul className="obs-list">
          {templates.map((t) => (
            <li key={t.id} className="obs-list-item">
              <span className="obs-list-label">{t.name}</span>
              <button type="button" className="obs-chip" onClick={() => onClone(t)}>Clone</button>
              <button type="button" className="obs-icon-btn" onClick={() => onDelete(t.id)}><Trash2 size={11} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
