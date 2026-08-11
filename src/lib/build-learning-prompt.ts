// Build learning → prompt brief.
//
// Turns the best past builds into a short "what worked before" system block.
// It carries DESIGN DECISIONS only — never markup, never prompts, never HTML —
// so quality compounds without the model pasting old pages back.
//
// Hard size cap: the brief must never crowd out the art-direction brief that
// follows it.

import { scoreOf, topExemplars, type BuildLearningEntry } from "./build-learning";

export const LEARNING_BRIEF_MAX_BYTES = 1500;

function clean(s: string, max: number): string {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Build the brief for a family. Returns "" when there is nothing worth saying
 * (no exemplars, or none that scored well enough to be worth imitating).
 */
export function buildLearningBrief(
  entries: readonly BuildLearningEntry[],
  family: string,
  limit = 2,
): string {
  const exemplars = topExemplars(entries, family, limit).filter((e) => scoreOf(e) >= 65);
  if (!exemplars.length) return "";

  const lines: string[] = [
    "PROVEN DIRECTIONS FROM THIS USER'S BEST PAST BUILDS",
    "These scored highest in past design reviews. Reuse the DECISIONS below (never the markup) and push further — do not reproduce a previous page.",
  ];

  for (const e of exemplars) {
    const bits: string[] = [];
    if (e.dnaAxes?.layout) bits.push(`layout: ${clean(e.dnaAxes.layout, 80)}`);
    if (e.dnaAxes?.typography) bits.push(`type: ${clean(e.dnaAxes.typography, 100)}`);
    if (e.dnaAxes?.palette) bits.push(`palette: ${clean(e.dnaAxes.palette, 100)}`);
    if (e.dnaAxes?.depth) bits.push(`depth: ${clean(e.dnaAxes.depth, 80)}`);
    if (e.dnaAxes?.signature) bits.push(`signature: ${clean(e.dnaAxes.signature, 100)}`);
    if (bits.length) lines.push(`- Scored ${scoreOf(e)}/100 — ${bits.join("; ")}`);
  }

  // What reviewers actually complained about, so it is not repeated.
  const avoid = new Set<string>();
  for (const e of entries.slice(0, 12)) {
    for (const issue of e.designIssues ?? []) {
      const v = clean(issue, 80);
      if (v) avoid.add(v);
      if (avoid.size >= 4) break;
    }
    if (avoid.size >= 4) break;
  }
  if (avoid.size) {
    lines.push(`AVOID — flagged on recent builds: ${[...avoid].join("; ")}`);
  }

  let brief = lines.join("\n");
  while (brief.length > LEARNING_BRIEF_MAX_BYTES && lines.length > 2) {
    lines.pop();
    brief = lines.join("\n");
  }
  return brief.slice(0, LEARNING_BRIEF_MAX_BYTES);
}
