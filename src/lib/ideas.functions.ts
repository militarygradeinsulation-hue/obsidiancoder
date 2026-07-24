// Lightweight AI idea generation. Free for the user (no credit gate), tiny
// requests to the Lovable AI Gateway. Two surfaces:
//   1) generateStarterIdeas — fresh "what could I build" prompts when the
//      composer is empty.
//   2) anticipateNextIdeas — the AI reads the user's in-progress prompt and
//      proposes concrete next-step additions they can accept with one click.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { REAL_WORLD_LEAKS_PROMPT } from "./real-world-leaks";

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
] as const;

const starterInput = z.object({
  exclude: z.array(z.string()).max(120).optional().default([]),
  count: z.number().int().min(3).max(8).optional().default(6),
  category: z.enum(CATEGORIES).optional().default("all"),
});

const CATEGORY_GUIDANCE: Record<(typeof CATEGORIES)[number], string> = {
  all: "Vary widely across creative tools, dashboards, storytelling, utilities, communities, playful microsites.",
  ai: "AI-powered single-page tools: chat UIs, agents, generators, summarizers, classifiers, playgrounds.",
  app: "Interactive single-page web apps: utilities, trackers, planners, mini social tools.",
  game: "Playable browser mini-games: puzzles, arcade, idle/clicker, word, memory, physics, trivia.",
  productivity: "Productivity tools: task managers, timers, note-takers, planners, focus/habit trackers.",
  education: "Educational pages: interactive lessons, flashcards, quizzes, explainers, visualizers.",
  presentation: "Presentation-style pages: pitch decks, slide flows, story scrollers, keynote-style microsites.",
  landing: "Marketing landing pages for products, apps, events, launches, waitlists.",
  dashboard: "Analytics/admin dashboards with KPI cards, charts, tables, filters.",
  portfolio: "Portfolio and personal sites: designers, developers, photographers, agencies, resumes.",
};

const anticipateInput = z.object({
  draft: z.string().min(1).max(2000),
  hasHtml: z.boolean().optional().default(false),
  count: z.number().int().min(2).max(5).optional().default(3),
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

// Fetch real-world pain-point signals from the web so ideas aren't the same
// recycled AI templates. Best-effort — silently no-ops if Firecrawl isn't
// configured or a call fails. Rotates queries so repeat calls stay fresh.
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
const GENERIC_QUERIES: string[] = [
  "what web tools do small businesses actually need 2025 site:reddit.com",
  "indie hacker painful workflows manual spreadsheets site:reddit.com",
  "professionals ask for tools that don't exist site:reddit.com",
  "underserved SMB vertical software gaps 2025",
];

type ResearchSnippet = { source: string; text: string };

async function firecrawlResearch(category: string, count: number): Promise<ResearchSnippet[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  const isTradeContext = category === "app" || category === "productivity" || category === "dashboard" || category === "all";
  const pool = isTradeContext ? [...TRADE_QUERIES, ...GENERIC_QUERIES] : GENERIC_QUERIES;
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
  // De-dupe and cap.
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

export const generateStarterIdeas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => starterInput.parse(d))
  .handler(async ({ data }): Promise<{ ideas: IdeaSuggestion[] }> => {
    const seed = Math.random().toString(36).slice(2, 8);
    const research = await firecrawlResearch(data.category, 8);
    const researchBlock = research.length
      ? `LIVE RESEARCH SIGNALS (real, current pain points scraped from the web — anchor at least half of the ideas to something concrete you see here; do NOT invent generic SaaS clichés):\n${research.map((r, i) => `[R${i + 1}] ${r.text}${r.source ? ` (src: ${r.source})` : ""}`).join("\n")}`
      : `LIVE RESEARCH SIGNALS: none available — you MUST still avoid generic ideas (todo apps, weather apps, calorie trackers, generic dashboards). Pick niche, specific problems.`;
    const system = `You brainstorm fresh, buildable single-page web project ideas for a front-end AI builder.
Return ONLY JSON of the exact shape: {"ideas":[{"label":"short name","snippet":"Build a ... describing the page in one sentence."}]}
Rules:
- ${data.count} ideas. Each unique. Not generic ("website", "app"); be specific and interesting.
- label: 2-4 words, Title Case, no emoji.
- snippet: one imperative sentence starting with "Build a" or "Build an", 12-28 words, mentions 2-3 concrete sections/features.
- Category focus: ${CATEGORY_GUIDANCE[data.category]}
- Avoid anything in the exclude list (case-insensitive) and do not repeat concepts already listed.
- Be inventive — surprising, specific niches beat safe generic picks.
- When an idea targets trades, contractors, field service, or compliance, anchor it to a leak from the library below and reference the leak ID(s) inside the snippet (e.g. "…plugs L3+L8.").

${researchBlock}

${REAL_WORLD_LEAKS_PROMPT}`;
    const user = `category:${data.category}\nvariety-seed:${seed}\nexclude:${JSON.stringify(data.exclude)}`;
    try {
      const raw = await callGateway(system, user);
      const parsed = parseIdeas(raw);
      const excludeSet = new Set(data.exclude.map((s) => s.toLowerCase()));
      const ideas: IdeaSuggestion[] = parsed
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

const TRADES_RE = /\b(trade|trades|contractor|contractors|field[- ]?service|hvac|refrigerant|nfpa|fire[- ]?protection|glazing|glazier|electrician|electrical sub|plumb|plumbing|mechanical|inspection|deficienc|quickbooks|qbo|technician|dispatch|work order|compliance|permit)\b/i;

export const anticipateNextIdeas = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => anticipateInput.parse(d))
  .handler(async ({ data }): Promise<{ ideas: IdeaSuggestion[] }> => {
    const tradesContext = TRADES_RE.test(data.draft);
    const system = `You are a co-designer helping a user refine a prompt for a front-end AI builder.
Read their in-progress prompt carefully and propose ${data.count} concrete NEXT additions THAT DIRECTLY EXTEND WHAT THEY ARE ACTUALLY BUILDING.
Return ONLY JSON: {"ideas":[{"label":"+ short addon","snippet":"One sentence to append to the prompt."}]}
Rules:
- Ground every suggestion in the specific subject, audience, and features of the draft. If the draft is a recipe app, suggest recipe-app additions. If it's a game, suggest game additions. Never pivot to unrelated domains.
- Each label starts with "+ " and is 2-5 words.
- Each snippet is a single imperative sentence, 8-22 words, that adds ONE specific section, feature, or refinement relevant to the draft's actual topic.
- Do NOT repeat things already implied by the draft.
- Prefer high-signal moves: missing sections, key components, states, accessibility, tone, or polish — all specific to the draft's domain.
- ${tradesContext
      ? "The draft IS about trades / contractors / field-service / compliance — every addition must plug a leak (cite ID, e.g. \"plugs L1\") and respect the two-tap field rule."
      : "The draft is NOT about trades or contractors — DO NOT mention leaks, L1-L10, trades, contractors, QuickBooks, NFPA, HVAC, or two-tap rules. Stay on the draft's actual topic."}
- ${data.hasHtml ? "The user is iterating on an existing build; suggest focused enhancements, not rebuilds." : "The user is starting fresh; suggest structural additions."}
${tradesContext ? `\n${REAL_WORLD_LEAKS_PROMPT}` : ""}`;
    const user = `Draft prompt:\n${data.draft}`;
    try {
      const raw = await callGateway(system, user);
      const parsed = parseIdeas(raw);
      const ideas: IdeaSuggestion[] = parsed.slice(0, data.count).map((p, i) => ({
        id: slug(p.label, i),
        label: p.label.startsWith("+") ? p.label : "+ " + p.label,
        snippet: p.snippet,
      }));
      return { ideas };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ideas_error";
      if (msg === "ideas_credit_limit" || msg === "ideas_rate_limited") throw err;
      return { ideas: [] };
    }
  });
