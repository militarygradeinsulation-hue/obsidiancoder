// Obsidian Pocket — concept planning contract.
// Pure: types, cache keys, deterministic fallback, strict parsing.
// Provider calls live in pocket-studio.functions.ts (metered).

import {
  generateDNA,
  selectDNA,
  hashString,
  shortHash,
  getFamily,
  CONCRETE_FAMILIES,
  type PocketDesignDNA,
  type PocketProfile,
  type PocketSignature,
  type PocketStyleFamily,
} from "./pocket-creative";

export const POCKET_CONCEPT_VERSION = 1 as const;

export type ConceptRisk = "low" | "medium" | "high";

export type PocketConcept = {
  id: string;
  name: string;
  /** Exactly one sentence. */
  concept: string;
  dna: PocketDesignDNA;
  signatureMoment: string;
  risk: ConceptRisk;
};

export type PocketConceptPlan = {
  v: typeof POCKET_CONCEPT_VERSION;
  concepts: [PocketConcept, PocketConcept, PocketConcept];
  selectedId: string;
  selectionReason: string;
  source: "ai" | "deterministic";
};

/** Cache key: prompt + style + profile + digest of recent signatures. */
export function conceptCacheKey(input: {
  prompt: string;
  family: PocketStyleFamily;
  profile: PocketProfile;
  recent: readonly PocketSignature[];
}): string {
  const digest = input.recent
    .slice(0, 12)
    .map((s) => `${s.family}|${s.layout}|${s.sections}`)
    .join(";");
  return [
    `v${POCKET_CONCEPT_VERSION}`,
    shortHash(input.prompt.trim().slice(0, 4000)),
    input.family,
    input.profile,
    shortHash(digest),
  ].join(":");
}

/** Bounded payload sent to the planner — never contains HTML. */
export const CONCEPT_PROMPT_MAX = 2000;

export function conceptSeed(prompt: string, family: PocketStyleFamily, salt: number): number {
  return hashString(`${prompt}::${family}::${salt}`) >>> 0 || 1;
}

/** Three structurally distinct concepts with zero provider calls. */
export function deterministicConceptPlan(input: {
  prompt: string;
  family: PocketStyleFamily;
  recent: readonly PocketSignature[];
}): PocketConceptPlan {
  const used: PocketSignature[] = [...input.recent];
  const concepts: PocketConcept[] = [];
  for (let i = 0; i < 3; i++) {
    const seed = conceptSeed(input.prompt, input.family, i);
    const dna = selectDNA({ family: input.family, seed, recent: used });
    used.unshift({
      family: dna.family,
      layout: dna.layout,
      hero: shortHash(dna.hero),
      sections: dna.sections.join(">"),
      typeClass: shortHash(dna.typography),
      paletteClass: shortHash(dna.palette),
      interaction: shortHash(dna.signatureInteraction),
    });
    concepts.push(makeConcept(dna, i));
  }
  const plan: PocketConceptPlan = {
    v: POCKET_CONCEPT_VERSION,
    concepts: concepts as [PocketConcept, PocketConcept, PocketConcept],
    selectedId: concepts[0].id,
    selectionReason: "Most structurally distinct from your recent Pocket builds.",
    source: "deterministic",
  };
  return plan;
}

function makeConcept(dna: PocketDesignDNA, index: number): PocketConcept {
  const fam = getFamily(dna.family);
  const names = ["Direction A", "Direction B", "Direction C"];
  return {
    id: `c${index + 1}_${dna.id}`,
    name: `${names[index]} — ${fam.label}`,
    concept: `A ${fam.label.toLowerCase()} build using a ${dna.layout} layout where ${dna.hero}.`,
    dna,
    signatureMoment: dna.signatureInteraction,
    risk: dna.techniques.some((t) => t.includes("webgl")) ? "high" : index === 0 ? "medium" : "low",
  };
}

/* ---------------- strict parsing of a model response ---------------- */

type RawConcept = {
  name?: unknown;
  concept?: unknown;
  signatureMoment?: unknown;
  risk?: unknown;
  family?: unknown;
  layout?: unknown;
  hero?: unknown;
  sections?: unknown;
};

function str(v: unknown, max: number, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
}

/**
 * Merge a model's creative direction over a deterministic base so the DNA is
 * always complete and valid, even if the model returns partial JSON.
 */
export function parseConceptPlan(raw: unknown, base: PocketConceptPlan): PocketConceptPlan {
  const obj = (raw ?? {}) as {
    concepts?: unknown;
    selectedId?: unknown;
    selectionReason?: unknown;
  };
  const list = Array.isArray(obj.concepts) ? (obj.concepts as RawConcept[]) : [];
  if (list.length < 3) return base;

  const concepts = base.concepts.map((fallbackConcept, i) => {
    const rc = list[i] ?? {};
    const family = CONCRETE_FAMILIES.includes(rc.family as never)
      ? (rc.family as PocketDesignDNA["family"])
      : fallbackConcept.dna.family;
    const seeded =
      family === fallbackConcept.dna.family
        ? fallbackConcept.dna
        : generateDNA({ family, seed: fallbackConcept.dna.seed });
    const sections = Array.isArray(rc.sections)
      ? (rc.sections as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 10)
      : seeded.sections;
    const dna: PocketDesignDNA = {
      ...seeded,
      layout: str(rc.layout, 80, seeded.layout),
      hero: str(rc.hero, 240, seeded.hero),
      sections: sections.length >= 3 ? sections : seeded.sections,
    };
    const risk =
      rc.risk === "low" || rc.risk === "medium" || rc.risk === "high"
        ? rc.risk
        : fallbackConcept.risk;
    return {
      id: fallbackConcept.id,
      name: str(rc.name, 60, fallbackConcept.name),
      concept: str(rc.concept, 220, fallbackConcept.concept),
      dna,
      signatureMoment: str(rc.signatureMoment, 160, fallbackConcept.signatureMoment),
      risk,
    } satisfies PocketConcept;
  }) as [PocketConcept, PocketConcept, PocketConcept];

  const selectedId = concepts.some((c) => c.id === obj.selectedId)
    ? (obj.selectedId as string)
    : concepts[0].id;

  return {
    v: POCKET_CONCEPT_VERSION,
    concepts,
    selectedId,
    selectionReason: str(obj.selectionReason, 200, base.selectionReason),
    source: "ai",
  };
}

export function selectedConcept(plan: PocketConceptPlan): PocketConcept {
  return plan.concepts.find((c) => c.id === plan.selectedId) ?? plan.concepts[0];
}

/** Compact JSON-only instruction for the planner call. */
export function conceptPlannerPrompt(input: {
  prompt: string;
  family: PocketStyleFamily;
  recentSummaries: readonly string[];
}): string {
  return `You are an art director for a single-file HTML product build.

USER REQUEST (verbatim, truncated):
${input.prompt.slice(0, CONCEPT_PROMPT_MAX)}

REQUESTED STYLE FAMILY: ${input.family}
RECENTLY USED STRUCTURES (do NOT repeat these):
${
  input.recentSummaries
    .slice(0, 12)
    .map((s) => `- ${s}`)
    .join("\n") || "- none"
}

Return STRICT JSON only, no prose, no markdown fence:
{"concepts":[{"name":"","concept":"one sentence","family":"futuristic|cinematic|luxury|editorial|brutalist|minimal|playful|organic|data-dense","layout":"concrete archetype","hero":"one concrete sentence describing hero composition","sections":["6 concrete section ids"],"signatureMoment":"one memorable visual or interaction","risk":"low|medium|high"}],"selectedId":"","selectionReason":""}

Rules: exactly 3 concepts. They must differ in LAYOUT, HERO and SECTION SEQUENCE — not merely colour. Never propose a centered hero with two pill buttons, a three-card feature row, or a purple-blue gradient. Do not output HTML.`;
}
