// Project pattern library — extracts reusable design/component/naming
// patterns from the current HTML document. Patterns are informational; they
// never rewrite working code on their own.

import { buildGraph } from "./knowledge-graph";
import { extractDesignTokens } from "./design-system";

export type PatternStatus = "observed" | "confirmed" | "locked";

export interface Pattern {
  id: string;
  kind: "color-token" | "font" | "component-signature" | "form" | "nav" | "naming" | "endpoint" | "a11y";
  value: string;
  count: number;
  status: PatternStatus;
}

export interface ProjectPatterns {
  patterns: Pattern[];
  extractedAt: number;
}

function makeId(prefix: string, value: string): string {
  return `${prefix}_${value.replace(/[^a-z0-9]/gi, "").slice(0, 24).toLowerCase()}`;
}

export function extractPatterns(html: string): ProjectPatterns {
  const patterns: Pattern[] = [];
  if (!html) return { patterns, extractedAt: Date.now() };
  const graph = buildGraph(html);
  const tokens = extractDesignTokens(html);

  const colorCount = new Map<string, number>();
  for (const c of tokens.colors) {
    const rawMatches = (html.match(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) ?? []).length;
    colorCount.set(c, Math.max(1, rawMatches));
  }
  for (const [color, count] of colorCount.entries()) {
    if (count >= 2) patterns.push({ id: makeId("color", color), kind: "color-token", value: color, count, status: "observed" });
  }
  for (const font of tokens.fonts.slice(0, 3)) {
    patterns.push({ id: makeId("font", font), kind: "font", value: font, count: 1, status: "observed" });
  }
  if (graph.buttons.length >= 2) {
    patterns.push({ id: "component_button", kind: "component-signature", value: `button×${graph.buttons.length}`, count: graph.buttons.length, status: "observed" });
  }
  const formCount = (html.match(/<form\b/gi) ?? []).length;
  if (formCount >= 1) patterns.push({ id: "component_form", kind: "form", value: `form×${formCount}`, count: formCount, status: "observed" });
  const navCount = (html.match(/<nav\b/gi) ?? []).length;
  if (navCount >= 1) patterns.push({ id: "component_nav", kind: "nav", value: `nav×${navCount}`, count: navCount, status: "observed" });
  for (const ep of graph.endpoints.slice(0, 5)) {
    patterns.push({ id: makeId("endpoint", ep), kind: "endpoint", value: ep, count: 1, status: "observed" });
  }
  const kebab = graph.ids.filter((id) => /^[a-z][a-z0-9-]*$/.test(id)).length;
  const camel = graph.ids.filter((id) => /^[a-z][a-zA-Z0-9]*$/.test(id) && /[A-Z]/.test(id)).length;
  if (kebab + camel > 0) {
    patterns.push({
      id: "naming_ids",
      kind: "naming",
      value: kebab >= camel ? "kebab-case" : "camelCase",
      count: kebab + camel,
      status: kebab + camel >= 4 ? "confirmed" : "observed",
    });
  }
  if (graph.meta.hasLang && graph.meta.hasViewport) {
    patterns.push({ id: "a11y_meta", kind: "a11y", value: "lang+viewport", count: 1, status: "confirmed" });
  }
  return { patterns, extractedAt: Date.now() };
}
