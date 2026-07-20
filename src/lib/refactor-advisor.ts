// Continuous Refactor Advisor — recommendation-only analyzer. Pure, deterministic.
// Consumes current HTML + KnowledgeGraph, returns prioritized suggestions
// (never applies them). Consumed by the Refactor panel and the readiness report.

import { buildGraph, type KnowledgeGraph } from "./knowledge-graph";

export type RefactorCategory =
  | "dead-code"
  | "duplication"
  | "oversized-file"
  | "coupling"
  | "stale-dependency"
  | "performance"
  | "accessibility";

export type RefactorSuggestion = {
  id: string;
  category: RefactorCategory;
  severity: "info" | "low" | "medium" | "high";
  message: string;
  evidence: string;
  effort: "S" | "M" | "L";
};

const STALE_LIBS: RegExp[] = [
  /jquery@?[12]\./i, /bootstrap@?[23]\./i, /moment(?!-timezone)/i, /lodash(?!-es)/i,
];

export function advise(input: { html: string; graph?: KnowledgeGraph }): RefactorSuggestion[] {
  const g = input.graph ?? buildGraph(input.html);
  const out: RefactorSuggestion[] = [];

  // Oversized document
  if (g.size > 300_000) {
    out.push({ id: "size-huge", category: "oversized-file", severity: "high",
      message: "Document exceeds 300 KB — split into components.",
      evidence: `${(g.size / 1024).toFixed(0)} KB`, effort: "L" });
  } else if (g.size > 150_000) {
    out.push({ id: "size-large", category: "oversized-file", severity: "medium",
      message: "Document over 150 KB — consider extracting inline blocks.",
      evidence: `${(g.size / 1024).toFixed(0)} KB`, effort: "M" });
  }

  // Duplicate ids (parse raw HTML — knowledge-graph dedupes before we see it)
  const allIdMatches = (input.html.match(/\bid=["'][^"']+["']/g) || []).map((s) => s);
  const uniqueIds = new Set(allIdMatches);
  const dupIds = allIdMatches.length - uniqueIds.size;
  if (dupIds > 0) {
    out.push({ id: "dup-ids", category: "duplication", severity: "high",
      message: `${dupIds} duplicate id(s) — rename to unique.`,
      evidence: `raw=${allIdMatches.length}, unique=${uniqueIds.size}`, effort: "S" });
  }

  // Inline script sprawl
  const inline = g.scripts.filter((s) => !s.src).length;
  if (inline > 4) {
    out.push({ id: "inline-scripts", category: "duplication", severity: "medium",
      message: `${inline} inline <script> blocks — consolidate into one.`,
      evidence: `${inline} inline / ${g.scripts.length} total`, effort: "M" });
  }

  // Dead-code heuristic: buttons with no handler and no text
  const dead = g.buttons.filter((b) => !b.hasHandler && !b.text).length;
  if (dead > 0) {
    out.push({ id: "dead-buttons", category: "dead-code", severity: "medium",
      message: `${dead} button(s) with no text and no handler.`,
      evidence: `${dead} / ${g.buttons.length}`, effort: "S" });
  }

  // Coupling: many broken internal links
  const brokenLinks = g.links.filter((l) => l.broken).length;
  if (brokenLinks > 2) {
    out.push({ id: "broken-links", category: "coupling", severity: "medium",
      message: `${brokenLinks} broken links — fix or remove.`,
      evidence: `${brokenLinks} broken`, effort: "S" });
  }

  // Stale dependencies (CDN version heuristic)
  for (const d of g.dependencies) {
    if (STALE_LIBS.some((rx) => rx.test(d))) {
      out.push({ id: `stale-${d}`, category: "stale-dependency", severity: "medium",
        message: `Stale dependency detected: ${d}`,
        evidence: d, effort: "M" });
    }
  }

  // Performance: too many DOM nodes
  if (g.nodeCount > 1500) {
    out.push({ id: "dom-heavy", category: "performance", severity: "medium",
      message: `${g.nodeCount} DOM nodes — consider virtualization.`,
      evidence: `${g.nodeCount} nodes`, effort: "L" });
  }

  // Accessibility: images without alt
  const noAlt = g.images.filter((i) => i.alt === null).length;
  if (noAlt > 0) {
    out.push({ id: "img-alt", category: "accessibility", severity: "high",
      message: `${noAlt} image(s) missing alt attribute.`,
      evidence: `${noAlt} / ${g.images.length}`, effort: "S" });
  }

  // Sort by severity
  const order: Record<RefactorSuggestion["severity"], number> = { high: 0, medium: 1, low: 2, info: 3 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
