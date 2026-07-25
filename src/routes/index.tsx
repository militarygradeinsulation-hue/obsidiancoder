import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Sparkles, Zap, Shield, Rocket, Check, Brain, Layers, Lock, Plug, HelpCircle, Cpu, Play } from "lucide-react";
import { trackHomeVisit, track } from "@/lib/analytics";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { DitheringBackground } from "@/components/DitheringBackground";
import obsidianLogo from "@/assets/obsidian-vibe-logo.png.asset.json";

// Browser-only: three.js can't run during SSR. Lazy + mounted gate keeps SSR safe.
const AnomalousMatterScene = lazy(() => import("@/components/AnomalousMatterScene"));
const GLSLHills = lazy(() => import("@/components/GLSLHills"));
const CircularGallery = lazy(() => import("@/components/ui/circular-gallery"));

type DemoCategory = "App" | "Landing" | "Dashboard" | "Tool" | "Game" | "Portfolio";
const DEMO_CATEGORIES: readonly DemoCategory[] = ["App", "Landing", "Dashboard", "Tool", "Game", "Portfolio"] as const;

const HOME_DEMOS: { slug: string; title: string; url?: string; category: DemoCategory }[] = [
  { slug: "0w653a21633k5v", title: "Obsidian Build 08", category: "Landing", url: "https://obsidianvibe.live/api/public/share/0w653a21633k5v" },
  { slug: "3s190o0x3o2r14", title: "Obsidian Build 09", category: "Dashboard", url: "https://obsidianvibe.live/api/public/share/3s190o0x3o2r14" },
  { slug: "1l370y43144a2o", title: "Obsidian Build 10", category: "Tool", url: "https://obsidianvibe.live/api/public/share/1l370y43144a2o" },
  { slug: "0t485n6s6i1203", title: "Obsidian Build 11", category: "Game", url: "https://obsidianvibe.live/api/public/share/0t485n6s6i1203" },
  { slug: "5i3e202p646j66", title: "Obsidian Build 12", category: "Portfolio", url: "https://obsidianvibe.live/api/public/share/5i3e202p646j66" },
  { slug: "1z63663n0j6c3n", title: "Obsidian Build 13", category: "App", url: "https://obsidianvibe.live/api/public/share/1z63663n0j6c3n#home" },
  { slug: "6t4k4d2h31512r", title: "Obsidian Build 14", category: "Landing", url: "https://obsidianvibe.live/api/public/share/6t4k4d2h31512r" },
  { slug: "0x1b67096z3d2l", title: "Obsidian Build 15", category: "Dashboard", url: "https://obsidianvibe.live/api/public/share/0x1b67096z3d2l" },
  { slug: "4a452v014l4a3d", title: "Obsidian Build 16", category: "Tool", url: "https://obsidianvibe.live/api/public/share/4a452v014l4a3d" },
  { slug: "4t4k4q2u0e2i0y", title: "Obsidian Build 17", category: "Game", url: "https://obsidianvibe.live/api/public/share/4t4k4q2u0e2i0y" },
  { slug: "3u6x2m401k4y6q", title: "Obsidian Build 18", category: "Portfolio", url: "https://obsidianvibe.live/api/public/share/3u6x2m401k4y6q" },
  { slug: "214o3v5d1g421g", title: "Obsidian Build 20", category: "Dashboard", url: "https://obsidianvibe.live/api/public/share/214o3v5d1g421g#live-map" },
  { slug: "4b3k4t624s4n1l", title: "Obsidian Build 21", category: "Landing", url: "https://obsidianvibe.live/api/public/share/4b3k4t624s4n1l#preview" },
  { slug: "2e5n3j0y47664q", title: "Obsidian Build 23", category: "Game", url: "https://obsidianvibe.live/api/public/share/2e5n3j0y47664q#episodes" },
  { slug: "4g71725v6y2o5b", title: "Obsidian Build 24", category: "App", url: "https://obsidianvibe.live/api/public/share/4g71725v6y2o5b" },
];

function cleanDemoTitle(raw: string): string {
  let t = (raw || "").replace(/^Demo\s*·\s*/i, "").trim();
  // strip markdown headings, "Role & Persona" prompt starts, code fences
  t = t.replace(/^#+\s*/g, "").replace(/^Role\s*&\s*Persona[:\-]?\s*/i, "");
  t = t.replace(/^You are (?:the|a|an)?\s*/i, "").replace(/["`*_]/g, "");
  t = t.split(/[\r\n]/)[0].trim();
  if (t.length > 60) t = t.slice(0, 57).trimEnd() + "…";
  return t || "Untitled build";
}

function LiveDemosSection() {
  const [cat, setCat] = useState<DemoCategory | "All">("All");
  const [expanded, setExpanded] = useState(false);
  const [featured, setFeatured] = useState<typeof HOME_DEMOS>([]);
  useEffect(() => {
    let alive = true;
    supabase.from("featured_demos").select("slug, title, category, url").order("sort_order", { ascending: false }).limit(200)
      .then(({ data }) => {
        if (!alive || !data) return;
        setFeatured(data.map((d) => ({
          slug: d.slug, title: d.title, url: d.url ?? undefined,
          category: (DEMO_CATEGORIES as readonly string[]).includes(d.category) ? (d.category as DemoCategory) : "App",
        })));
      });
    return () => { alive = false; };
  }, []);

  const allMerged = useMemo(() => {
    // DB is source of truth; only fall back to HOME_DEMOS if DB is empty.
    const source = featured.length > 0 ? featured : HOME_DEMOS;
    const map = new Map<string, typeof HOME_DEMOS[number] & { demoUrl: string }>();
    for (const d of source) {
      const demoUrl = d.url ?? `/api/public/share/${d.slug}`;
      if (!map.has(demoUrl)) map.set(demoUrl, { ...d, demoUrl });
    }
    return [...map.values()];
  }, [featured]);

  const merged = useMemo(
    () => allMerged.filter((d) => cat === "All" || d.category === cat),
    [allMerged, cat],
  );

  const items = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return merged.map((d) => {
      const abs = /^https?:\/\//i.test(d.demoUrl) ? d.demoUrl : `${origin}${d.demoUrl}`;
      return {
        src: `https://image.thum.io/get/width/600/crop/600/noanimate/${abs}`,
        title: cleanDemoTitle(d.title),
        subtitle: d.category,
        href: d.demoUrl,
      };
    });
  }, [merged]);

  const totalCount = allMerged.length;

  function handleCat(c: DemoCategory | "All") {
    setCat(c);
    // Selecting a specific category auto-expands; "All" collapses back to summary
    setExpanded(c !== "All");
  }

  return (
    <section id="demo" className="max-w-6xl mx-auto px-6 py-20">
      <Reveal>
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#F4A125]/30 bg-[#F4A125]/10 text-xs text-[#F4A125] mb-4 backdrop-blur">
            <Sparkles className="w-3 h-3" /> Live Demos
          </div>
          <h2 className="text-4xl md:text-5xl font-bold">
            Real builds. <span className="gold-text">Real code.</span>
          </h2>
          <p className="mt-3 text-[#B6BCC8]">
            {totalCount > 0 ? `${totalCount} live demos` : "Explore what people have shipped with Obsidian."}
          </p>
        </div>
      </Reveal>
      <Reveal delay={100}>
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {(["All", ...DEMO_CATEGORIES] as const).map((c) => {
            const active = cat === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => handleCat(c)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium border transition ${
                  active
                    ? "border-[#F4A125]/60 bg-[#F4A125]/15 text-[#F4A125] shadow-[0_0_20px_rgba(244,161,37,0.25)]"
                    : "border-white/10 bg-white/5 text-[#B6BCC8] hover:text-white hover:border-white/25"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      </Reveal>
      <Reveal delay={150}>
        <div className="flex justify-center mb-6">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="px-6 py-2.5 rounded-full text-sm font-semibold border border-[#F4A125]/50 bg-[#F4A125]/10 text-[#F4A125] hover:bg-[#F4A125]/20 transition shadow-[0_0_25px_rgba(244,161,37,0.2)]"
          >
            {expanded ? "Hide demos" : `Show ${items.length || totalCount} demo${(items.length || totalCount) === 1 ? "" : "s"}`}
          </button>
        </div>
      </Reveal>
      {expanded && (
        <Reveal delay={200}>
          {items.length === 0 ? (
            <div className="text-center text-[#8b93a1] text-sm py-16">No demos in this category yet.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {items.map((it) => (
                <a
                  key={it.href}
                  href={it.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group glass rounded-2xl overflow-hidden border border-white/10 hover:border-[#F4A125]/50 transition shadow-[0_10px_40px_rgba(0,0,0,0.4)] hover:shadow-[0_20px_60px_rgba(244,161,37,0.15)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#0b0d10]">
                    <img
                      src={it.src}
                      alt={it.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-3 left-3 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-black/70 text-[#F4A125] border border-[#F4A125]/30">
                      {it.subtitle}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-white font-semibold text-sm line-clamp-1">{it.title}</div>
                    <div className="text-[11px] text-[#B6BCC8] mt-1">Open demo →</div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </Reveal>
      )}
    </section>
  );
}

function HeroOrb() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ zIndex: 0 }}
    >
      <div
        className="relative"
        style={{
          width: "min(92vw, 780px)",
          height: "min(92vw, 780px)",
          maxHeight: "78vh",
          filter: "drop-shadow(0 0 60px rgba(244,161,37,0.35)) drop-shadow(0 0 140px rgba(244,161,37,0.18))",
        }}
      >
        {/* Amber bloom halo */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(244,161,37,0.28) 0%, rgba(244,161,37,0.10) 30%, transparent 65%)",
            animation: "orbPulse 8s ease-in-out infinite",
          }}
        />
        {mounted && (
          <Suspense fallback={null}>
            <AnomalousMatterScene color="#F4A125" className="absolute inset-0 w-full h-full" />
          </Suspense>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Obsidian — AI system builder for people who don't code" },
      { name: "description", content: "Obsidian is an AI system builder for people who don't code. Not like Base 44, Lovable, or Bolt. A starter tool for vibe coding that builds something that works the first time, without confusing options. One high-quality project free." },
      { property: "og:title", content: "Obsidian — AI system builder for people who don't code" },
      { property: "og:description", content: "A starter tool for vibe coding. Build something that works the first time, without confusing options. One project free." },
      { property: "og:url", content: "https://obsidianvibe.live/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Obsidian — AI system builder for people who don't code" },
      { name: "twitter:description", content: "A starter tool for vibe coding. Build something that works the first time, without confusing options. One project free." },
    ],
    links: [{ rel: "canonical", href: "https://obsidianvibe.live/" }],
  }),
  component: Home,
});

/** Lightweight IntersectionObserver-based reveal. Respects prefers-reduced-motion. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) { setShown(true); io.disconnect(); break; }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 700ms ease-out ${delay}ms, transform 700ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

function Home() {
  useEffect(() => { trackHomeVisit(); }, []);
  const onBuildFree = (source: string) => () => track("build_free_click", { source });

  return (
    <div className="min-h-screen bg-[#030405] text-[#f2eee7] overflow-x-hidden relative">
      {/* Animated dithering shader background */}
      <DitheringBackground
        colorBack="#030405"
        colorFront="#F4A125"
        shape="warp"
        type="4x4"
        size={3.2}
      />

      <style>{`
        @keyframes orbFloat { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,-20px) scale(1.06); } }
        @keyframes orbPulse { 0%,100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.05); opacity: 1; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes heroFadeIn { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .hero-title { animation: heroFadeIn 900ms cubic-bezier(0.16,1,0.3,1) both; }
        .hero-sub { animation: heroFadeIn 900ms cubic-bezier(0.16,1,0.3,1) 150ms both; }
        .hero-cta { animation: heroFadeIn 900ms cubic-bezier(0.16,1,0.3,1) 300ms both; }
        .glass { background: #111317; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 20px 60px -20px rgba(0,0,0,0.6); }
        .glass-hover { transition: transform 400ms cubic-bezier(0.16,1,0.3,1), border-color 300ms, box-shadow 300ms; }
        .glass-hover:hover { transform: translateY(-4px); border-color: rgba(244,161,37,0.35); box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset, 0 30px 80px -20px rgba(244,161,37,0.15); }
        .gold-text { background: linear-gradient(90deg, #F4A125, #DD9324, #F4A125); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: shimmer 6s linear infinite; }
        .float-y { animation: floatY 4s ease-in-out infinite; }
        .cta-glow { position: relative; }
        .cta-glow::after { content: ""; position: absolute; inset: -2px; border-radius: inherit; background: linear-gradient(90deg, #F4A125, #DD9324); filter: blur(18px); opacity: 0.45; z-index: -1; transition: opacity 300ms; }
        .cta-glow:hover::after { opacity: 0.75; }
        @media (prefers-reduced-motion: reduce) {
          .hero-title,.hero-sub,.hero-cta { animation: none !important; }
          .float-y,.gold-text { animation: none !important; }
        }
      `}</style>

      <div className="relative z-10">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/40 border-b border-white/5">
          <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
            <a href="#" className="flex items-center gap-2" aria-label="Obsidian Vibe">
              <img
                src={obsidianLogo.url}
                alt="Obsidian Vibe"
                className="h-36 w-auto object-contain select-none"
                draggable={false}
              />
            </a>
            <nav className="hidden md:flex items-center gap-6 text-sm text-[#B6BCC8]">
              <a href="#demo" className="hover:text-white transition-colors">Demo</a>
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#details" className="hover:text-white transition-colors">Details</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            </nav>
            <Link
              to="/build"
              search={{ q: undefined }}
              onClick={onBuildFree("nav")}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#F4A125] to-[#DD9324] text-black text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Build Free
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="relative overflow-hidden bg-black">
          {/* GLSL hills terrain — sits behind the orb */}
          <ClientOnly fallback={null}>
            <Suspense fallback={null}>
              <div className="pointer-events-none absolute inset-0" style={{ zIndex: 0 }} aria-hidden>
                <GLSLHills className="absolute inset-0 w-full h-full" />
              </div>
            </Suspense>
          </ClientOnly>
          <HeroOrb />
          {/* Readability veil under the copy */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 top-0"
            style={{
              zIndex: 5,
              background:
                "radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.75) 100%)",
            }}
          />
          <div className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center relative z-10">
            <div className="hero-title inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#F4A125]/40 bg-black/60 text-xs text-[#F4A125] mb-6 backdrop-blur">
              <Sparkles className="w-3 h-3" /> No credit card required
            </div>
            <h1
              className="hero-title text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] text-white"
              style={{ textShadow: "0 2px 24px rgba(0,0,0,0.85), 0 0 60px rgba(0,0,0,0.6)" }}
            >
              Think it. Type it.
              <br />
              <span className="gold-text">See it built.</span>
            </h1>
            <p
              className="hero-sub mt-6 text-lg md:text-xl text-white/90 max-w-2xl mx-auto"
              style={{ textShadow: "0 2px 16px rgba(0,0,0,0.8)" }}
            >
              Obsidian is an AI system builder for people who don't code. Get one high-quality
              project built free using our best default model. Upgrade only when you're ready.
            </p>
            <div className="hero-cta mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/build"
                search={{ q: undefined }}
                onClick={onBuildFree("hero")}
                className="cta-glow group px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#F4A125] to-[#DD9324] text-black font-semibold text-base flex items-center gap-2 hover:opacity-95 transition"
              >
                Build Free – No Credit Card Required
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a href="#pricing" className="px-6 py-3.5 rounded-xl border border-white/20 bg-black/40 text-sm text-white hover:text-white hover:border-white/40 transition backdrop-blur">
                See pricing
              </a>
            </div>
            <p className="hero-cta mt-4 text-xs text-white/70" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.8)" }}>
              Free build stays available for 7 days. Upgrade any time to save it permanently.
            </p>
          </div>
        </section>


        {/* Live Demos — dome gallery */}
        <LiveDemosSection />

        {/* Open the Builder — interactive prompt launcher */}
        <section id="try" className="max-w-6xl mx-auto px-6 py-20">
          <Reveal>
            <div className="grid md:grid-cols-[1.1fr_1fr] gap-8 items-stretch">
              <div className="glass glass-hover rounded-3xl p-8 md:p-10 relative overflow-hidden">
                <div aria-hidden className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-40 blur-3xl"
                     style={{ background: "radial-gradient(circle, #F4A125 0%, transparent 65%)" }} />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#F4A125]/30 bg-[#F4A125]/10 text-xs text-[#F4A125] mb-5 backdrop-blur">
                    <Play className="w-3 h-3" /> Open the Builder
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold leading-tight">
                    One prompt away from a <span className="gold-text">working product.</span>
                  </h2>
                  <p className="mt-4 text-[#B6BCC8]">
                    Type an idea. Obsidian streams the code, renders a live preview, and gives you a real
                    React + TypeScript project you can share, export, or deploy.
                  </p>
                  <PromptLauncher />
                  <p className="mt-3 text-xs text-[#8b93a1]">Free · No credit card · 7-day retention on the free tier</p>
                </div>
              </div>

              <div className="grid gap-3">
                {[
                  "A landing page for my coffee subscription",
                  "A budget tracker with charts",
                  "A tic-tac-toe game with sound",
                  "A dashboard for tracking client invoices",
                  "A portfolio site with a dark cinematic hero",
                ].map((ex, i) => (
                  <Reveal key={ex} delay={i * 60}>
                    <Link
                      to="/build"
                      search={{ q: ex }}
                      onClick={() => track("build_free_click", { source: "example", prompt: ex })}
                      className="glass glass-hover group flex items-center justify-between px-5 py-4 rounded-2xl text-sm text-[#f2eee7]"
                    >
                      <span className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-[#F4A125]/10 border border-[#F4A125]/30 flex items-center justify-center text-[#F4A125] text-xs font-bold">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {ex}
                      </span>
                      <ArrowRight className="w-4 h-4 text-[#F4A125] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                    </Link>
                  </Reveal>
                ))}
              </div>
            </div>
          </Reveal>
        </section>


        {/* Features */}
        <section id="features" className="max-w-6xl mx-auto px-6 py-16">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold">Everything you need to ship</h2>
              <p className="mt-3 text-[#B6BCC8]">Real code. Real preview. Real deployment.</p>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { icon: Zap, title: "Best default model", body: "We pick the strongest model for each task so your first build is quality — not a demo toy." },
              { icon: Shield, title: "Honest limits", body: "Free = one project, limited revisions, 7-day retention. You know before you start." },
              { icon: Rocket, title: "Upgrade only when needed", body: "Deploy, permanent save, exports, auth, databases, and premium models on paid plans." },
            ].map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 100}>
                <div className="glass glass-hover p-6 rounded-2xl h-full">
                  <Icon className="w-6 h-6 text-[#F4A125] mb-4" />
                  <h3 className="font-semibold text-lg">{title}</h3>
                  <p className="mt-2 text-sm text-[#B6BCC8]">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Details — collapsible dense info */}
        <section id="details" className="max-w-4xl mx-auto px-6 py-16">
          <Reveal>
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold">The technical details</h2>
              <p className="mt-3 text-[#B6BCC8]">Expand what matters to you.</p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="glass rounded-2xl p-2 md:p-4">
              <Accordion type="single" collapsible className="w-full">
                <DetailItem value="ai" icon={Brain} title="AI models & routing">
                  Obsidian routes each request to the right model automatically: Gemini 1.5 Flash for fast turns,
                  GPT-4o Mini for balanced tasks, Gemini 1.5 Pro for deep builds. Auto Mode picks based on task
                  complexity so you never pay for horsepower you don't need.
                </DetailItem>
                <DetailItem value="stack" icon={Layers} title="Stack & output">
                  Real React + TypeScript output — not a toy sandbox. Tailwind styling, semantic components,
                  responsive by default, exportable as HTML or a full ZIP on paid plans.
                </DetailItem>
                <DetailItem value="security" icon={Lock} title="Security & privacy">
                  Row-level security on every table, scoped API keys, and no third-party trackers on your builds.
                  Your prompts and code stay tied to your library code, never sold, never shared.
                </DetailItem>
                <DetailItem value="integrations" icon={Plug} title="Integrations">
                  Stripe checkout, GitHub push, Supabase auth & DB, custom domains, and an MCP server so agents
                  can browse your featured demos. Add secrets in Project Settings when needed.
                </DetailItem>
                <DetailItem value="perf" icon={Cpu} title="Performance & credits">
                  Streaming previews render as the model writes. A visible credit bar shows exactly what each
                  build and edit costs — no surprise burn.
                </DetailItem>
                <DetailItem value="faq" icon={HelpCircle} title="FAQ">
                  <div className="space-y-3">
                    <p><strong className="text-white">Do I need an account?</strong> Not to try. You need one to save permanently or deploy.</p>
                    <p><strong className="text-white">What happens after 7 days on the free tier?</strong> Your build is archived. Upgrade any time to restore and continue editing.</p>
                    <p><strong className="text-white">Can I cancel?</strong> Yes — monthly plans cancel any time. Whitelist is a one-time payment.</p>
                  </div>
                </DetailItem>
              </Accordion>
            </div>
          </Reveal>
        </section>

        {/* Pricing */}
        <section id="pricing" className="max-w-6xl mx-auto px-6 py-16">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold">Free to start. Upgrade when you're ready.</h2>
              <p className="mt-3 text-[#B6BCC8]">No credit card for your first build.</p>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5">
            <Reveal delay={0}>
              <div className="glass glass-hover p-6 rounded-2xl border-[#F4A125]/40 h-full">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xl font-bold">Free</h3>
                  <span className="text-xs text-[#B6BCC8]">Try it now</span>
                </div>
                <div className="mt-2 text-3xl font-bold">$0</div>
                <PriceList items={["1 high-quality project", "Best default AI model", "Limited revisions", "7-day retention", "Preview in browser"]} />
                <Link
                  to="/build"
                  search={{ q: undefined }}
                  onClick={onBuildFree("pricing")}
                  className="cta-glow mt-6 block text-center px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#F4A125] to-[#DD9324] text-black hover:opacity-95 transition"
                >
                  Start free
                </Link>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="glass glass-hover p-6 rounded-2xl h-full">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xl font-bold">Creator</h3>
                  <span className="text-xs text-[#B6BCC8]">For makers</span>
                </div>
                <div className="mt-2 text-3xl font-bold">$79/mo</div>
                <PriceList items={["Unlimited builds", "Permanent save", "Deploy & share", "Exports (HTML/ZIP)", "Auth & database", "Premium models"]} />
                <Link
                  to="/unlock"
                  search={{ intent: "buy", checkout: "1" }}
                  onClick={() => track("upgrade_view", { plan: "creator" })}
                  className="mt-6 block text-center px-4 py-2.5 rounded-lg text-sm font-semibold border border-white/15 text-white hover:bg-white/5 transition"
                >
                  Get Creator
                </Link>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className="glass glass-hover p-6 rounded-2xl h-full">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-xl font-bold">Whitelist</h3>
                  <span className="text-xs text-[#B6BCC8]">First 1,000</span>
                </div>
                <div className="mt-2 text-3xl font-bold">$100</div>
                <PriceList items={["Early access forever", "Founder pricing lock-in", "Priority feature votes", "Direct architect access"]} />
                <Link
                  to="/unlock"
                  search={{ intent: "buy", priceId: "obsidian_whitelist" }}
                  onClick={() => track("upgrade_view", { plan: "whitelist" })}
                  className="mt-6 block text-center px-4 py-2.5 rounded-lg text-sm font-semibold border border-white/15 text-white hover:bg-white/5 transition"
                >
                  Join Whitelist
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Founder */}
        <section id="founder" className="max-w-4xl mx-auto px-6 py-20 text-center">
          <Reveal>
            <img
              src={obsidianLogo.url}
              alt="Obsidian Vibe"
              className="mx-auto mb-6 h-72 w-auto object-contain float-y select-none"
              style={{ filter: "drop-shadow(0 0 40px rgba(244,161,37,0.4))" }}
              draggable={false}
            />
            <h2 className="text-2xl md:text-3xl font-bold">Built by an independent architect</h2>
            <p className="mt-4 text-[#B6BCC8] max-w-2xl mx-auto">
              Obsidian is built by a single operator focused on making real software creation
              accessible to people who don't code. Every dollar goes back into the product — no VCs,
              no bloat, no dark patterns.
            </p>
            <p className="mt-2 text-sm text-[#8b93a1]">— Aetheris.Technology</p>
          </Reveal>
        </section>

        <footer className="border-t border-white/5 py-8 text-center text-xs text-[#8b93a1]">
          <div className="flex items-center justify-center gap-4">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <a href="https://businessforensics.tech/aetheris-universe" target="_blank" rel="noopener noreferrer">Aetheris Universe</a>
          </div>
          <p className="mt-3">© {new Date().getFullYear()} Obsidian · Aetheris.Technology</p>
        </footer>
      </div>
    </div>
  );
}

function DetailItem({ value, icon: Icon, title, children }: { value: string; icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={value} className="border-white/5">
      <AccordionTrigger className="px-4 py-4 hover:no-underline text-left group">
        <span className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-[#F4A125]/10 border border-[#F4A125]/20 flex items-center justify-center group-hover:bg-[#F4A125]/20 transition">
            <Icon className="w-4 h-4 text-[#F4A125]" />
          </span>
          <span className="font-medium text-[#f2eee7]">{title}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-5 text-[#B6BCC8] leading-relaxed">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

function PriceList({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-2 text-sm text-[#B6BCC8]">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2">
          <Check className="w-4 h-4 text-[#F4A125] mt-0.5 shrink-0" />
          <span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

function PromptLauncher() {
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        track("build_free_click", { source: "prompt_launcher", prompt: q || undefined });
        const url = q.trim() ? `/build?q=${encodeURIComponent(q.trim())}` : "/build";
        window.location.href = url;
      }}
      className="mt-7 glass rounded-2xl p-2 flex items-center gap-2 focus-within:border-[#F4A125]/50 transition"
    >
      <span className="pl-3 text-[#F4A125]">›</span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Describe what you want to build…"
        className="flex-1 bg-transparent outline-none py-3 text-sm placeholder:text-[#8b93a1] text-[#f2eee7]"
        aria-label="What do you want to build?"
      />
      <button
        type="submit"
        className="cta-glow px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#F4A125] to-[#DD9324] text-black text-sm font-semibold flex items-center gap-2 hover:opacity-95 transition"
      >
        Build <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}
