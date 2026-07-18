// Version History v2 panel — rename, protect, guarded delete, restore.
// Preserves backward compatibility: old versions without metadata still render.

import { useState } from "react";
import { History, RotateCcw, Shield, ShieldOff, Trash2, Edit3, Check, X } from "lucide-react";
import type { VersionMetadata } from "@/lib/version-metadata";

export type UiVersion = {
  id: string;
  ts: number;
  html: string;
  label: string;
  protected?: boolean;
  metadata?: VersionMetadata;
};

export function VersionHistoryPanel(props: {
  versions: UiVersion[];
  currentHtml: string;
  disabled?: boolean;
  onRevert: (v: UiVersion) => void;
  onRename: (id: string, label: string) => void;
  onToggleProtect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { versions, currentHtml, disabled, onRevert, onRename, onToggleProtect, onDelete } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="obs-card">
      <div className="obs-card-head">
        <span className="obs-card-label"><History className="h-3.5 w-3.5 inline mr-1" /> Version History</span>
        <span className="obs-node">{versions.length}</span>
      </div>
      {versions.length === 0 ? (
        <p className="obs-history-empty">Each build is saved here. Revert anytime.</p>
      ) : (
        <ul className="obs-history-list">
          {versions.map((v, i) => {
            const isCurrent = v.html === currentHtml;
            const d = new Date(v.ts);
            const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const isEditing = editing === v.id;
            return (
              <li key={v.id} className={"obs-history-item " + (isCurrent ? "is-current" : "")}>
                <div className="obs-history-meta">
                  <span className="obs-history-idx">v{(versions.length - i).toString().padStart(2, "0")}</span>
                  {isEditing ? (
                    <>
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="obs-memory-input flex-1"
                        style={{ fontSize: 11, padding: "2px 6px" }}
                        autoFocus
                      />
                      <button type="button" className="obs-icon-btn" onClick={() => { onRename(v.id, draft.trim() || v.label); setEditing(null); }} aria-label="Save">
                        <Check className="h-3 w-3" />
                      </button>
                      <button type="button" className="obs-icon-btn" onClick={() => setEditing(null)} aria-label="Cancel">
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="obs-history-label" title={v.label}>
                        {v.protected && <Shield className="h-3 w-3 inline mr-1" />}
                        {v.label}
                      </span>
                      <span className="obs-history-time">{time}</span>
                    </>
                  )}
                </div>
                {v.metadata && !isEditing && (
                  <div className="text-[9.5px] opacity-60 mt-0.5">
                    {v.metadata.strategy}
                    {v.metadata.patchOperations ? ` · ${v.metadata.patchOperations} ops` : ""}
                    {v.metadata.repairAttempts?.length ? ` · repair×${v.metadata.repairAttempts.length}` : ""}
                    {` · +${v.metadata.charsAdded}/-${v.metadata.charsRemoved}`}
                  </div>
                )}
                {!isEditing && (
                  <div className="flex gap-1 mt-1">
                    <button
                      type="button"
                      className="obs-history-revert"
                      onClick={() => onRevert(v)}
                      disabled={disabled || isCurrent}
                      title={isCurrent ? "This is current" : "Revert"}
                    >
                      <RotateCcw className="h-3 w-3" />
                      {isCurrent ? "Current" : "Revert"}
                    </button>
                    <button type="button" className="obs-icon-btn" onClick={() => { setDraft(v.label); setEditing(v.id); }} aria-label="Rename" title="Rename">
                      <Edit3 className="h-3 w-3" />
                    </button>
                    <button type="button" className="obs-icon-btn" onClick={() => onToggleProtect(v.id)} aria-label="Toggle protect" title={v.protected ? "Unprotect" : "Protect from deletion"}>
                      {v.protected ? <ShieldOff className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                    </button>
                    <button
                      type="button"
                      className="obs-icon-btn"
                      onClick={() => {
                        if (v.protected) { alert("This version is protected. Unprotect it first."); return; }
                        if (window.confirm(`Delete version "${v.label}"?`)) onDelete(v.id);
                      }}
                      aria-label="Delete"
                      title={v.protected ? "Protected — unprotect first" : "Delete"}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
