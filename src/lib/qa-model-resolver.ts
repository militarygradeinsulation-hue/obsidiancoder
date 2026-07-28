// Pure model-resolution helper for the metered QA route.
//
// The QA route always prefers Claude-family models, cheapest first. This
// resolver is intentionally decoupled from any exact production model id:
// it accepts a snapshot of the CURRENT registry entries `{id, label?}` and
// ranks them by Claude family (Haiku → Sonnet → Opus → other Claude),
// with a stable lexical tie-break inside a family. Detection uses either
// id or label so the registry can drop / rename ids without breaking QA.

import { ROUTELLM_MODELS } from "./models";
import { routellmKeys } from "@/lib/routellm-keys";

export interface QaRegistryEntry {
  id: string;
  label?: string;
}

export interface QaRegistrySnapshot {
  /** True when the RouteLLM (Abacus) provider has a valid API key configured. */
  routellmAvailable: boolean;
  /** Full model entries from the current registry (order-independent). */
  registryModels: readonly QaRegistryEntry[];
}

export type QaModelReason =
  | "ok"
  | "no_routellm"
  | "no_claude_in_registry";

export interface QaModelResolution {
  model: string | null;
  reason: QaModelReason;
}

/** Family rank — lower is cheaper / preferred. Unknown Claude families rank last. */
const FAMILY_RANK: Record<string, number> = {
  haiku: 0,
  sonnet: 1,
  opus: 2,
};
const UNKNOWN_CLAUDE_RANK = 99;

function normalize(s: string): string {
  return s.toLowerCase();
}

function isClaudeEntry(e: QaRegistryEntry): boolean {
  const id = normalize(e.id);
  const label = e.label ? normalize(e.label) : "";
  return id.includes("claude") || label.includes("claude");
}

function familyRankFor(e: QaRegistryEntry): number {
  const id = normalize(e.id);
  const label = e.label ? normalize(e.label) : "";
  const hay = `${id} ${label}`;
  for (const fam of Object.keys(FAMILY_RANK)) {
    if (hay.includes(fam)) return FAMILY_RANK[fam];
  }
  return UNKNOWN_CLAUDE_RANK;
}

/** Choose the cheapest Claude-capable model available. Pure. */
export function resolveCheapestClaudeModel(snap: QaRegistrySnapshot): QaModelResolution {
  if (!snap.routellmAvailable) return { model: null, reason: "no_routellm" };
  const claude = snap.registryModels.filter(isClaudeEntry);
  if (claude.length === 0) return { model: null, reason: "no_claude_in_registry" };
  claude.sort((a, b) => {
    const ra = familyRankFor(a);
    const rb = familyRankFor(b);
    if (ra !== rb) return ra - rb;
    // Stable lexical tie-break so identical snapshots always return the same id.
    return a.id.localeCompare(b.id);
  });
  return { model: claude[0].id, reason: "ok" };
}

/** Snapshot built from the current environment + shared registry. */
export function currentQaRegistrySnapshot(): QaRegistrySnapshot {
  return {
    routellmAvailable: routellmKeys().length > 0,
    registryModels: ROUTELLM_MODELS.map((m) => ({ id: m.id, label: m.label })),
  };
}
