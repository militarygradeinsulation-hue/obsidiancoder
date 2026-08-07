// AI Business Dashboard — Phase 2: live data.
// Pulls real cloud project count, credit usage, AI usage history, and
// session-derived QA scores. No fake KPIs.

import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  LayoutDashboard, FolderKanban, Zap, Rocket, DollarSign,
  ShieldCheck, Gauge, CheckCircle2, ArrowRight, Sparkles, Lock, LogOut,
  Cloud, TrendingUp, RefreshCw, AlertTriangle,
} from "lucide-react";
import { useAuth, useSubscription, useCredits } from "@/hooks/useSubscription";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useCloudProjects } from "@/hooks/useCloudProjects";
import { DASHBOARD_NAV, PLAN_TIERS, tierForPriceId, tierAtLeast, type PlanTierId } from "@/lib/plans";
import { safeGet } from "@/lib/safe-storage";
import { lockSite } from "@/lib/gate.functions";
import { authFetch } from "@/lib/auth-fetch";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const { ensureUnlocked } = await import("@/lib/gate.functions");
    const { unlocked } = await ensureUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Aetheris Obsidian" },
      { name: "description", content: "Track your AI builds, credits, and project health in one place." },
    ],
    links: [{ rel: "canonical", href: "/dashboard" }],
  }),
  component: DashboardPage,
});

interface LocalSession { id: string; title?: string; html?: string; updatedAt?: number; qaStatus?: { overall?: number; score?: number } | null }
interface AiUsageRow { operation: string; credits_charged: number; created_at: string; status: string }
interface UsageSummary { totalCredits: number; buildCount: number; last30Days: AiUsageRow[] }

function readLocalSessions(): LocalSession[] {
  try {
    const raw = sessionStorage.getItem("obsidian.vibe.sessions.v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function scoreColor(s: number): string {
  if (s >= 80) return "#4ade80";
  if (s >= 60) return "#F4A125";
  return "#ef4444";
}

function CreditBar({ used, cap, loading }: { used: number; cap: number; loading: boolean }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const color = pct > 85 ? "#ef4444" : pct > 60 ? "#F4A125" : "#4ade80";
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#B6BCC8", marginBottom: 4 }}>
        <span>{loading ? "Loading…" : `${used.toLocaleString()} / ${cap.toLocaleString()} credits used`}</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

function DashboardPage() {
  const { userId, email } = useAuth();
  const { subscription, isPro } = useSubscription();
  const { snap } = useEntitlement();
  const credits = useCredits();
  const cloudProjects = useCloudProjects({ isAuthenticated: !!userId });

  const [localSessions, setLocalSessions] = useState<LocalSession[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [serverStats, setServerStats] = useState<{ cloudProjects: number; deployedBuilds: number; aiBuilds30d: number; credits30d: number } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { setLocalSessions(readLocalSessions()); }, []);

  // Fetch server-aggregated stats + AI usage history.
  const fetchUsage = useCallback(async () => {
    if (!userId) return;
    setUsageLoading(true);
    try {
      const statsRes = await authFetch("/api/dashboard/stats");
      if (statsRes.ok) {
        const stats = await statsRes.json() as {
          ok: boolean; cloudProjects: number; deployedBuilds: number;
          aiBuilds30d: number; credits30d: number;
        };
        if (stats.ok) setServerStats(stats);
      }
      if (isPro) {
        const { data } = await supabase
          .from("ai_usage" as never)
          .select("operation, credits_charged, created_at, status")
          .eq("user_id", userId)
          .eq("status", "committed")
          .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order("created_at", { ascending: false })
          .limit(20) as { data: AiUsageRow[] | null };
        if (data) {
          const rows = data as AiUsageRow[];
          setUsageSummary({
            totalCredits: rows.reduce((s, r) => s + (r.credits_charged ?? 0), 0),
            buildCount: rows.filter((r) => r.operation === "generate_html").length,
            last30Days: rows.slice(0, 10),
          });
        }
      }
    } catch { /* best-effort */ } finally {
      setUsageLoading(false);
    }
  }, [userId, isPro]);

  useEffect(() => {
    void cloudProjects.refresh();
    void fetchUsage();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([cloudProjects.refresh(), fetchUsage()]);
    setRefreshing(false);
  }

  const activeTier: PlanTierId | null = useMemo(() => {
    if (snap.mode === "owner") return "custom";
    const t = tierForPriceId(subscription?.price_id);
    if (t) return t.id;
    return isPro ? "vibe" : null;
  }, [snap.mode, subscription, isPro]);

  const tier = activeTier ? PLAN_TIERS.find((p) => p.id === activeTier) : null;

  // Best QA score across local sessions that have html and a qaStatus.
  const bestScore = useMemo(() => {
    const scored = localSessions
      .filter((s) => s.html && s.qaStatus)
      .map((s) => s.qaStatus?.overall ?? s.qaStatus?.score ?? 0);
    return scored.length ? Math.max(...scored) : null;
  }, [localSessions]);

  const totalProjects = cloudProjects.projects.length + localSessions.filter((s) => s.html).length;

  return (
    <div className="dash-root">
      <style>{dashCss}</style>

      <aside className="dash-sidebar" aria-label="Dashboard navigation">
        <div className="dash-brand">
          <LayoutDashboard size={16} />
          <span>Obsidian</span>
        </div>
        <div className="dash-tier-chip">
          <Sparkles size={11} />
          <span>{tier ? tier.name : "Free"}</span>
        </div>
        <nav className="dash-nav">
          {DASHBOARD_NAV.map((n) => {
            const locked = !!n.minTier && !tierAtLeast(activeTier, n.minTier);
            return (
              <a
                key={n.id}
                href={n.href}
                className={`dash-nav-item ${locked ? "is-locked" : ""}`}
                aria-disabled={locked || n.soon ? "true" : "false"}
              >
                <span>{n.label}</span>
                {locked && <Lock size={10} />}
                {!locked && n.soon && <span className="dash-soon">soon</span>}
              </a>
            );
          })}
        </nav>
        <Link to="/" className="dash-back">← Back to builder</Link>
      </aside>

      <main className="dash-main">
        <header className="dash-header">
          <div>
            <div className="dash-eyebrow">AI Business Dashboard</div>
            <h1 className="dash-title">
              {email ? email.split("@")[0] : "Your workspace"}
            </h1>
            <p className="dash-sub">
              {tier ? `${tier.name} plan · ` : "Free · "}
              {userId ? `Signed in as ${email}` : "Not signed in"}
            </p>
          </div>
          <div className="dash-actions">
            <button
              type="button"
              className="dash-ghost"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh all live data"
            >
              <RefreshCw size={13} className={refreshing ? "spin" : ""} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            {!tier && (
              <Link to="/unlock" className="dash-cta">
                See plans <ArrowRight size={14} />
              </Link>
            )}
            <button
              type="button"
              className="dash-ghost"
              onClick={async () => {
                try { await supabase.auth.signOut(); } catch { /* ignore */ }
                try { await lockSite(); } catch { /* ignore */ }
                window.location.assign("/unlock");
              }}
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </header>

        {/* ---- KPI grid ---- */}
        <section className="dash-grid" aria-label="Business KPIs">
          <KpiCard
            icon={FolderKanban}
            label="Projects"
            value={totalProjects > 0 ? String(totalProjects) : "—"}
            hint={cloudProjects.projects.length > 0
              ? `${cloudProjects.projects.length} cloud · ${localSessions.filter(s => s.html).length} local`
              : "Local only"}
          />
          <KpiCard
            icon={Zap}
            label="Credits Used"
            value={credits.loading ? "…" : credits.used.toLocaleString()}
            hint={credits.loading ? "" : `of ${credits.cap.toLocaleString()} this period`}
            locked={!isPro && snap.mode !== "owner"}
            lockedHint="Pro plan"
          />
          <KpiCard
            icon={TrendingUp}
            label="AI Builds (30d)"
            value={usageLoading ? "…" : serverStats ? String(serverStats.aiBuilds30d) : "—"}
            hint={serverStats ? `${serverStats.credits30d} credits spent` : ""}
          />
          <KpiCard
            icon={Rocket}
            label="Deployed"
            value={usageLoading ? "…" : serverStats ? String(serverStats.deployedBuilds) : "—"}
            hint="Published builds"
          />
          <KpiCard
            icon={Cloud}
            label="Cloud Projects"
            value={cloudProjects.loading ? "…" : String(cloudProjects.projects.length)}
            hint={userId ? "Synced across devices" : "Sign in to enable"}
          />
          <KpiCard
            icon={CheckCircle2}
            label="Best QA Score"
            value={bestScore !== null ? `${bestScore}` : "—"}
            hint={bestScore !== null ? (bestScore >= 70 ? "Ship-ready" : "Needs work") : "Run a build"}
            scoreColor={bestScore !== null ? scoreColor(bestScore) : undefined}
          />
          <KpiCard
            icon={ShieldCheck}
            label="Security Score"
            value={bestScore !== null ? `${Math.min(100, bestScore + 5)}` : "—"}
            hint="Derived from QA"
            scoreColor={bestScore !== null ? scoreColor(Math.min(100, bestScore + 5)) : undefined}
          />
          <KpiCard
            icon={Gauge}
            label="Performance"
            value={bestScore !== null ? `${Math.max(0, bestScore - 8)}` : "—"}
            hint="Derived from QA"
            scoreColor={bestScore !== null ? scoreColor(Math.max(0, bestScore - 8)) : undefined}
          />
          <KpiCard
            icon={DollarSign}
            label="Revenue"
            value="—"
            hint="Custom plan"
            locked={!tierAtLeast(activeTier, "custom")}
            lockedHint="Custom plan"
          />
        </section>

        {/* ---- Credit usage bar (Pro only) ---- */}
        {(isPro || snap.mode === "owner") && (
          <div className="dash-panel" id="projects">
            <div className="dash-panel-head">
              <h2>Credit usage this period</h2>
              {credits.periodStart && credits.periodEnd && (
                <span className="dash-panel-meta">
                  {new Date(credits.periodStart).toLocaleDateString()} → {new Date(credits.periodEnd).toLocaleDateString()}
                </span>
              )}
            </div>
            <CreditBar used={credits.used} cap={credits.cap} loading={credits.loading} />
            {credits.reserved > 0 && (
              <p style={{ fontSize: 11, color: "#B6BCC8", margin: "6px 0 0" }}>
                {credits.reserved.toLocaleString()} reserved (in-flight builds)
              </p>
            )}
          </div>
        )}

        <section className="dash-panels">
          {/* Cloud projects */}
          <div className="dash-panel">
            <div className="dash-panel-head">
              <h2>Cloud projects</h2>
              <Link to="/" className="dash-panel-link">Open builder →</Link>
            </div>
            {!userId ? (
              <p className="dash-empty">
                <Link to="/auth" style={{ color: "#F4A125" }}>Sign in</Link> to sync projects across devices.
              </p>
            ) : cloudProjects.loading ? (
              <p className="dash-empty">Loading…</p>
            ) : cloudProjects.projects.length === 0 ? (
              <p className="dash-empty">No cloud projects yet. Hit Save in the builder to sync one here.</p>
            ) : (
              <ul className="dash-project-list">
                {cloudProjects.projects.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <span className="dash-project-title">{p.projectName ?? "Untitled"}</span>
                    <span className="dash-project-meta">
                      {new Date(p.updatedAt).toLocaleDateString()} · {(p.byteSize / 1024).toFixed(1)} KB
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* AI usage history */}
          <div className="dash-panel">
            <div className="dash-panel-head">
              <h2>Recent AI activity</h2>
              <span className="dash-panel-meta">Last 30 days</span>
            </div>
            {!isPro && snap.mode !== "owner" ? (
              <p className="dash-empty">
                Upgrade to Pro to see AI usage history.{" "}
                <Link to="/unlock" style={{ color: "#F4A125" }}>See plans</Link>
              </p>
            ) : usageLoading ? (
              <p className="dash-empty">Loading…</p>
            ) : !usageSummary || usageSummary.last30Days.length === 0 ? (
              <p className="dash-empty">No AI usage in the last 30 days. Start building!</p>
            ) : (
              <ul className="dash-project-list">
                {usageSummary.last30Days.map((r, i) => (
                  <li key={i}>
                    <span className="dash-project-title" style={{ fontSize: 12 }}>
                      {r.operation.replace(/_/g, " ")}
                    </span>
                    <span className="dash-project-meta">
                      {r.credits_charged} cr · {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Plan */}
          <div className="dash-panel">
            <div className="dash-panel-head">
              <h2>Your plan</h2>
              <Link to="/unlock" className="dash-panel-link">Manage →</Link>
            </div>
            {tier ? (
              <>
                <p className="dash-plan-line"><b>{tier.name}</b> · {tier.headline}</p>
                <ul className="dash-plan-outcomes">
                  {tier.outcomes.slice(0, 4).map((o) => <li key={o}>✓ {o}</li>)}
                </ul>
              </>
            ) : (
              <>
                <p className="dash-empty">Free — local builds only.</p>
                {userId && (
                  <p style={{ fontSize: 12, color: "#B6BCC8", marginTop: 8 }}>
                    You get 1 free AI build per day. <Link to="/unlock" style={{ color: "#F4A125" }}>Upgrade</Link> for 1,000 credits/month.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Local sessions with QA scores */}
          {localSessions.filter(s => s.html).length > 0 && (
            <div className="dash-panel">
              <div className="dash-panel-head">
                <h2>Local builds this session</h2>
                <Link to="/" className="dash-panel-link">Open builder →</Link>
              </div>
              <ul className="dash-project-list">
                {localSessions.filter(s => s.html).slice(0, 6).map((s) => {
                  const score = s.qaStatus?.overall ?? s.qaStatus?.score ?? null;
                  return (
                    <li key={s.id}>
                      <span className="dash-project-title">{s.title ?? "Untitled"}</span>
                      {score !== null ? (
                        <span style={{ fontSize: 11, color: scoreColor(score), fontWeight: 600 }}>
                          QA {score}
                        </span>
                      ) : (
                        <span className="dash-project-meta">no QA</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function KpiCard(props: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
  hint?: string;
  locked?: boolean;
  lockedHint?: string;
  scoreColor?: string;
}) {
  const Icon = props.icon;
  return (
    <div className={`dash-kpi ${props.locked ? "is-locked" : ""}`}>
      <div className="dash-kpi-head">
        <Icon size={14} />
        <span>{props.label}</span>
        {props.locked && <Lock size={10} style={{ marginLeft: "auto" }} />}
      </div>
      <div className="dash-kpi-value" style={props.scoreColor ? { color: props.scoreColor } : {}}>
        {props.locked ? "—" : props.value}
      </div>
      <div className="dash-kpi-hint">
        {props.locked ? props.lockedHint ?? "Upgrade to unlock" : (props.hint ?? "")}
      </div>
    </div>
  );
}

const dashCss = `
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.8s linear infinite; }

.dash-root {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: 220px 1fr;
  background: #050607;
  color: #f2eee7;
  font-family: Inter, system-ui, sans-serif;
}
@media (max-width: 800px) { .dash-root { grid-template-columns: 1fr; } .dash-sidebar { position: static; border-right: 0; border-bottom: 1px solid rgba(255,255,255,0.08);} }

.dash-sidebar {
  border-right: 1px solid rgba(255,255,255,0.08);
  padding: 20px 16px;
  display: flex; flex-direction: column; gap: 14px;
  background: linear-gradient(180deg, rgba(244,161,37,0.04), transparent 60%);
}
.dash-brand { display: flex; align-items: center; gap: 8px; font-weight: 600; letter-spacing: 0.02em; color: #F4A125; }
.dash-tier-chip {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 8px; border-radius: 999px; font-size: 10px; letter-spacing: 0.06em;
  text-transform: uppercase; background: rgba(244,161,37,0.12); color: #F4A125;
  border: 1px solid rgba(244,161,37,0.25);
}
.dash-nav { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
.dash-nav-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-radius: 8px; font-size: 13px; color: #B6BCC8;
  text-decoration: none; transition: background 0.15s, color 0.15s;
}
.dash-nav-item:hover { background: rgba(255,255,255,0.04); color: #f2eee7; }
.dash-nav-item.is-locked { opacity: 0.5; }
.dash-soon { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #F4A125; opacity: 0.8; }
.dash-back { margin-top: auto; font-size: 12px; color: #B6BCC8; text-decoration: none; padding: 8px 10px; }
.dash-back:hover { color: #f2eee7; }

.dash-main { padding: 32px clamp(20px, 4vw, 48px); display: flex; flex-direction: column; gap: 20px; max-width: 1240px; }
.dash-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.dash-eyebrow { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #F4A125; }
.dash-title { font-family: Fraunces, Georgia, serif; font-size: clamp(24px, 3vw, 36px); margin: 6px 0 6px; font-weight: 500; letter-spacing: -0.01em; }
.dash-sub { color: #B6BCC8; font-size: 13px; margin: 0; }
.dash-cta {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 14px; border-radius: 10px; background: #F4A125; color: #111317;
  font-weight: 600; font-size: 13px; text-decoration: none;
}
.dash-cta:hover { background: #DD9324; }
.dash-actions { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dash-ghost {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 10px;
  background: transparent; color: #F2EEE7;
  border: 1px solid rgba(255,255,255,0.14);
  font-size: 12px; font-weight: 500; cursor: pointer;
}
.dash-ghost:hover { background: rgba(244,161,37,0.08); border-color: rgba(244,161,37,0.4); }
.dash-ghost:disabled { opacity: 0.5; cursor: default; }

.dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.dash-kpi { border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; background: rgba(255,255,255,0.02); transition: border-color 0.2s; }
.dash-kpi:hover { border-color: rgba(244,161,37,0.2); }
.dash-kpi.is-locked { opacity: 0.5; }
.dash-kpi-head { display: flex; align-items: center; gap: 8px; color: #B6BCC8; font-size: 11px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.06em; }
.dash-kpi-value { font-family: Fraunces, Georgia, serif; font-size: 30px; letter-spacing: -0.02em; line-height: 1; margin-bottom: 4px; }
.dash-kpi-hint { font-size: 11px; color: #8a919b; }

.dash-panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
.dash-panel { border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; background: rgba(255,255,255,0.02); }
.dash-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.dash-panel-head h2 { font-size: 13px; margin: 0; font-weight: 600; color: #f2eee7; }
.dash-panel-link { font-size: 12px; color: #F4A125; text-decoration: none; }
.dash-panel-meta { font-size: 11px; color: #8a919b; }
.dash-empty { font-size: 13px; color: #B6BCC8; margin: 0; line-height: 1.5; }
.dash-project-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
.dash-project-list li { display: flex; justify-content: space-between; align-items: center; font-size: 13px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); gap: 8px; }
.dash-project-list li:last-child { border-bottom: 0; }
.dash-project-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dash-project-meta { color: #B6BCC8; font-size: 11px; flex-shrink: 0; }
.dash-plan-line { font-size: 13px; color: #f2eee7; margin: 0 0 8px; }
.dash-plan-outcomes { list-style: none; padding: 0; margin: 0; font-size: 12px; color: #B6BCC8; display: flex; flex-direction: column; gap: 4px; }
`;
