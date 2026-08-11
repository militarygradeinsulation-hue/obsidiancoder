// Proven templates — a structural skeleton brief from the best past build.
//
// The learning memory in `build-learning.ts` remembers how GOOD a build was;
// the archive in `build-archive.ts` remembers WHAT it was. This module joins
// the two: it finds the highest-scoring kept build in the requested family,
// reads that build's markup out of the archive, and distills it into a short
// structural brief — section order, layout archetype, type scale, palette
// strategy, signature interaction.
//
// It NEVER emits markup, text content, prompts, URLs or class names. The model
// receives a scaffold to build against, not a page to paste back.

import { readArchive, type ArchiveEntry } from "./build-archive";
import { scoreOf, topExemplars, type BuildLearningEntry } from "./build-learning";

export const TEMPLATE_BRIEF_MAX_BYTES = 1500;
/** A skeleton is only worth reusing when the build it came from scored well. */
export const TEMPLATE_MIN_SCORE = 75;

export interface StructuralSkeleton {
  /** Ordered semantic section roles, e.g. ["hero","features","pricing"]. */
  sections: string[];
  /** Dominant layout mechanism. */
  layout: "grid" | "flex" | "flow";
  /** Distinct font-size steps found in the stylesheet, largest first (rem-ish). */
  typeScale: string[];
  /** How many distinct colours the palette commits to. */
  paletteSize: number;
  /** Whether the build leans on motion. */
  motion: boolean;
  /** Rough section count, useful as a density hint. */
  density: number;
}

const SECTION_HINTS: Array<[RegExp, string]> = [
  [/\bhero\b/i, "hero"],
  [/\bnav|header\b/i, "nav"],
  [/\bfeature/i, "features"],
  [/\bpricing|plans?\b/i, "pricing"],
  [/\btestimonial|review/i, "testimonials"],
  [/\bfaq\b/i, "faq"],
  [/\bgallery|showcase|portfolio/i, "gallery"],
  [/\bstats?|metrics?\b/i, "stats"],
  [/\bcta\b|call-to-action/i, "cta"],
  [/\bfooter\b/i, "footer"],
  [/\bcontact\b/i, "contact"],
  [/\babout\b/i, "about"],
];

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Distill a document into a reusable skeleton. Pure, allocation-light and
 * tolerant of malformed input — it must never throw on a half-written build.
 */
export function extractSkeleton(html: string): StructuralSkeleton {
  const doc = String(html ?? "");
  const sections: string[] = [];
  // Walk section-ish landmarks in document order and label each one.
  const landmark = /<(section|header|footer|main|nav|article)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = landmark.exec(doc)) !== null && guard++ < 400) {
    const tag = m[1].toLowerCase();
    const attrs = m[2] ?? "";
    let label = "";
    for (const [rx, name] of SECTION_HINTS) {
      if (rx.test(attrs)) { label = name; break; }
    }
    if (!label) {
      label = tag === "nav" ? "nav" : tag === "header" ? "nav" : tag === "footer" ? "footer" : "section";
    }
    sections.push(label);
  }

  const gridCount = (doc.match(/display\s*:\s*grid|grid-template/gi) ?? []).length;
  const flexCount = (doc.match(/display\s*:\s*flex/gi) ?? []).length;
  const layout: StructuralSkeleton["layout"] =
    gridCount >= 2 && gridCount >= flexCount ? "grid" : flexCount >= 2 ? "flex" : "flow";

  const sizes = uniq(
    (doc.match(/font-size\s*:\s*([0-9.]+)(rem|em|px)/gi) ?? [])
      .map((s) => s.replace(/font-size\s*:\s*/i, "").trim().toLowerCase()),
  )
    .sort((a, b) => parseFloat(b) - parseFloat(a))
    .slice(0, 6);

  const colours = uniq(
    (doc.match(/#[0-9a-f]{3,8}\b|oklch\([^)]*\)|hsl\([^)]*\)/gi) ?? []).map((c) => c.toLowerCase()),
  );

  const motion = /@keyframes|transition\s*:|animation\s*:|IntersectionObserver/i.test(doc);

  return {
    sections: uniq(sections).slice(0, 10),
    layout,
    typeScale: sizes,
    paletteSize: Math.min(colours.length, 24),
    motion,
    density: sections.length,
  };
}

/** Render a skeleton as a compact prompt block. */
export function skeletonToPrompt(skeleton: StructuralSkeleton, score: number, family: string): string {
  const lines = [
    "PROVEN STRUCTURE — the highest-scoring build this user kept in this family",
    `Family ${family} · scored ${score}/100. Treat this as a SCAFFOLD, not a template: match the structural rigour, then design something new. Never reproduce the previous page's copy, markup or components.`,
  ];
  if (skeleton.sections.length) lines.push(`- Section order that worked: ${skeleton.sections.join(" → ")}`);
  lines.push(`- Primary layout mechanism: ${skeleton.layout}`);
  if (skeleton.typeScale.length) lines.push(`- Type scale steps: ${skeleton.typeScale.join(", ")}`);
  if (skeleton.paletteSize) lines.push(`- Palette committed to ~${skeleton.paletteSize} distinct values — stay this disciplined`);
  lines.push(`- Motion: ${skeleton.motion ? "yes — carry a signature interaction" : "restrained"}`);
  lines.push(`- Density: about ${skeleton.density} landmark sections`);
  return lines.join("\n").slice(0, TEMPLATE_BRIEF_MAX_BYTES);
}

function bestArchiveEntry(
  archive: readonly ArchiveEntry[],
  family: string,
  surface?: string,
): ArchiveEntry | null {
  const pool = archive.filter(
    (e) => e.html && e.html.length > 400 && (!family || family === "auto" || e.family === family) && (!surface || e.surface === surface),
  );
  // Archive entries are newest-first; the most recent match in the winning
  // family is the closest thing to "the build that scored".
  return pool[0] ?? null;
}

/**
 * The structural brief for the next build, or "" when there is no
 * quality-gated precedent to reuse. Cheap: reads local memory only, makes no
 * provider call, and is safe to run on every build.
 */
export function provenTemplateBrief(
  entries: readonly BuildLearningEntry[],
  family: string,
  libraryCode?: string,
  surface?: string,
): string {
  try {
    const best = topExemplars(entries, family, 1)[0];
    if (!best || best.outcome !== "kept") return "";
    const score = scoreOf(best);
    if (score < TEMPLATE_MIN_SCORE) return "";
    const entry = bestArchiveEntry(readArchive(libraryCode).entries, best.family, surface);
    if (!entry) return "";
    const skeleton = extractSkeleton(entry.html);
    if (!skeleton.sections.length && skeleton.layout === "flow") return "";
    return skeletonToPrompt(skeleton, score, best.family);
  } catch {
    return "";
  }
}
