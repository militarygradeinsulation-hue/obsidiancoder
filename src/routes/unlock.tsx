import { createFileRoute, redirect, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { unlockSite, unlockIfPro } from "@/lib/gate.functions";
import { supabase } from "@/integrations/supabase/client";
import { CheckoutSurface } from "@/components/CheckoutSurface";
import { CAP_PRO_MONTHLY } from "@/lib/credit-gate";
import { PLAN_TIERS } from "@/lib/plans";
import { buildAuthUrl } from "@/lib/redirect-safe";
import unlockBg from "@/assets/unlock-bg.mp4.asset.json";
import signatureCard from "@/assets/joseph-signature-card.jpeg.asset.json";

const CREATOR_PRICE_ID = "obsidian_creator_monthly";

type DemoCategory = "App" | "Landing" | "Dashboard" | "Tool" | "Game" | "Portfolio";
const DEMO_CATEGORIES: readonly DemoCategory[] = ["App", "Landing", "Dashboard", "Tool", "Game", "Portfolio"] as const;

const DEMOS: { slug: string; title: string; url?: string; category: DemoCategory }[] = [
  { slug: "0v6h3d1b0k5e60", title: "Demo · Obsidian Build 01", category: "App" },
  { slug: "254055672k2h6p", title: "Demo · Obsidian Build 02", category: "Landing" },
  { slug: "68055l616v1f1m", title: "Demo · Obsidian Build 03", category: "Dashboard" },
  { slug: "6u0k1t5t544959", title: "Demo · Obsidian Build 04", category: "Tool" },
  { slug: "3u6i063s2u000m", title: "Demo · Obsidian Build 05", category: "Game" },
  { slug: "712q5y47130j3k", title: "Demo · Obsidian Build 06", category: "Portfolio" },
  { slug: "0o170e051k1558", title: "Demo · Obsidian Build 07", category: "App" },
  { slug: "0w653a21633k5v", title: "Demo · Obsidian Build 08", category: "Landing", url: "https://obsidianvibe.live/api/public/share/0w653a21633k5v" },
  { slug: "3s190o0x3o2r14", title: "Demo · Obsidian Build 09", category: "Dashboard", url: "https://obsidianvibe.live/api/public/share/3s190o0x3o2r14" },
  { slug: "1l370y43144a2o", title: "Demo · Obsidian Build 10", category: "Tool", url: "https://obsidianvibe.live/api/public/share/1l370y43144a2o" },
  { slug: "0t485n6s6i1203", title: "Demo · Obsidian Build 11", category: "Game", url: "https://obsidianvibe.live/api/public/share/0t485n6s6i1203" },
  { slug: "5i3e202p646j66", title: "Demo · Obsidian Build 12", category: "Portfolio", url: "https://obsidianvibe.live/api/public/share/5i3e202p646j66" },
  { slug: "1z63663n0j6c3n", title: "Demo · Obsidian Build 13", category: "App", url: "https://obsidianvibe.live/api/public/share/1z63663n0j6c3n#home" },
  { slug: "6t4k4d2h31512r", title: "Demo · Obsidian Build 14", category: "Landing", url: "https://obsidianvibe.live/api/public/share/6t4k4d2h31512r" },
  { slug: "0x1b67096z3d2l", title: "Demo · Obsidian Build 15", category: "Dashboard", url: "https://obsidianvibe.live/api/public/share/0x1b67096z3d2l" },
  { slug: "4a452v014l4a3d", title: "Demo · Obsidian Build 16", category: "Tool", url: "https://obsidianvibe.live/api/public/share/4a452v014l4a3d" },
  { slug: "4t4k4q2u0e2i0y", title: "Demo · Obsidian Build 17", category: "Game", url: "https://obsidianvibe.live/api/public/share/4t4k4q2u0e2i0y" },
  { slug: "3u6x2m401k4y6q", title: "Demo · Obsidian Build 18", category: "Portfolio", url: "https://obsidianvibe.live/api/public/share/3u6x2m401k4y6q" },
  { slug: "6u1l6b255s6n2t", title: "Demo · Obsidian Build 19", category: "App", url: "https://obsidianvibe.live/api/public/share/6u1l6b255s6n2t#mockup-anchor" },
  { slug: "214o3v5d1g421g", title: "Demo · Obsidian Build 20", category: "Dashboard", url: "https://obsidianvibe.live/api/public/share/214o3v5d1g421g#live-map" },
  { slug: "4b3k4t624s4n1l", title: "Demo · Obsidian Build 21", category: "Landing", url: "https://obsidianvibe.live/api/public/share/4b3k4t624s4n1l#preview" },
  { slug: "3s2q0g011p2z3b", title: "Demo · Obsidian Build 22", category: "App", url: "https://obsidianvibe.live/api/public/share/3s2q0g011p2z3b#home" },
  { slug: "2e5n3j0y47664q", title: "Demo · Obsidian Build 23", category: "Game", url: "https://obsidianvibe.live/api/public/share/2e5n3j0y47664q#episodes" },
  { slug: "4g71725v6y2o5b", title: "Demo · Obsidian Build 24", category: "App", url: "https://obsidianvibe.live/api/public/share/4g71725v6y2o5b" },
  { slug: "5j4x38736j4y56", title: "Demo · Obsidian Build 25", category: "App", url: "https://obsidianvibe.live/api/public/share/5j4x38736j4y56" },
  { slug: "3e2s2m0q2i3b2s", title: "Demo · Obsidian Build 26", category: "Landing", url: "https://obsidianvibe.live/api/public/share/3e2s2m0q2i3b2s#top" },
];

type Intent = "buy" | "code";

export const Route = createFileRoute("/unlock")({
  validateSearch: (s: Record<string, unknown>) => ({
    password: typeof s.password === "string" ? s.password : undefined,
    intent: (s.intent === "buy" || s.intent === "code" ? s.intent : undefined) as Intent | undefined,
    checkout: s.checkout === "1" ? "1" : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const pwd = (search as { password?: string }).password;
    if (!pwd) return;
    const { ok } = await unlockSite({ data: { password: pwd } });
    if (ok) throw redirect({ to: "/" });
    throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "Get Obsidian Creator — Obsidian" },
      { name: "description", content: "Start Obsidian Creator for $79/month or enter your access code. Build production-ready software with an AI engineering team." },
      { property: "og:title", content: "Get Obsidian Creator — Obsidian" },
      { property: "og:description", content: "Build production-ready software with an AI engineering team. $79/month, 1,000 AI credits per billing period." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/unlock" }],
  }),
  component: Unlock,
});

function Unlock() {
  const router = useRouter();
  const search = Route.useSearch();
  const unlock = useServerFn(unlockSite);
  const proUnlock = useServerFn(unlockIfPro);

  const [tab, setTab] = useState<Intent>(search.intent === "code" ? "code" : "buy");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<{ userId: string; email: string | null } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [showCheckout, setShowCheckout] = useState(search.checkout === "1");
  const [expandDetails, setExpandDetails] = useState(false);
  const [demoCategory, setDemoCategory] = useState<DemoCategory | "All">("All");

  // Track auth session
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ? { userId: data.session.user.id, email: data.session.user.email ?? null } : null);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s ? { userId: s.user.id, email: s.user.email ?? null } : null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // Attempt server-verified Pro unlock whenever we have a signed-in session
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const { ok } = await proUnlock({});
        if (cancelled) return;
        if (ok) {
          setStatus("Pro access verified — opening Obsidian…");
          await router.navigate({ to: "/" });
          router.invalidate();
        }
      } catch { /* not pro or transport error — stay on page */ }
    })();
    return () => { cancelled = true; };
  }, [session, proUnlock, router]);

  async function onCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    try {
      const { ok } = await unlock({ data: { password } });
      if (ok) {
        await router.navigate({ to: "/" });
        router.invalidate();
      } else setError("Access denied.");
    } catch { setError("Something went wrong. Try again."); }
    finally { setBusy(false); }
  }

  function startPurchase() {
    setError(null);
    if (!session) {
      // Send to auth in signup mode, then return here with checkout=1.
      window.location.assign(buildAuthUrl("signup", "/unlock?intent=buy&checkout=1"));
      return;
    }
    setShowCheckout(true);
  }

  function goSignIn() {
    // Existing customers: land on auth in signin mode; the auth-state
    // listener on this page then verifies Pro and unlocks the app.
    window.location.assign(buildAuthUrl("signin", "/unlock"));
  }

  async function signOutAndReset() {
    await supabase.auth.signOut();
    setShowCheckout(false);
  }

  // --- Tab keyboard navigation (WAI-ARIA authoring practices) --------------
  const tabOrder: Intent[] = ["buy", "code"];
  const tabRefs = useRef<Record<Intent, HTMLButtonElement | null>>({ buy: null, code: null });
  function focusTab(t: Intent) {
    setTab(t);
    // Focus follows selection so screen-reader users hear the panel change.
    requestAnimationFrame(() => tabRefs.current[t]?.focus());
  }
  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const idx = tabOrder.indexOf(tab);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault(); focusTab(tabOrder[(idx + 1) % tabOrder.length]);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault(); focusTab(tabOrder[(idx - 1 + tabOrder.length) % tabOrder.length]);
    } else if (e.key === "Home") {
      e.preventDefault(); focusTab(tabOrder[0]);
    } else if (e.key === "End") {
      e.preventDefault(); focusTab(tabOrder[tabOrder.length - 1]);
    }
  }

  return (
    <div className="unlock-root">
      <style>{unlockCss}</style>

      <video
        className="unlock-video"
        src={unlockBg.url}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden
        tabIndex={-1}
      />
      <div aria-hidden className="unlock-video-veil" />

      <div aria-hidden className="unlock-face">
        <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="faceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f4a125" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#dd9324" stopOpacity="0.2" />
            </linearGradient>
            <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
              <rect width="4" height="1" fill="#f4a125" fillOpacity="0.25" />
            </pattern>
          </defs>
          <g fill="none" stroke="url(#faceGrad)" strokeWidth="1.1">
            <path d="M200 60 C120 60 90 140 90 220 C90 300 120 400 200 440 C280 400 310 300 310 220 C310 140 280 60 200 60 Z" />
            <path d="M120 300 C150 380 200 430 200 430 C200 430 250 380 280 300" />
            <path d="M200 190 L188 270 L200 285 L212 270 L200 190" />
            <ellipse cx="155" cy="215" rx="24" ry="10" />
            <ellipse cx="245" cy="215" rx="24" ry="10" />
            <circle cx="155" cy="215" r="4" fill="#f4a125" />
            <circle cx="245" cy="215" r="4" fill="#f4a125" />
            <path d="M160 340 Q200 360 240 340" />
            <path d="M110 180 Q200 200 290 180" />
            <path d="M105 250 Q200 275 295 250" />
            <path d="M115 320 Q200 345 285 320" />
            <path d="M200 60 L200 440" strokeOpacity="0.3" />
          </g>
          <rect x="0" y="0" width="400" height="500" fill="url(#scan)" />
        </svg>
      </div>

      <div aria-hidden className="unlock-noise" />

      <main className="unlock-card" role="main" aria-labelledby="unlock-heading">
        <div className="unlock-card-glow" aria-hidden />

        <header className="unlock-brand">
          <div id="unlock-heading" className="unlock-title" data-text="OBSIDIAN">OBSIDIAN</div>
          <div className="unlock-sub">Obsidian // Access Terminal</div>
        </header>

        {/* Tabs */}
        <div className="unlock-tabs" role="tablist" aria-label="Access options">
          <button
            role="tab"
            aria-selected={tab === "buy"}
            aria-controls="panel-buy"
            id="tab-buy"
            tabIndex={tab === "buy" ? 0 : -1}
            ref={(el) => { tabRefs.current.buy = el; }}
            className={`unlock-tab ${tab === "buy" ? "is-active" : ""}`}
            onClick={() => setTab("buy")}
            onKeyDown={onTabKeyDown}
            type="button"
          >
            Get Obsidian Creator
          </button>
          <button
            role="tab"
            aria-selected={tab === "code"}
            aria-controls="panel-code"
            id="tab-code"
            tabIndex={tab === "code" ? 0 : -1}
            ref={(el) => { tabRefs.current.code = el; }}
            className={`unlock-tab ${tab === "code" ? "is-active" : ""}`}
            onClick={() => setTab("code")}
            onKeyDown={onTabKeyDown}
            type="button"
          >
            Access Code
          </button>
        </div>

        {/* PURCHASE PANEL */}
        {tab === "buy" && (
          <section id="panel-buy" role="tabpanel" aria-labelledby="tab-buy">
            {!showCheckout && (
              <>
                <h2 className="unlock-headline">Build, Launch, and Grow Software with AI.</h2>

                <div className="unlock-price">
                  <span className="price-amount">$79</span>
                  <span className="price-cadence">/month</span>
                </div>
                <p className="unlock-allowance">
                  Includes <strong>{CAP_PRO_MONTHLY.toLocaleString()} AI credits</strong> each billing period, reset on your Stripe billing date.
                </p>

                {status && <div className="unlock-status" role="status">{status}</div>}
                {error && <div role="alert" className="unlock-error">⚠ {error}</div>}

                <button
                  type="button"
                  className="unlock-btn unlock-btn-primary"
                  onClick={startPurchase}
                  disabled={sessionLoading}
                >
                  {sessionLoading ? "…" : session ? "Continue to Secure Checkout" : "Start Obsidian Creator — $79/month"}
                </button>

                <button type="button" className="unlock-btn-secondary" onClick={goSignIn}>
                  Already purchased? Sign in
                </button>

                <button
                  type="button"
                  className="unlock-disclosure"
                  aria-expanded={expandDetails}
                  onClick={() => setExpandDetails((v) => !v)}
                >
                  {expandDetails ? "Hide details ▲" : "What you get & how it works ▼"}
                </button>

                {expandDetails && (
                  <div className="unlock-details">
                    <div className="detail-block">
                      <h3>Why Obsidian is different</h3>
                      <ul>
                        <li><strong>An AI engineering team, not a single chat model.</strong> A Chief Engineer routes each request across specialized agents for planning, code, review, security, and rollback — most vibe coders send one prompt to one model and hope.</li>
                        <li><strong>Production-grade output by default.</strong> Every build is validated, screenshot-tested, and scored on a readiness report covering performance, accessibility, and security before you ship.</li>
                        <li><strong>Never simulates data.</strong> Obsidian generates real HTML/CSS/JS wired to real APIs and real images — no fake JSON, no placeholder text, no “this is a mock” escape hatches.</li>
                        <li><strong>Deterministic patches, not full rewrites.</strong> Small changes stay small. A transactional patch engine surgically edits the exact section you asked about and preserves everything else that worked.</li>
                        <li><strong>Multi-provider AI with automatic failover.</strong> Gemini 3, GPT-5, and Claude — plus Leonardo, Higgsfield, and Gemini for images. If one provider fails or rate-limits, Obsidian switches mid-request and refunds credits when nothing was delivered.</li>
                        <li><strong>Your library, cross-device.</strong> Builds, saved ideas, and version history follow you across browsers via your private library code — no lock-in, exportable at any time.</li>
                        <li><strong>Real deploys.</strong> One-click Go Live, GitHub repo + Pages integration, and shareable public URLs baked in.</li>
                      </ul>
                    </div>

                    <div className="detail-block">
                      <h3>Pricing tiers</h3>
                      <div className="tier-grid">
                        {PLAN_TIERS.map((t) => (
                          <div key={t.id} className={`tier-row ${t.featured ? "is-featured" : ""}`}>
                            <div className="tier-head">
                              <span className="tier-name">{t.name}</span>
                              <span className="tier-price">{t.price}<span className="tier-cadence">{t.cadence}</span></span>
                            </div>
                            <div className="tier-headline">{t.headline}</div>
                            <div className="tier-bestfor">Best for: {t.bestFor}</div>
                            <ul className="tier-outcomes">
                              {t.outcomes.map((o) => <li key={o}>{o}</li>)}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="detail-block">
                      <h3>How it works</h3>
                      <ol>
                        <li>Create your account</li>
                        <li>Complete secure Stripe checkout</li>
                        <li>Return automatically with Pro access enabled</li>
                      </ol>
                    </div>

                    <div className="detail-block">
                      <h3>What stays free &amp; local</h3>
                      <p>Local editing, previews, local project storage, deterministic tools, exports, screenshots, and local history remain free and never leave your browser. Credits are consumed only for cloud AI and provider work.</p>
                    </div>

                    <p className="detail-trust">Secure billing through Stripe. Cancel anytime.</p>
                  </div>
                )}

                <div className="unlock-legal">
                  <Link to="/terms">Terms</Link>
                  <span aria-hidden> · </span>
                  <Link to="/privacy">Privacy</Link>
                </div>
              </>
            )}

            {showCheckout && session && (
              <div className="unlock-checkout">
                <div className="checkout-header">
                  <div>
                    <div className="checkout-title">Obsidian Creator</div>
                    <div className="checkout-sub">
                      Signed in as {session.email ?? "your account"}
                      <button type="button" onClick={signOutAndReset} className="checkout-signout">
                        Use another account
                      </button>
                    </div>
                  </div>
                  <button type="button" onClick={() => setShowCheckout(false)} className="checkout-back">← Back</button>
                </div>
                <CheckoutSurface
                  priceId={CREATOR_PRICE_ID}
                  onCancel={() => setShowCheckout(false)}
                />

                <p className="checkout-legal">
                  Secure billing through Stripe. Cancel anytime. By continuing you accept our{" "}
                  <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy</Link>.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ACCESS CODE PANEL */}
        {tab === "code" && (
          <section id="panel-code" role="tabpanel" aria-labelledby="tab-code">
            <h2 className="unlock-headline compact">Private access</h2>
            <p className="unlock-allowance">Enter your access code to open the Obsidian terminal.</p>

            <form onSubmit={onCodeSubmit} className="unlock-code-form">
              <label htmlFor="password" className="unlock-label">Access code</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                inputMode="numeric"
                disabled={busy}
                className="unlock-input"
                placeholder="••••"
              />
              {error && <div role="alert" className="unlock-error">⚠ {error}</div>}
              <button type="submit" disabled={busy} className="unlock-btn unlock-btn-primary">
                {busy ? "AUTHENTICATING…" : "UNLOCK"}
              </button>
            </form>

            <button type="button" className="unlock-btn-secondary" onClick={() => setTab("buy")}>
              Don&apos;t have a code? Get Obsidian Creator
            </button>
          </section>
        )}

        <div className="unlock-foot">OBSIDIAN</div>
      </main>

      <section className="unlock-demos" aria-labelledby="demos-heading">
        <div className="demos-header">
          <h2 id="demos-heading" className="demos-title">Live Demos</h2>
          <p className="demos-sub">Explore builds crafted with Obsidian. View-only — the vibe coder requires access.</p>
        </div>
        <div className="demo-chips" role="tablist" aria-label="Filter demos by category">
          {(["All", ...DEMO_CATEGORIES] as const).map((cat) => {
            const active = demoCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                className={`demo-chip ${active ? "is-active" : ""}`}
                onClick={() => setDemoCategory(cat)}
              >
                {cat}
              </button>
            );
          })}
        </div>
        <div className="demos-grid">
          {Array.from(
            new Map(
              DEMOS
                .filter((d) => demoCategory === "All" || d.category === demoCategory)
                .map((d) => {
                  const demoUrl = d.url ?? `/api/public/share/${d.slug}`;
                  return [demoUrl, { ...d, demoUrl }] as const;
                })
            ).values()
          ).map(({ slug, title, demoUrl, category }) => (
            <a
              key={slug}
              href={demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="demo-card"
            >
              <div className="demo-frame" aria-hidden>
                <iframe
                  src={demoUrl}
                  title={title}
                  loading="lazy"
                  sandbox=""
                  tabIndex={-1}
                />
                <div className="demo-scrim" />
              </div>
              <div className="demo-meta">
                <span className="demo-name">{title}</span>
                <span className="demo-open">{category} ↗</span>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* MEET THE ARCHITECT */}
      <section className="unlock-architect" aria-labelledby="architect-heading">
        <div className="architect-card">
          <div className="architect-portrait">
            <img
              src={signatureCard.url}
              alt="Joseph Toney — AI Architect signature card"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="architect-body">
            <h2 id="architect-heading" className="architect-title">Meet the Architect</h2>
            <p className="architect-name">Joseph Toney</p>
            <p className="architect-tagline">
              AI Architect · MS, BA · IBM AI Certified
            </p>
            <p className="architect-quote">
              “I find the cause of chaos and remove it at the source.”
            </p>
            <div className="architect-links">
              <a
                href="https://Aetheris.Technology"
                target="_blank"
                rel="noopener noreferrer"
                className="architect-link"
              >
                Aetheris.Technology
              </a>
              <a
                href="https://www.linkedin.com/in/thejosephtoney"
                target="_blank"
                rel="noopener noreferrer"
                className="architect-link"
              >
                LinkedIn
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

const unlockCss = `
.unlock-root {
  position: relative;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  background: #000;
  color: #f2eee7;
  font-family: Inter, system-ui, sans-serif;
  padding: 24px 16px;
  overflow-x: hidden;
  overflow-y: auto;
  isolation: isolate;
}
.unlock-video {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  object-fit: cover;
  z-index: -2;
  pointer-events: none;
  filter: saturate(1.05) contrast(1.05) brightness(0.85);
}
.unlock-video-veil {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(120% 90% at 50% 40%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.78) 60%, rgba(0,0,0,0.92) 100%),
    linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.65) 100%);
  mix-blend-mode: multiply;
}
.unlock-tab:focus-visible,
.unlock-btn:focus-visible,
.unlock-btn-primary:focus-visible,
.unlock-btn-secondary:focus-visible,
.unlock-disclosure:focus-visible {
  outline: 2px solid #F4A125;
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .unlock-face, .unlock-face svg, .unlock-card, .unlock-card-glow,
  .unlock-title::before, .unlock-title::after {
    animation: none !important;
  }
}
.unlock-face {
  position: absolute; inset: 0;
  display: grid; place-items: center; pointer-events: none;
  opacity: 0; filter: blur(1.2px) contrast(1.1); mix-blend-mode: screen;
  animation: face-cycle 14s ease-in-out infinite;
}
.unlock-face svg {
  width: min(520px, 70vmin); height: auto;
  filter: drop-shadow(0 0 24px rgba(244,161,37,0.35));
  animation: face-jitter 6s steps(1) infinite;
}
@keyframes face-cycle { 0%,100%{opacity:0} 40%{opacity:0} 46%{opacity:.18} 50%{opacity:.32} 54%{opacity:.10} 58%{opacity:.28} 64%{opacity:0} }
@keyframes face-jitter {
  0%,100%{transform:translate(0,0)}
  20%{transform:translate(-1px,.5px)} 40%{transform:translate(1.5px,-.5px)}
  60%{transform:translate(-.5px,1px)} 80%{transform:translate(.5px,-1px)}
}
.unlock-noise {
  position: absolute; inset: 0; pointer-events: none;
  background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0 1px, transparent 1px 3px);
  mix-blend-mode: overlay; opacity: 0.7;
}
.unlock-card {
  position: relative;
  width: 100%; max-width: 620px;
  background: rgba(8,8,10,0.78);
  border: 1px solid rgba(244,161,37,0.28);
  border-radius: 16px;
  padding: 26px 24px 22px;
  box-shadow: 0 0 0 1px rgba(244,161,37,0.05), 0 30px 80px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06);
  backdrop-filter: blur(14px);
  animation: card-float 6s ease-in-out infinite;
}
.unlock-card-glow {
  position: absolute; inset: -1px; border-radius: 16px; pointer-events: none;
  background: linear-gradient(120deg, transparent 30%, rgba(244,161,37,0.22) 50%, transparent 70%);
  background-size: 200% 100%; animation: shimmer 5s linear infinite;
  mix-blend-mode: overlay; opacity: 0.55;
}
@keyframes card-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-100% 0} }

.unlock-brand { text-align: left; margin-bottom: 18px; }
.unlock-title {
  position: relative;
  font-family: Fraunces, Georgia, serif;
  font-size: 34px; letter-spacing: 8px; color: #f2eee7;
  text-shadow: 0 0 12px rgba(244,161,37,0.45), 0 0 2px rgba(122,212,255,0.35);
  animation: glitch-shake 2.6s infinite steps(1);
  will-change: transform, filter;
}
.unlock-title::before, .unlock-title::after {
  content: attr(data-text); position: absolute; top:0; left:0; width:100%; overflow: hidden;
  pointer-events: none;
}
.unlock-title::before { color:#f4a125; animation: glitch-1 1.6s infinite steps(1); clip-path: polygon(0 0,100% 0,100% 45%,0 45%); text-shadow: 2px 0 rgba(244,161,37,0.6); }
.unlock-title::after  { color:#7ad4ff; animation: glitch-2 2.1s infinite steps(1); clip-path: polygon(0 55%,100% 55%,100% 100%,0 100%); mix-blend-mode: screen; text-shadow: -2px 0 rgba(122,212,255,0.6); }
@keyframes glitch-shake {
  0%,100% { transform: translate(0,0); filter: none; }
  8%  { transform: translate(-1px,0); }
  16% { transform: translate(1px,-1px); filter: hue-rotate(-8deg); }
  22% { transform: translate(0,1px); }
  35% { transform: translate(-2px,0); filter: contrast(1.2); }
  38% { transform: translate(2px,0); }
  55% { transform: translate(0,0); }
  72% { transform: translate(1px,1px); filter: hue-rotate(6deg); }
  78% { transform: translate(-1px,0); }
}
@keyframes glitch-1 {
  0%,100% { transform: translate(0,0); opacity: 0; }
  6%  { transform: translate(-3px,0); opacity: .95; clip-path: polygon(0 0,100% 0,100% 45%,0 45%); }
  9%  { transform: translate(3px,0);  opacity: .85; clip-path: polygon(0 10%,100% 10%,100% 30%,0 30%); }
  12% { transform: translate(-2px,1px); opacity: .9;  clip-path: polygon(0 60%,100% 60%,100% 80%,0 80%); }
  15% { opacity: 0; }
  40% { transform: translate(4px,-1px); opacity: .8; clip-path: polygon(0 20%,100% 20%,100% 55%,0 55%); }
  43% { opacity: 0; }
  70% { transform: translate(-4px,2px); opacity: .9; clip-path: polygon(0 5%,100% 5%,100% 35%,0 35%); }
  73% { opacity: 0; }
}
@keyframes glitch-2 {
  0%,100% { transform: translate(0,0); opacity: 0; }
  5%  { transform: translate(3px,0);  opacity: .85; clip-path: polygon(0 55%,100% 55%,100% 100%,0 100%); }
  8%  { transform: translate(-3px,1px); opacity: .8; clip-path: polygon(0 70%,100% 70%,100% 92%,0 92%); }
  11% { opacity: 0; }
  32% { transform: translate(-4px,0); opacity: .9; clip-path: polygon(0 40%,100% 40%,100% 65%,0 65%); }
  35% { opacity: 0; }
  60% { transform: translate(5px,-1px); opacity: .8; clip-path: polygon(0 15%,100% 15%,100% 42%,0 42%); }
  63% { opacity: 0; }
  86% { transform: translate(-2px,2px); opacity: .95; clip-path: polygon(0 78%,100% 78%,100% 100%,0 100%); }
  89% { opacity: 0; }
}
.unlock-sub {
  margin-top: 6px; font-size: 10px; letter-spacing: 3px;
  color: rgba(182,188,200,0.7); text-transform: uppercase;
}

.unlock-tabs {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
  padding: 4px; border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(244,161,37,0.15);
  margin-bottom: 18px;
}
.unlock-tab {
  padding: 9px 10px; border-radius: 7px; border: 0;
  background: transparent; color: rgba(182,188,200,0.8);
  font-size: 12px; letter-spacing: 1px; text-transform: uppercase;
  cursor: pointer; transition: background .15s, color .15s;
  font-weight: 600;
}
.unlock-tab:hover { color: #f2eee7; }
.unlock-tab:focus-visible { outline: 2px solid #f4a125; outline-offset: 2px; }
.unlock-tab.is-active {
  background: linear-gradient(180deg, rgba(244,161,37,.18), rgba(221,147,36,.10));
  color: #f2eee7;
  box-shadow: inset 0 0 0 1px rgba(244,161,37,0.35);
}

.unlock-headline {
  font-family: Fraunces, Georgia, serif;
  font-size: 20px; line-height: 1.25; letter-spacing: .2px;
  color: #f2eee7; margin: 4px 0 14px;
}
.unlock-headline.compact { font-size: 18px; margin-bottom: 10px; }

.unlock-price { display: flex; align-items: baseline; gap: 6px; margin-top: 2px; }
.price-amount { font-family: Fraunces, Georgia, serif; font-size: 40px; color: #f4a125; letter-spacing: 1px; }
.price-cadence { font-size: 13px; color: rgba(182,188,200,0.85); letter-spacing: 1px; }
.unlock-allowance {
  margin: 6px 0 16px; font-size: 12.5px; line-height: 1.55;
  color: rgba(182,188,200,0.9);
}
.unlock-allowance strong { color: #f2eee7; }

.unlock-btn {
  width: 100%; padding: 13px 14px; border-radius: 10px; border: 1px solid #dd9324;
  background: linear-gradient(180deg, #f4a125 0%, #dd9324 100%);
  color: #0a0a0a; font-weight: 700; font-size: 13px; letter-spacing: 2px;
  cursor: pointer; text-transform: uppercase; transition: transform .15s, box-shadow .2s;
}
.unlock-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(244,161,37,0.35); }
.unlock-btn:focus-visible { outline: 2px solid #f4a125; outline-offset: 3px; }
.unlock-btn:disabled { opacity: .6; cursor: wait; }

.unlock-btn-secondary {
  display: block; width: 100%; margin-top: 10px; padding: 10px;
  background: transparent; color: rgba(182,188,200,0.85);
  border: 1px solid rgba(244,161,37,0.22); border-radius: 10px;
  font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase;
  cursor: pointer; transition: color .15s, border-color .15s;
}
.unlock-btn-secondary:hover { color: #f2eee7; border-color: rgba(244,161,37,0.45); }
.unlock-btn-secondary:focus-visible { outline: 2px solid #f4a125; outline-offset: 3px; }

.unlock-disclosure {
  display: block; width: 100%; margin-top: 14px; padding: 8px;
  background: transparent; border: 0; color: rgba(182,188,200,0.6);
  font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer;
}
.unlock-disclosure:hover { color: #f4a125; }
.unlock-disclosure:focus-visible { outline: 2px solid #f4a125; outline-offset: 2px; border-radius: 4px; }

.unlock-details { margin-top: 6px; border-top: 1px solid rgba(244,161,37,0.15); padding-top: 14px; }
.detail-block { margin-bottom: 14px; }
.detail-block h3 {
  font-family: Fraunces, Georgia, serif;
  font-size: 13px; color: #f4a125; letter-spacing: 1px;
  margin: 0 0 6px; text-transform: uppercase;
}
.detail-block ul, .detail-block ol { margin: 0; padding-left: 18px; }
.detail-block li, .detail-block p {
  font-size: 12px; line-height: 1.6; color: rgba(182,188,200,0.9); margin: 2px 0;
}
.detail-trust {
  margin-top: 8px; font-size: 11.5px; letter-spacing: .5px;
  color: rgba(182,188,200,0.7); text-align: center;
}

.tier-grid { display: grid; gap: 10px; margin-top: 4px; }
.tier-row {
  border: 1px solid rgba(244,161,37,0.18); border-radius: 10px;
  padding: 10px 12px; background: rgba(0,0,0,0.35);
}
.tier-row.is-featured {
  border-color: rgba(244,161,37,0.5);
  box-shadow: 0 0 0 1px rgba(244,161,37,0.15), 0 0 24px rgba(244,161,37,0.08);
}
.tier-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  margin-bottom: 2px;
}
.tier-name {
  font-family: Fraunces, Georgia, serif; font-size: 14px; color: #f2eee7;
  letter-spacing: .5px;
}
.tier-price { font-size: 14px; color: #f4a125; font-weight: 600; }
.tier-cadence { font-size: 11px; color: rgba(244,161,37,0.6); margin-left: 2px; }
.tier-headline { font-size: 12px; color: rgba(242,238,231,0.85); margin-bottom: 2px; }
.tier-bestfor { font-size: 11px; color: rgba(182,188,200,0.7); margin-bottom: 4px; font-style: italic; }
.tier-outcomes { margin: 0; padding-left: 16px; }
.tier-outcomes li { font-size: 11.5px; line-height: 1.5; color: rgba(182,188,200,0.85); }

.unlock-legal {
  margin-top: 14px; text-align: center;
  font-size: 11px; color: rgba(182,188,200,0.55); letter-spacing: 1px;
}
.unlock-legal a { color: rgba(182,188,200,0.75); text-decoration: underline; text-underline-offset: 3px; }
.unlock-legal a:hover { color: #f4a125; }

.unlock-code-form { margin-top: 4px; }
.unlock-label {
  display: block; font-size: 10px; letter-spacing: 2px;
  text-transform: uppercase; color: rgba(182,188,200,0.75); margin-bottom: 8px;
}
.unlock-input {
  width: 100%; padding: 12px 14px; border-radius: 10px;
  border: 1px solid rgba(244,161,37,0.25); background: rgba(0,0,0,0.65);
  color: #f4a125; font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 18px; letter-spacing: 8px; outline: none;
  transition: border-color .2s, box-shadow .2s; margin-bottom: 12px;
}
.unlock-input:focus { border-color: #f4a125; box-shadow: 0 0 0 3px rgba(244,161,37,0.15), 0 0 24px rgba(244,161,37,0.2); }

.unlock-status { margin: 8px 0; font-size: 12px; color: #7ad4ff; letter-spacing: .5px; }
.unlock-error { margin: 8px 0; font-size: 12px; color: #f4a125; letter-spacing: .5px; }

.unlock-checkout { }
.checkout-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  margin-bottom: 12px;
}
.checkout-title { font-family: Fraunces, Georgia, serif; font-size: 16px; color: #f2eee7; }
.checkout-sub { font-size: 11px; color: rgba(182,188,200,0.7); margin-top: 2px; }
.checkout-signout {
  display: block; margin-top: 4px; background: transparent; border: 0; padding: 0;
  color: rgba(244,161,37,0.75); font-size: 11px; text-decoration: underline; cursor: pointer;
}
.checkout-back {
  background: transparent; color: rgba(182,188,200,0.75); border: 1px solid rgba(244,161,37,0.2);
  border-radius: 8px; padding: 6px 10px; font-size: 11px; letter-spacing: 1px; cursor: pointer;
}
.checkout-back:hover { color: #f2eee7; border-color: rgba(244,161,37,0.45); }
.checkout-legal { margin-top: 12px; font-size: 11px; color: rgba(182,188,200,0.6); text-align: center; }
.checkout-legal a { color: rgba(182,188,200,0.8); text-decoration: underline; }

.unlock-foot {
  margin-top: 20px; text-align: center; font-family: Fraunces, Georgia, serif;
  font-size: 11px; letter-spacing: 4px; color: rgba(244,161,37,0.55); text-transform: uppercase;
}

@media (max-width: 480px) {
  .unlock-card { padding: 22px 18px 18px; }
  .unlock-title { font-size: 26px; letter-spacing: 5px; }
  .price-amount { font-size: 34px; }
  .unlock-headline { font-size: 18px; }
}

.unlock-demos {
  position: relative;
  width: 100%;
  max-width: 1100px;
  margin: 40px auto 8px;
  padding: 0 8px;
}
.demos-header { text-align: center; margin-bottom: 18px; }
.demos-title {
  font-family: Fraunces, Georgia, serif;
  font-size: 22px; letter-spacing: 0.5px; color: #f2eee7; margin: 0;
}
.demos-sub { margin: 6px 0 0; font-size: 12px; color: #B6BCC8; }
.demo-chips {
  display: flex; flex-wrap: wrap; gap: 8px;
  justify-content: center; margin: 0 0 18px;
}
.demo-chip {
  appearance: none; cursor: pointer;
  padding: 6px 12px; border-radius: 999px;
  font: 500 12px/1 Inter, system-ui, sans-serif;
  letter-spacing: 0.3px; color: #B6BCC8;
  background: rgba(17,19,23,0.7);
  border: 1px solid rgba(244,161,37,0.22);
  transition: color .15s ease, border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.demo-chip:hover { color: #f2eee7; border-color: rgba(244,161,37,0.45); }
.demo-chip.is-active {
  color: #111317; background: #f4a125;
  border-color: #f4a125;
  box-shadow: 0 0 0 1px rgba(244,161,37,0.35), 0 6px 18px rgba(244,161,37,0.25);
}
.demo-chip:focus-visible { outline: 2px solid #f4a125; outline-offset: 2px; }
.demos-grid {
  display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}
.demo-card {
  position: relative; display: block; text-decoration: none;
  background: rgba(8,8,10,0.7);
  border: 1px solid rgba(244,161,37,0.22);
  border-radius: 12px; overflow: hidden;
  transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.demo-card:hover {
  transform: translateY(-2px);
  border-color: rgba(244,161,37,0.55);
  box-shadow: 0 16px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(244,161,37,0.15);
}
.demo-frame {
  position: relative; width: 100%; aspect-ratio: 16 / 10;
  background: #050607; overflow: hidden;
}
.demo-frame iframe {
  position: absolute; top: 0; left: 0;
  width: 200%; height: 200%;
  transform: scale(0.5); transform-origin: top left;
  border: 0; pointer-events: none;
  background: #050607;
}
.demo-scrim {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.6) 100%);
  pointer-events: none;
}
.demo-meta {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px;
  border-top: 1px solid rgba(244,161,37,0.15);
}
.demo-name { font-size: 12px; color: #f2eee7; letter-spacing: 0.3px; }
.demo-open { font-size: 11px; color: #F4A125; font-weight: 600; }

.unlock-architect {
  position: relative;
  width: 100%; max-width: 1100px;
  margin: 28px auto 60px;
  padding: 0 16px;
}
.architect-card {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 28px;
  align-items: center;
  background: rgba(8,8,10,0.72);
  border: 1px solid rgba(244,161,37,0.22);
  border-radius: 16px;
  padding: 24px;
  backdrop-filter: blur(14px);
  box-shadow: 0 20px 60px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05);
  transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
}
.architect-card:hover {
  border-color: rgba(244,161,37,0.45);
  box-shadow: 0 24px 70px rgba(0,0,0,0.75), 0 0 0 1px rgba(244,161,37,0.12);
}
.architect-portrait {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(244,161,37,0.2);
  background: #050607;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.architect-portrait img {
  display: block; width: 100%; height: auto;
  transition: transform .4s ease;
}
.architect-card:hover .architect-portrait img { transform: scale(1.03); }
.architect-body { text-align: left; }
.architect-title {
  font-family: Fraunces, Georgia, serif;
  font-size: 14px; letter-spacing: 2px; text-transform: uppercase;
  color: rgba(244,161,37,0.85); margin: 0 0 8px;
}
.architect-name {
  font-family: Fraunces, Georgia, serif;
  font-size: 28px; color: #f2eee7; margin: 0 0 6px;
  text-shadow: 0 0 18px rgba(244,161,37,0.25);
}
.architect-tagline {
  font-size: 13px; letter-spacing: 0.3px;
  color: rgba(182,188,200,0.85); margin: 0 0 14px;
}
.architect-quote {
  font-family: Georgia, serif;
  font-size: 15px; line-height: 1.55;
  color: rgba(242,238,231,0.92); font-style: italic;
  border-left: 2px solid rgba(244,161,37,0.45);
  padding-left: 14px; margin: 0 0 18px;
}
.architect-links {
  display: flex; flex-wrap: wrap; gap: 12px;
}
.architect-link {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 8px;
  border: 1px solid rgba(244,161,37,0.25);
  background: rgba(244,161,37,0.08);
  color: #f2eee7; font-size: 12px; letter-spacing: 0.5px;
  text-decoration: none; font-weight: 600;
  transition: background .15s, border-color .15s, color .15s;
}
.architect-link:hover {
  background: rgba(244,161,37,0.18);
  border-color: rgba(244,161,37,0.5);
  color: #fff;
}
.architect-link:focus-visible {
  outline: 2px solid #f4a125; outline-offset: 2px;
}

@media (max-width: 640px) {
  .architect-card {
    grid-template-columns: 1fr;
    text-align: center;
    gap: 20px;
  }
  .architect-portrait { max-width: 200px; margin: 0 auto; }
  .architect-body { text-align: center; }
  .architect-quote {
    border-left: 0; border-top: 2px solid rgba(244,161,37,0.45);
    padding-left: 0; padding-top: 12px;
  }
  .architect-links { justify-content: center; }
}
`;
