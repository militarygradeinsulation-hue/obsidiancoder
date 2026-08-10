// Lightweight AI idea generation. Free for the user (no credit gate), tiny
// requests to the Lovable AI Gateway. Two surfaces:
//   1) generateStarterIdeas — fresh "what could I build" prompts when the
//      composer is empty.
//   2) anticipateNextIdeas — the AI reads the user's in-progress prompt and
//      proposes concrete next-step additions they can accept with one click.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { REAL_WORLD_LEAKS_PROMPT } from "./real-world-leaks";
import {
  filterGenericSuggestions,
  isExplicitTradesContext,
  neutralEnhancementFallbacks,
} from "./suggestion-safety";

const MODEL = "google/gemini-3.1-flash-lite";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type IdeaSuggestion = { id: string; label: string; snippet: string };

const CATEGORIES = [
  "all",
  "ai",
  "app",
  "game",
  "productivity",
  "education",
  "presentation",
  "landing",
  "dashboard",
  "portfolio",
  "trades",
] as const;

const starterInput = z.object({
  exclude: z.array(z.string()).max(120).optional().default([]),
  count: z.number().int().min(3).max(8).optional().default(6),
  category: z.enum(CATEGORIES).optional().default("all"),
});

const CATEGORY_GUIDANCE: Record<(typeof CATEGORIES)[number], string> = {
  all: "Vary WIDELY across many domains — consumers, creators, families, education, health & fitness, local businesses, finance, entertainment, hobbies, nonprofits, communities, professional services, games, and productivity. Do NOT default to trades, contractors, field service, or B2B ops.",
  ai: "AI-powered single-page tools: chat UIs, agents, generators, summarizers, classifiers, playgrounds.",
  app: "Interactive single-page web apps for everyday people: utilities, trackers, planners, mini social tools, hobby helpers. Consumer / prosumer, not trades.",
  game: "Playable browser mini-games: puzzles, arcade, idle/clicker, word, memory, physics, trivia.",
  productivity: "Personal & team productivity: task managers, timers, note-takers, planners, focus/habit trackers, journals, review tools. Consumer / knowledge-worker, not field-service.",
  education: "Educational pages: interactive lessons, flashcards, quizzes, explainers, visualizers, language learning.",
  presentation: "Presentation-style pages: pitch decks, slide flows, story scrollers, keynote-style microsites.",
  landing: "Marketing landing pages for products, apps, events, launches, waitlists.",
  dashboard: "Analytics dashboards for creators, marketers, finance, ops, personal metrics — KPI cards, charts, tables, filters. Not field-service dispatch.",
  portfolio: "Portfolio and personal sites: designers, developers, photographers, agencies, resumes.",
  trades: "Commercial specialty trades ONLY — fire protection, HVAC/mechanical, commercial glazing, electrical subs, field-service compliance. Use the leak library and cite leak IDs.",
};

const anticipateInput = z.object({
  // Long drafts are truncated (keep the most recent 2000 chars) instead of
  // rejected — the co-designer only needs recent context.
  draft: z
    .string()
    .min(1)
    .transform((s) => (s.length > 2000 ? s.slice(-2000) : s)),
  hasHtml: z.boolean().optional().default(false),
  count: z.number().int().min(2).max(5).optional().default(3),
  tradesSelected: z.boolean().optional().default(false),
});


function slug(s: string, i: number): string {
  return (
    "ai-" +
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) +
    "-" +
    i
  );
}

function parseIdeas(raw: string): Array<{ label: string; snippet: string }> {
  const text = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    const j = JSON.parse(text);
    const arr = Array.isArray(j) ? j : Array.isArray(j?.ideas) ? j.ideas : [];
    return arr
      .map((it: unknown) => {
        if (!it || typeof it !== "object") return null;
        const o = it as Record<string, unknown>;
        const label = String(o.label ?? o.title ?? "").trim();
        const snippet = String(o.snippet ?? o.prompt ?? o.description ?? "").trim();
        if (!label || !snippet) return null;
        return { label: label.slice(0, 40), snippet: snippet.slice(0, 260) };
      })
      .filter(Boolean) as Array<{ label: string; snippet: string }>;
  } catch {
    return [];
  }
}

async function callGateway(system: string, user: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI is not configured yet.");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 403 && /credit_limit_reached|credit limit/i.test(body)) {
      throw new Error("ideas_credit_limit");
    }
    if (res.status === 402) throw new Error("ideas_credit_limit");
    if (res.status === 429) throw new Error("ideas_rate_limited");
    throw new Error(`ideas_${res.status}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

// --- Research query pools ------------------------------------------------
// Trades queries run ONLY when the category is `trades`. Never mixed in for
// generic categories, or the model biases every idea toward field service.
const TRADE_QUERIES: string[] = [
  "site:reddit.com/r/fireprotection what software do you wish existed",
  "site:reddit.com/r/HVAC field tech app pain points",
  "site:reddit.com/r/Construction subcontractor billing problems 2025",
  "site:reddit.com/r/Electricians what do you hate about ServiceTitan",
  "site:reddit.com/r/glazing quoting software gaps",
  "commercial trades contractor unbilled work leakage 2025",
  "NFPA 25 inspection deficiency to quote workflow problems",
  "EPA 608 refrigerant leak logging January 2026 compliance",
  "QuickBooks Online field service double entry problems",
  "small mechanical contractor change order dispute software",
];

// Broad, rotating generic pool — covers many audiences so the "all" tab
// doesn't collapse into the same 3 ideas every load.
const GENERIC_QUERIES: string[] = [
  "what web tools do people wish existed 2025 site:reddit.com",
  "site:reddit.com/r/AskReddit what app do you wish existed",
  "site:reddit.com/r/SomebodyMakeThis best ideas 2025",
  "site:reddit.com/r/lifehacks tools I built for myself",
  "site:reddit.com/r/personalfinance app I wish existed",
  "site:reddit.com/r/parenting apps that would actually help",
  "site:reddit.com/r/teachers classroom tools that don't exist",
  "site:reddit.com/r/fitness app feature nobody has built",
  "site:reddit.com/r/cooking recipe tool I wish existed",
  "site:reddit.com/r/weddingplanning tool I wish existed",
  "site:reddit.com/r/petcare app idea nobody built",
  "site:reddit.com/r/gamedev tiny web games people love",
  "site:reddit.com/r/languagelearning tool that would help",
  "site:reddit.com/r/nonprofit software gaps 2025",
  "creator economy sponsorship tracker gaps 2025",
  "indie hacker painful workflows manual spreadsheets site:reddit.com",
];

// Category-specific seed queries mixed in with the generic pool for variety.
const CATEGORY_QUERIES: Partial<Record<(typeof CATEGORIES)[number], string[]>> = {
  ai: ["fun AI web tools people want 2025", "site:reddit.com/r/singularity ai tool ideas"],
  game: ["site:reddit.com/r/WebGames tiny web game ideas", "browser mini game ideas 2025"],
  education: ["site:reddit.com/r/teachers classroom tool ideas", "language learning app gaps 2025"],
  productivity: ["site:reddit.com/r/productivity tool I wish existed", "personal task app gaps 2025"],
  dashboard: ["creator analytics dashboard gaps", "personal finance dashboard ideas 2025"],
  portfolio: ["designer portfolio inspiration 2025", "developer portfolio trends 2025"],
  landing: ["saas landing page trends 2025", "product launch waitlist ideas"],
  presentation: ["interactive pitch deck ideas 2025", "story scroller microsite examples"],
  app: ["site:reddit.com/r/SomebodyMakeThis best ideas 2025", "consumer web app ideas 2025"],
};

type ResearchSnippet = { source: string; text: string };

async function firecrawlResearch(
  category: (typeof CATEGORIES)[number],
  count: number,
): Promise<ResearchSnippet[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  const isTrades = category === "trades";
  const pool = isTrades
    ? TRADE_QUERIES
    : [...(CATEGORY_QUERIES[category] ?? []), ...GENERIC_QUERIES];
  // Pick 2 random queries per call so ideas rotate.
  const picks: string[] = [];
  const used = new Set<number>();
  while (picks.length < 2 && used.size < pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    picks.push(pool[i]);
  }
  const collect: ResearchSnippet[] = [];
  await Promise.all(picks.map(async (q) => {
    try {
      const res = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ query: q, limit: 4 }),
        signal: AbortSignal.timeout(9_000),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: Array<{ title?: string; description?: string; url?: string }> };
      for (const it of json.data ?? []) {
        const text = [it.title, it.description].filter(Boolean).join(" — ").trim();
        if (!text) continue;
        collect.push({ source: it.url ?? "", text: text.slice(0, 220) });
      }
    } catch { /* swallow — research is best-effort */ }
  }));
  const seen = new Set<string>();
  const out: ResearchSnippet[] = [];
  for (const s of collect) {
    const k = s.text.toLowerCase().slice(0, 80);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= count) break;
  }
  return out;
}

const NEUTRAL_GUARDRAIL = `HARD CONSTRAINT: Stay entirely inside the requested subject, audience, and category. Do not introduce an unrelated industry, operational workflow, specialized jargon, acronym, or numbered business framework. Every idea must be understandable from the requested category alone.`;

export const generateStarterIdeas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => starterInput.parse(d))
  .handler(async ({ data }): Promise<{ ideas: IdeaSuggestion[] }> => {
    const seed = Math.random().toString(36).slice(2, 8);
    const isTrades = data.category === "trades";
    const research = await firecrawlResearch(data.category, 8);
    const researchBlock = research.length
      ? `LIVE RESEARCH SIGNALS (real, current signals scraped from the web — anchor at least half of the ideas to something concrete you see here; do NOT invent generic SaaS clichés):\n${research.map((r, i) => `[R${i + 1}] ${r.text}${r.source ? ` (src: ${r.source})` : ""}`).join("\n")}`
      : `LIVE RESEARCH SIGNALS: none available — you MUST still avoid generic ideas (todo apps, weather apps, calorie trackers, generic dashboards). Pick niche, specific problems.`;

    const tradesBlock = isTrades ? `\n${REAL_WORLD_LEAKS_PROMPT}` : `\n${NEUTRAL_GUARDRAIL}`;
    const leakRule = isTrades
      ? "- Anchor each idea to a leak from the library below and reference the leak ID(s) inside the snippet (e.g. \"…plugs L3+L8.\")."
      : "- Do NOT reference leak IDs, trades, contractors, or field-service jargon.";

    const system = `You brainstorm fresh, buildable single-page web project ideas for a front-end AI builder.
Return ONLY JSON of the exact shape: {"ideas":[{"label":"short name","snippet":"Build a ... describing the page in one sentence."}]}
Rules:
- ${data.count} ideas. Each unique. Not generic ("website", "app"); be specific and interesting.
- label: 2-4 words, Title Case, no emoji.
- snippet: one imperative sentence starting with "Build a" or "Build an", 12-28 words, mentions 2-3 concrete sections/features.
- Category focus: ${CATEGORY_GUIDANCE[data.category]}
- Avoid anything in the exclude list (case-insensitive) and do not repeat concepts already listed.
- Be inventive — surprising, specific niches beat safe generic picks.
${leakRule}

${researchBlock}
${tradesBlock}`;
    const user = `category:${data.category}\nvariety-seed:${seed}\nexclude:${JSON.stringify(data.exclude)}`;
    try {
      const raw = await callGateway(system, user);
      const parsed = parseIdeas(raw);
      const excludeSet = new Set(data.exclude.map((s) => s.toLowerCase()));
      const safeParsed = isTrades ? parsed : filterGenericSuggestions(parsed);
      const ideas: IdeaSuggestion[] = safeParsed
        .filter((p) => !excludeSet.has(p.label.toLowerCase()))
        .slice(0, data.count)
        .map((p, i) => ({ id: slug(p.label, i), label: p.label, snippet: p.snippet }));
      return { ideas };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ideas_error";
      if (msg === "ideas_credit_limit" || msg === "ideas_rate_limited") throw err;
      return { ideas: [] };
    }
  });

export const anticipateNextIdeas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => anticipateInput.parse(d))
  .handler(async ({ data }): Promise<{ ideas: IdeaSuggestion[] }> => {
    const tradesContext = data.tradesSelected || isExplicitTradesContext(data.draft);
    const system = `You are a co-designer helping a user refine a prompt for a front-end AI builder.
Read their in-progress prompt CAREFULLY and propose ${data.count} concrete NEXT additions THAT DIRECTLY EXTEND WHAT THEY ARE ACTUALLY BUILDING.
Return ONLY JSON: {"ideas":[{"label":"+ short addon","snippet":"One sentence to append to the prompt."}]}
Rules:
- Ground every suggestion in the specific subject, audience, and features of the draft. If the draft is a recipe app, suggest recipe-app additions. If it's a wedding planner, wedding features. If it's a game, game additions. If it's a church site, church features. If it's a fitness tracker, fitness features. Never pivot to unrelated domains.
- Each label starts with "+ " and is 2-5 words.
- Each snippet is a single imperative sentence, 8-22 words, that adds ONE specific section, feature, or refinement relevant to the draft's actual topic.
- Do NOT repeat things already implied by the draft.
- Prefer high-signal moves: missing sections, key components, states, accessibility, tone, or polish — all specific to the draft's domain.
- ${tradesContext
      ? "The draft IS clearly about commercial specialty trades / field-service / compliance — every addition may plug a leak (cite ID, e.g. \"plugs L1\") and respect the two-tap field rule."
      : NEUTRAL_GUARDRAIL}
- ${data.hasHtml ? "The user is iterating on an existing build; suggest focused enhancements, not rebuilds." : "The user is starting fresh; suggest structural additions."}
${tradesContext ? `\n${REAL_WORLD_LEAKS_PROMPT}` : ""}`;
    const user = `Draft prompt:\n${data.draft}`;
    try {
      const raw = await callGateway(system, user);
      const parsed = parseIdeas(raw);
      const safeParsed = tradesContext ? parsed : filterGenericSuggestions(parsed);
      const selected = safeParsed.length > 0
        ? safeParsed.slice(0, data.count)
        : neutralEnhancementFallbacks(data.draft, data.hasHtml, data.count);
      const ideas: IdeaSuggestion[] = selected.map((p, i) => ({
        id: slug(p.label, i),
        label: p.label.startsWith("+") ? p.label : "+ " + p.label,
        snippet: p.snippet,
      }));
      return { ideas };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ideas_error";
      if (msg === "ideas_credit_limit" || msg === "ideas_rate_limited") throw err;
      const fallback = neutralEnhancementFallbacks(data.draft, data.hasHtml, data.count);
      return {
        ideas: fallback.map((p, i) => ({
          id: slug(p.label, i),
          label: p.label.startsWith("+") ? p.label : "+ " + p.label,
          snippet: p.snippet,
        })),
      };
    }
  });
