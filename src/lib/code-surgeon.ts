// Code Surgeon — resolves the smallest safe scope for an outcome-level
// request. Returns a plan; never applies changes. Explicit non-goal: do NOT
// fall back to full-generation when a targeted patch fails — surface the
// failure so the caller can prompt for narrower intent.

import type { KnowledgeGraph } from "./knowledge-graph";
import { buildGraph } from "./knowledge-graph";

export type SurgeonScope = {
  anchors: string[];      // element ids / selectors touched
  regions: string[];      // logical regions (header, hero, footer, ...)
  reason: string;
  confidence: number;     // 0-1
  bailReason?: string;    // if set, caller MUST refuse — never widen to full regen
};

const REGION_PATTERNS: [RegExp, string][] = [
  [/\b(hero|banner|jumbotron)\b/i, "hero"],
  [/\bheader\b/i, "header"],
  [/\bnav(bar|igation)?\b/i, "nav"],
  [/\bfooter\b/i, "footer"],
  [/\bpricing\b/i, "pricing"],
  [/\btestimonials?\b/i, "testimonials"],
  [/\bcontact\b/i, "contact"],
  [/\bform\b/i, "form"],
  [/\bcta\b|call to action/i, "cta"],
  [/\b(faq|questions)\b/i, "faq"],
];

export function resolveScope(input: {
  request: string;
  html: string;
  graph?: KnowledgeGraph;
}): SurgeonScope {
  const req = input.request.toLowerCase();
  const g = input.graph ?? buildGraph(input.html);

  // Bail on outcome-level asks that clearly touch everything.
  const globalRewrite = /\b(rewrite|redesign|from scratch|completely|entirely|full page)\b/.test(req);
  if (globalRewrite) {
    return {
      anchors: [], regions: [], reason: "request implies full-document rewrite",
      confidence: 0, bailReason: "surgeon: refuse — request is global scope. Ask user to name a region.",
    };
  }

  const regions: string[] = [];
  for (const [rx, name] of REGION_PATTERNS) if (rx.test(req) && !regions.includes(name)) regions.push(name);

  // Anchors: any id referenced verbatim in the request
  const anchors: string[] = [];
  for (const id of g.ids) if (req.includes(id.toLowerCase())) anchors.push(id);

  // Nothing matched — bail; do NOT widen.
  if (anchors.length === 0 && regions.length === 0) {
    return {
      anchors: [], regions: [], reason: "no anchor id or region keyword matched",
      confidence: 0,
      bailReason: "surgeon: refuse — cannot localize scope. Ask user for an element id or a named region.",
    };
  }

  const confidence = Math.min(1, anchors.length * 0.5 + regions.length * 0.3);
  return {
    anchors, regions,
    reason: `matched ${anchors.length} anchor(s), ${regions.length} region(s)`,
    confidence,
  };
}

/**
 * When a Surgeon-scoped patch fails, this returns a structured refusal
 * instead of a full-generation fallback. The caller MUST surface this to
 * the user rather than retrying with a wider prompt.
 */
export function refusalOnPatchFailure(scope: SurgeonScope, patchError: string): {
  ok: false;
  reason: string;
  suggestion: string;
} {
  return {
    ok: false,
    reason: `Surgeon patch failed within scope (${scope.regions.join(",") || "anchors"}): ${patchError.slice(0, 200)}`,
    suggestion: "Narrow the request further or provide the exact element id — full regeneration is disabled in Surgeon Mode.",
  };
}
