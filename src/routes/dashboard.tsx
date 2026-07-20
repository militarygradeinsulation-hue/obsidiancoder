// AI Business Dashboard — Phase 1 shell.
// Read-only outcome-focused KPIs. Values are computed from what the client
// already knows (localStorage projects, entitlement snapshot). No new
// backend queries; monetization and security surfaces remain untouched.

import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, FolderKanban, Timer, Rocket, DollarSign,
  ShieldCheck, Gauge, CheckCircle2, ArrowRight, Sparkles, Lock, LogOut,
} from "lucide-react";
import { useAuth, useSubscription } from "@/hooks/useSubscription";
import { useEntitlement } from "@/hooks/useEntitlement";
import { DASHBOARD_NAV, PLAN_TIERS, tierForPriceId, tierAtLeast, type PlanTierId } from "@/lib/plans";
import { safeGet } from "@/lib/safe-storage";
import { lockSite } from "@/lib/gate.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const { ensureUnlocked } = await import("@/lib/gate.functions");
    const { unlocked } = await ensureUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "AI Business Dashboard — Aetheris Obsidian" },
      { name: "description", content: "Build, launch, and grow software with AI. Track projects, deployments, revenue, and product readiness in one place." },
      { property: "og:title", content: "AI Business Dashboard — Aetheris Obsidian" },
      { property: "og:description", content: "Build, launch, and grow software with AI." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/dashboard" }],
  }),
  component: DashboardPage,
});

interface LocalProjectMeta { id: string; title?: string; updatedAt?: number }

function readLocalProjects(): LocalProjectMeta[] {
  // Best-effort scan of local project storage; falls back to empty.
  try {
    const parsed = safeGet<LocalProjectMeta[]>("obs.projects.index");
    if (Array.isArray(parsed)) return parsed;
  } catch { /* ignore */ }
  return [];
}

function DashboardPage() {
  const { userId, email } = useAuth();
  const { subscription, isPro } = useSubscription();
  const { snap } = useEntitlement();
  const [projects, setProjects] = useState<LocalProjectMeta[]>([]);

  useEffect(() => { setProjects(readLocalProjects()); }, []);

  const activeTier: PlanTierId | null = useMemo(() => {
    if (snap.mode === "owner") return "elite";
    const t = tierForPriceId(subscription?.price_id);
    if (t) return t.id;
    return isPro ? "creator" : null;
  }, [snap.mode, subscription, isPro]);

  const tier = activeTier ? PLAN_TIERS.find((p) => p.id === activeTier) : null;

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
          <span>{tier ? tier.name : "Free Local"}</span>
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
            <h1 className="dash-title">Build, Launch, and Grow Software with AI</h1>
            <p className="dash-sub">
              {email ? `Signed in as ${email}. ` : "Local Free mode. "}
              {tier
                ? `You're on the ${tier.name} plan.`
                : "Upgrade to unlock deployments, analytics, and launch readiness."}
            </p>
          </div>
          <div className="dash-actions">
            {!tier && (
              <Link to="/unlock" className="dash-cta">
                See plans <ArrowRight size={14} />
              </Link>
            )}
            <button
              type="button"
              className="dash-ghost"
              onClick={async () => {
                try { await lockSite(); } catch { /* ignore */ }
                window.location.assign("/unlock");
              }}
              title="Return to the access screen. Your Obsidian account stays signed in."
            >
              <Lock size={13} /> Lock workspace
            </button>
            <button
              type="button"
              className="dash-ghost"
              data-testid="dashboard-signout"
              onClick={async () => {
                try { await supabase.auth.signOut(); } catch { /* ignore */ }
                try { await lockSite(); } catch { /* ignore */ }
                window.location.assign("/unlock");
              }}
              title="Sign out of your Obsidian account and lock the workspace."
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </header>

        <section className="dash-grid" aria-label="Business KPIs">
          <KpiCard icon={FolderKanban} label="Projects" value={String(projects.length)} hint="Local + cloud" />
          <KpiCard icon={Timer} label="AI Engineering Time" value="—" hint="Coming soon" />
          <KpiCard icon={Rocket} label="Deployments" value="—" hint="Coming soon" />
          <KpiCard icon={DollarSign} label="Revenue" value="—" hint="Business plan and above" locked={!tierAtLeast(activeTier, "business")} />
          <KpiCard icon={CheckCircle2} label="Product Readiness" value="—" hint="Per-build score" />
          <KpiCard icon={ShieldCheck} label="Security Score" value="—" hint="Per-build score" />
          <KpiCard icon={Gauge} label="Performance Score" value="—" hint="Per-build score" />
          <KpiCard icon={Rocket} label="Launch Readiness" value="—" hint="Composite readiness" />
        </section>

        <section className="dash-panels">
          <div className="dash-panel">
            <div className="dash-panel-head">
              <h2>Recent projects</h2>
              <Link to="/gallery" className="dash-panel-link">Open gallery →</Link>
            </div>
            {projects.length === 0 ? (
              <p className="dash-empty">No local projects yet. Start a build to populate this list.</p>
            ) : (
              <ul className="dash-project-list">
                {projects.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <span className="dash-project-title">{p.title || "Untitled build"}</span>
                    <span className="dash-project-meta">
                      {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="dash-panel">
            <div className="dash-panel-head">
              <h2>Your plan</h2>
              <Link to="/unlock" className="dash-panel-link">Manage →</Link>
            </div>
            {tier ? (
              <>
                <p className="dash-plan-line"><b>{tier.name}</b> · {tier.headline}</p>
                <ul className="dash-plan-outcomes">
                  {tier.outcomes.slice(0, 4).map((o) => <li key={o}>• {o}</li>)}
                </ul>
              </>
            ) : (
              <p className="dash-empty">
                You're on Free Local. Upgrade to run cloud AI, deploy, and unlock the growth dashboard.
              </p>
            )}
          </div>
        </section>

        <p className="dash-foot">
          Phase 1 shell · Live KPIs and plan-aware modules ship in the next phases.
          {userId ? "" : " Sign in to sync across devices."}
        </p>
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
}) {
  const Icon = props.icon;
  return (
    <div className={`dash-kpi ${props.locked ? "is-locked" : ""}`}>
      <div className="dash-kpi-head">
        <Icon size={14} />
        <span>{props.label}</span>
        {props.locked && <Lock size={11} />}
      </div>
      <div className="dash-kpi-value">{props.locked ? "—" : props.value}</div>
      {props.hint && <div className="dash-kpi-hint">{props.hint}</div>}
    </div>
  );
}

const dashCss = `
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

.dash-main { padding: 32px clamp(20px, 4vw, 48px); display: flex; flex-direction: column; gap: 28px; max-width: 1240px; }
.dash-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.dash-eyebrow { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #F4A125; }
.dash-title { font-family: Fraunces, Georgia, serif; font-size: clamp(28px, 4vw, 40px); margin: 6px 0 8px; font-weight: 500; letter-spacing: -0.01em; }
.dash-sub { color: #B6BCC8; font-size: 14px; margin: 0; max-width: 60ch; }
.dash-cta {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 16px; border-radius: 10px; background: #F4A125; color: #111317;
  font-weight: 600; font-size: 13px; text-decoration: none;
}
.dash-cta:hover { background: #DD9324; }

.dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.dash-kpi { border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; background: rgba(255,255,255,0.02); }
.dash-kpi.is-locked { opacity: 0.55; }
.dash-kpi-head { display: flex; align-items: center; gap: 8px; color: #B6BCC8; font-size: 12px; margin-bottom: 6px; }
.dash-kpi-value { font-family: Fraunces, Georgia, serif; font-size: 28px; letter-spacing: -0.01em; }
.dash-kpi-hint { font-size: 11px; color: #B6BCC8; opacity: 0.75; margin-top: 4px; }

.dash-panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.dash-panel { border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; background: rgba(255,255,255,0.02); }
.dash-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.dash-panel-head h2 { font-size: 13px; margin: 0; font-weight: 600; color: #f2eee7; }
.dash-panel-link { font-size: 12px; color: #F4A125; text-decoration: none; }
.dash-empty { font-size: 13px; color: #B6BCC8; margin: 0; }
.dash-project-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.dash-project-list li { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px dashed rgba(255,255,255,0.06); }
.dash-project-list li:last-child { border-bottom: 0; }
.dash-project-meta { color: #B6BCC8; font-size: 11px; }
.dash-plan-line { font-size: 13px; color: #f2eee7; margin: 0 0 8px; }
.dash-plan-outcomes { list-style: none; padding: 0; margin: 0; font-size: 12px; color: #B6BCC8; display: flex; flex-direction: column; gap: 4px; }

.dash-foot { font-size: 11px; color: #B6BCC8; opacity: 0.7; margin-top: auto; }
`;
