// Phase 0 baseline harness — measurement only, no behavior change.
// Runs deterministic analyzers over representative generated fixtures so we
// can compare cold-build quality before and after later phases. Does not call
// any AI provider (safe in sandbox / no credits, no ledger writes).
//
// If a real provider run is later needed, `runLive()` can be wired to the
// existing `/api/generate` route; for now the harness intentionally reads
// static fixtures under `./fixtures/` to keep production side-effect free.

import { buildGraph, type KnowledgeGraph } from "@/lib/knowledge-graph";
import { validateHtml, type ValidationReport } from "@/lib/validation";

export type BaselinePrompt = {
  id: "b2b-analytics" | "editorial-hospitality" | "playful-edu";
  label: string;
  prompt: string;
};

export const BASELINE_PROMPTS: BaselinePrompt[] = [
  {
    id: "b2b-analytics",
    label: "B2B analytics dashboard",
    prompt:
      "Build a B2B analytics dashboard for a SaaS company: KPI tiles, chart, filters, table.",
  },
  {
    id: "editorial-hospitality",
    label: "Editorial / luxury hospitality page",
    prompt:
      "Build a luxury boutique hotel landing page: editorial typography, rich imagery, reservation CTA.",
  },
  {
    id: "playful-edu",
    label: "Playful consumer / education app",
    prompt:
      "Build a playful learning app for kids: bright colors, rounded shapes, interactive lesson cards.",
  },
];

export type InteractionAudit = {
  buttons: number;
  buttonsWithBehavior: number;
  links: number;
  externalLinks: number;
  brokenHashLinks: number;
  targetBlank: number;
  windowOpenCalls: number;
  locationAssignments: number;
  forms: number;
  formsExternalAction: number;
};

export type SectionPatternAudit = {
  hasHero: boolean;
  hasFeatureTriad: boolean; // three equal cards
  hasLogoStrip: boolean;
  hasCtaBanner: boolean;
  headingCount: number;
  sectionCount: number;
  signature: string; // compact pattern string
};

export type ThemeTokenAudit = {
  fontFamilies: string[];
  colors: string[];
  radii: string[];
  hasCssVars: boolean;
};

export type BaselineReport = {
  promptId: BaselinePrompt["id"];
  label: string;
  source: "fixture" | "live";
  model: string | null;
  strategy: string | null;
  latencyMs: number | null;
  costMeta: Record<string, unknown> | null;
  graph: KnowledgeGraph;
  validation: ValidationReport;
  interaction: InteractionAudit;
  sections: SectionPatternAudit;
  theme: ThemeTokenAudit;
  notes: string[];
};

export function auditInteractions(html: string): InteractionAudit {
  const buttons = (html.match(/<button\b/gi) || []).length;
  const buttonsWithBehavior = (html.match(/<button\b[^>]*(?:onclick=|data-[a-z-]+=|type=["']submit)/gi) || []).length;
  const links = (html.match(/<a\b[^>]*href=/gi) || []).length;
  const externalLinks = (html.match(/<a\b[^>]*href=["']https?:\/\//gi) || []).length;
  const brokenHashLinks = (html.match(/href=["']#["']/gi) || []).length;
  const targetBlank = (html.match(/target=["']_blank/gi) || []).length;
  const windowOpenCalls = (html.match(/window\.open\s*\(/g) || []).length;
  const locationAssignments = (html.match(/(?:window\.)?location(?:\.href)?\s*=/g) || []).length;
  const forms = (html.match(/<form\b/gi) || []).length;
  const formsExternalAction = (html.match(/<form\b[^>]*action=["']https?:\/\//gi) || []).length;
  return {
    buttons,
    buttonsWithBehavior,
    links,
    externalLinks,
    brokenHashLinks,
    targetBlank,
    windowOpenCalls,
    locationAssignments,
    forms,
    formsExternalAction,
  };
}

export function auditSections(html: string): SectionPatternAudit {
  const lower = html.toLowerCase();
  const headingCount = (html.match(/<h[1-3]\b/gi) || []).length;
  const sectionCount = (html.match(/<section\b/gi) || []).length;
  const hasHero = /hero|banner/.test(lower) || /<h1\b/i.test(html);
  // three equal cards heuristic: grid-cols-3 or three sibling cards
  const hasFeatureTriad = /grid-cols-3|repeat\(3,/i.test(html) || /(card[^<]{0,120}){3,}/i.test(html);
  const hasLogoStrip = /logos?|clients?|trusted by|as seen on/i.test(html);
  const hasCtaBanner = /(get started|start (?:free|now)|book|reserve|sign up|try (?:for )?free)/i.test(html);
  const signature = [
    hasHero ? "H" : "-",
    hasFeatureTriad ? "3" : "-",
    hasLogoStrip ? "L" : "-",
    hasCtaBanner ? "C" : "-",
    `s${sectionCount}`,
  ].join("");
  return { hasHero, hasFeatureTriad, hasLogoStrip, hasCtaBanner, headingCount, sectionCount, signature };
}

export function auditTheme(html: string): ThemeTokenAudit {
  const fontFamilies = uniq(
    Array.from(html.matchAll(/font-family:\s*([^;"']+)/gi)).map((m) => m[1].trim()),
  ).slice(0, 8);
  const colors = uniq(
    Array.from(html.matchAll(/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi)).map((m) => m[0].toLowerCase()),
  ).slice(0, 20);
  const radii = uniq(
    Array.from(html.matchAll(/border-radius:\s*([^;"']+)/gi)).map((m) => m[1].trim()),
  ).slice(0, 8);
  const hasCssVars = /--[a-z][\w-]*:/i.test(html);
  return { fontFamilies, colors, radii, hasCssVars };
}

export type FixtureBundle = {
  promptId: BaselinePrompt["id"];
  html: string;
  model: string | null;
  strategy: string | null;
  latencyMs: number | null;
  costMeta: Record<string, unknown> | null;
};

export function analyzeFixture(bundle: FixtureBundle, label: string): BaselineReport {
  const graph = buildGraph(bundle.html);
  const validation = validateHtml(bundle.html);
  return {
    promptId: bundle.promptId,
    label,
    source: "fixture",
    model: bundle.model,
    strategy: bundle.strategy,
    latencyMs: bundle.latencyMs,
    costMeta: bundle.costMeta,
    graph,
    validation,
    interaction: auditInteractions(bundle.html),
    sections: auditSections(bundle.html),
    theme: auditTheme(bundle.html),
    notes: [
      "source=fixture (no live provider call to avoid production side effects / credit usage)",
    ],
  };
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}
