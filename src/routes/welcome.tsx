import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/ui/header";
import { HeroSection } from "@/components/ui/hero";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Obsidian — Vibe Coding. Elevated." },
      {
        name: "description",
        content:
          "Code with clarity. Build with intention. Obsidian is the free, no-login vibe coding tool for builders who value focus, flow, and precision.",
      },
      { property: "og:title", content: "Obsidian — Vibe Coding. Elevated." },
      {
        property: "og:description",
        content:
          "Code with clarity. Build with intention. Obsidian is the free, no-login vibe coding tool for builders who value focus, flow, and precision.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/welcome" },
    ],
    links: [{ rel: "canonical", href: "/welcome" }],
  }),
  component: Welcome,
});

function Welcome() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <Header />
      <main className="grow pb-24">
        <HeroSection />
        <HowItWorks />
        <Models />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

const STEPS = [
  {
    title: "Describe it",
    body: "Tell Obsidian what you want to build, in plain language. One thing at a time.",
  },
  {
    title: "Watch it build",
    body: "Your model of choice writes the page live. The result renders instantly beside the chat.",
  },
  {
    title: "Keep iterating",
    body: "Obsidian remembers what already works, so every follow-up builds on a stable result.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-5xl px-4 py-24">
      <div className="max-w-xl">
        <p className="font-mono text-xs uppercase tracking-widest text-amber">How it works</p>
        <h2 className="mt-3 text-balance font-serif text-3xl font-medium text-foreground md:text-4xl">
          From prompt to page, one step at a time
        </h2>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="glass-panel flex flex-col gap-3 p-5">
            <span className="font-mono text-xs text-amber">0{i + 1}</span>
            <h3 className="text-base font-medium text-foreground">{step.title}</h3>
            <p className="text-sm text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const MODEL_LIST = [
  { label: "Gemini 2.5 Pro", hint: "Default · multimodal" },
  { label: "Claude 3.5 Sonnet", hint: "Anthropic · best code" },
  { label: "GPT-4 Turbo", hint: "OpenAI · powerful" },
  { label: "Gemini 3.5 Flash", hint: "Fast alternative" },
  { label: "Gemini 3.1 Pro", hint: "Deep reasoning" },
];

function Models() {
  return (
    <section id="models" className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="glass-panel flex flex-col gap-6 p-6 sm:p-8">
        <div className="max-w-xl">
          <p className="font-mono text-xs uppercase tracking-widest text-amber">
            Bring your own reasoning
          </p>
          <h2 className="mt-3 text-balance font-serif text-2xl font-medium text-foreground md:text-3xl">
            Switch models mid-conversation, no re-setup
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {MODEL_LIST.map((model) => (
            <div
              key={model.label}
              className="flex items-center gap-2 rounded-full border border-border/40 bg-white/5 px-3 py-1.5"
            >
              <span className="text-xs font-medium text-foreground">{model.label}</span>
              <span className="text-[10px] text-muted-foreground/60">{model.hint}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "Do I need an account?",
    a: "No. Obsidian is free and works without a login — open it and start describing what you want to build.",
  },
  {
    q: "Which AI models power it?",
    a: "Obsidian routes your prompt to Gemini 2.5 Pro by default, with Claude 3.5 Sonnet and GPT-4 Turbo available whenever you want a different take.",
  },
  {
    q: "Does it remember earlier changes?",
    a: "Yes. Each new instruction builds on the current working result instead of starting over, so your page stays intact as you iterate.",
  },
];

function Faq() {
  return (
    <section id="faq" className="mx-auto w-full max-w-5xl px-4 py-24">
      <div className="max-w-xl">
        <p className="font-mono text-xs uppercase tracking-widest text-amber">FAQ</p>
        <h2 className="mt-3 text-balance font-serif text-3xl font-medium text-foreground md:text-4xl">
          Good to know
        </h2>
      </div>

      <div className="mt-10 divide-y divide-border/30 border-t border-border/30">
        {FAQS.map((item) => (
          <div key={item.q} className="grid gap-2 py-6 sm:grid-cols-3 sm:gap-6">
            <h3 className="text-sm font-medium text-foreground">{item.q}</h3>
            <p className="text-sm text-muted-foreground sm:col-span-2">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4">
      <div className="glass-panel-amber glass-shine flex flex-col items-start gap-4 p-8 sm:p-12">
        <h2 className="text-balance font-serif text-3xl font-medium text-foreground md:text-4xl">
          Tell it what to build.
        </h2>
        <p className="max-w-md text-sm text-muted-foreground md:text-base">
          No setup, no boilerplate, no login. Open Obsidian and describe your first page.
        </p>
        <a
          href="/"
          className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          Start building
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto w-full max-w-5xl border-t border-border/30 px-4 py-8">
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4" viewBox="0 0 32 40" fill="none" aria-hidden="true">
            <path
              d="M16 0L8 10L16 20L8 30L16 40M16 0L24 10L16 20L24 30L16 40"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-amber"
            />
          </svg>
          <span className="font-mono text-xs font-semibold tracking-wide text-amber">OBSIDIAN</span>
        </div>
        <p className="text-xs text-muted-foreground/60">
          &copy; {new Date().getFullYear()} Obsidian. Vibe coding, elevated.
        </p>
      </div>
    </footer>
  );
}
