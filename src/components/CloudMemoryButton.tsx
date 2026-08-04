// Cloud Memory control — owner-only. Turns a build's shared team data store on
// or off, shows the team URL and code, and can wipe the shared data.
//
// Teammates never see this. It only ever changes DATA settings — the build's
// code, prompts, and AI surface are untouched.

import { useEffect, useRef, useState } from "react";
import { DEFAULT_TEAM_CODE, normalizeTeamCode } from "@/lib/build-memory";
import { teamUrlFor } from "@/lib/cloud-memory";

export interface CloudMemoryButtonProps {
  /** Owner-only gate — pass the result of your full-access check. */
  canUse: boolean;
  cloudMemory: boolean;
  teamCodeSet: boolean;
  live: boolean;
  shareSlug: string | null;
  entries: number;
  lastUpdate: string | null;
  lastBy: string | null;
  busy: boolean;
  onToggle: (enabled: boolean, teamCode?: string) => Promise<unknown>;
  onSetCode: (teamCode: string) => Promise<unknown>;
  onReset: () => Promise<unknown>;
  onGoLive?: () => void;
  /** Compact style hook so it can sit in either top bar. */
  className?: string;
  /** When set, the button still shows but the controls are replaced by this note. */
  notReadyReason?: string;
  /** True when the running build has never called window.ObsidianMemory. */
  buildIgnoresMemory?: boolean;
}

function ago(iso: string | null): string {
  if (!iso) return "no activity yet";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export function CloudMemoryButton(props: CloudMemoryButtonProps) {
  const {
    canUse, cloudMemory, teamCodeSet, live, shareSlug, entries,
    lastUpdate, lastBy, busy, onToggle, onSetCode, onReset, onGoLive, className,
    notReadyReason, buildIgnoresMemory,
  } = props;

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!canUse) return null;

  const teamUrl = shareSlug ? teamUrlFor(shareSlug) : null;

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setNote("Copied."); }
    catch { setNote("Copy failed — select the link manually."); }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className={className ?? "obs-muted"}
        onClick={() => { setNote(""); setOpen((v) => !v); }}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{ cursor: "pointer", color: cloudMemory ? "#F4A125" : undefined }}
        title={notReadyReason
          ? notReadyReason
          : cloudMemory
            ? "Cloud Memory is on — your team shares this build's data"
            : "Turn on Cloud Memory so your team shares this build's data"}
      >
        <span aria-hidden="true">☁</span> {cloudMemory ? "Cloud Memory" : "Cloud Memory"}
      </button>


      {open && (
        <div
          role="dialog"
          aria-label="Cloud Memory settings"
          className="obs-glass"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 60,
            width: 320,
            padding: 14,
            borderRadius: 12,
            border: "1px solid rgba(244,161,37,0.22)",
            background: "rgba(17,19,23,0.97)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, letterSpacing: "0.02em", marginBottom: 6 }}>
            Cloud Memory
          </div>
          <p className="obs-muted" style={{ margin: "0 0 10px", fontSize: 11 }}>
            Keeps this build&rsquo;s data in the cloud so everyone with the team link sees the same
            dashboard, calendar, or log — live. Only you can change the build itself.
          </p>

          {!notReadyReason && buildIgnoresMemory && (
            <p
              style={{
                margin: "0 0 10px",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(244,161,37,0.28)",
                background: "rgba(244,161,37,0.08)",
                color: "#F4A125",
                fontSize: 11,
              }}
            >
              This build does not use Cloud Memory. Ask Obsidian to store its data in Cloud
              Memory and it will sync across devices.
            </p>
          )}

          {notReadyReason ? (
            <p
              style={{
                margin: 0,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(244,161,37,0.28)",
                background: "rgba(244,161,37,0.08)",
                color: "#F4A125",
                fontSize: 11,
              }}
            >
              {notReadyReason}
            </p>
          ) : (
          <>


          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={cloudMemory}
              disabled={busy}
              onChange={(e) => {
                setNote("");
                void onToggle(e.target.checked).then(() => {
                  setNote(e.target.checked ? "Cloud Memory on." : "Cloud Memory off.");
                });
              }}
            />
            <span>{cloudMemory ? "On — shared with your team" : "Off — data stays on this device"}</span>
          </label>

          {cloudMemory && (
            <>
              {teamUrl ? (
                <div style={{ marginBottom: 10 }}>
                  <div className="obs-muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Team URL
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <code style={{ flex: 1, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {teamUrl}
                    </code>
                    <button type="button" className="obs-muted" style={{ fontSize: 10, cursor: "pointer", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "2px 6px" }} onClick={() => void copy(teamUrl)}>
                      Copy
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: "0 0 10px", fontSize: 11, color: "#F4A125" }}>
                  Turn on the live URL to get a team link.{" "}
                  {onGoLive && !live && (
                    <button type="button" onClick={() => { onGoLive(); }} style={{ background: "transparent", border: "none", color: "#F4A125", textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 11 }}>
                      Go live
                    </button>
                  )}
                </p>
              )}

              <div style={{ marginBottom: 10 }}>
                <div className="obs-muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Team code {teamCodeSet ? "(set)" : `(defaults to ${DEFAULT_TEAM_CODE})`}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="New team code"
                    aria-label="New team code"
                    style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "4px 6px", color: "inherit", fontSize: 11 }}
                  />
                  <button
                    type="button"
                    disabled={busy || !normalizeTeamCode(code)}
                    onClick={() => {
                      const norm = normalizeTeamCode(code);
                      if (!norm) return;
                      void onSetCode(norm).then(() => { setCode(""); setNote("Team code updated."); });
                    }}
                    style={{ fontSize: 10, cursor: "pointer", background: "transparent", border: "1px solid rgba(244,161,37,0.4)", color: "#F4A125", borderRadius: 6, padding: "2px 8px" }}
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="obs-muted" style={{ fontSize: 11, marginBottom: 10 }}>
                {entries} {entries === 1 ? "entry" : "entries"} · {ago(lastUpdate)}
                {lastBy ? ` by ${lastBy}` : ""}
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Wipe all shared data for this build? The build itself is untouched.")) return;
                  void onReset().then((n) => setNote(`Cleared ${typeof n === "number" ? n : 0} entries.`));
                }}
                style={{ fontSize: 10, cursor: "pointer", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "3px 8px" }}
              >
                Reset shared data
              </button>
            </>
          )}
          </>
          )}


          {note && <div style={{ marginTop: 10, fontSize: 11, color: "#F4A125" }}>{note}</div>}
        </div>
      )}
    </div>
  );
}

export default CloudMemoryButton;
