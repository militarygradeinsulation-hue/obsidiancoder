import { createFileRoute, redirect, useRouter, Link, ClientOnly } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent } from "react";

const AnomalousMatterScene = lazy(() => import("@/components/AnomalousMatterScene"));
import { unlockSite, unlockIfPro } from "@/lib/gate.functions";
import { supabase } from "@/integrations/supabase/client";
import { CheckoutSurface } from "@/components/CheckoutSurface";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
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
  { slug: "1i3r07161s0q6h", title: "Demo · Obsidian Build 27", category: "Tool", url: "https://obsidianvibe.live/api/public/share/1i3r07161s0q6h#" },
  { slug: "1i54063l620y0h", title: "Demo · Obsidian Build 28", category: "App", url: "https://obsidianvibe.live/api/public/share/1i54063l620y0h" },
  { slug: "6j0m0l1y016p44", title: "Demo · Obsidian Build 29", category: "App", url: "https://obsidianvibe.live/api/public/share/6j0m0l1y016p44" },
];

type Intent = "buy" | "code";

export const Route = createFileRoute("/unlock")({
  validateSearch: (s: Record<string, unknown>) => ({
    password: typeof s.password === "string" ? s.password : undefined,
    intent: (s.intent === "buy" || s.intent === "code" ? s.intent : undefined) as Intent | undefined,
    checkout: s.checkout === "1" ? "1" : undefined,
    priceId: typeof s.priceId === "string" && /^[a-zA-Z0-9_-]+$/.test(s.priceId) ? s.priceId : undefined,
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
      { title: "Unlock Obsidian Access — Obsidian" },
      { name: "description", content: "Start Obsidian Creator for $79/month or enter your access code. Build production-ready software with an AI engineering team." },
      { property: "og:title", content: "Unlock Obsidian Access — Obsidian" },
      { property: "og:description", content: "Build production-ready software with an AI engineering team. $79/month, 1,000 AI credits per billing period." },
      { property: "og:url", content: "https://obsidianvibe.live/unlock" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Unlock Obsidian Access — Obsidian" },
      { name: "twitter:description", content: "Start Obsidian Creator for $79/month or enter your access code." },
    ],
    links: [{ rel: "canonical", href: "https://obsidianvibe.live/unlock" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: "Obsidian Creator",
          brand: { "@type": "Brand", name: "Obsidian" },
          description: "Obsidian Creator plan — build production-ready software with an AI engineering team. Includes 1,000 AI credits per billing period.",
          offers: {
            "@type": "Offer",
            price: "79",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: "https://obsidianvibe.live/unlock",
          },
        }),
      },
    ],
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
  const [selectedPriceId, setSelectedPriceId] = useState<string>(
    search.priceId && typeof search.priceId === "string" ? search.priceId : CREATOR_PRICE_ID,
  );
  const [expandDetails, setExpandDetails] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [demoCategory, setDemoCategory] = useState<DemoCategory | "All">("All");
  const [demosOpen, setDemosOpen] = useState(false);
  const [waitlistTier, setWaitlistTier] = useState<string | null>(null);
  const [featuredDemos, setFeaturedDemos] = useState<{ slug: string; title: string; url?: string; category: DemoCategory }[]>([]);

  // Load admin-curated demos so newly promoted builds appear without a code edit.
  useEffect(() => {
    let alive = true;
    supabase
      .from("featured_demos")
      .select("slug, title, category, url")
      .order("sort_order", { ascending: false })
      .limit(60)
      .then(({ data }) => {
        if (!alive || !data) return;
        setFeaturedDemos(
          data.map((d) => ({
            slug: d.slug,
            title: d.title,
            url: d.url ?? undefined,
            category: (DEMO_CATEGORIES as readonly string[]).includes(d.category) ? (d.category as DemoCategory) : "App",
          })),
        );
      });
    return () => { alive = false; };
  }, []);


  // Track auth session
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession((prev) => {
        const next = data.session
          ? { userId: data.session.user.id, email: data.session.user.email ?? null }
          : null;
        if (prev?.userId === next?.userId && prev?.email === next?.email) return prev;
        return next;
      });
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession((prev) => {
        const next = s ? { userId: s.user.id, email: s.user.email ?? null } : null;
        // Avoid triggering downstream effects on TOKEN_REFRESHED / repeated INITIAL_SESSION
        // events that carry the same user — those otherwise re-run the Pro-unlock effect
        // and can navigate the page mid-scroll, causing a visible scroll reset.
        if (prev?.userId === next?.userId && prev?.email === next?.email) return prev;
        return next;
      });
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
  }, [session?.userId, proUnlock, router]);


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

  function startPurchase(priceId: string = CREATOR_PRICE_ID) {
    setError(null);
    setSelectedPriceId(priceId);
    if (!session) {
      // Send to auth in signup mode, then return here with checkout=1 and the chosen tier.
      const q = `intent=buy&checkout=1&priceId=${encodeURIComponent(priceId)}`;
      window.location.assign(buildAuthUrl("signup", `/unlock?${q}`));
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

      <div aria-hidden className="unlock-scene">
        <ClientOnly fallback={null}>
          <Suspense fallback={null}>
            <AnomalousMatterScene className="unlock-scene-canvas" />
          </Suspense>
        </ClientOnly>
      </div>


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

      <nav className="unlock-topbar" aria-label="Primary">
        <a href="#top" className="unlock-topbar-brand" aria-label="Obsidian home">
          <span className="unlock-topbar-mark">◆</span>
          <span className="unlock-topbar-name">OBSIDIAN</span>
        </a>
        <div className="unlock-topbar-links">
          <button type="button" className="unlock-topbar-link" onClick={() => { setTab("buy"); setPlansOpen(true); requestAnimationFrame(() => document.getElementById("plans-heading")?.scrollIntoView({ behavior: "smooth", block: "center" })); }}>Pricing</button>
          <button type="button" className="unlock-topbar-link" onClick={() => { setDemosOpen(true); requestAnimationFrame(() => document.getElementById("demos-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>Live Demos</button>
          <button type="button" className="unlock-topbar-link" onClick={() => setTab("code")}>Access Code</button>
          <button type="button" className="unlock-topbar-cta" onClick={goSignIn}>Sign in</button>
        </div>
      </nav>

      <main className="unlock-card" role="main" aria-labelledby="unlock-heading" id="top">
        <div className="unlock-card-glow" aria-hidden />

        <header className="unlock-brand">
          <h1 id="unlock-heading" className="unlock-title" data-text="OBSIDIAN">OBSIDIAN</h1>
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
                <h2 className="unlock-headline">Think it, Type it, See it.</h2>
                <p className="unlock-subheadline">A tool builder for people that can&apos;t code.</p>

                <div className="unlock-price">
                  <span className="price-amount">$49</span>
                  <span className="price-cadence">/month</span>
                  <span className="price-strike">$79</span>
                </div>
                <p className="unlock-allowance">
                  <strong style={{ color: "#F4A125" }}>Founding Member Pricing</strong> — first 100 Creator members lock in $49/month for life.
                  Includes <strong>{CAP_PRO_MONTHLY.toLocaleString()} AI credits</strong> each billing period.
                </p>

                {status && <div className="unlock-status" role="status">{status}</div>}
                {error && <div role="alert" className="unlock-error">⚠ {error}</div>}

                <button
                  type="button"
                  className="unlock-btn unlock-btn-primary"
                  onClick={() => startPurchase(CREATOR_PRICE_ID)}
                  disabled={sessionLoading}
                >
                  {sessionLoading ? "…" : session ? "Continue to Secure Checkout" : "Start Obsidian Creator — $49/month"}
                </button>

                <div className="plans-block" aria-labelledby="plans-heading">
                  <button
                    type="button"
                    className="plans-toggle"
                    aria-expanded={plansOpen}
                    aria-controls="plans-grid"
                    onClick={() => setPlansOpen((v) => !v)}
                  >
                    <span className="plans-toggle-label">
                      <span id="plans-heading" className="plans-title">Compare all plans</span>
                      <span className="plans-toggle-sub">Starter · Creator · Professional · Business · Elite</span>
                    </span>
                    <span className="plans-toggle-caret" aria-hidden>{plansOpen ? "▲" : "▼"}</span>
                  </button>
                  {plansOpen && (
                    <div id="plans-grid" className="tier-grid">
                      {PLAN_TIERS.map((t) => (
                        <div key={t.id} className={`tier-row ${t.featured ? "is-featured" : ""}`}>
                          {t.featured && <div className="tier-badge">Most Popular</div>}
                          <div className="tier-head">
                            <span className="tier-name">{t.name}</span>
                            <span className="tier-price">
                              {t.price}
                              {t.originalPrice && <span className="tier-price-strike">{t.originalPrice}</span>}
                              <span className="tier-cadence">{t.cadence}</span>
                            </span>
                          </div>
                          {t.founding && (
                            <div className="tier-founding">Founding Member · First 100 · locked in for life</div>
                          )}
                          <div className="tier-headline">{t.headline}</div>
                          <ul className="tier-outcomes">
                            {t.outcomes.map((o) => <li key={o}>• {o}</li>)}
                          </ul>
                          {t.cta === "checkout" && t.priceId ? (
                            <button
                              type="button"
                              className="tier-cta tier-cta-primary"
                              onClick={() => startPurchase(t.priceId!)}
                              disabled={sessionLoading}
                            >
                              {session ? `Choose ${t.name}` : `Buy ${t.name}`}
                            </button>
                          ) : (
                            <a
                              className="tier-cta tier-cta-locked"
                              href="mailto:hello@aetheris.technology?subject=Obsidian%20Enterprise%20inquiry"
                            >
                              Contact sales
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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
                        <li><strong>Multi-provider AI with automatic failover.</strong> Google Gemini and OpenAI GPT — plus Leonardo, Higgsfield, and Gemini for images. If one provider fails or rate-limits, Obsidian switches mid-request and refunds credits when nothing was delivered.</li>
                        <li><strong>Your library, cross-device.</strong> Builds, saved ideas, and version history follow you across browsers via your private library code — no lock-in, exportable at any time.</li>
                        <li><strong>Real deploys.</strong> One-click Go Live, GitHub repo + Pages integration, and shareable public URLs baked in.</li>
                      </ul>
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
                    <div className="checkout-title">
                      {PLAN_TIERS.find((t) => t.priceId === selectedPriceId)?.name ?? "Obsidian"}
                    </div>
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
                  priceId={selectedPriceId}
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

        <div
          className="unlock-foot"
          onClick={(e) => {
            const el = e.currentTarget as HTMLElement & { _c?: number; _t?: number };
            const now = Date.now();
            if (!el._t || now - el._t > 1200) el._c = 0;
            el._t = now;
            el._c = (el._c ?? 0) + 1;
            if (el._c >= 3) { el._c = 0; window.location.assign("/demos"); }
          }}
          title="OBSIDIAN"
          style={{ cursor: "default", userSelect: "none" }}
        >OBSIDIAN</div>
        <Link to="/demos" aria-label="Admin portal" className="unlock-backdoor" title="Admin">·</Link>
      </main>

      <section className="unlock-demos" aria-labelledby="demos-heading" id="demos-anchor">
        <div className="demos-header">
          <h2 id="demos-heading" className="demos-title">Live Demos</h2>
          <p className="demos-sub">Explore builds crafted with Obsidian. View-only — the vibe coder requires access.</p>
          <button
            type="button"
            className="demos-toggle"
            aria-expanded={demosOpen || demoCategory !== "All"}
            aria-controls="demos-grid"
            onClick={() => {
              const next = !(demosOpen || demoCategory !== "All");
              setDemosOpen(next);
              if (!next) setDemoCategory("All");
            }}
          >
            {(demosOpen || demoCategory !== "All") ? "Hide gallery ▲" : "Show gallery ▼"}
          </button>
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
                onClick={() => {
                  setDemoCategory(cat);
                  if (cat !== "All") setDemosOpen(true);
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
        {(demosOpen || demoCategory !== "All") && (
          <div id="demos-grid" className="demos-grid">
            {Array.from(
              new Map(
                [...featuredDemos, ...DEMOS].map((d) => {
                  const demoUrl = d.url ?? `/api/public/share/${d.slug}`;
                  return [demoUrl, { ...d, demoUrl }] as const;
                })
              ).values()
            ).map(({ slug, title, demoUrl, category }) => {
              const hidden = demoCategory !== "All" && category !== demoCategory;
              return (
                <a
                  key={slug}
                  href={demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="demo-card"
                  data-hidden={hidden ? "true" : undefined}
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
              );
            })}
          </div>
        )}
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

      {waitlistTier && (
        <WaitlistModal
          tier={waitlistTier}
          onClose={() => setWaitlistTier(null)}
        />
      )}
    </div>
  );
}

function WaitlistModal({ tier, onClose }: { tier: string; onClose: () => void }) {
  const selected = PLAN_TIERS.find((t) => t.id === tier);
  const selectedLabel = selected ? `${selected.name} — ${selected.price}${selected.cadence}` : "Any plan";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [use, setUse] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "pay">("form");
  const [remaining, setRemaining] = useState<number | null>(null);

  // Load remaining early-access spots so users see scarcity before paying.
  useEffect(() => {
    let alive = true;
    import("@/utils/payments.functions").then(({ getWhitelistStatus }) =>
      getWhitelistStatus().then((s) => { if (alive) setRemaining(s.remaining); }).catch(() => {}),
    );
    return () => { alive = false; };
  }, []);

  const full = remaining !== null && remaining <= 0;

  async function goToPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null);
    // Basic client-side sanity — server re-validates.
    if (!name.trim() || !email.trim()) { setErr("Name and email are required."); setBusy(false); return; }
    setPhase("pay");
    setBusy(false);
  }

  async function fetchClientSecret(): Promise<string> {
    const { createWhitelistCheckout } = await import("@/utils/payments.functions");
    const { getStripeEnvironment } = await import("@/lib/stripe");
    const result = await createWhitelistCheckout({
      data: {
        name: name.trim(),
        email: email.trim(),
        company: company.trim(),
        intended_use: use.trim(),
        interest_level: "ready",
        tier,
        returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}&whitelist=1`,
        environment: getStripeEnvironment(),
      },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Stripe did not return a client secret");
    if (typeof result.remaining === "number") setRemaining(result.remaining);
    return result.clientSecret;
  }

  return (
    <div className="wl-overlay" role="dialog" aria-modal="true" aria-labelledby="wl-title" onClick={onClose}>
      <div className="wl-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="wl-close" onClick={onClose} aria-label="Close">×</button>
        {phase === "pay" ? (
          <>
            <h3 id="wl-title" className="wl-title">Reserve your whitelist spot — $100</h3>
            <p className="wl-sub">
              One-time payment to lock in your early-access spot for {selectedLabel}. Non-refundable.
              {remaining !== null && remaining > 0 && (
                <> Only <strong style={{ color: "#f4a125" }}>{remaining}</strong> of 1,000 spots left.</>
              )}
            </p>
            <div className="wl-checkout">
              <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
            <button type="button" className="unlock-btn unlock-btn-secondary" onClick={() => setPhase("form")}>
              ← Edit details
            </button>
          </>
        ) : (
          <>
            <h3 id="wl-title" className="wl-title">Reserve Early Access — $100</h3>
            <p className="wl-sub">
              First 1,000 members lock in a lifetime early-access spot. One-time $100 payment,
              refunded only if we cannot honor your reservation.
              {remaining !== null && (
                <> <strong style={{ color: "#f4a125" }}>{remaining}</strong> / 1,000 spots left.</>
              )}
            </p>
            <div className="wl-selected" aria-live="polite">
              <span className="wl-selected-label">Selected plan</span>
              <strong className="wl-selected-value">{selectedLabel}</strong>
            </div>
            <form onSubmit={goToPayment} className="wl-form">
              <label className="wl-label">Name
                <input required maxLength={200} className="wl-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </label>
              <label className="wl-label">Email
                <input required type="email" maxLength={320} className="wl-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              <label className="wl-label">Company <span className="wl-optional">(optional)</span>
                <input maxLength={200} className="wl-input" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
              </label>
              <label className="wl-label">Intended use <span className="wl-optional">(optional)</span>
                <textarea maxLength={2000} rows={3} className="wl-input wl-textarea" value={use} onChange={(e) => setUse(e.target.value)} />
              </label>
              {err && <div role="alert" className="unlock-error">⚠ {err}</div>}
              <button type="submit" disabled={busy || full} className="unlock-btn unlock-btn-primary">
                {full ? "Whitelist is full" : busy ? "Loading…" : "Continue to $100 payment →"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}



const unlockCss = `
.unlock-root {
  position: relative;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  background: #000;
  color: #f2eee7;
  font-family: Inter, system-ui, sans-serif;
  padding: 24px 16px;
  overflow-x: hidden;
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
.unlock-scene {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  display: grid;
  place-items: center;
}
.unlock-scene-canvas {
  width: min(920px, 92vmin);
  height: min(920px, 92vmin);
  filter: drop-shadow(0 0 60px rgba(244,161,37,0.25));
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
  width: 100%; max-width: min(1400px, 96vw);
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
  font-size: 34px; letter-spacing: 8px; color: #c9761f;
  text-shadow: 0 0 12px rgba(201,118,31,0.55), 0 0 2px rgba(201,118,31,0.4);
  animation: glitch-shake 2.6s infinite steps(1);
  will-change: transform, filter;
}
.unlock-title::before, .unlock-title::after {
  content: attr(data-text); position: absolute; top:0; left:0; width:100%; overflow: hidden;
  pointer-events: none; color: #c9761f;
}
.unlock-title::before { animation: glitch-1 1.6s infinite steps(1); clip-path: polygon(0 0,100% 0,100% 45%,0 45%); text-shadow: 2px 0 rgba(201,118,31,0.7); }
.unlock-title::after  { animation: glitch-2 2.1s infinite steps(1); clip-path: polygon(0 55%,100% 55%,100% 100%,0 100%); text-shadow: -2px 0 rgba(201,118,31,0.7); }
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
.unlock-subheadline {
  font-family: Inter, system-ui, sans-serif;
  font-size: 13.5px; line-height: 1.45;
  color: rgba(182,188,200,0.95); margin: -8px 0 16px;
}

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

.tier-grid {
  display: grid; gap: 10px; margin-top: 4px;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}
@media (max-width: 1100px) { .tier-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px)  { .tier-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tier-row {
  border: 1px solid rgba(244,161,37,0.18); border-radius: 10px;
  padding: 10px 10px; background: rgba(0,0,0,0.35);
  display: flex; flex-direction: column; min-width: 0;
}
.tier-row.is-featured {
  border-color: rgba(244,161,37,0.5);
  box-shadow: 0 0 0 1px rgba(244,161,37,0.15), 0 0 24px rgba(244,161,37,0.08);
}
.tier-head {
  display: flex; flex-direction: column; gap: 2px; margin-bottom: 4px;
}
.tier-name {
  font-family: Fraunces, Georgia, serif; font-size: 13px; color: #f2eee7;
  letter-spacing: .3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tier-price { font-size: 15px; color: #f4a125; font-weight: 600; }
.tier-cadence { font-size: 10px; color: rgba(244,161,37,0.6); margin-left: 2px; }
.tier-headline { font-size: 11px; color: rgba(242,238,231,0.75); margin-bottom: 6px; line-height: 1.35; }
.tier-bestfor, .tier-outcomes { display: none; }
.tier-row .tier-cta { margin-top: auto; font-size: 11px; padding: 7px 8px; }


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
  .unlock-subheadline { font-size: 12.5px; margin: -6px 0 14px; }
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
.demos-toggle {
  margin-top: 12px;
  padding: 8px 18px;
  background: rgba(244,161,37,0.08);
  border: 1px solid rgba(244,161,37,0.35);
  color: #F4A125;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.demos-toggle:hover { background: rgba(244,161,37,0.16); border-color: rgba(244,161,37,0.6); }
.demos-toggle:focus-visible { outline: 2px solid #f4a125; outline-offset: 2px; }
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
  overflow-anchor: auto;
}
.demo-card[data-hidden="true"] { display: none; }

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
  width: 100%; max-width: 1200px;
  margin: 40px auto 80px;
  padding: 0 20px;
}
.architect-card {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 36px;
  align-items: center;
  background: rgba(8,8,10,0.78);
  border: 1px solid rgba(244,161,37,0.28);
  border-radius: 20px;
  padding: 32px;
  backdrop-filter: blur(18px);
  box-shadow:
    0 28px 80px rgba(0,0,0,0.72),
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 0 0 1px rgba(244,161,37,0.08);
  transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
}
.architect-card:hover {
  transform: translateY(-4px);
  border-color: rgba(244,161,37,0.55);
  box-shadow:
    0 34px 90px rgba(0,0,0,0.82),
    0 0 0 1px rgba(244,161,37,0.18),
    0 0 40px rgba(244,161,37,0.12);
}
.architect-portrait {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(244,161,37,0.25);
  background: #050607;
  box-shadow: 0 16px 45px rgba(0,0,0,0.6);
}
.architect-portrait::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 16px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
  pointer-events: none;
}
.architect-portrait img {
  display: block; width: 100%; height: auto;
  transition: transform .45s ease;
}
.architect-card:hover .architect-portrait img { transform: scale(1.04); }
.architect-body { text-align: left; }
.architect-title {
  font-family: Fraunces, Georgia, serif;
  font-size: 17px; letter-spacing: 2.5px; text-transform: uppercase;
  color: rgba(244,161,37,0.92); margin: 0 0 10px;
}
.architect-name {
  font-family: Fraunces, Georgia, serif;
  font-size: 40px; color: #f2eee7; margin: 0 0 8px;
  text-shadow: 0 0 24px rgba(244,161,37,0.3);
}
.architect-tagline {
  font-size: 16px; letter-spacing: 0.4px;
  color: rgba(182,188,200,0.9); margin: 0 0 18px;
}
.architect-quote {
  font-family: Georgia, serif;
  font-size: 19px; line-height: 1.65;
  color: rgba(242,238,231,0.95); font-style: italic;
  border-left: 3px solid rgba(244,161,37,0.55);
  padding-left: 18px; margin: 0 0 22px;
}
.architect-links {
  display: flex; flex-wrap: wrap; gap: 14px;
}
.architect-link {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 11px 18px; border-radius: 10px;
  border: 1px solid rgba(244,161,37,0.3);
  background: rgba(244,161,37,0.1);
  color: #f2eee7; font-size: 14px; letter-spacing: 0.6px;
  text-decoration: none; font-weight: 600;
  transition: background .18s, border-color .18s, color .18s, transform .18s;
}
.architect-link:hover {
  background: rgba(244,161,37,0.22);
  border-color: rgba(244,161,37,0.6);
  color: #fff;
  transform: translateY(-2px);
}
.architect-link:focus-visible {
  outline: 2px solid #f4a125; outline-offset: 2px;
}

@media (max-width: 800px) {
  .architect-card {
    grid-template-columns: 1fr;
    text-align: center;
    gap: 24px;
    padding: 26px;
  }
  .architect-portrait { max-width: 260px; margin: 0 auto; }
  .architect-body { text-align: center; }
  .architect-name { font-size: 32px; }
  .architect-quote {
    border-left: 0; border-top: 3px solid rgba(244,161,37,0.55);
    padding-left: 0; padding-top: 16px;
  }
  .architect-links { justify-content: center; }
}
@media (max-width: 480px) {
  .architect-card { padding: 20px; }
  .architect-name { font-size: 26px; }
  .architect-tagline { font-size: 14px; }
  .architect-quote { font-size: 16px; }
  .architect-link { font-size: 13px; padding: 9px 14px; }
}
.plans-block { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(244,161,37,0.15); }
.plans-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.plans-title { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #f4a125; margin: 0; }
.plans-toggle {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0,1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: linear-gradient(180deg, rgba(244,161,37,0.08), rgba(244,161,37,0.02));
  border: 1px solid rgba(244,161,37,0.28);
  border-radius: 12px;
  color: #f2eee7;
  cursor: pointer;
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}
.plans-toggle:hover { border-color: rgba(244,161,37,0.55); background: linear-gradient(180deg, rgba(244,161,37,0.14), rgba(244,161,37,0.04)); }
.plans-toggle-label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.plans-toggle-sub { font-size: 12px; color: rgba(242,238,231,0.65); letter-spacing: 0.02em; }
.plans-toggle-caret { color: #f4a125; font-size: 14px; }
.plans-toggle + .tier-grid { margin-top: 14px; }
.unlock-topbar {
  position: sticky; top: 0; z-index: 5;
  width: 100%; max-width: min(1400px, 96vw);
  margin: 0 auto 14px;
  display: grid;
  grid-template-columns: minmax(0,1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(8,8,10,0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(244,161,37,0.22);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.5);
}
.unlock-topbar-brand { display: flex; align-items: center; gap: 10px; color: #f2eee7; text-decoration: none; min-width: 0; }
.unlock-topbar-mark { color: #f4a125; font-size: 18px; filter: drop-shadow(0 0 8px rgba(244,161,37,0.6)); }
.unlock-topbar-name { font-family: var(--font-display, inherit); letter-spacing: 0.24em; font-weight: 700; font-size: 14px; }
.unlock-topbar-links { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.unlock-topbar-link {
  background: transparent; border: 0; color: rgba(242,238,231,0.8);
  padding: 8px 12px; border-radius: 8px; cursor: pointer;
  font-size: 13px; letter-spacing: 0.04em;
  transition: color 140ms ease, background 140ms ease;
}
.unlock-topbar-link:hover { color: #f4a125; background: rgba(244,161,37,0.08); }
.unlock-topbar-cta {
  background: linear-gradient(180deg, #f4a125, #dd9324);
  color: #111317; border: 0; font-weight: 700;
  padding: 8px 14px; border-radius: 8px; cursor: pointer;
  letter-spacing: 0.04em; font-size: 13px;
  box-shadow: 0 6px 24px rgba(244,161,37,0.35);
}
.unlock-topbar-cta:hover { filter: brightness(1.05); }
@media (max-width: 640px) {
  .unlock-topbar { padding: 8px 10px; }
  .unlock-topbar-name { font-size: 12px; letter-spacing: 0.18em; }
  .unlock-topbar-link { padding: 6px 8px; font-size: 12px; }
}
.plans-sub { font-size: 11.5px; color: rgba(182,188,200,0.75); margin: 0 0 10px; }
.unlock-btn-whitelist {
  background: linear-gradient(180deg, #f4a125, #dd9324);
  color: #111317; border: 0; border-radius: 8px;
  padding: 8px 14px; font-weight: 700; font-size: 12px; letter-spacing: 0.06em;
  cursor: pointer; box-shadow: 0 6px 18px rgba(244,161,37,0.35);
}
.unlock-btn-whitelist:hover { filter: brightness(1.05); }
.tier-row.is-locked { opacity: 0.86; }
.tier-lock { font-size: 10px; color: rgba(244,161,37,0.55); font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; margin-left: 6px; }
.tier-cta {
  margin-top: 8px; width: 100%;
  border-radius: 8px; padding: 8px 10px; font-size: 12px; font-weight: 600;
  cursor: pointer; border: 1px solid transparent;
}
.tier-cta-primary { background: linear-gradient(180deg, #f4a125, #dd9324); color: #111317; }
.tier-cta-primary:hover { filter: brightness(1.05); }
.tier-cta-locked { background: transparent; color: #f4a125; border-color: rgba(244,161,37,0.35); }
.tier-cta-locked:hover { background: rgba(244,161,37,0.08); }
.tier-price-strike { color: rgba(182,188,200,0.55); text-decoration: line-through; font-size: 11px; margin-left: 6px; font-weight: 500; }
.tier-founding { color: #F4A125; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; margin: 2px 0 4px; }
.tier-badge { position: absolute; top: -8px; left: 12px; background: #F4A125; color: #111317; font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; }
.tier-row { position: relative; }
.tier-row.is-featured { border-color: rgba(244,161,37,0.55); box-shadow: 0 0 0 1px rgba(244,161,37,0.12); }
.tier-outcomes { list-style: none; padding: 0; margin: 6px 0 4px; display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #B6BCC8; }
.price-strike { color: rgba(182,188,200,0.55); text-decoration: line-through; font-size: 16px; margin-left: 10px; align-self: center; }
.tier-cta-disabled {
  background: rgba(255,255,255,0.03); color: rgba(182,188,200,0.4);
  border-color: rgba(182,188,200,0.12); cursor: not-allowed; pointer-events: none;
  text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px;
}
.tier-grid.is-disabled { filter: grayscale(0.85) brightness(0.55); opacity: 0.55; pointer-events: none; user-select: none; }
.tier-grid.is-disabled .tier-row { background: rgba(255,255,255,0.015); border-color: rgba(255,255,255,0.05); }
.plans-title-lock { color: rgba(182,188,200,0.45); font-weight: 400; letter-spacing: 0.08em; }

.whitelist-hero {
  position: relative;
  margin: 6px 0 18px;
  padding: 22px 20px 18px;
  border-radius: 16px;
  background: radial-gradient(120% 140% at 50% 0%, rgba(244,161,37,0.18), rgba(244,161,37,0.04) 55%, transparent 80%),
              linear-gradient(180deg, rgba(20,14,4,0.9), rgba(10,8,4,0.7));
  border: 1px solid rgba(244,161,37,0.35);
  box-shadow: 0 0 0 1px rgba(244,161,37,0.08) inset, 0 20px 60px -20px rgba(244,161,37,0.45), 0 0 80px -20px rgba(244,161,37,0.35);
  text-align: center;
  overflow: hidden;
}
.whitelist-hero::before {
  content: ""; position: absolute; inset: -40%;
  background: conic-gradient(from 0deg, transparent 0deg, rgba(244,161,37,0.18) 60deg, transparent 120deg, transparent 240deg, rgba(244,161,37,0.12) 300deg, transparent 360deg);
  animation: wl-orbit 8s linear infinite;
  pointer-events: none; z-index: 0;
}
.whitelist-hero > * { position: relative; z-index: 1; }
.whitelist-hero-eyebrow {
  font-size: 10.5px; letter-spacing: 0.22em; text-transform: uppercase;
  color: rgba(244,161,37,0.85); margin-bottom: 12px; font-weight: 600;
}
.whitelist-hero-cta {
  display: inline-flex; align-items: center; gap: 14px;
  font-size: 20px !important; padding: 16px 32px !important;
  letter-spacing: 0.08em !important; font-weight: 800 !important;
  border-radius: 12px !important;
  box-shadow: 0 0 0 1px rgba(255,220,150,0.4) inset,
              0 12px 40px rgba(244,161,37,0.55),
              0 0 60px rgba(244,161,37,0.45),
              0 0 120px rgba(244,161,37,0.25) !important;
  animation: wl-pulse 2.2s ease-in-out infinite;
  text-transform: uppercase;
}
.whitelist-hero-spark { font-size: 22px; animation: wl-spin 6s linear infinite; display: inline-block; }
.whitelist-hero-price {
  background: rgba(17,19,23,0.35); color: #111317;
  padding: 4px 10px; border-radius: 6px; font-size: 15px;
  border: 1px solid rgba(17,19,23,0.25);
}
.whitelist-hero-sub {
  margin: 14px 0 0; font-size: 12px; color: rgba(242,238,231,0.7); line-height: 1.5;
  max-width: 460px; margin-left: auto; margin-right: auto;
}
@keyframes wl-pulse {
  0%, 100% { transform: translateY(0) scale(1); box-shadow: 0 0 0 1px rgba(255,220,150,0.4) inset, 0 12px 40px rgba(244,161,37,0.55), 0 0 60px rgba(244,161,37,0.45), 0 0 120px rgba(244,161,37,0.25); }
  50% { transform: translateY(-2px) scale(1.02); box-shadow: 0 0 0 1px rgba(255,230,170,0.55) inset, 0 16px 50px rgba(244,161,37,0.7), 0 0 90px rgba(244,161,37,0.6), 0 0 160px rgba(244,161,37,0.35); }
}
@keyframes wl-orbit { to { transform: rotate(360deg); } }
@keyframes wl-spin { to { transform: rotate(360deg); } }


.wl-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.72); backdrop-filter: blur(6px);
  display: grid; place-items: center; padding: 20px;
}
.wl-card {
  position: relative; width: 100%; max-width: 520px; max-height: 92vh; overflow-y: auto;
  background: rgba(10,10,12,0.96); border: 1px solid rgba(244,161,37,0.35);
  border-radius: 14px; padding: 22px 22px 20px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.85);
  color: #f2eee7;
}
.wl-close { position: absolute; top: 8px; right: 12px; background: none; border: 0; color: #f2eee7; font-size: 22px; cursor: pointer; opacity: 0.7; }
.wl-close:hover { opacity: 1; }
.wl-title { font-size: 18px; margin: 0 0 6px; color: #f4a125; }
.wl-sub, .wl-body { font-size: 12.5px; color: rgba(242,238,231,0.8); margin: 0 0 14px; line-height: 1.5; }
.wl-form { display: flex; flex-direction: column; gap: 10px; }
.wl-label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(244,161,37,0.85); }
.wl-optional { color: rgba(182,188,200,0.55); text-transform: none; letter-spacing: 0; font-size: 10.5px; margin-left: 4px; }
.wl-input {
  background: rgba(0,0,0,0.55); border: 1px solid rgba(244,161,37,0.25);
  color: #f2eee7; border-radius: 8px; padding: 8px 10px; font-size: 13px;
  font-family: inherit;
}
.wl-input:focus { outline: none; border-color: #f4a125; box-shadow: 0 0 0 2px rgba(244,161,37,0.25); }
.wl-textarea { resize: vertical; min-height: 60px; }
.wl-selected {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 10px; margin: 0 0 12px;
  border: 1px solid rgba(244,161,37,0.3); border-radius: 8px;
  background: rgba(244,161,37,0.06);
}
.wl-selected-label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(244,161,37,0.75); }
.wl-selected-value { font-size: 13px; color: #f4a125; font-family: Fraunces, Georgia, serif; }
.wl-checkout { margin: 6px 0 12px; border-radius: 10px; overflow: hidden; }
.unlock-btn-secondary { background: transparent; border: 1px solid rgba(244,161,37,0.35); color: #f4a125; margin-top: 8px; }
.unlock-btn-secondary:hover { background: rgba(244,161,37,0.08); }
.unlock-backdoor {
  position: fixed; bottom: 10px; right: 12px; z-index: 90;
  width: 14px; height: 14px; border-radius: 50%;
  display: grid; place-items: center;
  color: rgba(244,161,37,0.15); text-decoration: none; font-size: 18px; line-height: 1;
  background: rgba(244,161,37,0.04); border: 1px solid rgba(244,161,37,0.12);
  transition: color .2s ease, background .2s ease, box-shadow .2s ease;
}
.unlock-backdoor:hover { color: #f4a125; background: rgba(244,161,37,0.15); box-shadow: 0 0 12px rgba(244,161,37,0.5); }
`;

