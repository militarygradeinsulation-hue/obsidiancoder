import { createFileRoute, redirect, useRouter, Link, ClientOnly } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent, type FormEvent } from "react";
import { ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const AnomalousMatterScene = lazy(() => import("@/components/AnomalousMatterScene"));
const GLSLHills = lazy(() => import("@/components/ui/glsl-hills"));
import SphereDemoGrid from "@/components/SphereDemoGrid";
import { unlockSite, unlockIfPro } from "@/lib/gate.functions";
import { setAccountCode } from "@/lib/account-code";
import { supabase } from "@/integrations/supabase/client";
import { CheckoutSurface } from "@/components/CheckoutSurface";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
import { CAP_PRO_MONTHLY } from "@/lib/credit-gate";
import { PLAN_TIERS } from "@/lib/plans";
import { buildAuthUrl } from "@/lib/redirect-safe";
import { submitFeedback } from "@/lib/feedback.functions";
import unlockBg from "@/assets/unlock-bg.mp4.asset.json";
import aetherisEmblem from "@/assets/aetheris-emblem.jpg.asset.json";
import vibeShot from "@/assets/workspace-vibe.png.asset.json";
import pocketShot from "@/assets/workspace-pocket.png.asset.json";
import PocketPromoModal from "@/components/PocketPromoModal";


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
  validateSearch: (s: Record<string, unknown>): {
    password?: string; intent?: Intent; checkout?: "1"; priceId?: string;
  } => ({
    password: typeof s.password === "string" ? s.password : undefined,
    intent: (s.intent === "buy" || s.intent === "code" ? s.intent : undefined) as Intent | undefined,
    checkout: s.checkout === "1" ? "1" : undefined,
    priceId: typeof s.priceId === "string" && /^[a-zA-Z0-9_-]+$/.test(s.priceId) ? s.priceId : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const pwd = (search as { password?: string }).password;
    if (!pwd) return;
    const { ok } = await unlockSite({ data: { password: pwd } });
    if (ok) throw redirect({ to: "/home" });
    throw redirect({ to: "/unlock" });
  },
  head: () => ({
    meta: [
      { title: "Build the software your business needs — Obsidian" },
      { name: "description", content: "Describe the tool your business needs and watch it get built. Work orders, quotes, intake forms, dashboards. Free daily builds, no card required." },
      { property: "og:title", content: "Build the software your business needs — Obsidian" },
      { property: "og:description", content: "Describe the tool your business needs and watch it get built. Free daily builds, no card. Vibe from $39/month." },
      { property: "og:url", content: "https://obsidianvibe.live/" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Build the software your business needs — Obsidian" },
      { name: "twitter:description", content: "Describe the tool your business needs and watch it get built. Free daily builds, no card required." },
    ],
    links: [{ rel: "canonical", href: "https://obsidianvibe.live/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: "Obsidian Vibe",
          brand: { "@type": "Brand", name: "Obsidian" },
          description: "Obsidian Vibe plan — build production-ready software with an AI engineering team. Includes 1,000 AI credits per billing period.",
          offers: {
            "@type": "Offer",
            price: "39",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: "https://obsidianvibe.live/",
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
  const [panelOpen, setPanelOpen] = useState<boolean>(
    search.checkout === "1" || search.intent === "buy" || search.intent === "code",
  );
  function openPanel(next: Intent) { setTab(next); setPanelOpen(true); }
  const [demoCategory, setDemoCategory] = useState<DemoCategory | "All">("All");
  const [demosOpen, setDemosOpen] = useState(false);
  const [waitlistTier, setWaitlistTier] = useState<string | null>(null);
  const [featuredDemos, setFeaturedDemos] = useState<{ slug: string; title: string; url?: string; category: DemoCategory }[]>([]);
  const [pocketExpanded, setPocketExpanded] = useState(false);

  // Community builds shared from Obsidian Pocket — shown right on the home
  // screen so visitors see real work without opening /library first.
  const [communityBuilds, setCommunityBuilds] = useState<
    { id: string; title: string; prompt: string; share_slug: string | null; remix_count: number; byte_size: number }[]
  >([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/public/community?limit=24")
      .then((r) => (r.ok ? r.json() : { builds: [] }))
      .then((j: { builds?: typeof communityBuilds }) => {
        if (alive && Array.isArray(j.builds)) setCommunityBuilds(j.builds.filter((b) => b.share_slug && b.byte_size > 900).slice(0, 8));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!pocketExpanded) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setPocketExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pocketExpanded]);

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
        // Collapse duplicates (same title or same target URL promoted twice).
        const seen = new Set<string>();
        const unique = data.filter((d) => {
          const key = (d.url || d.title || d.slug).toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setFeaturedDemos(
          unique.map((d) => ({
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
          await router.navigate({ to: "/home" });
          router.invalidate();
        }
      } catch { /* not pro or transport error — stay on page */ }
    })();
    return () => { cancelled = true; };
  }, [session?.userId, proUnlock, router]);


  async function onCodeSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    try {
      const { ok } = await unlock({ data: { password } });
      if (ok) {
        // The access code doubles as the person's library code, so their
        // saved projects follow them across browsers and devices.
        setAccountCode(password);
        await router.navigate({ to: "/home" });
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
            <GLSLHills className="unlock-hills-canvas" />
            <AnomalousMatterScene className="unlock-scene-canvas" />
          </Suspense>
        </ClientOnly>
      </div>



      <div aria-hidden className="unlock-noise" />

      <nav className="unlock-topbar" aria-label="Primary">
        <a href="#top" className="unlock-topbar-brand" aria-label="Obsidian home" onClick={() => setPanelOpen(false)}>
          <img src={aetherisEmblem.url} alt="Aetheris Business Forensics emblem" className="unlock-topbar-mark" width={28} height={28} />
          <span className="unlock-topbar-name">OBSIDIAN</span>
        </a>
        <div className="unlock-topbar-links">
          <a href="https://businessforensics.tech/aetheris-universe" target="_blank" rel="noopener noreferrer" className="unlock-topbar-link">Aetheris Universe</a>
          <button type="button" className="unlock-topbar-link" onClick={() => { openPanel("buy"); setPlansOpen(true); requestAnimationFrame(() => document.getElementById("plans-heading")?.scrollIntoView({ behavior: "smooth", block: "center" })); }}>Pricing</button>
          <button type="button" className="unlock-topbar-link" onClick={() => { setDemosOpen(true); requestAnimationFrame(() => document.getElementById("demos-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>Live Demos</button>
          <Link to="/pocket" className="unlock-topbar-link" title="Obsidian Pocket — simplified prompt-to-app workspace">Pocket</Link>
          <Link to="/library" className="unlock-topbar-link" title="Community Library — browse, copy and remix builds">Library</Link>
          <button type="button" className="unlock-topbar-link" onClick={() => openPanel("code")}>Access Code</button>
          <a
            href="/?demo=1"
            className="unlock-topbar-link"
            style={{ color: "#f4a125", border: "1px solid rgba(244,161,37,0.35)" }}
            aria-label="Try a free demo — one build, no card required"
          >
            Try a Free Demo
          </a>

          {session ? (
            <>
              <span className="unlock-topbar-link" aria-live="polite" style={{ opacity: 0.75 }}>{session.email ?? "Signed in"}</span>
              <button type="button" className="unlock-topbar-link" onClick={() => openPanel("code")}>Enter Access Code</button>
              <button type="button" className="unlock-topbar-cta" onClick={signOutAndReset}>Sign out</button>
            </>
          ) : (
            <button type="button" className="unlock-topbar-cta" onClick={goSignIn}>Sign in</button>
          )}
        </div>
      </nav>

      {!panelOpen && (
        <div className="unlock-wordmark" id="top">
          <div className="unlock-hero-stack">
            {/* Status pill — structure from the reference hero (mono eyebrow
                chip + label + divider + nudging arrow), rendered in the
                site's existing gold-on-black identity rather than the
                reference's light theme. */}
            <a
              href="#plans"
              onClick={(e) => { e.preventDefault(); setPanelOpen(true); setTab("buy"); }}
              className={cn(
                "group mx-auto flex w-fit items-center gap-3 rounded-md border border-[#F4A125]/25 bg-black/40 p-1 shadow-sm backdrop-blur-sm",
                "transition-colors hover:border-[#F4A125]/50",
                "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-500 duration-500 ease-out",
              )}
            >
              <span className="rounded-sm border border-[#F4A125]/30 bg-[#F4A125]/10 px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-[#F4A125] shadow-sm">
                NOW
              </span>
              <span className="text-xs text-[#c9c6c0]">3 free AI builds every day</span>
              <span className="block h-5 border-l border-white/10" />
              <span className="pr-1">
                <ArrowRight className="size-3 -translate-x-0.5 text-[#F4A125] duration-150 ease-out group-hover:translate-x-0.5" />
              </span>
            </a>

            <h1
              className={cn(
                "unlock-title unlock-title-hero",
                "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-100 duration-500 ease-out",
              )}
              data-text="OBSIDIAN VIBE"
            >
              OBSIDIAN VIBE
            </h1>
            <div
              className={cn(
                "unlock-hero-slogan",
                "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-200 duration-500 ease-out",
              )}
              aria-labelledby="hero-slogan-heading"
            >
              <h2 id="hero-slogan-heading" className="hero-slogan-headline">Build without the meter running.</h2>
              <p className="hero-slogan-body">
                Build in Obsidian, Finish in Lovable.&nbsp; Build where experimentation is cheap. Finish where production is powerful. Obsidian becomes the daily-driver development environment for builders who don't want every idea, mistake, experiment, or revision consuming expensive credits.
              </p>
            </div>

            {/* Paired primary/secondary CTA, per the reference. */}
            <div
              className={cn(
                "mx-auto flex w-fit items-center justify-center gap-3 pt-1",
                "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-300 duration-500 ease-out",
              )}
            >
              <a
                href="/?demo=1"
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-[#F6B24A] to-[#DD9324] px-5 py-2.5 text-sm font-semibold text-[#14100a] shadow-lg shadow-[#F4A125]/20 transition-transform hover:scale-[1.03]"
              >
                Start building free
                <ArrowRight className="size-4" />
              </a>
              <a
                href="/pocket"
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-5 py-2.5 text-sm font-medium text-[#E8E6E1] transition-colors hover:border-white/30 hover:bg-white/5"
              >
                <Sparkles className="size-4" />
                Try Pocket
              </a>
            </div>

            {/* PRICING — in the main page flow, not hidden behind a panel.
                Previously the only pricing lived inside the click-to-open
                panel, so a visitor could scroll the entire page and never
                see a price. Styled per the supplied reference component:
                large padded cards, oversized price, check-icon feature
                list, full-width CTA, ring highlight on the featured tier. */}
            <section
              id="pricing"
              aria-labelledby="pricing-heading"
              className={cn(
                "mx-auto mt-16 w-full max-w-6xl px-4",
                "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-400 duration-500 ease-out",
              )}
            >
              <div className="mb-3 text-center">
                <h2 id="pricing-heading" className="text-balance text-3xl font-semibold tracking-tight text-[#f2eee7] md:text-4xl">
                  Start building in the next five minutes
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm text-[#a5a29c] md:text-base">
                  Free to try, no card. Pick a plan when you're ready for more.
                </p>
              </div>

              <div className="mt-10 grid items-stretch gap-7 sm:grid-cols-2 lg:grid-cols-3">
                {PLAN_TIERS.map((t) => {
                  const featured = !!t.featured;
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "relative flex w-full flex-col rounded-2xl p-8 text-left",
                        featured
                          ? "bg-[#100d08] text-[#f2eee7] shadow-2xl ring-2 ring-[#F4A125]/60"
                          : "border border-white/10 bg-white/[0.03] text-[#e8e6e1] shadow-lg",
                      )}
                    >
                      {featured && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-b from-[#F6B24A] to-[#DD9324] px-4 py-1 text-[11px] font-bold uppercase tracking-widest text-[#14100a] shadow-lg shadow-[#F4A125]/40">
                          Most popular
                        </div>
                      )}

                      <h3 className="text-center text-2xl font-bold">{t.name}</h3>

                      <div className="mt-4 flex items-baseline justify-center">
                        <span className="text-5xl font-extrabold tracking-tight">{t.price}</span>
                        {t.cadence && <span className="ml-1 text-lg font-medium opacity-70">{t.cadence}</span>}
                      </div>

                      <p className="mt-4 text-center text-sm leading-relaxed opacity-80">{t.headline}</p>

                      <ul className="mt-8 space-y-4">
                        {t.outcomes.map((o) => (
                          <li key={o} className="flex items-start gap-3 text-sm leading-snug">
                            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#F4A125]" aria-hidden />
                            <span>{o}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-auto pt-8">
                        {t.cta === "checkout" && t.priceId ? (
                          <button
                            type="button"
                            onClick={() => { setSelectedPriceId(t.priceId!); setPanelOpen(true); setTab("buy"); }}
                            className={cn(
                              "w-full rounded-xl px-6 py-3.5 text-[15px] font-semibold shadow-lg transition-transform hover:scale-[1.03]",
                              featured
                                ? "bg-gradient-to-b from-[#F6B24A] to-[#DD9324] text-[#14100a] shadow-[#F4A125]/25"
                                : "bg-[#f2eee7] text-[#14100a]",
                            )}
                          >
                            {t.id === "pocket" ? "Start with Pocket — $10" : "Get Vibe — $39/mo"}
                          </button>
                        ) : (
                          <a
                            href="mailto:hello@aetheris.technology?subject=Obsidian%20Custom%20inquiry"
                            className="block w-full rounded-xl border border-white/20 px-6 py-3.5 text-center text-[15px] font-semibold text-[#f2eee7] transition-colors hover:border-white/40 hover:bg-white/5"
                          >
                            Talk to us
                          </a>
                        )}
                        <p className="mt-3 text-center text-[11px] opacity-55">
                          {t.cta === "checkout" ? "Cancel anytime. No contract." : "Custom terms, SLAs, and support."}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className={`pocket-spotlight ${pocketExpanded ? "is-expanded" : "is-collapsed"}`} aria-labelledby="pocket-spotlight-heading">
              <div className="pocket-spotlight-glow" aria-hidden />
              <span className="pocket-spotlight-badge">New · Minimal mode</span>
              <h2 id="pocket-spotlight-heading" className="pocket-spotlight-title">Obsidian Pocket</h2>
              <p className="pocket-spotlight-body">
                Prototype here. Ship anywhere.<br /><br />Build cheap. Graduate when ready.
              </p>
              <a
                href="https://promptopto.com"
                target="_blank"
                rel="noopener noreferrer"
                className="pocket-spotlight-link"
                aria-label="PromptOpto — AI prompt optimization for Obsidian Pocket"
              >
                <span className="pocket-spotlight-link-label">PromptOpto</span>
                <span className="pocket-spotlight-link-desc">AI prompt optimization that makes Pocket builds sharper.</span>
              </a>

              {!pocketExpanded ? (
                <button
                  type="button"
                  className="pocket-spotlight-expand"
                  onClick={() => setPocketExpanded(true)}
                  aria-expanded={false}
                  aria-controls="pocket-spotlight-frame"
                >
                  <span className="pocket-spotlight-expand-preview" aria-hidden>
                    <span className="pocket-spotlight-expand-dots">
                      <span /><span /><span />
                    </span>
                    <em>Live sandbox preview</em>
                  </span>
                  <span className="pocket-spotlight-expand-label">Tap to open the sandbox</span>
                </button>
              ) : (
                <div id="pocket-spotlight-frame" className="pocket-spotlight-frame">
                  <div className="pocket-spotlight-bar">
                    <span /><span /><span />
                    <em className="pocket-spotlight-url">obsidian pocket · live sandbox</em>
                    <Link to="/pocket" className="pocket-spotlight-openfull">Open full page ↗</Link>
                    <button
                      type="button"
                      className="pocket-spotlight-collapse"
                      onClick={() => setPocketExpanded(false)}
                      aria-label="Close sandbox"
                    >
                      ×
                    </button>
                  </div>
                  <div className="pocket-spotlight-stage">
                    <iframe
                      src="/pocket?embed=1"
                      title="Obsidian Pocket live sandbox"
                      className="pocket-spotlight-iframe"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Product comparison: Vibe vs Pocket */}
            <section className="unlock-compare" aria-labelledby="compare-heading">
              <h2 id="compare-heading" className="unlock-compare-title">Choose your workspace</h2>
              <div className="unlock-compare-grid">
                <div className="unlock-compare-card is-vibe">
                  <img
                    className="unlock-compare-shot"
                    src={vibeShot.url}
                    alt="Obsidian Vibe workspace: left tool rail, live sandbox canvas, and right agent panel"
                    loading="lazy"
                    width={1440}
                    height={900}
                  />
                  <div className="unlock-compare-card-head">
                    <span className="unlock-compare-badge">Full power</span>
                    <h3 className="unlock-compare-card-title">Obsidian Vibe</h3>
                    <p className="unlock-compare-card-sub">The complete builder for serious projects.</p>
                  </div>
                  <ul className="unlock-compare-list">
                    <li>Multi-file project editor with version history</li>
                    <li>Advanced model routing, GitHub deploy, and QA gates</li>
                    <li>Deep customization: themes, design library, voice control</li>
                    <li>Co-designer chat, image uploads, and style guides</li>
                    <li>Best for polished apps, dashboards, and client work</li>
                  </ul>
                  <a href="/?demo=1" className="unlock-compare-cta is-secondary">
                    Try Obsidian Vibe free
                  </a>
                </div>

                <div className="unlock-compare-card is-pocket">
                  <img
                    className="unlock-compare-shot"
                    src={pocketShot.url}
                    alt="Obsidian Pocket workspace: single prompt box with code and live preview side by side"
                    loading="lazy"
                    width={1440}
                    height={900}
                  />
                  <div className="unlock-compare-card-head">
                    <span className="unlock-compare-badge">Quick builds</span>
                    <h3 className="unlock-compare-card-title">Obsidian Pocket</h3>
                    <p className="unlock-compare-card-sub">One prompt, one working page, zero setup.</p>
                  </div>
                  <ul className="unlock-compare-list">
                    <li>Single-box prompt-to-app with live preview</li>
                    <li>No panels to learn — type and generate</li>
                    <li>Instant publish, save, and export</li>
                    <li>Free to use with no account required</li>
                    <li>Best for fast landing pages, ideas, and prototypes</li>
                  </ul>
                  <a href="/pocket" className="unlock-compare-cta">
                    Start building free — no account
                  </a>
                </div>
              </div>

              {/* Live builds people shared from Pocket */}
              {communityBuilds.length > 0 && (
              <div className="unlock-community" id="community-anchor">
                <div className="unlock-community-head">
                  <div>
                    <h3 className="unlock-compare-card-title">Built in Pocket by the community</h3>
                    <p className="unlock-compare-card-sub">
                      Real, working pages people shared. Preview one live, then copy or remix it.
                    </p>
                  </div>
                  <a href="/library" className="unlock-compare-cta">Browse the Library</a>
                </div>
                  <div className="unlock-community-grid">
                    {communityBuilds.map((b) => (
                      <a
                        key={b.id}
                        className="demo-card"
                        href={`/api/public/share/${b.share_slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={b.prompt || b.title}
                      >
                        <span className="demo-frame">
                          <iframe
                            src={`/api/public/share/${b.share_slug}`}
                            title={b.title}
                            loading="lazy"
                            sandbox="allow-scripts"
                            tabIndex={-1}
                          />
                          <span className="demo-scrim" aria-hidden />
                        </span>
                        <span className="demo-meta">
                          <span className="demo-name">{b.title || "Untitled build"}</span>
                          <span className="demo-open">Open ↗</span>
                        </span>
                      </a>
                    ))}
                  </div>
              </div>
              )}

            </section>
          </div>
        </div>
      )}


      {panelOpen && (
      <main className="unlock-card" role="main" aria-labelledby="unlock-heading" id="top">
        <button type="button" className="unlock-card-close" aria-label="Close" onClick={() => setPanelOpen(false)}>×</button>
        <div className="unlock-card-glow" aria-hidden />


        <header className="unlock-brand" hidden aria-hidden>
          <h1 id="unlock-heading" className="unlock-title" data-text="OBSIDIAN VIBE">OBSIDIAN VIBE</h1>
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
            Get Obsidian Vibe
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
                  <span className="price-amount">$39</span>
                  <span className="price-cadence">/month</span>
                </div>
                <p className="unlock-allowance">
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
                  {sessionLoading ? "…" : session ? "Continue to Secure Checkout" : "Start Obsidian Vibe — $39/month"}
                </button>

                {plansOpen && (
                <div className="plans-block" aria-labelledby="plans-heading">
                  <button
                    type="button"
                    className="plans-toggle"
                    aria-expanded={plansOpen}
                    aria-controls="plans-grid"
                    onClick={() => setPlansOpen(false)}
                  >
                    <span className="plans-toggle-label">
                      <span id="plans-heading" className="plans-title">Compare all plans</span>
                      <span className="plans-toggle-sub">Pocket · Vibe · Custom</span>
                    </span>
                    <span className="plans-toggle-caret" aria-hidden>▲</span>
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
                            {t.outcomes.map((o) => <li key={o}>{o}</li>)}
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
                              href="mailto:hello@aetheris.technology?subject=Obsidian%20Custom%20inquiry"
                            >
                              Contact sales
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )}

                <button
                  type="button"
                  style={{ width: "100%", padding: "11px 0", borderRadius: 10, background: "rgba(244,161,37,0.12)", color: "#F4A125", border: "1px solid rgba(244,161,37,0.35)", fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: 8 }}
                  onClick={() => window.location.assign("/auth?mode=signup")}
                >
                  Create free account — 3 AI builds/day, no card
                </button>
                <button type="button" className="unlock-btn-secondary" onClick={goSignIn}>
                  Already have an account? Sign in
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
                      <h3>What stays free</h3>
                      <p>Create a free account and get <strong>3 AI builds per day</strong> — no card, no trial, always on. Local editing, previews, exports, and screenshots are always free too. Cloud saves, GitHub export, and deploy require Pro.</p>
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
              Don&apos;t have a code? Get Obsidian Vibe
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
      </main>
      )}
      {/* Admin backdoor — visible only inside the Access Code panel and admin portal. */}
      {panelOpen && tab === "code" && (
        <Link to="/demos" aria-label="Admin portal" className="unlock-backdoor" title="Admin">·</Link>
      )}

      <section className="unlock-demos" aria-labelledby="demos-heading" id="demos-anchor">
        <div className="demos-header">
          <h2 id="demos-heading" className="demos-title">Live Demos</h2>
          <p className="demos-sub">Real builds made with Obsidian. Open any one, then build your own free.</p>
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
        {(demosOpen || demoCategory !== "All") && (() => {
          const seenTitles = new Set<string>();
          const merged = Array.from(
            new Map(
              [...featuredDemos, ...DEMOS].map((d) => {
                const demoUrl = d.url ?? `/api/public/share/${d.slug}`;
                return [demoUrl, { ...d, demoUrl }] as const;
              }),
            ).values(),
          )
            // Same project promoted under two slugs shows once.
            .filter(({ title }) => {
              const key = (title || "").toLowerCase().replace(/\s+/g, " ").trim();
              if (!key) return true;
              if (seenTitles.has(key)) return false;
              seenTitles.add(key);
              return true;
            })
            .filter(({ category }) => demoCategory === "All" || category === demoCategory);


          const liveDemos = merged.map((d) => ({
            id: d.slug,
            title: d.title.replace(/^Demo\s*·\s*/, ""),
            category: d.category,
            url: d.demoUrl,
            previewUrl: d.demoUrl,
          }));
          return (
            <div id="demos-grid" className="demos-sphere-wrap">
              <SphereDemoGrid
                items={liveDemos}
                containerSize={600}
                sphereRadius={240}
                tileSize={112}
                autoRotateSpeed={0.12}
              />
              <p className="demos-sphere-hint">Drag to rotate · tap a tile to open</p>
            </div>
          );
        })()}
      </section>

      <FeedbackWidget />





      {waitlistTier && (

        <WaitlistModal
          tier={waitlistTier}
          onClose={() => setWaitlistTier(null)}
        />
      )}

      <PocketPromoModal
        blocked={
          panelOpen ||
          showCheckout ||
          !!waitlistTier ||
          pocketExpanded ||
          demosOpen
        }
        sessionLoading={sessionLoading}
        signedIn={!!session}
        search={{ checkout: search.checkout, intent: search.intent }}
      />
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

  async function goToPayment(e: FormEvent<HTMLFormElement>) {
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
.unlock-hills-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.55;
  mix-blend-mode: screen;
}
.unlock-scene-canvas {
  position: relative;
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
  .unlock-card, .unlock-card-glow,
  .unlock-title::before, .unlock-title::after {
    animation: none !important;
  }
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

.unlock-hero-slogan {
  pointer-events: auto;
  max-width: 680px;
  margin: 18px auto 0;
  padding: 22px 28px;
  text-align: center;
  background: rgba(8,8,10,0.55);
  border: 1px solid rgba(244,161,37,0.18);
  border-radius: 18px;
  backdrop-filter: blur(12px);
  box-shadow:
    0 18px 50px rgba(0,0,0,0.55),
    inset 0 1px 0 rgba(255,255,255,0.04),
    0 0 0 1px rgba(244,161,37,0.05);
  transition: border-color .25s ease, box-shadow .25s ease;
}
.unlock-hero-slogan:hover {
  border-color: rgba(244,161,37,0.45);
  box-shadow:
    0 22px 60px rgba(0,0,0,0.65),
    0 0 0 1px rgba(244,161,37,0.12),
    0 0 30px rgba(244,161,37,0.08);
}
.hero-slogan-headline {
  font-family: Fraunces, Georgia, serif;
  font-size: 22px;
  line-height: 1.3;
  color: #f2eee7;
  margin: 0 0 10px;
  text-shadow: 0 0 18px rgba(244,161,37,0.18);
}
.hero-slogan-body {
  font-size: 13.5px;
  line-height: 1.6;
  color: rgba(182,188,200,0.85);
  margin: 0 auto;
  max-width: 560px;
}

/* ---- Hero stack: title, slogan, and spotlight share the title's intrinsic width ---- */
.unlock-hero-stack {
  width: fit-content;
  max-width: 96vw;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ---- Pocket spotlight ---- */
.pocket-spotlight {
  pointer-events: auto;
  position: relative;
  width: 100%;
  max-width: 100%;
  margin-top: 22px;
  padding: 24px 26px 26px;
  text-align: center;
  border-radius: 20px;
  border: 1px solid rgba(244,161,37,0.35);
  background: linear-gradient(180deg, rgba(20,15,6,0.72), rgba(8,8,10,0.72));
  backdrop-filter: blur(14px);
  box-shadow:
    0 24px 70px rgba(0,0,0,0.6),
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 0 44px rgba(244,161,37,0.12);
  overflow: hidden;
  animation: pocketRise .7s ease both;
}
@keyframes pocketRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.pocket-spotlight-glow {
  position: absolute; inset: -40% -20% auto -20%; height: 180px;
  background: radial-gradient(ellipse at 50% 0%, rgba(244,161,37,0.28), transparent 70%);
  pointer-events: none;
  animation: pocketPulse 5s ease-in-out infinite;
}
@keyframes pocketPulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
.pocket-spotlight-badge {
  position: relative;
  display: inline-block;
  font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase;
  color: #F4A125;
  border: 1px solid rgba(244,161,37,0.4);
  border-radius: 999px;
  padding: 4px 11px;
  background: rgba(244,161,37,0.08);
}
.pocket-spotlight-title {
  position: relative;
  font-family: Fraunces, Georgia, serif;
  font-size: 26px; margin: 12px 0 6px; color: #f2eee7;
  text-shadow: 0 0 24px rgba(244,161,37,0.25);
}
.pocket-spotlight-body {
  position: relative;
  font-size: 13px; line-height: 1.6; color: rgba(182,188,200,0.9);
  margin: 0 auto; max-width: 420px;
}
.pocket-spotlight-link {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin: 12px auto 0;
  padding: 8px 16px;
  border-radius: 999px;
  text-decoration: none;
  color: #f4a125;
  background: rgba(244,161,37,0.08);
  border: 1px solid rgba(244,161,37,0.25);
  box-shadow: 0 0 20px rgba(244,161,37,0.06);
  transition: background .2s ease, border-color .2s ease, box-shadow .2s ease, transform .2s ease;
}
.pocket-spotlight-link:hover {
  background: rgba(244,161,37,0.14);
  border-color: rgba(244,161,37,0.45);
  box-shadow: 0 0 28px rgba(244,161,37,0.14);
  transform: translateY(-1px);
}
.pocket-spotlight-link-label {
  font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
}
.pocket-spotlight-link-desc {
  font-size: 11px; color: rgba(182,188,200,0.75); text-align: center; line-height: 1.4;
}
.pocket-spotlight-frame {
  position: relative;
  margin: 18px auto 0;
  border-radius: 14px;
  border: 1px solid rgba(244,161,37,0.2);
  background: rgba(0,0,0,0.5);
  padding: 10px;
  text-align: left;
  display: flex;
  flex-direction: column;
  height: min(76vh, 760px);
}
.pocket-spotlight-bar { display: flex; align-items: center; gap: 5px; margin-bottom: 10px; }
.pocket-spotlight-bar span {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgba(244,161,37,0.32);
}
.pocket-spotlight-url {
  margin-left: 8px; font-style: normal;
  font-size: 10.5px; letter-spacing: .6px; text-transform: uppercase;
  color: rgba(182,188,200,0.65);
}
.pocket-spotlight-stage {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(244,161,37,0.18);
  background: #08080a;
  flex: 1;
  min-height: 0;
}
.pocket-spotlight-iframe {
  width: 100%; height: 100%; border: 0; display: block;
}
.pocket-spotlight-openfull {
  margin-left: auto;
  font-size: 11px; letter-spacing: .4px;
  color: #F4A125; text-decoration: none;
  border: 1px solid rgba(244,161,37,0.3);
  border-radius: 999px; padding: 4px 10px;
  transition: background .2s ease;
}
.pocket-spotlight-openfull:hover { background: rgba(244,161,37,0.14); }
.pocket-spotlight-collapse { margin-left: 8px; }

.pocket-spotlight-cta {
  position: relative;
  display: inline-block;
  margin-top: 18px;
  padding: 11px 24px;
  border-radius: 999px;
  font-size: 13.5px; font-weight: 700; letter-spacing: .3px;
  color: #111317;
  background: linear-gradient(180deg, #F4A125, #DD9324);
  text-decoration: none;
  box-shadow: 0 10px 30px rgba(244,161,37,0.28);
  transition: transform .2s ease, box-shadow .2s ease;
}
.pocket-spotlight-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 40px rgba(244,161,37,0.42);
}

/* Collapsed / expanded sandbox states */
.pocket-spotlight.is-collapsed { padding-bottom: 22px; }
.pocket-spotlight-expand {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: 16px;
  padding: 18px 20px;
  border-radius: 14px;
  border: 1px dashed rgba(244,161,37,0.35);
  background: rgba(0,0,0,0.32);
  color: #f2eee7;
  cursor: pointer;
  transition: background .2s ease, border-color .2s ease, transform .2s ease, box-shadow .2s ease;
}
.pocket-spotlight-expand:hover {
  background: rgba(244,161,37,0.08);
  border-color: rgba(244,161,37,0.55);
  transform: translateY(-1px);
  box-shadow: 0 12px 34px rgba(244,161,37,0.12);
}
.pocket-spotlight-expand-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px; letter-spacing: .6px; text-transform: uppercase;
  color: rgba(182,188,200,0.75);
}
.pocket-spotlight-expand-dots { display: flex; align-items: center; gap: 4px; }
.pocket-spotlight-expand-dots span {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(244,161,37,0.45);
  animation: pocketDotPulse 1.6s ease-in-out infinite;
}
.pocket-spotlight-expand-dots span:nth-child(2) { animation-delay: .2s; }
.pocket-spotlight-expand-dots span:nth-child(3) { animation-delay: .4s; }
@keyframes pocketDotPulse { 0%,100% { opacity: .35; transform: scale(.9); } 50% { opacity: 1; transform: scale(1.1); } }
.pocket-spotlight-expand-label {
  font-size: 13px; font-weight: 700; letter-spacing: .2px;
  color: #F4A125;
}
.pocket-spotlight-collapse {
  margin-left: auto;
  width: 24px; height: 24px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(244,161,37,0.35);
  background: rgba(244,161,37,0.1);
  color: #F4A125;
  font-size: 18px; line-height: 1;
  cursor: pointer;
  transition: background .2s ease, transform .2s ease;
}
.pocket-spotlight-collapse:hover {
  background: rgba(244,161,37,0.2);
  transform: scale(1.05);
}

/* ---- Vibe vs Pocket comparison ---- */
.unlock-compare-shot {
  display: block; width: 100%; height: auto; aspect-ratio: 16 / 10;
  object-fit: cover; object-position: top center;
  border-radius: 12px; margin-bottom: 14px;
  border: 1px solid rgba(244,161,37,0.22);
  box-shadow: 0 14px 34px rgba(0,0,0,0.55);
}
.unlock-community { margin-top: 22px; }
.unlock-community-head {
  display: flex; flex-wrap: wrap; gap: 12px;
  align-items: flex-end; justify-content: space-between; margin-bottom: 14px;
}
.unlock-community-empty { font-size: 13px; color: rgba(182,188,200,0.7); margin: 0; }
.unlock-community-grid {
  display: grid; gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.unlock-community-grid .demo-frame { display: block; }
.unlock-community-grid .demo-meta { display: flex; }

.unlock-compare {
  pointer-events: auto;
  width: 100%;
  max-width: 1063px;
  margin: 34px auto 0;
  padding: 26px;
  border-radius: 20px;
  border: 1px solid rgba(244,161,37,0.22);
  background: linear-gradient(180deg, rgba(8,8,10,0.62), rgba(8,8,10,0.42));
  backdrop-filter: blur(14px);
  box-shadow:
    0 24px 70px rgba(0,0,0,0.5),
    inset 0 1px 0 rgba(255,255,255,0.05);
}
.unlock-compare-title {
  margin: 0 0 18px;
  font-family: Fraunces, Georgia, serif;
  font-size: 20px;
  text-align: center;
  color: #f2eee7;
  letter-spacing: 0.04em;
}
.unlock-compare-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.unlock-compare-card {
  position: relative;
  padding: 22px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(0,0,0,0.32);
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
}
.unlock-compare-card:hover {
  transform: translateY(-2px);
  border-color: rgba(244,161,37,0.35);
  box-shadow: 0 16px 40px rgba(0,0,0,0.35);
}
.unlock-compare-card.is-vibe { border-top: 2px solid rgba(244,161,37,0.55); }
.unlock-compare-card.is-pocket { border-top: 2px solid rgba(221,147,36,0.55); }
.unlock-compare-card-head { display: flex; flex-direction: column; gap: 6px; }
.unlock-compare-badge {
  align-self: flex-start;
  font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase;
  color: #F4A125;
  border: 1px solid rgba(244,161,37,0.35);
  border-radius: 999px;
  padding: 3px 10px;
  background: rgba(244,161,37,0.08);
}
.unlock-compare-card-title {
  margin: 0;
  font-family: Fraunces, Georgia, serif;
  font-size: 22px;
  color: #f2eee7;
}
.unlock-compare-card-sub {
  margin: 0;
  font-size: 12.5px;
  color: rgba(182,188,200,0.85);
  line-height: 1.45;
}
.unlock-compare-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12.5px;
  color: rgba(242,238,231,0.85);
}
.unlock-compare-list li {
  position: relative;
  padding-left: 18px;
  line-height: 1.45;
}
.unlock-compare-list li::before {
  content: "✓";
  position: absolute;
  left: 0;
  top: 0;
  color: #F4A125;
  font-weight: 700;
  font-size: 11px;
}
.unlock-compare-cta {
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-decoration: none;
  color: #111317;
  background: linear-gradient(180deg, #F4A125, #DD9324);
  transition: transform .2s ease, box-shadow .2s ease;
}
.unlock-compare-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 28px rgba(244,161,37,0.32);
}
.unlock-compare-cta.is-secondary {
  background: transparent;
  color: #F4A125;
  border: 1px solid rgba(244,161,37,0.4);
  box-shadow: none;
}
.unlock-compare-cta.is-secondary:hover {
  background: rgba(244,161,37,0.1);
  box-shadow: 0 8px 24px rgba(244,161,37,0.14);
}
@media (max-width: 720px) {
  .unlock-compare { padding: 20px 18px; margin-top: 26px; }
  .unlock-compare-grid { grid-template-columns: 1fr; }
  .unlock-compare-title { font-size: 18px; }
  .unlock-compare-card-title { font-size: 20px; }
}

@media (prefers-reduced-motion: reduce) {
  .pocket-spotlight, .pocket-spotlight-glow, .pocket-spotlight-typed, .pocket-spotlight-caret { animation: none; }
  .pocket-spotlight-typed { width: auto; }
}
@media (max-width: 640px) {
  .pocket-spotlight { padding: 20px 18px 22px; margin-top: 18px; }
  .pocket-spotlight-title { font-size: 22px; }
}



.unlock-examples {
  position: relative;
  width: 100%;
  padding: 30px 16px 24px;
  opacity: 0.95;
  z-index: 3;
}
.unlock-examples::before {
  content: "";
  position: absolute;
  top: 0; left: 50%; transform: translateX(-50%);
  width: min(600px, 70vw); height: 1px;
  background: linear-gradient(90deg, transparent, rgba(244,161,37,0.25), transparent);
}
.unlock-examples-header {
  max-width: 720px;
  margin: 0 auto 18px;
  text-align: center;
}
.unlock-examples-title {
  font-family: Fraunces, Georgia, serif;
  font-size: 22px;
  color: #f2eee7;
  margin: 0 0 6px;
  text-shadow: 0 0 18px rgba(244,161,37,0.18);
}
.unlock-examples-sub {
  font-size: 13px;
  color: rgba(182,188,200,0.7);
  margin: 0;
}

.slogan-examples {
  margin-top: 22px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  width: 100%;
}
.slogan-example {
  position: relative;
  margin: 0;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(244,161,37,0.22);
  background: rgba(10,11,13,0.7);
  box-shadow: 0 10px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04);
  padding: 0;
  text-align: left;
  cursor: pointer;
  transition: transform .25s ease, border-color .25s ease, box-shadow .25s ease;
}
.slogan-example:hover,
.slogan-example:focus-visible {
  transform: translateY(-3px) scale(1.01);
  border-color: rgba(244,161,37,0.55);
  box-shadow: 0 16px 50px rgba(0,0,0,0.55), 0 0 30px rgba(244,161,37,0.12), inset 0 1px 0 rgba(255,255,255,0.06);
}
.slogan-example:focus-visible {
  outline: 2px solid #F4A125;
  outline-offset: 2px;
}
.slogan-example video {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  background: #000;
  pointer-events: none;
}
.slogan-example-caption {
  display: block;
  padding: 8px 12px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(244,161,37,0.85);
  border-top: 1px solid rgba(244,161,37,0.18);
  background: rgba(0,0,0,0.4);
}
.slogan-example-play {
  position: absolute;
  inset: 0 0 auto;
  display: grid;
  place-items: center;
  height: calc(100% - 34px);
  font-size: 28px;
  color: #f4a125;
  text-shadow: 0 0 16px rgba(0,0,0,0.8);
  opacity: 0;
  transition: opacity .25s ease;
  pointer-events: none;
  background: radial-gradient(circle, rgba(0,0,0,0.35) 0%, transparent 70%);
}
.slogan-example:hover .slogan-example-play,
.slogan-example:focus-visible .slogan-example-play {
  opacity: 1;
}

.video-lightbox {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0,0,0,0.88);
  backdrop-filter: blur(14px);
  animation: lightbox-in .25s ease;
}
@keyframes lightbox-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.video-lightbox-close {
  position: absolute;
  top: 18px;
  right: 22px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(244,161,37,0.35);
  background: rgba(10,11,13,0.85);
  color: #f4a125;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background .2s ease, transform .2s ease;
}
.video-lightbox-close:hover,
.video-lightbox-close:focus-visible {
  background: rgba(244,161,37,0.15);
  transform: scale(1.05);
}
.video-lightbox-close:focus-visible {
  outline: 2px solid #F4A125;
  outline-offset: 2px;
}
.video-lightbox-stage {
  width: min(1100px, 92vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.video-lightbox-stage video {
  width: 100%;
  height: auto;
  max-height: 78vh;
  border-radius: 14px;
  border: 1px solid rgba(244,161,37,0.25);
  box-shadow: 0 30px 80px rgba(0,0,0,0.8), 0 0 40px rgba(244,161,37,0.1);
  background: #000;
}
.video-lightbox-caption {
  margin: 0;
  text-align: center;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(244,161,37,0.9);
}
@media (max-width: 640px) {
  .slogan-examples { grid-template-columns: 1fr; }
  .video-lightbox { padding: 14px; }
  .video-lightbox-stage { width: 100%; }
}



@media (max-width: 800px) {
  .unlock-hero-slogan { padding: 18px 22px; margin-top: 14px; }
  .hero-slogan-headline { font-size: 19px; }
  .hero-slogan-body { font-size: 12.5px; }
  .unlock-examples { padding: 40px 14px 20px; }
  .unlock-examples-title { font-size: 20px; }
}
@media (max-width: 520px) {
  .unlock-wordmark { padding: 100px 14px 30px; }
  .unlock-title-hero { font-size: clamp(34px, 11vw, 64px); letter-spacing: 4px; }
  .unlock-hero-slogan { padding: 14px 18px; }
  .hero-slogan-headline { font-size: 16px; }
  .hero-slogan-body { font-size: 11.5px; line-height: 1.55; }
  .unlock-examples-title { font-size: 18px; }
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
  /* Brand keeps its natural width so the wide-tracked wordmark can never be
     squeezed under the nav links; the links column absorbs the rest. */
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 24px;
  padding: 10px 14px;
  background: rgba(8,8,10,0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(244,161,37,0.22);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.5);
}
.unlock-topbar-brand { display: flex; align-items: center; gap: 10px; color: #f2eee7; text-decoration: none; white-space: nowrap; }
.unlock-topbar-mark { width: 28px; height: 28px; border-radius: 999px; object-fit: cover; display: block; flex: 0 0 auto; filter: drop-shadow(0 0 8px rgba(244,161,37,0.45)); }
.unlock-topbar-name { font-family: var(--font-display, inherit); letter-spacing: 0.24em; font-weight: 700; font-size: 14px; padding-right: 0.24em; }
.unlock-topbar-links { display: flex; align-items: center; gap: 4px 6px; flex-wrap: wrap; justify-content: flex-end; min-width: 0; }

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

/* Centered hero wordmark shown when the panel is closed */
.unlock-wordmark {
  position: relative;
  min-height: 100vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  pointer-events: none; z-index: 2;
  padding: 110px 16px 40px;
}
.unlock-title-hero {
  font-size: clamp(44px, 9vw, 116px);
  letter-spacing: clamp(6px, 1.4vw, 18px);
  color: #f2eee7;
  text-shadow: 0 0 30px rgba(244,161,37,0.25), 0 0 80px rgba(244,161,37,0.12);
  margin: 0 0 4px; padding: 0 16px; text-align: center;
  font-family: Fraunces, Georgia, serif; font-weight: 500;
}

/* Close button on the panel card */
.unlock-card-close {
  position: absolute; top: 12px; right: 12px; z-index: 3;
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(20,20,24,0.6); border: 1px solid rgba(244,161,37,0.25);
  color: rgba(242,238,231,0.85); font-size: 20px; line-height: 1;
  cursor: pointer; display: grid; place-items: center;
  transition: color .15s ease, background .15s ease, border-color .15s ease, transform .15s ease;
}
.unlock-card-close:hover { color: #f4a125; border-color: rgba(244,161,37,0.6); background: rgba(20,20,24,0.85); transform: rotate(90deg); }

/* Elegant topbar refinement */
.unlock-topbar {
  max-width: min(1100px, 92vw) !important;
  margin: 14px auto 0 !important;
  padding: 10px 18px !important;
  background: linear-gradient(180deg, rgba(14,14,18,0.78), rgba(10,10,12,0.6)) !important;
  border: 1px solid rgba(244,161,37,0.14) !important;
  border-radius: 999px !important;
  box-shadow:
    0 1px 0 rgba(255,255,255,0.04) inset,
    0 20px 60px rgba(0,0,0,0.55),
    0 0 40px rgba(244,161,37,0.06) !important;
}
.unlock-topbar-name { font-family: Fraunces, Georgia, serif !important; font-weight: 500 !important; letter-spacing: 0.32em !important; padding-right: 0.32em; }
@media (max-width: 900px) {
  /* Stack brand above the links instead of letting them collide. */
  .unlock-topbar { grid-template-columns: 1fr !important; row-gap: 6px; border-radius: 18px !important; }
  .unlock-topbar-links { justify-content: center; }
  .unlock-topbar-brand { justify-content: center; }
}

.unlock-topbar-link {
  position: relative;
  text-transform: uppercase; font-size: 11px !important; letter-spacing: 0.12em !important; white-space: nowrap;
  padding: 8px 10px !important; color: rgba(242,238,231,0.7) !important;
  border-radius: 999px !important;
}
.unlock-topbar-link::after {
  content: ""; position: absolute; left: 10px; right: 10px; bottom: 4px; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(244,161,37,0.7), transparent);
  transform: scaleX(0); transform-origin: center; transition: transform .25s ease;
}
.unlock-topbar-link:hover { background: transparent !important; color: #f4a125 !important; }
.unlock-topbar-link:hover::after { transform: scaleX(1); }
.unlock-topbar-cta {
  text-transform: uppercase; font-size: 11px !important; letter-spacing: 0.2em !important;
  padding: 9px 14px !important; border-radius: 999px !important; white-space: nowrap;
  background: linear-gradient(180deg, #f4a125, #c9761f) !important;
  box-shadow: 0 6px 24px rgba(244,161,37,0.28), 0 1px 0 rgba(255,255,255,0.25) inset !important;
}
`;

function FeedbackWidget() {
  const send = useServerFn(submitFeedback);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<Array<{ role: "bot" | "user"; text: string }>>([
    { role: "bot", text: "What do you want in a coder that you wish this had? Drop a feature request, friction point, or idea — read by the architect." },
  ]);
  const disabled = status === "sending" || message.trim().length < 3;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    const userText = message.trim();
    setThread((t) => [...t, { role: "user", text: userText }]);
    setStatus("sending");
    setError(null);
    try {
      const path = typeof window !== "undefined" ? window.location.pathname + window.location.search : null;
      const res = await send({ data: { message: userText, contact: contact.trim() || null, path } });
      if (res.ok) {
        setStatus("sent");
        setMessage("");
        setContact("");
        setThread((t) => [...t, { role: "bot", text: "Thanks — sent to Joseph. Add another if you want." }]);
      } else {
        setStatus("error");
        setError(res.error || "Something went wrong.");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close feedback chat" : "Open feedback chat"}
        style={{
          position: "fixed", right: 22, bottom: 22, zIndex: 90,
          width: 58, height: 58, borderRadius: 999, border: 0, cursor: "pointer",
          background: "linear-gradient(180deg, #f4a125, #c9761f)",
          color: "#111317", fontSize: 24, fontWeight: 800,
          boxShadow: "0 12px 40px rgba(244,161,37,0.45), 0 1px 0 rgba(255,255,255,0.35) inset",
        }}
      >
        {open ? "×" : "💬"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-labelledby="feedback-heading"
          style={{
            position: "fixed", right: 22, bottom: 92, zIndex: 91,
            width: "min(380px, calc(100vw - 32px))", maxHeight: "min(560px, calc(100vh - 120px))",
            display: "flex", flexDirection: "column",
            borderRadius: 18, overflow: "hidden",
            background: "linear-gradient(180deg, rgba(17,19,23,0.96), rgba(11,13,16,0.96))",
            border: "1px solid rgba(244,161,37,0.28)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset",
            backdropFilter: "blur(18px)",
          }}
        >
          <header style={{ padding: "14px 16px", borderBottom: "1px solid rgba(244,161,37,0.18)" }}>
            <h2 id="feedback-heading" style={{
              fontFamily: "Fraunces, Georgia, serif", margin: 0, color: "#F4A125",
              fontSize: 16, letterSpacing: "0.01em",
            }}>
              Talk to the architect
            </h2>
            <p style={{ color: "#B6BCC8", margin: "2px 0 0", fontSize: 11 }}>
              Feature requests · friction · ideas
            </p>
          </header>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {thread.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
                padding: "8px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.45,
                background: m.role === "user" ? "rgba(244,161,37,0.16)" : "rgba(255,255,255,0.04)",
                color: m.role === "user" ? "#f6e6c8" : "#e6e9ef",
                border: `1px solid ${m.role === "user" ? "rgba(244,161,37,0.32)" : "rgba(255,255,255,0.08)"}`,
              }}>{m.text}</div>
            ))}
          </div>

          <form onSubmit={onSubmit} style={{ padding: 12, borderTop: "1px solid rgba(244,161,37,0.18)", display: "grid", gap: 8 }}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void onSubmit(e as unknown as FormEvent); } }}
              placeholder="I wish this coder could…"
              rows={2}
              maxLength={2000}
              required
              style={{
                width: "100%", resize: "none", padding: "10px 12px",
                background: "rgba(6,8,11,0.7)", color: "#f2eee7",
                border: "1px solid rgba(244,161,37,0.25)", borderRadius: 10,
                fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, lineHeight: 1.5,
              }}
            />
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Email or handle (optional)"
              maxLength={200}
              style={{
                width: "100%", padding: "8px 12px",
                background: "rgba(6,8,11,0.7)", color: "#f2eee7",
                border: "1px solid rgba(244,161,37,0.18)", borderRadius: 10,
                fontFamily: "Inter, system-ui, sans-serif", fontSize: 12,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 11, color: status === "error" ? "#ff8a8a" : status === "sent" ? "#7bd88f" : "#8a919b" }}>
                {status === "sent" && "Sent."}
                {status === "error" && (error || "Send failed.")}
                {status === "idle" && `${message.length}/2000`}
                {status === "sending" && "Sending…"}
              </span>
              <button
                type="submit"
                disabled={disabled}
                style={{
                  padding: "8px 16px", borderRadius: 999, border: 0, cursor: disabled ? "not-allowed" : "pointer",
                  background: disabled ? "rgba(244,161,37,0.35)" : "linear-gradient(180deg, #f4a125, #c9761f)",
                  color: "#111317", fontWeight: 700, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase",
                  boxShadow: disabled ? "none" : "0 6px 24px rgba(244,161,37,0.28), 0 1px 0 rgba(255,255,255,0.25) inset",
                }}
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}



