// Representative fixtures for the three cold-build baseline prompts.
// Intentionally small, hand-authored to be typical of what the current
// pipeline emits (habitual centered-hero + triad-card + CTA banner pattern).
// Real live-generated samples can replace these later; they only need to be
// structurally representative for pattern/interaction/token measurement.

import type { FixtureBundle } from "./harness";

export const FIXTURES: FixtureBundle[] = [
  {
    promptId: "b2b-analytics",
    model: "gemini-1.5-flash",
    strategy: "full-generation",
    latencyMs: 4200,
    costMeta: { tier: "fast", est_credits: 1 },
    html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Analytics</title><style>:root{--bg:#0b0d10;--fg:#e8eef7;--accent:#F4A125}body{font-family:Inter,sans-serif;background:var(--bg);color:var(--fg);margin:0}.hero{text-align:center;padding:80px 20px}.grid-cols-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:40px}.card{background:#111317;border-radius:12px;padding:24px}button{background:var(--accent);color:#111;padding:12px 24px;border:0;border-radius:8px}</style></head><body><section class="hero"><h1>Analytics that scale</h1><p>Real-time dashboards</p><button>Get started</button><button>Book a demo</button></section><section class="grid-cols-3"><div class="card"><h3>KPIs</h3></div><div class="card"><h3>Charts</h3></div><div class="card"><h3>Reports</h3></div></section><section><p>Trusted by</p></section><section><h2>Ready?</h2><a href="https://example.com" target="_blank">Sign up</a></section></body></html>`,
  },
  {
    promptId: "editorial-hospitality",
    model: "gemini-1.5-pro",
    strategy: "full-generation",
    latencyMs: 7800,
    costMeta: { tier: "deep", est_credits: 3 },
    html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Villa</title><style>:root{--bg:#f7f2ea;--fg:#2b1e14;--accent:#c9761f}body{font-family:Fraunces,Georgia,serif;background:var(--bg);color:var(--fg);margin:0}.hero{text-align:center;padding:120px 20px}.grid-cols-3{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:60px}.card{background:#fff;border-radius:4px;padding:32px}button{background:var(--accent);color:#fff;padding:14px 28px;border:0;border-radius:2px}</style></head><body><section class="hero"><h1>An intimate boutique retreat</h1><p>Quiet luxury on the coast</p><button>Reserve</button><button>Explore</button></section><section class="grid-cols-3"><div class="card"><h3>Suites</h3></div><div class="card"><h3>Dining</h3></div><div class="card"><h3>Spa</h3></div></section><section><p>As seen on</p></section><section><h2>Book your stay</h2><a href="mailto:hi@example.com">Contact</a></section></body></html>`,
  },
  {
    promptId: "playful-edu",
    model: "gemini-1.5-flash",
    strategy: "full-generation",
    latencyMs: 5100,
    costMeta: { tier: "fast", est_credits: 1 },
    html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Learn</title><style>:root{--bg:#fff8ec;--fg:#25204a;--accent:#ff7ab6}body{font-family:Inter,sans-serif;background:var(--bg);color:var(--fg);margin:0}.hero{text-align:center;padding:80px 20px}.grid-cols-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:40px}.card{background:#fff;border-radius:24px;padding:24px}button{background:var(--accent);color:#fff;padding:12px 24px;border:0;border-radius:999px}</style></head><body><section class="hero"><h1>Learning is play</h1><p>Fun lessons for curious kids</p><button>Start free</button><button>Sign up</button></section><section class="grid-cols-3"><div class="card"><h3>Math</h3></div><div class="card"><h3>Reading</h3></div><div class="card"><h3>Science</h3></div></section><section><p>Trusted by schools</p></section><section><h2>Try it today</h2><a href="#">Learn more</a></section></body></html>`,
  },
];
