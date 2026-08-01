// Obsidian Pocket — premium creative coding system.
// Pure, SSR-safe, no React, no provider calls. Owns:
//   • build profiles (fast / studio / cinematic)
//   • style families with CONCRETE values (never mood adjectives alone)
//   • PocketDesignDNA generation + structural signatures
//   • a bounded, privacy-safe anti-repetition memory ledger
//
// Everything here is deterministic given a seed so tests can pin behaviour.

import { safeGet, safeSet } from "./safe-storage";

export const POCKET_CREATIVE_VERSION = 1 as const;

/* ------------------------------------------------------------------ *
 * Profiles
 * ------------------------------------------------------------------ */

export type PocketProfile = "fast" | "studio" | "cinematic";

export type PocketProfileSpec = {
  id: PocketProfile;
  label: string;
  /** One-line, honest description of behaviour and cost. */
  blurb: string;
  /** Requires paidAccess / admin under the EXISTING entitlement rules. */
  paidOnly: boolean;
  /** Max provider calls, in order: plan, build, critique. */
  maxPlanCalls: 0 | 1;
  maxBuildCalls: 1;
  maxCritiqueCalls: 0 | 1;
};

export const POCKET_PROFILES: readonly PocketProfileSpec[] = [
  {
    id: "fast",
    label: "Fast",
    blurb: "Quickest — one build call, deterministic art direction.",
    paidOnly: false,
    maxPlanCalls: 0,
    maxBuildCalls: 1,
    maxCritiqueCalls: 0,
  },
  {
    id: "studio",
    label: "Studio",
    blurb: "Best available Claude + art direction. Up to 2 calls (plan + build).",
    paidOnly: true,
    maxPlanCalls: 1,
    maxBuildCalls: 1,
    maxCritiqueCalls: 0,
  },
  {
    id: "cinematic",
    label: "Cinematic",
    blurb: "Studio plus one critique pass. Up to 3 calls (plan + build + critique).",
    paidOnly: true,
    maxPlanCalls: 1,
    maxBuildCalls: 1,
    maxCritiqueCalls: 1,
  },
] as const;

export function getProfile(id: string | undefined): PocketProfileSpec {
  return POCKET_PROFILES.find((p) => p.id === id) ?? POCKET_PROFILES[0];
}

/** Provider-call estimate shown in the UI before Generate. */
export function providerCallEstimate(profile: PocketProfile, isRefine: boolean): number {
  const spec = getProfile(profile);
  if (isRefine) return spec.maxBuildCalls; // refine never re-plans
  return spec.maxPlanCalls + spec.maxBuildCalls + spec.maxCritiqueCalls;
}

export function isProfileAllowed(profile: PocketProfile, paidAccess: boolean): boolean {
  return paidAccess || !getProfile(profile).paidOnly;
}

/* ------------------------------------------------------------------ *
 * Style families
 * ------------------------------------------------------------------ */

export type PocketStyleFamily =
  | "auto"
  | "futuristic"
  | "cinematic"
  | "luxury"
  | "editorial"
  | "brutalist"
  | "minimal"
  | "playful"
  | "organic"
  | "data-dense";

export const POCKET_STYLE_FAMILIES: readonly PocketStyleFamily[] = [
  "auto",
  "futuristic",
  "cinematic",
  "luxury",
  "editorial",
  "brutalist",
  "minimal",
  "playful",
  "organic",
  "data-dense",
] as const;

/** Concrete families only — "auto" resolves to one of these. */
export const CONCRETE_FAMILIES = POCKET_STYLE_FAMILIES.filter(
  (f) => f !== "auto",
) as readonly Exclude<PocketStyleFamily, "auto">[];

export type StyleFamilySpec = {
  id: Exclude<PocketStyleFamily, "auto">;
  label: string;
  layouts: readonly string[];
  heroes: readonly string[];
  /** Typography category + concrete scale/weight contrast. */
  typography: readonly string[];
  spacing: readonly string[];
  shape: readonly string[];
  depth: readonly string[];
  palettes: readonly string[];
  motion: readonly string[];
  interactions: readonly string[];
  techniques: readonly string[];
  sectionSequences: readonly (readonly string[])[];
  mobileRules: readonly string[];
  forbidden: readonly string[];
};

const UNIVERSAL_FORBIDDEN = [
  "centered hero with a single subtitle and two pill buttons",
  "three equal rounded feature cards in a row",
  "purple-to-blue diagonal gradient background",
  "generic glassmorphism panel over a blurred blob",
  "hero → features → testimonials → pricing → CTA in that exact order",
] as const;

export const STYLE_FAMILIES: readonly StyleFamilySpec[] = [
  {
    id: "futuristic",
    label: "Futuristic",
    layouts: ["split-diagonal-console", "orbital-radial", "hud-overlay-grid", "stacked-viewport-panels"],
    heroes: [
      "left-anchored headline with a live canvas constellation field on the right",
      "full-bleed shader gradient with a hairline HUD frame and corner telemetry",
      "vertically-split hero: kinetic type left, perspective 3D card stack right",
    ],
    typography: [
      "geometric grotesque display 900 at clamp(3rem,9vw,7rem) / mono body 400 at 15px — 6:1 contrast",
      "condensed uppercase display 800 tracking -0.04em / neutral sans body 400 — 5:1 contrast",
    ],
    spacing: ["8px step, 96px section-y, 24px grid gap", "6px step, 72px section-y, 16px grid gap"],
    shape: ["0px radius with 1px cyan hairline borders and clipped 12px corner notches", "4px radius, 2px solid borders, no shadows"],
    depth: ["layered translucent planes with additive glow, no drop shadows", "hard 1px outlines plus radial backlight bloom"],
    palettes: [
      "near-black #05070a base, single electric accent, 2 neutral greys, zero secondary hue",
      "deep navy base, sodium-amber accent, cool grey text ramp",
    ],
    motion: ["120ms linear micro-states, 900ms scroll-linked parallax on depth layers", "160ms cubic-bezier(.2,.9,.1,1) with staggered 40ms reveals"],
    interactions: ["cursor-reactive lighting on the hero canvas", "magnetic primary CTA with 8px pull radius", "scroll-scrubbed telemetry counters"],
    techniques: ["canvas-2d-particles", "css-3d-perspective", "webgl-shader-gradient", "cursor-reactive-lighting", "scroll-linked-transform"],
    sectionSequences: [
      ["hero-console", "capability-matrix", "live-diagram", "spec-table", "deployment-cta", "minimal-footer"],
      ["hero-shader", "scroll-narrative", "comparison-grid", "faq-accordion", "terminal-cta", "minimal-footer"],
    ],
    mobileRules: ["drop the canvas to a static gradient under 640px", "single column, 56px section-y, disable parallax"],
    forbidden: [...UNIVERSAL_FORBIDDEN],
  },
  {
    id: "cinematic",
    label: "Cinematic",
    layouts: ["full-bleed-scene-sequence", "letterboxed-chapters", "scroll-stage"],
    heroes: [
      "full-viewport dark scene with a vignette, a single 8vw title, and a scroll cue",
      "letterboxed 2.39:1 frame with layered parallax foreground/midground/background",
      "title card that dissolves into the first chapter on scroll",
    ],
    typography: [
      "high-contrast serif display 300 at clamp(3.5rem,10vw,8rem) / sans body 400 16px — 7:1 contrast",
      "wide-tracked uppercase sans 500 0.3em / serif body 400 18px",
    ],
    spacing: ["8px step, 140px section-y, 32px gap", "12px step, 160px section-y, 40px gap"],
    shape: ["0px radius everywhere, no borders, separation by light only", "2px radius, hairline 8%-white rules"],
    depth: ["multi-layer parallax with a graded vignette and film grain overlay", "spotlight radial masks over near-black"],
    palettes: [
      "true black base, warm tungsten highlight, desaturated teal shadow ramp",
      "charcoal base, bone-white text, single blood-orange accent",
    ],
    motion: ["600ms ease-out dissolves, scroll-scrubbed camera pans", "400ms cubic-bezier(.16,1,.3,1) with 80ms stagger"],
    interactions: ["scroll-scrubbed chapter transitions", "hover-revealed caption overlays", "parallax depth on pointer move"],
    techniques: ["scroll-linked-transform", "parallax-depth-layers", "layered-svg", "animated-noise-grain", "kinetic-typography"],
    sectionSequences: [
      ["title-card", "chapter-one", "chapter-two", "credits-grid", "closing-frame"],
      ["cold-open", "scene-strip", "quote-slab", "chapter-three", "end-card", "minimal-footer"],
    ],
    mobileRules: ["replace scrub with discrete IntersectionObserver reveals", "cap grain overlay opacity, 72px section-y"],
    forbidden: [...UNIVERSAL_FORBIDDEN],
  },
  {
    id: "luxury",
    label: "Luxury",
    layouts: ["asymmetric-editorial-luxe", "centered-plinth", "gallery-rail"],
    heroes: [
      "off-centre product plinth with a soft key light and a single serif line",
      "full-width still image with a lower-third caption block and hairline rule",
      "two-column: oversized serif wordmark left, slow crossfade gallery right",
    ],
    typography: [
      "didone serif display 400 at clamp(3rem,7vw,5.5rem) tracking -0.01em / humanist sans 300 15px — 4.5:1 contrast",
      "old-style serif 500 / small-caps sans label 600 0.18em tracking",
    ],
    spacing: ["8px step, 160px section-y, 48px gap, 1180px container", "10px step, 128px section-y, 56px gap"],
    shape: ["0px radius, 1px 12%-warm-grey hairlines, generous inner padding 48px", "2px radius, no borders, whitespace as separation"],
    depth: ["no shadows; separation via whitespace and a single soft image glow", "one 0 30px 80px -40px shadow on the plinth only"],
    palettes: [
      "warm bone #F6F2EA base, ink #14120F text, brushed-gold accent, no third hue",
      "deep espresso base, champagne accent, warm ivory text",
    ],
    motion: ["500ms ease-in-out crossfades, 0px hover lift, opacity-only states", "350ms ease with 2px letter-spacing shift on links"],
    interactions: ["slow crossfade gallery with keyboard arrows", "hover reveals a hairline underline that draws from left", "sticky side index"],
    techniques: ["layered-svg", "css-3d-perspective", "scroll-linked-transform", "animated-gradient-mesh"],
    sectionSequences: [
      ["wordmark-hero", "atelier-story", "collection-rail", "materials-detail", "enquiry-block", "serif-footer"],
      ["still-hero", "editorial-split", "numbered-craft", "gallery-rail", "concierge-cta", "serif-footer"],
    ],
    mobileRules: ["stack to one column at 768px, 80px section-y, keep hairlines", "swap crossfade gallery for a swipe rail"],
    forbidden: [...UNIVERSAL_FORBIDDEN, "neon accents", "drop shadows on every card"],
  },
  {
    id: "editorial",
    label: "Editorial",
    layouts: ["asymmetric-magazine", "two-column-longform", "modular-front-page"],
    heroes: [
      "front-page masthead with a 3-column deck and a pull-quote sidebar",
      "oversized headline spanning 9 of 12 columns with a byline rail",
      "lead article block beside a stacked secondary story column",
    ],
    typography: [
      "transitional serif headline 700 at clamp(2.5rem,6vw,4.5rem) / serif body 400 18px 1.7lh — 4:1 contrast",
      "grotesque headline 800 / serif body 400 19px, drop caps on lead paragraphs",
    ],
    spacing: ["8px step, 88px section-y, 32px column gap, 1240px container", "6px step, 72px section-y, 24px gap"],
    shape: ["0px radius, 1px rules between stories, no cards", "0px radius, 3px top rule on section headers"],
    depth: ["flat — hierarchy from type size and rules only", "one subtle tint band per alternating section"],
    palettes: [
      "paper #FBFAF7 base, ink text, one editorial red accent for links and rules",
      "off-white base, near-black text, deep forest accent",
    ],
    motion: ["no entrance animation; 120ms link underline only", "180ms ease fade-in on images only"],
    interactions: ["sticky reading-progress rule", "footnote popovers", "column-aware pull quotes"],
    techniques: ["layered-svg", "scroll-linked-transform", "accessible-animated-diagram"],
    sectionSequences: [
      ["masthead", "lead-story", "column-grid", "pull-quote", "sidebar-list", "author-note", "rule-footer"],
      ["deck-hero", "longform-body", "inline-figure", "related-strip", "subscribe-rule", "rule-footer"],
    ],
    mobileRules: ["collapse to one column at 720px, keep 18px body", "rules stay, gutters shrink to 16px"],
    forbidden: [...UNIVERSAL_FORBIDDEN, "card grids", "gradient headings"],
  },
  {
    id: "brutalist",
    label: "Brutalist",
    layouts: ["poster-brutalist", "raw-grid-exposed", "marquee-stack"],
    heroes: [
      "wall of 14vw uppercase type clipped by the viewport edge",
      "exposed 12-column grid with visible gridlines and a numbered index",
      "full-width marquee band above a raw two-tone statement block",
    ],
    typography: [
      "grotesque 900 uppercase at clamp(3rem,14vw,11rem) tracking -0.05em / mono body 400 14px — 8:1 contrast",
      "condensed 800 uppercase / system mono 500 13px, all caps labels",
    ],
    spacing: ["4px step, 48px section-y, 0px gap (touching blocks)", "8px step, 64px section-y, 4px gap"],
    shape: ["0px radius, 3px solid black borders, hard offsets", "0px radius, 2px borders, 6px hard offset shadow"],
    depth: ["hard offset blocks, no blur, no gradient", "flat colour fields butted together"],
    palettes: [
      "paper white base, pure black text, one screaming accent (#FF3B00 or #C8FF00)",
      "safety-yellow base, black text, no third colour",
    ],
    motion: ["0ms or 80ms step transitions, instant hover inversion", "100ms with a 6px hard translate on hover"],
    interactions: ["hover inverts the whole block", "infinite marquee band", "click-to-cycle colourway"],
    techniques: ["kinetic-typography", "canvas-2d-noise", "animated-grid-background"],
    sectionSequences: [
      ["type-wall", "index-list", "marquee-band", "raw-table", "contact-slab"],
      ["statement-block", "numbered-manifesto", "grid-exposed", "marquee-band", "contact-slab"],
    ],
    mobileRules: ["type clamps to 12vw, borders stay 3px", "marquee slows to 40s, one column"],
    forbidden: [...UNIVERSAL_FORBIDDEN, "soft shadows", "rounded corners", "gradients"],
  },
  {
    id: "minimal",
    label: "Minimal",
    layouts: ["single-column-quiet", "left-rail-index", "wide-margin-canvas"],
    heroes: [
      "one 40px line of text, a thin rule, and 200px of whitespace beneath",
      "left-aligned name plus a two-line description in a 520px measure",
      "sticky left index with the first section already in view",
    ],
    typography: [
      "neutral sans 500 at 40px / body 400 16px 1.7lh — 2.5:1 contrast, no display sizes",
      "sans 600 at 32px / body 400 15px, tabular numerals for data",
    ],
    spacing: ["8px step, 120px section-y, 24px gap, 720px measure", "8px step, 96px section-y, 32px gap"],
    shape: ["0px radius, 1px 8%-grey hairlines only where needed", "6px radius, no borders"],
    depth: ["none — flat surfaces, whitespace only", "one 1px hairline separator per section"],
    palettes: [
      "#FFFFFF base, #111 text, #6B7280 muted, one restrained accent used under 3 times",
      "#0B0B0C base, #E8E8EA text, one cool accent",
    ],
    motion: ["150ms ease opacity only, no transforms", "no motion beyond focus rings"],
    interactions: ["keyboard-first navigation", "inline expand/collapse detail", "hover reveals metadata in the margin"],
    techniques: ["layered-svg", "accessible-animated-diagram"],
    sectionSequences: [
      ["quiet-intro", "work-index", "selected-detail", "notes", "contact-line"],
      ["statement", "list-of-things", "about-measure", "contact-line"],
    ],
    mobileRules: ["measure becomes 100% minus 24px gutters", "index collapses above content"],
    forbidden: [...UNIVERSAL_FORBIDDEN, "hero imagery", "animated backgrounds"],
  },
  {
    id: "playful",
    label: "Playful",
    layouts: ["canvas-modular-collage", "sticker-scatter", "zig-zag-sections"],
    heroes: [
      "collage hero with tilted cards, a hand-drawn arrow SVG, and a bouncy CTA",
      "oversized rounded blob behind a 2-line headline with sticker badges",
      "zig-zag intro: illustration left, copy right, then mirrored",
    ],
    typography: [
      "rounded sans 800 at clamp(2.5rem,7vw,5rem) / rounded sans 500 17px — 4:1 contrast",
      "playful display 700 with alternating colour words / sans body 400 16px",
    ],
    spacing: ["8px step, 96px section-y, 28px gap", "12px step, 80px section-y, 36px gap"],
    shape: ["24px radius everywhere, 2px solid borders, 4px hard offset", "9999px pills for every control, 20px cards"],
    depth: ["chunky 6px offset shadows in the accent colour", "layered stickers with slight rotations"],
    palettes: [
      "cream base, ink text, three saturated accents (coral, mint, sun) used deliberately",
      "mint base, deep plum text, sunshine accent",
    ],
    motion: ["220ms cubic-bezier(.34,1.56,.64,1) springy hovers, 4px lift", "180ms with a 2deg wiggle on hover"],
    interactions: ["tilt-on-hover cards", "confetti burst on primary action", "drag-to-reorder sticker board"],
    techniques: ["css-3d-tilt", "canvas-2d-particles", "layered-svg", "kinetic-typography", "magnetic-controls"],
    sectionSequences: [
      ["collage-hero", "how-it-works-zigzag", "sticker-board", "faq-bubbles", "big-cta", "friendly-footer"],
      ["blob-hero", "playful-steps", "gallery-scatter", "testimonial-bubbles", "big-cta", "friendly-footer"],
    ],
    mobileRules: ["reduce rotations to 0deg, stack zig-zag", "confetti disabled under 640px"],
    forbidden: [...UNIVERSAL_FORBIDDEN, "corporate blue", "flat grey cards"],
  },
  {
    id: "organic",
    label: "Organic",
    layouts: ["flowing-curve-sections", "soft-grid-asymmetric", "terrain-scroll"],
    heroes: [
      "SVG wave divider under a warm gradient mesh with a two-line serif headline",
      "off-grid hero with an irregular blob mask over a photograph",
      "terrain-layered hero where three SVG ridges scroll at different speeds",
    ],
    typography: [
      "humanist serif 600 at clamp(2.75rem,7vw,5rem) / humanist sans 400 17px 1.75lh — 4:1 contrast",
      "soft sans 700 / serif body 400 18px",
    ],
    spacing: ["8px step, 112px section-y, 32px gap", "10px step, 128px section-y, 40px gap"],
    shape: ["organic radii 32px 8px 32px 8px, no borders", "9999px on media, 16px on surfaces"],
    depth: ["soft 0 24px 60px -30px shadows tinted with the accent", "overlapping translucent layers, no hard edges"],
    palettes: [
      "sage #EDF1E8 base, bark #2C3327 text, terracotta accent, clay secondary",
      "sand base, deep moss text, ochre accent",
    ],
    motion: ["400ms ease-in-out, 6px float loops on decorative shapes", "300ms with gentle scale 1.02 on hover"],
    interactions: ["scroll-morphing SVG path", "cursor-following soft light", "expanding accordion with curve reveal"],
    techniques: ["layered-svg", "animated-gradient-mesh", "scroll-linked-transform", "parallax-depth-layers", "canvas-2d-noise"],
    sectionSequences: [
      ["wave-hero", "story-curve", "ingredient-grid", "process-terrain", "warm-cta", "curved-footer"],
      ["blob-hero", "values-flow", "photo-mosaic", "quote-band", "warm-cta", "curved-footer"],
    ],
    mobileRules: ["waves simplify to 2 ridges", "float loops disabled, 64px section-y"],
    forbidden: [...UNIVERSAL_FORBIDDEN, "hard 90-degree card grids", "neon"],
  },
  {
    id: "data-dense",
    label: "Data-dense",
    layouts: ["sidebar-dense-ops", "three-panel-app", "table-first-console"],
    heroes: [
      "no marketing hero: an operational header bar with live KPI tiles and a filter row",
      "split console: left nav rail, centre table, right inspector",
      "dashboard masthead with 6 compact stat cells and a sparkline strip",
    ],
    typography: [
      "sans 600 at 22px max / body 400 13px, tabular numerals, mono for IDs — 1.8:1 contrast",
      "sans 700 at 20px / 12.5px body, uppercase 11px 0.08em labels",
    ],
    spacing: ["4px step, 32px section-y, 12px gap, 1440px container", "4px step, 24px section-y, 8px gap, full-bleed"],
    shape: ["4px radius, 1px 10%-borders on every cell", "2px radius, 1px borders, zebra rows"],
    depth: ["no shadows except a 1px sticky-header rule", "elevation only on popovers"],
    palettes: [
      "#0E1116 base, #E6E9EF text, semantic green/amber/red status ramp, one blue accent",
      "#F7F8FA base, slate text, semantic status ramp",
    ],
    motion: ["80ms linear only; no entrance animation", "100ms for popovers, none for rows"],
    interactions: ["keyboard row navigation with j/k", "column sort + sticky header", "inline sparkline tooltips"],
    techniques: ["canvas-2d-charts", "accessible-animated-diagram", "layered-svg"],
    sectionSequences: [
      ["ops-header", "kpi-strip", "primary-table", "detail-inspector", "activity-log", "status-footer"],
      ["filter-bar", "chart-row", "dense-table", "breakdown-panel", "status-footer"],
    ],
    mobileRules: ["table becomes stacked definition rows under 720px", "inspector becomes a bottom sheet"],
    forbidden: [...UNIVERSAL_FORBIDDEN, "large hero imagery", "marketing testimonials"],
  },
] as const;

export function getFamily(id: PocketStyleFamily): StyleFamilySpec {
  return STYLE_FAMILIES.find((f) => f.id === id) ?? STYLE_FAMILIES[0];
}

/* ------------------------------------------------------------------ *
 * Design DNA
 * ------------------------------------------------------------------ */

export type PocketDesignDNA = {
  id: string;
  v: typeof POCKET_CREATIVE_VERSION;
  seed: number;
  family: Exclude<PocketStyleFamily, "auto">;
  layout: string;
  hero: string;
  sections: readonly string[];
  typography: string;
  palette: string;
  spacing: string;
  shape: string;
  depth: string;
  motion: string;
  signatureInteraction: string;
  techniques: readonly string[];
  mobileRules: readonly string[];
  forbidden: readonly string[];
};

/** Deterministic PRNG (mulberry32) — same seed ⇒ same DNA. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function pick<T>(arr: readonly T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

/** Structural signature — colour is deliberately NOT part of it. */
export type PocketSignature = {
  family: string;
  layout: string;
  hero: string;
  sections: string;
  typeClass: string;
  paletteClass: string;
  interaction: string;
};

export function dnaSignature(dna: PocketDesignDNA): PocketSignature {
  return {
    family: dna.family,
    layout: dna.layout,
    hero: shortHash(dna.hero),
    sections: dna.sections.join(">"),
    typeClass: shortHash(dna.typography),
    paletteClass: shortHash(dna.palette),
    interaction: shortHash(dna.signatureInteraction),
  };
}

export function shortHash(s: string): string {
  return hashString(s).toString(36).slice(0, 8);
}

/** 0 = identical structure, 1 = fully different. Colour weighted lowest. */
export function signatureDistance(a: PocketSignature, b: PocketSignature): number {
  let d = 0;
  let total = 0;
  const axis = (same: boolean, weight: number) => {
    total += weight;
    if (!same) d += weight;
  };
  axis(a.family === b.family, 4);
  axis(a.layout === b.layout, 4);
  axis(a.hero === b.hero, 3);
  axis(a.sections === b.sections, 4);
  axis(a.typeClass === b.typeClass, 2);
  axis(a.interaction === b.interaction, 2);
  axis(a.paletteClass === b.paletteClass, 1);
  return total === 0 ? 0 : d / total;
}

export function generateDNA(input: {
  family: Exclude<PocketStyleFamily, "auto">;
  seed: number;
}): PocketDesignDNA {
  const spec = getFamily(input.family) as StyleFamilySpec;
  const r = rng(input.seed);
  const sections = pick(spec.sectionSequences, r);
  const dna: PocketDesignDNA = {
    id: `dna_${input.family}_${(input.seed >>> 0).toString(36).slice(0, 6)}`,
    v: POCKET_CREATIVE_VERSION,
    seed: input.seed >>> 0,
    family: spec.id,
    layout: pick(spec.layouts, r),
    hero: pick(spec.heroes, r),
    sections,
    typography: pick(spec.typography, r),
    palette: pick(spec.palettes, r),
    spacing: pick(spec.spacing, r),
    shape: pick(spec.shape, r),
    depth: pick(spec.depth, r),
    motion: pick(spec.motion, r),
    signatureInteraction: pick(spec.interactions, r),
    techniques: spec.techniques.slice(0, 4),
    mobileRules: spec.mobileRules,
    forbidden: spec.forbidden,
  };
  return dna;
}

/**
 * Pick the DNA whose structural signature is FARTHEST from recent builds.
 * `auto` additionally prefers the least-recently-used family.
 */
export function selectDNA(input: {
  family: PocketStyleFamily;
  seed: number;
  recent: readonly PocketSignature[];
}): PocketDesignDNA {
  const recent = input.recent.slice(0, 12);
  const families: readonly Exclude<PocketStyleFamily, "auto">[] =
    input.family === "auto" ? CONCRETE_FAMILIES : [input.family];

  let best: PocketDesignDNA | null = null;
  let bestScore = -1;
  // Deterministic candidate sweep: 6 seeds per family.
  for (const fam of families) {
    for (let i = 0; i < 6; i++) {
      const cand = generateDNA({ family: fam, seed: (input.seed + i * 7919) >>> 0 });
      const sig = dnaSignature(cand);
      const score = recent.length
        ? Math.min(...recent.map((rsig) => signatureDistance(sig, rsig)))
        : 1;
      // Recency bonus for `auto`: families not seen recently win ties.
      const recencyIdx = recent.findIndex((rsig) => rsig.family === fam);
      const recencyBonus = input.family === "auto" ? (recencyIdx === -1 ? 0.15 : recencyIdx / 100) : 0;
      const total = score + recencyBonus;
      if (total > bestScore) {
        bestScore = total;
        best = cand;
      }
    }
  }
  return best ?? generateDNA({ family: families[0], seed: input.seed });
}

/* ------------------------------------------------------------------ *
 * Creative memory ledger (bounded, privacy-safe)
 * ------------------------------------------------------------------ */

export const CREATIVE_MEMORY_LIMIT = 12;
export const CREATIVE_MEMORY_MAX_BYTES = 12_000;

export type CreativeMemoryEntry = PocketSignature & { at: number };
export type CreativeMemory = { v: number; entries: CreativeMemoryEntry[] };

/** Memory is scoped by a hash of the library code so no code is ever stored. */
export function creativeMemoryKey(libraryCode: string | undefined): string {
  const code = (libraryCode ?? "").trim();
  return `pocket.creative.mem.${code ? shortHash(code) : "guest"}`;
}

export function readCreativeMemory(libraryCode?: string): CreativeMemory {
  const raw = safeGet<CreativeMemory>(creativeMemoryKey(libraryCode));
  if (!raw || !Array.isArray(raw.entries)) return { v: POCKET_CREATIVE_VERSION, entries: [] };
  return {
    v: POCKET_CREATIVE_VERSION,
    entries: raw.entries.filter(isSafeEntry).slice(0, CREATIVE_MEMORY_LIMIT),
  };
}

function isSafeEntry(e: unknown): e is CreativeMemoryEntry {
  if (!e || typeof e !== "object") return false;
  const c = e as Record<string, unknown>;
  return (
    typeof c.family === "string" &&
    typeof c.layout === "string" &&
    typeof c.sections === "string" &&
    typeof c.at === "number"
  );
}

/** Append a signature. Never stores HTML, prompts, URLs, PII, or the code. */
export function rememberSignature(
  sig: PocketSignature,
  libraryCode?: string,
  now = Date.now(),
): CreativeMemory {
  const current = readCreativeMemory(libraryCode);
  const entry: CreativeMemoryEntry = { ...sig, at: now };
  const entries = [entry, ...current.entries].slice(0, CREATIVE_MEMORY_LIMIT);
  let next: CreativeMemory = { v: POCKET_CREATIVE_VERSION, entries };
  while (JSON.stringify(next).length > CREATIVE_MEMORY_MAX_BYTES && next.entries.length > 1) {
    next = { v: POCKET_CREATIVE_VERSION, entries: next.entries.slice(0, next.entries.length - 1) };
  }
  safeSet(creativeMemoryKey(libraryCode), next);
  return next;
}

/* ------------------------------------------------------------------ *
 * Persisted creative preferences
 * ------------------------------------------------------------------ */

export type PocketCreativePrefs = { profile: PocketProfile; family: PocketStyleFamily };
export const CREATIVE_PREFS_KEY = "pocket.creative.prefs";
export const DEFAULT_CREATIVE_PREFS: PocketCreativePrefs = { profile: "fast", family: "auto" };

export function normalizeCreativePrefs(raw: unknown): PocketCreativePrefs {
  const o = (raw ?? {}) as Record<string, unknown>;
  const profile = POCKET_PROFILES.some((p) => p.id === o.profile)
    ? (o.profile as PocketProfile)
    : DEFAULT_CREATIVE_PREFS.profile;
  const family = POCKET_STYLE_FAMILIES.includes(o.family as PocketStyleFamily)
    ? (o.family as PocketStyleFamily)
    : DEFAULT_CREATIVE_PREFS.family;
  return { profile, family };
}

export function readCreativePrefs(): PocketCreativePrefs {
  return normalizeCreativePrefs(safeGet<unknown>(CREATIVE_PREFS_KEY));
}

export function writeCreativePrefs(prefs: PocketCreativePrefs): void {
  safeSet(CREATIVE_PREFS_KEY, normalizeCreativePrefs(prefs));
}

/** One compact human line for the "Design DNA" summary chip. */
export function dnaSummaryLine(dna: PocketDesignDNA): string {
  return `${getFamily(dna.family).label} · ${dna.layout} · ${dna.sections.length} sections · ${dna.id}`;
}
