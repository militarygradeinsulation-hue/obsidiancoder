import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  listFeaturedDemos, updateFeaturedDemo, deleteFeaturedDemo, reorderFeaturedDemos,
  getWaitlistStats, getCreditLedger,
  type FeaturedDemoRow, type WaitlistStats, type CreditLedgerStats,
} from "@/lib/featured-demos.functions";
import { getTwentyfirstHealthStats } from "@/lib/twentyfirst-metrics.functions";
import type { TwentyfirstEvent } from "@/lib/twentyfirst-metrics.server";

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
  const fetchStats = useServerFn(getWaitlistStats);
  const fetchCredits = useServerFn(getCreditLedger);

  const [code, setCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [demos, setDemos] = useState<FeaturedDemoRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [credits, setCredits] = useState<CreditLedgerStats | null>(null);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [creditsLive, setCreditsLive] = useState(true);
  const [creditsUpdated, setCreditsUpdated] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "rows" | "grid" | "table">(() => {
    if (typeof window === "undefined") return "cards";
    const v = localStorage.getItem("obs.demos.viewMode");
    return (v === "rows" || v === "grid" || v === "table" || v === "cards") ? v : "cards";
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("obs.demos.viewMode", viewMode); }, [viewMode]);

  function toggleSelect(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll() { setSelected(new Set((demos ?? []).map((d) => d.id))); }
  function clearSelection() { setSelected(new Set()); }

  async function onBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} demo${selected.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setError(null); setStatus(null);
    const ids = Array.from(selected);
    let failed = 0;
    for (const id of ids) {
      const r = await remove({ data: { adminCode: code, id } });
      if (!r.ok) failed++;
    }
    setDemos((cur) => cur ? cur.filter((d) => !selected.has(d.id)) : cur);
    setSelected(new Set());
    if (failed) setError(`${failed} deletion${failed === 1 ? "" : "s"} failed`);
    else setStatus(`Deleted ${ids.length} demo${ids.length === 1 ? "" : "s"}`);
  }

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(CODE_KEY) : "";
    if (saved) setCode(saved);
  }, []);

  const refreshCredits = useCallback(async (adminCode: string) => {
    const c = await fetchCredits({ data: { adminCode } });
    if (c.ok) { setCredits(c.stats); setCreditsError(null); setCreditsUpdated(Date.now()); }
    else setCreditsError(c.error);
  }, [fetchCredits]);

  const refresh = useCallback(async (adminCode: string) => {
    setError(null);
    const r = await list({ data: { adminCode } });
    if (!r.ok) { setError(r.error); if (r.error === "not admin") { localStorage.removeItem(CODE_KEY); setCode(""); } return; }
    setDemos(r.demos);
    const s = await fetchStats({ data: { adminCode } });
    if (s.ok) setStats(s.stats);
    await refreshCredits(adminCode);
  }, [list, fetchStats, refreshCredits]);

  useEffect(() => { if (code) refresh(code); }, [code, refresh]);

  // Live credit ledger polling — 5s while tab is visible and Live is on.
  useEffect(() => {
    if (!code || !creditsLive) return;
    const tick = () => { if (document.visibilityState === "visible") refreshCredits(code); };
    const id = window.setInterval(tick, 5000);
    const onVis = () => { if (document.visibilityState === "visible") refreshCredits(code); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [code, creditsLive, refreshCredits]);


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

      <section style={{ padding: "16px 28px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontFamily: "Fraunces, Georgia, serif", margin: 0, color: "#F4A125", fontSize: 20 }}>
              Live Credit Feed
              <span style={{ marginLeft: 10, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: creditsLive ? "#7bd88f" : "#B6BCC8", verticalAlign: "middle" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: creditsLive ? "#7bd88f" : "#666", boxShadow: creditsLive ? "0 0 8px #7bd88f" : "none", animation: creditsLive ? "pulse 1.4s infinite" : undefined }} />
                {creditsLive ? "LIVE" : "PAUSED"}
              </span>
            </h2>
            <p style={{ margin: "2px 0 0", color: "#B6BCC8", fontSize: 12 }}>
              In-app credit consumption (ai_usage · credit_usage · owner_usage) — last 7 days.
              {creditsUpdated && <> Updated {new Date(creditsUpdated).toLocaleTimeString()}.</>}
              {" "}Note: Lovable workspace credits have no public API — check Settings → Plans & credits in Lovable for those.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setCreditsLive((v) => !v)}
              style={{ background: "transparent", border: "1px solid #22262d", color: "#f2eee7", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
            >{creditsLive ? "Pause" : "Resume"}</button>
            <button
              onClick={() => code && refreshCredits(code)}
              style={{ background: "#F4A125", border: "none", color: "#111", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >Refresh</button>
          </div>
        </div>
        {creditsError && (
          <div style={{ color: "#ff8a8a", fontSize: 12, marginBottom: 8 }}>Ledger error: {creditsError}</div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {[
            { label: "Credits · last hour", value: credits?.last_1h_credits ?? 0, accent: "#F4A125" },
            { label: "Credits · last 24h", value: credits?.last_24h_credits ?? 0, accent: "#F4A125" },
            { label: "Committed (7d)", value: credits?.totals.credits_committed ?? 0, accent: "#7bd88f" },
            { label: "Pending", value: credits?.totals.credits_pending ?? 0, accent: "#E7B24A" },
            { label: "Refunded", value: credits?.totals.credits_refunded ?? 0, accent: "#B6BCC8" },
            { label: "Est. cost USD (7d)", value: credits ? `$${credits.totals.cost_usd.toFixed(4)}` : "$0", accent: "#7bd88f" },
            { label: "Calls (7d)", value: credits?.totals.calls ?? 0, accent: "#B6BCC8" },
            { label: "Owner credits (7d)", value: credits?.owner_credits_period ?? 0, accent: "#F4A125" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#171a20", border: "1px solid #22262d", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "#B6BCC8" }}>{s.label}</div>
              <div style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 24, color: s.accent, marginTop: 4 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {credits && (credits.by_operation.length > 0 || credits.by_model.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, marginTop: 12 }}>
            {credits.by_operation.length > 0 && (
              <div style={{ background: "#171a20", border: "1px solid #22262d", borderRadius: 12, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "#B6BCC8", marginBottom: 6 }}>Top operations</div>
                <table style={{ width: "100%", fontSize: 12 }}>
                  <tbody>
                    {credits.by_operation.map((o) => (
                      <tr key={o.operation} style={{ borderTop: "1px solid #22262d" }}>
                        <td style={{ padding: "4px 6px", color: "#f2eee7" }}>{o.operation}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right", color: "#F4A125" }}>{o.credits} cr</td>
                        <td style={{ padding: "4px 6px", textAlign: "right", color: "#B6BCC8" }}>${o.cost_usd.toFixed(4)}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right", color: "#B6BCC8" }}>{o.calls}×</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {credits.by_model.length > 0 && (
              <div style={{ background: "#171a20", border: "1px solid #22262d", borderRadius: 12, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "#B6BCC8", marginBottom: 6 }}>Top models</div>
                <table style={{ width: "100%", fontSize: 12 }}>
                  <tbody>
                    {credits.by_model.map((m) => (
                      <tr key={m.model} style={{ borderTop: "1px solid #22262d" }}>
                        <td style={{ padding: "4px 6px", color: "#f2eee7" }}>{m.model}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right", color: "#F4A125" }}>{m.credits} cr</td>
                        <td style={{ padding: "4px 6px", textAlign: "right", color: "#B6BCC8" }}>${m.cost_usd.toFixed(4)}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right", color: "#B6BCC8" }}>{m.calls}×</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {credits && credits.recent.length > 0 && (
          <details open style={{ marginTop: 12, background: "#171a20", border: "1px solid #22262d", borderRadius: 12, padding: "10px 14px" }}>
            <summary style={{ cursor: "pointer", color: "#F4A125", fontSize: 13 }}>Recent {credits.recent.length} events</summary>
            <div style={{ overflowX: "auto", marginTop: 10, maxHeight: 360 }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#B6BCC8", textAlign: "left", position: "sticky", top: 0, background: "#171a20" }}>
                    <th style={{ padding: "6px 8px" }}>When</th>
                    <th style={{ padding: "6px 8px" }}>Actor</th>
                    <th style={{ padding: "6px 8px" }}>Operation</th>
                    <th style={{ padding: "6px 8px" }}>Model</th>
                    <th style={{ padding: "6px 8px" }}>Status</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Credits</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Tokens (in/out)</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.recent.map((r) => (
                    <tr key={`${r.source}-${r.id}`} style={{ borderTop: "1px solid #22262d" }}>
                      <td style={{ padding: "6px 8px", color: "#B6BCC8", whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleTimeString()}</td>
                      <td style={{ padding: "6px 8px", color: r.actor === "owner" ? "#F4A125" : "#f2eee7" }}>{r.actor}</td>
                      <td style={{ padding: "6px 8px" }}>{r.operation}</td>
                      <td style={{ padding: "6px 8px", color: "#B6BCC8" }}>{r.model ?? "—"}</td>
                      <td style={{ padding: "6px 8px", color: r.status === "committed" ? "#7bd88f" : r.status === "pending" ? "#E7B24A" : r.status === "refunded" ? "#B6BCC8" : "#ff8a8a" }}>{r.status}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#F4A125" }}>{r.credits}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#B6BCC8" }}>{r.input_tokens}/{r.output_tokens}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#B6BCC8" }}>{r.cost_usd != null ? `$${r.cost_usd.toFixed(4)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <TwentyfirstHealthCard code={code} />



      <section style={{ padding: "16px 28px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontFamily: "Fraunces, Georgia, serif", margin: 0, color: "#F4A125", fontSize: 20 }}>Signups</h2>
            <p style={{ margin: "2px 0 0", color: "#B6BCC8", fontSize: 12 }}>
              {stats ? `${stats.total} total waitlist entries` : "Loading signup stats…"}
            </p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          {[
            { label: "Total signups", value: stats?.total ?? 0, accent: "#F4A125" },
            { label: "Paid ($100)", value: stats?.paid ?? 0, accent: "#7bd88f" },
            { label: "Unpaid", value: stats?.unpaid ?? 0, accent: "#B6BCC8" },
            { label: "Last 24h", value: stats?.last_24h ?? 0, accent: "#F4A125" },
            { label: "Last 7 days", value: stats?.last_7d ?? 0, accent: "#F4A125" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#171a20", border: "1px solid #22262d", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "#B6BCC8" }}>{s.label}</div>
              <div style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 28, color: s.accent, marginTop: 4 }}>{s.value}</div>
            </div>
          ))}
        </div>
        {stats && stats.by_tier.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {stats.by_tier.map((t) => (
              <span key={t.tier} style={{ fontSize: 11, color: "#f2eee7", background: "#0b0d10", border: "1px solid #22262d", borderRadius: 999, padding: "4px 10px" }}>
                {t.tier}: <strong style={{ color: "#F4A125" }}>{t.count}</strong>
              </span>
            ))}
          </div>
        )}
        {stats && stats.recent.length > 0 && (
          <details style={{ marginTop: 12, background: "#171a20", border: "1px solid #22262d", borderRadius: 12, padding: "10px 14px" }}>
            <summary style={{ cursor: "pointer", color: "#F4A125", fontSize: 13 }}>Recent {stats.recent.length} signups</summary>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#B6BCC8", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px" }}>When</th>
                    <th style={{ padding: "6px 8px" }}>Name</th>
                    <th style={{ padding: "6px 8px" }}>Email</th>
                    <th style={{ padding: "6px 8px" }}>Tier</th>
                    <th style={{ padding: "6px 8px" }}>Interest</th>
                    <th style={{ padding: "6px 8px" }}>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((r) => (
                    <tr key={r.id} style={{ borderTop: "1px solid #22262d" }}>
                      <td style={{ padding: "6px 8px", color: "#B6BCC8", whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString()}</td>
                      <td style={{ padding: "6px 8px" }}>{r.name}</td>
                      <td style={{ padding: "6px 8px" }}><a href={`mailto:${r.email}`} style={{ color: "#F4A125" }}>{r.email}</a></td>
                      <td style={{ padding: "6px 8px" }}>{r.tier ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{r.interest_level}</td>
                      <td style={{ padding: "6px 8px", color: r.paid ? "#7bd88f" : "#B6BCC8" }}>{r.paid ? "yes" : "no"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>


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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", margin: "8px 0 0", color: "#F4A125", fontSize: 20 }}>Demos</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", border: "1px solid #22262d", borderRadius: 6, overflow: "hidden" }}>
              {(["rows", "table", "grid", "cards"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  style={{
                    background: viewMode === m ? "#F4A125" : "transparent",
                    color: viewMode === m ? "#111317" : "#B6BCC8",
                    border: 0, padding: "6px 10px", fontSize: 12, cursor: "pointer",
                    textTransform: "capitalize", fontWeight: viewMode === m ? 600 : 400,
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "#B6BCC8" }}>{selected.size} selected</span>
            <button type="button" onClick={selectAll} style={toolBtn}>Select all</button>
            <button type="button" onClick={clearSelection} disabled={selected.size === 0} style={{ ...toolBtn, opacity: selected.size === 0 ? 0.5 : 1 }}>Clear</button>
            <button
              type="button"
              onClick={onBulkDelete}
              disabled={selected.size === 0}
              style={{ background: selected.size === 0 ? "transparent" : "#3a2226", color: "#ff8a8a", border: "1px solid #3a2226", padding: "6px 10px", borderRadius: 6, cursor: selected.size === 0 ? "not-allowed" : "pointer", fontSize: 12, opacity: selected.size === 0 ? 0.5 : 1 }}
            >
              Delete selected
            </button>
          </div>
        </div>

        {viewMode === "rows" && (demos ?? []).map((d) => {
          const url = d.url ?? `https://obsidianvibe.live/api/public/share/${d.slug}`;
          const isSelected = selected.has(d.id);
          const isEditing = editingId === d.id;
          return (
            <div key={d.id} style={{ background: isSelected ? "#1d2028" : "#171a20", border: `1px solid ${isSelected ? "#F4A125" : "#22262d"}`, borderRadius: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, alignItems: "center", padding: "10px 14px" }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(d.id)} aria-label={`Select ${d.title}`} style={{ width: 18, height: 18, accentColor: "#F4A125", cursor: "pointer" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 1fr auto", gap: 12, alignItems: "center", minWidth: 0 }}>
                  <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{d.title}</div>
                  <span style={{ fontSize: 11, color: "#F4A125", background: "rgba(244,161,37,0.1)", border: "1px solid rgba(244,161,37,0.3)", borderRadius: 4, padding: "2px 8px", textAlign: "center", justifySelf: "start" }}>{d.category}</span>
                  <div style={{ fontSize: 11, color: "#B6BCC8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.slug}</div>
                  <span style={{ fontSize: 11, color: "#8a919b" }}>#{d.sort_order}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#F4A125", padding: "4px 8px" }}>Open ↗</a>
                  <button type="button" onClick={() => setEditingId(isEditing ? null : d.id)} style={{ background: "transparent", color: "#F4A125", border: "1px solid rgba(244,161,37,0.35)", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>{isEditing ? "Close" : "Edit"}</button>
                  <button type="button" onClick={() => onDelete(d)} aria-label={`Delete ${d.title}`} title="Delete" style={{ background: "transparent", color: "#ff8a8a", border: "1px solid #3a2226", width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
                </div>
              </div>
              {isEditing && (
                <div style={{ borderTop: "1px solid #22262d", padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div><label style={labelStyle}>Title</label><input defaultValue={d.title} onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== d.title) saveField(d, { title: v }); }} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Category</label><select defaultValue={d.category} onChange={(e) => saveField(d, { category: e.currentTarget.value as Category })} style={inputStyle}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div><label style={labelStyle}>Slug</label><input defaultValue={d.slug} onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== d.slug) saveField(d, { slug: v }); }} style={inputStyle} /></div>
                  <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>URL</label><input defaultValue={d.url ?? ""} onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v !== (d.url ?? "")) saveField(d, { url: v }); }} style={inputStyle} /></div>
                </div>
              )}
            </div>
          );
        })}

        {viewMode === "table" && (
          <div style={{ overflowX: "auto", border: "1px solid #22262d", borderRadius: 10 }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead style={{ background: "#0b0d10", color: "#B6BCC8" }}>
                <tr>
                  <th style={thStyle}><input type="checkbox" checked={demos != null && demos.length > 0 && selected.size === demos.length} onChange={() => selected.size === (demos?.length ?? 0) ? clearSelection() : selectAll()} style={{ accentColor: "#F4A125" }} /></th>
                  <th style={thStyle}>Title</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Slug</th>
                  <th style={thStyle}>Order</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(demos ?? []).map((d) => {
                  const url = d.url ?? `https://obsidianvibe.live/api/public/share/${d.slug}`;
                  const isSelected = selected.has(d.id);
                  return (
                    <tr key={d.id} style={{ borderTop: "1px solid #22262d", background: isSelected ? "#1d2028" : "transparent" }}>
                      <td style={tdStyle}><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(d.id)} style={{ accentColor: "#F4A125" }} /></td>
                      <td style={tdStyle}>{d.title}</td>
                      <td style={tdStyle}><span style={{ fontSize: 11, color: "#F4A125" }}>{d.category}</span></td>
                      <td style={{ ...tdStyle, color: "#B6BCC8", fontSize: 12 }}>{d.slug}</td>
                      <td style={{ ...tdStyle, color: "#8a919b" }}>#{d.sort_order}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#F4A125" }}>Open ↗</a>
                          <button type="button" onClick={() => setEditingId(d.id === editingId ? null : d.id)} style={{ background: "transparent", color: "#F4A125", border: "1px solid rgba(244,161,37,0.35)", padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>Edit</button>
                          <button type="button" onClick={() => onDelete(d)} aria-label="Delete" style={{ background: "transparent", color: "#ff8a8a", border: "1px solid #3a2226", width: 24, height: 24, borderRadius: 4, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === "grid" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {(demos ?? []).map((d) => {
              const url = d.url ?? `https://obsidianvibe.live/api/public/share/${d.slug}`;
              const isSelected = selected.has(d.id);
              return (
                <div key={d.id} style={{ background: isSelected ? "#1d2028" : "#171a20", border: `1px solid ${isSelected ? "#F4A125" : "#22262d"}`, borderRadius: 10, overflow: "hidden", position: "relative" }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(d.id)} style={{ position: "absolute", top: 8, left: 8, zIndex: 2, width: 18, height: 18, accentColor: "#F4A125", cursor: "pointer" }} />
                  <button type="button" onClick={() => onDelete(d)} aria-label="Delete" title="Delete" style={{ position: "absolute", top: 8, right: 8, zIndex: 2, background: "rgba(17,19,23,0.85)", color: "#ff8a8a", border: "1px solid #3a2226", width: 26, height: 26, borderRadius: 6, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
                  <iframe src={url} title={d.title} sandbox="allow-scripts" style={{ width: "100%", height: 140, border: 0, background: "#0b0d10", pointerEvents: "none" }} loading="lazy" />
                  <div style={{ padding: 10 }}>
                    <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                      <span style={{ fontSize: 10, color: "#F4A125", background: "rgba(244,161,37,0.1)", border: "1px solid rgba(244,161,37,0.3)", borderRadius: 4, padding: "1px 6px" }}>{d.category}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#F4A125" }}>Open ↗</a>
                        <button type="button" onClick={() => setEditingId(d.id === editingId ? null : d.id)} style={{ background: "transparent", color: "#F4A125", border: "1px solid rgba(244,161,37,0.35)", padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>Edit</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === "cards" && (demos ?? []).map((d) => {
          const url = d.url ?? `https://obsidianvibe.live/api/public/share/${d.slug}`;
          const isSaving = savingId === d.id;
          const isSelected = selected.has(d.id);
          return (
            <div
              key={d.id}
              draggable
              onDragStart={() => onDragStart(d.id)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(d.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "28px 220px 1fr auto",
                gap: 16,
                alignItems: "start",
                background: isSelected ? "#1d2028" : "#171a20",
                border: `1px solid ${isSelected ? "#F4A125" : dragId === d.id ? "#F4A125" : "#22262d"}`,
                borderRadius: 12,
                padding: 12,
                cursor: "grab",
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(d.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${d.title}`}
                style={{ marginTop: 6, width: 18, height: 18, accentColor: "#F4A125", cursor: "pointer" }}
              />
              <iframe
                src={url}
                title={d.title}
                sandbox="allow-scripts"
                style={{ width: 220, height: 140, border: 0, background: "#0b0d10", borderRadius: 8, pointerEvents: "none" }}
                loading="lazy"
              />
              <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
                <label style={labelStyle}>Title</label>
                <input defaultValue={d.title} onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== d.title) saveField(d, { title: v }); }} style={inputStyle} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <select defaultValue={d.category} onChange={(e) => saveField(d, { category: e.currentTarget.value as Category })} style={inputStyle}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Slug</label>
                    <input defaultValue={d.slug} onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== d.slug) saveField(d, { slug: v }); }} style={inputStyle} />
                  </div>
                </div>
                <label style={labelStyle}>URL</label>
                <input defaultValue={d.url ?? ""} onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v !== (d.url ?? "")) saveField(d, { url: v }); }} style={inputStyle} />
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

function TwentyfirstHealthCard({ code }: { code: string }) {
  const fetchHealth = useServerFn(getTwentyfirstHealthStats);
  const [h, setH] = useState<Awaited<ReturnType<typeof fetchHealth>> | null>(null);
  const load = useCallback(async () => {
    if (!code) return;
    try { setH(await fetchHealth({ data: { adminCode: code } })); } catch { /* ignore */ }
  }, [code, fetchHealth]);
  useEffect(() => { load(); const id = window.setInterval(load, 30_000); return () => window.clearInterval(id); }, [load]);
  const health = h && h.ok ? h.health : null;
  const err = h && !h.ok ? h.error : null;
  return (
    <section style={{ padding: "16px 28px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", margin: 0, color: "#F4A125", fontSize: 20 }}>
            21st.dev Component Library
            <span style={{ marginLeft: 10, fontSize: 11, color: health?.hasKey ? (health.authOk === false ? "#ff8a8a" : "#7bd88f") : "#B6BCC8" }}>
              {health?.hasKey ? (health.authOk === false ? "AUTH FAIL" : health.authOk === true ? "AUTH OK" : "READY") : "NO KEY"}
            </span>
          </h2>
          <p style={{ margin: "2px 0 0", color: "#B6BCC8", fontSize: 12 }}>
            Component planner + fetcher telemetry. Process-scoped, resets on cold start.
          </p>
        </div>
        <button onClick={load} style={{ background: "transparent", border: "1px solid #22262d", color: "#f2eee7", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>Refresh</button>
      </div>
      {err && <div style={{ color: "#ff8a8a", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      {health && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            {[
              { label: "Rounds", value: health.totalRounds, accent: "#F4A125" },
              { label: "Total hits", value: health.totalHits, accent: "#7bd88f" },
              { label: "Hit rate", value: `${health.hitRate}%`, accent: "#F4A125" },
              { label: "Avg hits / round", value: health.avgHitsPerRound, accent: "#B6BCC8" },
              { label: "Avg duration", value: `${health.avgDurationMs}ms`, accent: "#B6BCC8" },
            ].map((s) => (
              <div key={s.label} style={{ background: "#0b0d10", border: "1px solid #22262d", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: "#B6BCC8", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
                <div style={{ fontFamily: "Fraunces, Georgia, serif", color: s.accent, fontSize: 22, marginTop: 4 }}>{s.value}</div>
              </div>
            ))}
          </div>
          {health.recent.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "#B6BCC8", marginBottom: 6 }}>Recent planner rounds ({health.recent.length})</summary>
              <div style={{ overflowX: "auto", background: "#0b0d10", border: "1px solid #22262d", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #22262d", color: "#B6BCC8", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px" }}>Time</th>
                      <th style={{ padding: "6px 8px" }}>Queries</th>
                      <th style={{ padding: "6px 8px" }}>Hits</th>
                      <th style={{ padding: "6px 8px" }}>Components</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.recent.map((r: TwentyfirstEvent, i: number) => (
                      <tr key={r.requestId + i} style={{ borderBottom: "1px solid #1a1e24" }}>
                        <td style={{ padding: "6px 8px", color: "#B6BCC8", whiteSpace: "nowrap" }}>{new Date(r.at).toLocaleTimeString()}</td>
                        <td style={{ padding: "6px 8px", color: "#f2eee7" }}>{r.queries.join(" · ") || "—"}</td>
                        <td style={{ padding: "6px 8px", color: r.hitCount ? "#7bd88f" : "#ff8a8a" }}>{r.hitCount}</td>
                        <td style={{ padding: "6px 8px", color: "#B6BCC8" }}>{r.componentNames.join(", ") || "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "#B6BCC8" }}>{r.durationMs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 11, color: "#B6BCC8" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: "10px 12px" };

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

const toolBtn: React.CSSProperties = {
  background: "transparent",
  color: "#F4A125",
  border: "1px solid rgba(244,161,37,0.35)",
  padding: "6px 10px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
};
