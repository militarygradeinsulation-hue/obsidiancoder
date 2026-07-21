import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  listFeaturedDemos, updateFeaturedDemo, deleteFeaturedDemo, reorderFeaturedDemos,
  type FeaturedDemoRow,
} from "@/lib/featured-demos.functions";

const CATEGORIES = ["App", "Landing", "Dashboard", "Tool", "Game", "Portfolio"] as const;
type Category = (typeof CATEGORIES)[number];

const CODE_KEY = "obs.demos.admin_code";

export const Route = createFileRoute("/demos")({
  // Admin-only portal — gated by its own admin code (SITE_PASSWORD) so it
  // works as a backdoor from the locked /unlock page without requiring the
  // site session cookie first.
  head: () => ({
    meta: [
      { title: "Live Demos — Admin" },
      { name: "description", content: "Manage the demos surfaced on the Obsidian login page." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DemosAdmin,
  errorComponent: ({ error, reset }) => (
    <div style={{ padding: 32, color: "#f2eee7", background: "#111317", minHeight: "100vh" }}>
      <h1>Couldn't load demos admin</h1>
      <p style={{ color: "#B6BCC8" }}>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  ),
  notFoundComponent: () => <div style={{ padding: 32 }}>Not found</div>,
});

function DemosAdmin() {
  const list = useServerFn(listFeaturedDemos);
  const update = useServerFn(updateFeaturedDemo);
  const remove = useServerFn(deleteFeaturedDemo);
  const reorder = useServerFn(reorderFeaturedDemos);

  const [code, setCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [demos, setDemos] = useState<FeaturedDemoRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(CODE_KEY) : "";
    if (saved) setCode(saved);
  }, []);

  const refresh = useCallback(async (adminCode: string) => {
    setError(null);
    const r = await list({ data: { adminCode } });
    if (!r.ok) { setError(r.error); if (r.error === "not admin") { localStorage.removeItem(CODE_KEY); setCode(""); } return; }
    setDemos(r.demos);
  }, [list]);

  useEffect(() => { if (code) refresh(code); }, [code, refresh]);

  async function saveField(row: FeaturedDemoRow, patch: Partial<FeaturedDemoRow>) {
    setSavingId(row.id); setStatus(null); setError(null);
    const r = await update({ data: { adminCode: code, id: row.id, ...patch } as never });
    setSavingId(null);
    if (!r.ok) { setError(r.error); return; }
    setStatus(`Saved “${patch.title ?? row.title}”`);
    setDemos((cur) => cur ? cur.map((d) => d.id === row.id ? { ...d, ...patch } : d) : cur);
  }

  async function onDelete(row: FeaturedDemoRow) {
    if (!confirm(`Delete “${row.title}” from live demos?`)) return;
    const r = await remove({ data: { adminCode: code, id: row.id } });
    if (!r.ok) { setError(r.error); return; }
    setStatus(`Deleted “${row.title}”`);
    setDemos((cur) => cur ? cur.filter((d) => d.id !== row.id) : cur);
  }

  function onDragStart(id: string) { setDragId(id); }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  async function onDrop(targetId: string) {
    if (!dragId || !demos || dragId === targetId) { setDragId(null); return; }
    const from = demos.findIndex((d) => d.id === dragId);
    const to = demos.findIndex((d) => d.id === targetId);
    if (from < 0 || to < 0) { setDragId(null); return; }
    const next = demos.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDemos(next);
    setDragId(null);
    const r = await reorder({ data: { adminCode: code, order: next.map((d) => d.id) } });
    if (!r.ok) { setError(r.error); return; }
    setStatus("Order saved");
  }

  if (!code) {
    return (
      <div style={{ minHeight: "100vh", background: "#111317", color: "#f2eee7", fontFamily: "Inter, system-ui", display: "grid", placeItems: "center", padding: 24 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = codeInput.trim();
            if (!v) return;
            localStorage.setItem(CODE_KEY, v);
            setCode(v);
          }}
          style={{ background: "#171a20", border: "1px solid #22262d", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420 }}
        >
          <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 22, margin: 0, color: "#F4A125" }}>Live Demos — Admin</h1>
          <p style={{ color: "#B6BCC8", marginTop: 8, fontSize: 13 }}>
            Enter the admin code to manage the login-page demo gallery.
          </p>
          <input
            type="password"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="Admin code"
            style={{ width: "100%", marginTop: 12, padding: "10px 12px", background: "#0b0d10", color: "#f2eee7", border: "1px solid #22262d", borderRadius: 8 }}
          />
          <button
            type="submit"
            style={{ marginTop: 12, width: "100%", padding: "10px 12px", background: "#F4A125", color: "#111317", border: 0, borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
          >
            Unlock
          </button>
          {error && <p style={{ color: "#ff8a8a", marginTop: 10, fontSize: 12 }}>{error}</p>}
          <Link to="/" style={{ display: "inline-block", marginTop: 14, color: "#B6BCC8", fontSize: 13 }}>← Back to Coder</Link>
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#111317", color: "#f2eee7", fontFamily: "Inter, system-ui" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 28px", borderBottom: "1px solid #22262d" }}>
        <div>
          <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 28, margin: 0, color: "#F4A125" }}>
            Live Demos <span style={{ fontSize: 12, color: "#B6BCC8", marginLeft: 8 }}>admin</span>
          </h1>
          <p style={{ color: "#B6BCC8", margin: "4px 0 0", fontSize: 13 }}>
            {demos ? `${demos.length} demos — drag to reorder, edit fields inline, or delete.` : "Loading…"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => refresh(code)}
            style={{ background: "transparent", color: "#F4A125", border: "1px solid rgba(244,161,37,0.35)", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => { localStorage.removeItem(CODE_KEY); setCode(""); setDemos(null); }}
            style={{ background: "transparent", color: "#B6BCC8", border: "1px solid #22262d", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
          >
            Sign out
          </button>
          <Link to="/" style={{ color: "#F4A125", textDecoration: "none", fontSize: 14 }}>← Back to Coder</Link>
        </div>
      </header>

      {(status || error) && (
        <div style={{ padding: "10px 28px", color: error ? "#ff8a8a" : "#7bd88f", fontSize: 13 }}>
          {error ?? status}
        </div>
      )}

      <section style={{ padding: "16px 28px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <h2 style={{ fontFamily: "Fraunces, Georgia, serif", margin: 0, color: "#F4A125", fontSize: 20 }}>Login Screen Preview</h2>
            <p style={{ margin: "2px 0 0", color: "#B6BCC8", fontSize: 12 }}>Live view of /unlock — changes to demos below appear here after Refresh.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/unlock" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#F4A125", border: "1px solid rgba(244,161,37,0.35)", padding: "6px 10px", borderRadius: 6, textDecoration: "none" }}>Open /unlock ↗</a>
          </div>
        </div>
        <div style={{ position: "relative", height: 560, border: "1px solid #22262d", borderRadius: 12, overflow: "hidden", background: "#0b0d10" }}>
          <iframe
            key={demos?.length ?? 0}
            src="/unlock"
            title="Login screen preview"
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        </div>
      </section>

      <div style={{ display: "grid", gap: 12, padding: "16px 28px 40px" }}>
        <h2 style={{ fontFamily: "Fraunces, Georgia, serif", margin: "8px 0 0", color: "#F4A125", fontSize: 20 }}>Demos</h2>
        {(demos ?? []).map((d) => {
          const url = d.url ?? `https://obsidianvibe.live/api/public/share/${d.slug}`;
          const isSaving = savingId === d.id;
          return (
            <div
              key={d.id}
              draggable
              onDragStart={() => onDragStart(d.id)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(d.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "220px 1fr auto",
                gap: 16,
                background: "#171a20",
                border: `1px solid ${dragId === d.id ? "#F4A125" : "#22262d"}`,
                borderRadius: 12,
                padding: 12,
                cursor: "grab",
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              <iframe
                src={url}
                title={d.title}
                sandbox="allow-scripts"
                style={{ width: 220, height: 140, border: 0, background: "#0b0d10", borderRadius: 8, pointerEvents: "none" }}
                loading="lazy"
              />
              <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
                <label style={{ fontSize: 11, color: "#B6BCC8" }}>Title</label>
                <input
                  defaultValue={d.title}
                  onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== d.title) saveField(d, { title: v }); }}
                  style={inputStyle}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "#B6BCC8" }}>Category</label>
                    <select
                      defaultValue={d.category}
                      onChange={(e) => saveField(d, { category: e.currentTarget.value as Category })}
                      style={inputStyle}
                    >
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#B6BCC8" }}>Slug</label>
                    <input
                      defaultValue={d.slug}
                      onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== d.slug) saveField(d, { slug: v }); }}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <label style={{ fontSize: 11, color: "#B6BCC8" }}>URL</label>
                <input
                  defaultValue={d.url ?? ""}
                  onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v !== (d.url ?? "")) saveField(d, { url: v }); }}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "space-between", alignItems: "flex-end" }}>
                <span style={{ fontSize: 11, color: "#8a919b" }}>#{d.sort_order}</span>
                <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#F4A125" }}>Open ↗</a>
                <button
                  type="button"
                  onClick={() => onDelete(d)}
                  style={{ background: "transparent", color: "#ff8a8a", border: "1px solid #3a2226", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
        {demos && demos.length === 0 && <div style={{ color: "#B6BCC8" }}>No demos yet. Push one from the builder.</div>}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "#0b0d10",
  color: "#f2eee7",
  border: "1px solid #22262d",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 13,
};
