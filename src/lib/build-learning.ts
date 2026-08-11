// Build learning — a scored memory of every finished build.
//
// The creative memory in `pocket-creative.ts` only remembers STRUCTURE, so it
// can avoid repeating itself. It has no idea whether a build was any good.
// This module records the quality signals we already compute and throw away
// (critique scores, design-floor findings, validation status, keep/discard)
// and turns them into three reusable outputs:
//
//   1. exemplars  — the best past directions, re-injected as a prompt brief
//   2. bias       — families/models/profiles that consistently win or lose
//   3. proven DNA — a high-scoring direction that can be reused (mutated)
//      instead of paying for another concept-planning provider call
//
// Everything here is pure + deterministic and stores no HTML, no prompts, no
// URLs, no PII and never the library code itself (only a hash of it).

import { safeGet, safeSet } from "./safe-storage";
import {
  generateDNA,
  shortHash,
  type PocketDesignDNA,
  type PocketProfile,
  type PocketStyleFamily,
} from "./pocket-creative";

export const BUILD_LEARNING_VERSION = 1 as const;
/** Entries kept per library code. */
export const LEARNING_LIMIT = 60;
export const LEARNING_MAX_BYTES = 32_000;
/** One build never becomes a rule — same floor as preference-learning.ts. */
export const MIN_OBSERVATIONS = 3;
/** A direction must score at least this to be reused without re-planning. */
export const PROVEN_SCORE = 80;

export type LearningSurface = "vibe" | "pocket";
export type LearningOutcome = "kept" | "discarded" | "restored";
export type LearningValidation = "passed" | "warnings" | "failed" | "unknown";

export interface BuildLearningEntry {
  id: string;
  at: number;
  surface: LearningSurface;
  profile: PocketProfile;
  /** Concrete family ("auto" is resolved before recording). */
  family: string;
  dnaId: string;
  dnaSeed: number;
  /** Short, human-readable axis notes used to build the exemplar brief. */
  dnaAxes: {
    layout: string;
    typography: string;
    palette: string;
    depth: string;
    signature: string;
  };
  model: string;
  /** Critique axis scores, 0-10 each. Empty when no review ran. */
  critique: Record<string, number>;
  /** Design-floor issue codes/messages, already truncated. */
  designIssues: string[];
  validationStatus: LearningValidation;
  latencyMs: number;
  outcome: LearningOutcome;
}

export interface BuildLearning {
  v: number;
  entries: BuildLearningEntry[];
}

const EMPTY: BuildLearning = { v: BUILD_LEARNING_VERSION, entries: [] };

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

export function learningKey(libraryCode: string | undefined): string {
  const code = (libraryCode ?? "").trim();
  return `obs.build.learning.${code ? shortHash(code) : "guest"}`;
}

function clampScoreMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        out[k.slice(0, 40)] = Math.max(0, Math.min(10, v));
      }
    }
  }
  return out;
}

function isEntry(v: unknown): v is BuildLearningEntry {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.at === "number" &&
    typeof o.family === "string" &&
    typeof o.model === "string" &&
    typeof o.outcome === "string"
  );
}

export function readBuildLearning(libraryCode?: string): BuildLearning {
  const raw = safeGet<BuildLearning>(learningKey(libraryCode));
  if (!raw || !Array.isArray(raw.entries)) return { ...EMPTY, entries: [] };
  return {
    v: BUILD_LEARNING_VERSION,
    entries: raw.entries.filter(isEntry).slice(0, LEARNING_LIMIT),
  };
}

export function writeBuildLearning(next: BuildLearning, libraryCode?: string): BuildLearning {
  let out: BuildLearning = { v: BUILD_LEARNING_VERSION, entries: next.entries.slice(0, LEARNING_LIMIT) };
  while (JSON.stringify(out).length > LEARNING_MAX_BYTES && out.entries.length > 1) {
    out = { v: BUILD_LEARNING_VERSION, entries: out.entries.slice(0, out.entries.length - 1) };
  }
  safeSet(learningKey(libraryCode), out);
  return out;
}

export function forgetBuildLearning(libraryCode?: string): BuildLearning {
  const empty: BuildLearning = { v: BUILD_LEARNING_VERSION, entries: [] };
  safeSet(learningKey(libraryCode), empty);
  return empty;
}

export type BuildOutcomeInput = {
  surface: LearningSurface;
  profile: PocketProfile;
  dna: PocketDesignDNA | null;
  family?: PocketStyleFamily | string;
  model: string;
  critique?: Record<string, number> | null;
  designIssues?: readonly string[];
  validationStatus?: LearningValidation;
  latencyMs?: number;
  outcome: LearningOutcome;
};

/** Append one graded build. Returns the new memory. */
export function recordBuildOutcome(
  input: BuildOutcomeInput,
  libraryCode?: string,
  now = Date.now(),
): BuildLearning {
  const dna = input.dna;
  const family = String(dna?.family ?? input.family ?? "auto").slice(0, 40);
  const entry: BuildLearningEntry = {
    id: `b_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: now,
    surface: input.surface,
    profile: input.profile,
    family,
    dnaId: String(dna?.id ?? "").slice(0, 80),
    dnaSeed: typeof dna?.seed === "number" ? dna.seed >>> 0 : 0,
    dnaAxes: {
      layout: String(dna?.layout ?? "").slice(0, 90),
      typography: String(dna?.typography ?? "").slice(0, 120),
      palette: String(dna?.palette ?? "").slice(0, 120),
      depth: String(dna?.depth ?? "").slice(0, 90),
      signature: String(dna?.signatureInteraction ?? "").slice(0, 120),
    },
    model: String(input.model ?? "").slice(0, 80),
    critique: clampScoreMap(input.critique),
    designIssues: (input.designIssues ?? []).slice(0, 4).map((s) => String(s).slice(0, 120)),
    validationStatus: input.validationStatus ?? "unknown",
    latencyMs: Math.max(0, Math.round(input.latencyMs ?? 0)),
    outcome: input.outcome,
  };
  const current = readBuildLearning(libraryCode);
  return writeBuildLearning({ v: BUILD_LEARNING_VERSION, entries: [entry, ...current.entries] }, libraryCode);
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

/**
 * One 0-100 quality number.
 *  • critique axes (0-10 each) average → 0-100, when a review ran
 *  • otherwise a validation-derived baseline
 *  • minus design-floor penalties, minus a discard penalty
 */
export function scoreOf(entry: BuildLearningEntry): number {
  const axes = Object.values(entry.critique ?? {});
  let base: number;
  if (axes.length) {
    base = (axes.reduce((a, b) => a + b, 0) / axes.length) * 10;
  } else {
    // A critique-free build must still be able to earn a reusable score —
    // otherwise the whole speed path below is unreachable on the `fast`
    // profile, which never runs a review.
    base =
      entry.validationStatus === "passed" ? 78 :
      entry.validationStatus === "warnings" ? 64 :
      entry.validationStatus === "failed" ? 30 : 55;
  }
  base -= Math.min(15, (entry.designIssues?.length ?? 0) * 5);
  if (entry.outcome === "discarded") base -= 30;
  else if (entry.outcome === "restored") base -= 12;
  else base += 4; // kept builds are the ones the user actually shipped
  return Math.max(0, Math.min(100, Math.round(base)));
}

/** Best recent entries for a family (or across all families when omitted). */
export function topExemplars(
  entries: readonly BuildLearningEntry[],
  family?: string,
  n = 2,
): BuildLearningEntry[] {
  const pool = entries.filter(
    (e) =>
      e.outcome !== "discarded" &&
      (!family || family === "auto" || e.family === family),
  );
  return [...pool]
    .sort((a, b) => {
      const d = scoreOf(b) - scoreOf(a);
      return d !== 0 ? d : b.at - a.at;
    })
    .slice(0, Math.max(0, n));
}

/* ------------------------------------------------------------------ *
 * Learned bias
 * ------------------------------------------------------------------ */

export interface BiasStat {
  n: number;
  avgScore: number;
  keepRate: number;
}
export interface LearnedBias {
  families: Record<string, BiasStat>;
  models: Record<string, BiasStat>;
  profiles: Record<string, BiasStat>;
}

function accumulate(map: Record<string, { n: number; total: number; kept: number }>, key: string, e: BuildLearningEntry) {
  if (!key) return;
  const slot = (map[key] ??= { n: 0, total: 0, kept: 0 });
  slot.n++;
  slot.total += scoreOf(e);
  if (e.outcome === "kept") slot.kept++;
}

function finalize(map: Record<string, { n: number; total: number; kept: number }>): Record<string, BiasStat> {
  const out: Record<string, BiasStat> = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = { n: v.n, avgScore: Math.round(v.total / v.n), keepRate: v.kept / v.n };
  }
  return out;
}

export function learnedBias(entries: readonly BuildLearningEntry[]): LearnedBias {
  const fams: Record<string, { n: number; total: number; kept: number }> = {};
  const models: Record<string, { n: number; total: number; kept: number }> = {};
  const profiles: Record<string, { n: number; total: number; kept: number }> = {};
  for (const e of entries) {
    accumulate(fams, e.family, e);
    accumulate(models, e.model, e);
    accumulate(profiles, e.profile, e);
  }
  return { families: finalize(fams), models: finalize(models), profiles: finalize(profiles) };
}

/** The family that consistently scores best, or null when there is no signal. */
export function preferredFamily(bias: LearnedBias): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const [family, stat] of Object.entries(bias.families)) {
    if (stat.n < MIN_OBSERVATIONS || family === "auto") continue;
    if (stat.avgScore > bestScore) {
      bestScore = stat.avgScore;
      best = family;
    }
  }
  return bestScore >= 70 ? best : null;
}

/**
 * True when a model has enough observations AND consistently underperforms.
 * Callers use this to prefer the next-best sibling — never to hard-ban.
 */
export function modelUnderperforms(bias: LearnedBias, model: string): boolean {
  const stat = bias.models[model];
  if (!stat || stat.n < MIN_OBSERVATIONS) return false;
  return stat.avgScore < 55 || stat.keepRate < 0.34;
}

/* ------------------------------------------------------------------ *
 * Proven direction reuse (the speed path)
 * ------------------------------------------------------------------ */

export interface ProvenDirection {
  seed: number;
  family: string;
  score: number;
  dnaId: string;
}

/**
 * A past direction good enough to reuse instead of paying for another
 * concept-planning call. Only kept builds with a real score qualify.
 */
export function provenDirection(
  entries: readonly BuildLearningEntry[],
  family: string,
): ProvenDirection | null {
  // "auto" is the default in both surfaces, so it must resolve to whichever
  // concrete family has actually been winning rather than disqualifying the
  // lookup outright.
  const resolved =
    !family || family === "auto"
      ? preferredFamily(learnedBias(entries))
      : family;
  if (!resolved || resolved === "auto") return null;
  // One good build never becomes a rule.
  const observed = entries.filter((e) => e.family === resolved).length;
  if (observed < MIN_OBSERVATIONS) return null;
  const best = topExemplars(entries, resolved, 1)[0];
  if (!best || best.outcome !== "kept" || !best.dnaSeed) return null;
  const score = scoreOf(best);
  if (score < PROVEN_SCORE) return null;
  return { seed: best.dnaSeed, family: best.family, score, dnaId: best.dnaId };
}

/**
 * Rebuild a proven direction and mutate it: the axes that made it work
 * (layout, typography, palette, spacing, shape, depth) are kept; the parts a
 * user notices as "the same page again" (hero, sections, motion, signature)
 * are re-rolled from a fresh DNA in the same family.
 */
export function mutateProvenDna(proven: ProvenDirection, freshSeed: number): PocketDesignDNA | null {
  const family = proven.family as Exclude<PocketStyleFamily, "auto">;
  try {
    const base = generateDNA({ family, seed: proven.seed });
    const fresh = generateDNA({ family, seed: freshSeed >>> 0 });
    return {
      ...base,
      id: fresh.id,
      seed: fresh.seed,
      hero: fresh.hero,
      sections: fresh.sections,
      motion: fresh.motion,
      signatureInteraction: fresh.signatureInteraction,
    };
  } catch {
    return null;
  }
}
