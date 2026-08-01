// Obsidian Pocket — premium generation prompt blocks + critique rubric.
// Pure strings. Injected server-side only when `surface === "pocket"`.

import { getFamily, type PocketDesignDNA, type PocketProfile } from "./pocket-creative";

export const POCKET_PROMPT_VERSION = 1 as const;

/**
 * Self-contained visual toolkit. Pocket output is ONE standalone HTML file, so
 * this deliberately never mentions React Three Fiber, npm packages or CDNs.
 */
export const POCKET_NATIVE_TOOLKIT = `SELF-CONTAINED VISUAL TOOLKIT (zero dependencies — pick only what the DNA justifies)
- CSS 3D: perspective, transform-style: preserve-3d, rotateX/Y card stacks, tilt-on-pointer.
- Layered SVG: inline <svg> ridges, masks, clip-paths, animated stroke-dashoffset diagrams.
- Canvas 2D: particle/constellation fields, value-noise grain, sparklines, charts.
- Native WebGL: only for a small hand-written shader gradient/hills scene, inline GLSL, no libraries.
- Cursor-reactive lighting: a radial-gradient layer whose --x/--y CSS vars follow pointermove.
- Scroll-linked motion: IntersectionObserver reveals + requestAnimationFrame transform scrubbing.
- Parallax depth layers, animated gradient meshes, animated grids, magnetic/tilt controls, kinetic typography.

HARD CONSTRAINTS
- No external JS, CSS or font files. System/web-safe font stacks only.
- No network requests other than image URLs already permitted by policy.
- Pause every animation loop when document.hidden or the element leaves the viewport.
- Cap devicePixelRatio at 2 on canvas/WebGL.
- @media (prefers-reduced-motion: reduce) must disable all non-essential motion.
- Under 640px: use the DNA's mobile fallback; drop canvas/WebGL to a static equivalent.
- No autoplay audio. No animation that blocks scroll, input or pointer events.
- No huge inline base64 binaries.`;

export function dnaPromptBlock(dna: PocketDesignDNA): string {
  const fam = getFamily(dna.family);
  return `DESIGN DNA — implement these EXACT concrete decisions (id ${dna.id}, family ${fam.label})
- Layout archetype: ${dna.layout}
- Hero composition: ${dna.hero}
- Section sequence (in this order): ${dna.sections.join(" → ")}
- Typography: ${dna.typography}
- Spacing/density: ${dna.spacing}
- Shape/edges: ${dna.shape}
- Depth/elevation: ${dna.depth}
- Palette strategy: ${dna.palette}
- Motion language: ${dna.motion}
- Signature interaction (must exist and be memorable): ${dna.signatureInteraction}
- Permitted techniques: ${dna.techniques.join(", ")}
- Mobile rules: ${dna.mobileRules.join("; ")}
- FORBIDDEN patterns (do not produce any of these): ${dna.forbidden.join("; ")}`;
}

export function pocketPremiumBlock(input: {
  profile: PocketProfile;
  dna: PocketDesignDNA;
  conceptName?: string;
  conceptSentence?: string;
  selectionReason?: string;
  recentSignatures?: readonly string[];
}): string {
  const parts: string[] = [];
  parts.push(`OBSIDIAN POCKET PREMIUM DIRECTION (profile: ${input.profile})
You are building a genuinely differentiated, high-end product page — not a template.
Originality outranks template safety. Structural variation matters more than palette changes.`);

  if (input.conceptName) {
    parts.push(`CHOSEN CREATIVE DIRECTION: ${input.conceptName}
${input.conceptSentence ?? ""}
Why this direction: ${input.selectionReason ?? "maximum distance from recent builds"}
Implement this direction fully. Do NOT output alternative concepts — output exactly one complete HTML document.`);
  }

  parts.push(dnaPromptBlock(input.dna));

  if (input.recentSignatures?.length) {
    parts.push(`RECENT BUILD STRUCTURES TO AVOID REPEATING:
${input.recentSignatures.slice(0, 12).map((s) => `- ${s}`).join("\n")}`);
  }

  parts.push(`NON-NEGOTIABLE QUALITY BAR
- Exactly one memorable signature visual or interaction, executed well.
- No default centered hero unless the DNA explicitly asks for it.
- No generic three-card feature row unless the DNA explicitly asks for it.
- No automatic purple/blue gradient and no reflexive glassmorphism.
- Premium typographic hierarchy: real display/body contrast, deliberate tracking and measure.
- Deep layering and composition where the DNA calls for it.
- Real content density appropriate to the requested product — no lorem, no "Feature one".
- Polished mobile behaviour, no horizontal overflow at 360px.
- Performance-aware and reduced-motion safe.
- Preserve existing functionality and the internal-only navigation policy.`);

  parts.push(POCKET_NATIVE_TOOLKIT);
  return parts.join("\n\n");
}

/* ---------------------------- critique ---------------------------- */

export const POCKET_CRITIQUE_POLICY_VERSION = "pocket-critique-v1";

export const POCKET_CRITIQUE_RUBRIC = `You are a senior design director reviewing ONE standalone HTML document.

Score each axis 0-10 (10 = excellent):
originality, visualHierarchy, heroImpact, typography, depthComposition,
interactionQuality, motionRestraint, responsive, accessibility,
contentCompleteness, codeRisk (10 = no runtime risk).

Return STRICT JSON only, no prose, no markdown fence:
{"scores":{"originality":0,"visualHierarchy":0,"heroImpact":0,"typography":0,"depthComposition":0,"interactionQuality":0,"motionRestraint":0,"responsive":0,"accessibility":0,"contentCompleteness":0,"codeRisk":0},
 "similarityRisk":"low|medium|high",
 "issues":["concise, specific, max 8"],
 "verdict":"keep|repair|block",
 "operations":[]}

"operations" must be an array of patch operations compatible with the host patch protocol; use [] when the verdict is "keep". Never rewrite the whole document. Never remove working functionality. Never introduce external dependencies.`;

export type PocketCritiqueScores = Record<string, number>;
export type PocketCritique = {
  scores: PocketCritiqueScores;
  similarityRisk: "low" | "medium" | "high";
  issues: string[];
  verdict: "keep" | "repair" | "block";
  operations: unknown[];
  policyVersion: string;
};

export function parseCritique(raw: unknown): PocketCritique {
  const o = (raw ?? {}) as Record<string, unknown>;
  const scores: PocketCritiqueScores = {};
  if (o.scores && typeof o.scores === "object") {
    for (const [k, v] of Object.entries(o.scores as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) scores[k.slice(0, 40)] = Math.max(0, Math.min(10, v));
    }
  }
  const verdict = o.verdict === "repair" || o.verdict === "block" ? o.verdict : "keep";
  const similarityRisk =
    o.similarityRisk === "medium" || o.similarityRisk === "high" ? o.similarityRisk : "low";
  const issues = Array.isArray(o.issues)
    ? (o.issues as unknown[]).filter((i): i is string => typeof i === "string").slice(0, 8).map((i) => i.slice(0, 240))
    : [];
  const operations = Array.isArray(o.operations) ? (o.operations as unknown[]).slice(0, 24) : [];
  return { scores, similarityRisk, issues, verdict, operations, policyVersion: POCKET_CRITIQUE_POLICY_VERSION };
}
