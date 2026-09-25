// Obsidian Brain — ONE read-only facade over the intelligence that already
// exists. It owns NO storage of its own: every signal comes from an existing
// module (build-learning, proven-templates, component-registry, creative
// memory, build archive, preference learning, project memory, current
// project identity). Deterministic and local — never calls a model.

import {
  readBuildLearning,
  learnedBias,
  preferredFamily,
  provenDirection,
  mutateProvenDna,
  scoreOf,
  topExemplars,
  MIN_OBSERVATIONS,
  type BuildLearningEntry,
  type ProvenDirection,
} from "./build-learning";
import { buildLearningBrief } from "./build-learning-prompt";
import { provenTemplateBrief } from "./proven-templates";
import { loadRegistry, matchComponentsIn, type StoredComponent } from "./component-registry";
import { readCreativeMemory, hashString, type PocketDesignDNA, type CreativeMemoryEntry } from "./pocket-creative";
import { readArchive } from "./build-archive";
import { loadPreferences, isAppliedPreference, type LearnedPreference } from "./preference-learning";
import { memoryToPrompt, type ProjectMemory } from "./project-memory";
import { readCurrentProject, type CurrentProject } from "./current-project";

export const BRAIN_BRIEF_MAX_BYTES = 3000;

export type BrainMatch = "hit" | "partial" | "novel";

export interface BrainQuery {
  prompt: string;
  family: string;
  surface: "vibe" | "pocket";
  libraryCode?: string;
  isRefine?: boolean;
  /** Injectable sources (tests / callers that already loaded them). */
  entries?: readonly BuildLearningEntry[];
  registry?: readonly StoredComponent[];
  /** Pre-rendered proven-template brief; defaults to reading the archive. */
  templateBrief?: string;
  now?: number;
}

export interface BrainResult {
  match: BrainMatch;
  lookupMs: number;
  proven: ProvenDirection | null;
  /** Mutated proven DNA — present only when concept planning can be skipped. */
  provenDna: PocketDesignDNA | null;
  planningSkippable: boolean;
  components: StoredComponent[];
  exemplarScores: number[];
  /** 0–100 average of matched exemplars, or null when no evidence exists. */
  confidence: number | null;
  avoid: string[];
  brief: string;
  reasons: string[];
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Query the Brain before a build. Cheap: local reads only, zero provider calls. */
export function queryBrain(q: BrainQuery): BrainResult {
  const t0 = now();
  const entries = q.entries ?? safe(() => readBuildLearning(q.libraryCode).entries, []);
  const registry = q.registry ?? safe(() => loadRegistry(), []);
  const reasons: string[] = [];

  // Refinements are patch-first: no planning decisions, no brief bloat.
  if (q.isRefine) {
    return {
      match: "novel", lookupMs: Math.round(now() - t0), proven: null, provenDna: null,
      planningSkippable: false, components: [], exemplarScores: [], confidence: null,
      avoid: [], brief: "", reasons: ["refinement — patch-first path, Brain brief not injected"],
    };
  }

  const proven = provenDirection(entries, q.family);
  const provenDna = proven
    ? mutateProvenDna(proven, hashString(`${q.prompt}|${q.now ?? Date.now()}`))
    : null;
  if (proven) reasons.push(`proven ${proven.family} direction scored ${proven.score}/100`);

  const family = proven?.family ?? q.family;
  const exemplars = topExemplars(entries, family, 2).filter((e) => scoreOf(e) >= 65);
  const exemplarScores = exemplars.map(scoreOf);
  if (exemplars.length) reasons.push(`${exemplars.length} quality-approved exemplar(s)`);

  const components = matchComponentsIn(registry, q.prompt, 3);
  if (components.length) reasons.push(`${components.length} relevant reusable component(s)`);

  const avoid = collectAvoid(entries);

  const learning = buildLearningBrief(entries, family);
  const template = q.templateBrief ?? safe(() => provenTemplateBrief(entries, family, q.libraryCode, q.surface), "");

  const match: BrainMatch = provenDna
    ? "hit"
    : learning || template || components.length
      ? "partial"
      : "novel";

  const confidence = exemplarScores.length
    ? Math.round(exemplarScores.reduce((a, b) => a + b, 0) / exemplarScores.length)
    : null;

  // Priority order: header → proven decisions → proven structure. Components
  // travel separately (reusableComponents) so they are not duplicated here.
  const parts: string[] = [];
  if (match !== "novel") {
    parts.push(`OBSIDIAN BRAIN: ${match === "hit" ? "strong proven-pattern hit" : "partial memory match"}${confidence != null ? ` · confidence ${confidence}/100` : ""}. Reuse decisions, never markup or prior customer text.`);
  }
  if (learning) parts.push(learning);
  if (template) parts.push(template);
  let brief = "";
  for (const p of parts) {
    const next = brief ? `${brief}\n\n${p}` : p;
    if (next.length > BRAIN_BRIEF_MAX_BYTES) break;
    brief = next;
  }

  return {
    match,
    lookupMs: Math.round(now() - t0),
    proven,
    provenDna,
    planningSkippable: Boolean(provenDna),
    components,
    exemplarScores,
    confidence,
    avoid,
    brief,
    reasons: reasons.length ? reasons : ["no stored learning matches — novel path"],
  };
}

function collectAvoid(entries: readonly BuildLearningEntry[]): string[] {
  const out = new Set<string>();
  for (const e of entries.slice(0, 12)) {
    if (e.outcome === "kept" && scoreOf(e) >= 70) continue;
    for (const issue of e.designIssues ?? []) {
      const v = String(issue).replace(/\s+/g, " ").trim().slice(0, 80);
      if (v) out.add(v);
      if (out.size >= 5) return [...out];
    }
  }
  return [...out];
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export function brainMatchLabel(m: BrainMatch): string {
  return m === "hit" ? "Brain hit" : m === "partial" ? "Partial match" : "Novel path";
}

/* ------------------------------------------------------------------ *
 * Snapshot for the /brain intelligence map — real data only.
 * ------------------------------------------------------------------ */

export interface BrainSnapshot {
  project: CurrentProject | null;
  memoryText: string;
  learning: {
    total: number;
    kept: number;
    discarded: number;
    restored: number;
    recent: Array<{ at: number; family: string; model: string; score: number; outcome: string; surface: string }>;
    families: Array<{ family: string; n: number; avgScore: number; keepRate: number; proven: boolean }>;
    preferredFamily: string | null;
    lowQuality: Array<{ family: string; model: string; score: number; issues: string[] }>;
  };
  components: Array<{ kind: string; count: number; label: string }>;
  creative: CreativeMemoryEntry[];
  archive: { total: number; bySurface: Record<string, number> };
  preferences: { applied: LearnedPreference[]; observed: number };
  nextBuild: { family: string | null; provenScore: number | null; reasons: string[] };
}

export function brainSnapshot(libraryCode?: string, memory?: ProjectMemory | null): BrainSnapshot {
  const entries = safe(() => readBuildLearning(libraryCode).entries, [] as BuildLearningEntry[]);
  const bias = learnedBias(entries);
  const pref = preferredFamily(bias);
  const registry = safe(() => loadRegistry(), [] as StoredComponent[]);
  const archive = safe(() => readArchive(libraryCode).entries, []);
  const prefs = safe(() => loadPreferences(), [] as LearnedPreference[]);

  const kinds = new Map<string, { count: number; label: string }>();
  for (const c of registry) {
    const k = kinds.get(c.kind) ?? { count: 0, label: c.label };
    k.count++;
    kinds.set(c.kind, k);
  }
  const bySurface: Record<string, number> = {};
  for (const a of archive) bySurface[a.surface] = (bySurface[a.surface] ?? 0) + 1;

  const families = Object.entries(bias.families).map(([family, s]) => ({
    family, n: s.n, avgScore: s.avgScore, keepRate: s.keepRate,
    proven: Boolean(provenDirection(entries, family)),
  })).sort((a, b) => b.avgScore - a.avgScore);

  const next = pref ? provenDirection(entries, pref) : null;
  const nextReasons: string[] = [];
  if (next) nextReasons.push(`Reuse the ${next.family} direction that scored ${next.score}/100 and skip concept planning.`);
  else if (entries.length < MIN_OBSERVATIONS) nextReasons.push(`Needs ${MIN_OBSERVATIONS}+ scored builds in one style family before a direction is promoted.`);
  else nextReasons.push("No family has a kept build scoring 80+ yet — the next build plans fresh.");
  if (registry.length) nextReasons.push(`${registry.length} stored component(s) will be offered when the prompt matches their kind.`);

  return {
    project: readCurrentProject(),
    memoryText: memoryToPrompt(memory ?? null),
    learning: {
      total: entries.length,
      kept: entries.filter((e) => e.outcome === "kept").length,
      discarded: entries.filter((e) => e.outcome === "discarded").length,
      restored: entries.filter((e) => e.outcome === "restored").length,
      recent: entries.slice(0, 10).map((e) => ({ at: e.at, family: e.family, model: e.model, score: scoreOf(e), outcome: e.outcome, surface: e.surface })),
      families,
      preferredFamily: pref,
      lowQuality: entries.filter((e) => scoreOf(e) < 60).slice(0, 6).map((e) => ({ family: e.family, model: e.model, score: scoreOf(e), issues: (e.designIssues ?? []).slice(0, 3) })),
    },
    components: [...kinds.entries()].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.count - a.count),
    creative: safe(() => readCreativeMemory(libraryCode).entries, [] as CreativeMemoryEntry[]),
    archive: { total: archive.length, bySurface },
    preferences: { applied: prefs.filter(isAppliedPreference), observed: prefs.length },
    nextBuild: { family: next?.family ?? null, provenScore: next?.score ?? null, reasons: nextReasons },
  };
}
