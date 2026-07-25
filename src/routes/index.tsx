import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Sparkles, Zap, Shield, Code2, Rocket, Check } from "lucide-react";
import { trackHomeVisit, track } from "@/lib/analytics";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Obsidian — Build production software with AI, free to start" },
      { name: "description", content: "Type your idea, watch it build. One high-quality project free — no credit card required. Upgrade only when you're ready to save, deploy, or keep editing." },
      { property: "og:title", content: "Obsidian — Build production software with AI" },
      { property: "og:description", content: "Free AI system builder. One project free, no credit card. Save & deploy on paid plans." },
      { property: "og:url", content: "https://obsidianvibe.live/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Obsidian — Build production software with AI" },
      { name: "twitter:description", content: "Free AI system builder. One project free, no credit card." },
    ],
    links: [{ rel: "canonical", href: "https://obsidianvibe.live/" }],
  }),
  component: Home,
});

function Home() {
  useEffect(() => { trackHomeVisit(); }, []);
  const onBuildFree = (source: string) => () => track("build_free_click", { source });

  return (
    <div className="min-h-screen bg-[#030405] text-[#f2eee7]">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-black/40 border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-gradient-to-br from-[#F4A125] to-[#DD9324]" aria-hidden />
            <span className="font-semibold tracking-tight">Obsidian</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-[#B6BCC8]">
            <a href="#demo" className="hover:text-white">Demo</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#founder" className="hover:text-white">Founder</a>
          </nav>
          <Link
            to="/build"
            search={{ q: undefined }}
            onClick={onBuildFree("nav")}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#F4A125] to-[#DD9324] text-black text-sm font-semibold hover:opacity-90"
          >
            Build Free
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#F4A125]/30 bg-[#F4A125]/10 text-xs text-[#F4A125] mb-6">
            <Sparkles className="w-3 h-3" /> No credit card required
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
            Think it. Type it.
            <br />
            <span className="bg-gradient-to-r from-[#F4A125] to-[#DD9324] bg-clip-text text-transparent">See it built.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-[#B6BCC8] max-w-2xl mx-auto">
            Obsidian is an AI system builder for people who don't code. Get one high-quality
            project built free using our best default model. Upgrade only when you're ready to
            save it permanently, deploy, or keep editing.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/build"
              search={{ q: undefined }}
              onClick={onBuildFree("hero")}
              className="group px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#F4A125] to-[#DD9324] text-black font-semibold text-base flex items-center gap-2 hover:opacity-90"
            >
              Build Free – No Credit Card Required
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a href="#pricing" className="px-6 py-3.5 rounded-xl border border-white/10 text-sm text-[#B6BCC8] hover:text-white hover:border-white/20">
              See pricing
            </a>
          </div>
          <p className="mt-4 text-xs text-[#8b93a1]">
            Free build stays available for 7 days. Upgrade any time to save it permanently.
          </p>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold">Watch it build in real time</h2>
          <p className="mt-3 text-[#B6BCC8]">From plain-English idea to working preview in seconds.</p>
        </div>
        <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-[#0a0b0f] to-[#111317] shadow-2xl">
          <div className="absolute inset-0 flex items-center justify-center text-center">
            <div>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#F4A125]/20 flex items-center justify-center">
                <Code2 className="w-8 h-8 text-[#F4A125]" />
              </div>
              <p className="text-[#B6BCC8]">Live demo — try it yourself</p>
              <Link
                to="/build"
                search={{ q: undefined }}
                onClick={onBuildFree("demo")}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
              >
                Open the builder <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 grid md:grid-cols-3 gap-3">
          {[
            "A landing page for my coffee subscription",
            "A budget tracker with charts",
            "A tic-tac-toe game with sound",
          ].map((ex) => (
            <Link
              key={ex}
              to="/build"
              search={{ q: ex }}
              onClick={() => track("build_free_click", { source: "example", prompt: ex })}
              className="text-left px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-[#f2eee7]"
            >
              <span className="text-[#F4A125] mr-2">›</span>{ex}
            </Link>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">Everything you need to ship</h2>
          <p className="mt-3 text-[#B6BCC8]">Real code. Real preview. Real deployment.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { icon: Zap, title: "Best default model", body: "We pick the strongest model for each task so your first build is quality — not a demo toy." },
            { icon: Shield, title: "Honest limits", body: "Free = one project, limited revisions, 7-day retention. You know before you start." },
            { icon: Rocket, title: "Upgrade only when needed", body: "Deploy, permanent save, exports, auth, databases, and premium models on paid plans." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="p-6 rounded-2xl border border-white/10 bg-white/[0.03]">
              <Icon className="w-6 h-6 text-[#F4A125] mb-4" />
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="mt-2 text-sm text-[#B6BCC8]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold">Free to start. Upgrade when you're ready.</h2>
          <p className="mt-3 text-[#B6BCC8]">No credit card for your first build.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          <div className="p-6 rounded-2xl border border-[#F4A125]/40 bg-[#F4A125]/[0.06]">
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
              className="mt-6 block text-center px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#F4A125] to-[#DD9324] text-black hover:opacity-90"
            >
              Start free
            </Link>
          </div>
          <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.03]">
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
              className="mt-6 block text-center px-4 py-2.5 rounded-lg text-sm font-semibold border border-white/15 text-white hover:bg-white/5"
            >
              Get Creator
            </Link>
          </div>
          <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.03]">
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
              className="mt-6 block text-center px-4 py-2.5 rounded-lg text-sm font-semibold border border-white/15 text-white hover:bg-white/5"
            >
              Join Whitelist
            </Link>
          </div>
        </div>
      </section>

      {/* Founder */}
      <section id="founder" className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="inline-block w-20 h-20 rounded-full bg-gradient-to-br from-[#F4A125] to-[#DD9324] mb-6" aria-hidden />
        <h2 className="text-2xl md:text-3xl font-bold">Built by an independent architect</h2>
        <p className="mt-4 text-[#B6BCC8] max-w-2xl mx-auto">
          Obsidian is built by a single operator focused on making real software creation
          accessible to people who don't code. Every dollar goes back into the product — no VCs,
          no bloat, no dark patterns.
        </p>
        <p className="mt-2 text-sm text-[#8b93a1]">— Aetheris.Technology</p>
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
