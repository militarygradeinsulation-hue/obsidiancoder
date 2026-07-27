// Pure model-resolution helper for the metered QA route.
//
// The QA route always prefers Claude-family models. We choose the cheapest
// available Claude model from the CURRENT model registry. When RouteLLM
// isn't configured (no ROUTELLM_API_KEY) or no Claude model appears in the
// registry snapshot, callers get `null` and MUST return a structured
// unavailable envelope without invoking any provider.
//
// The resolver is intentionally pure (no I/O) so it can be unit-tested by
// passing a synthetic registry snapshot.

import { ROUTELLM_MODELS } from "./models";

/** Claude-family model ids ordered from CHEAPEST → most expensive. */
export const CLAUDE_MODEL_ORDER: readonly string[] = [
  "routellm/claude-haiku-4-5-20251001",
  "routellm/claude-sonnet-4-5-20250929",
  "routellm/claude-opus-4-1-20250805",
];

export interface QaRegistrySnapshot {
  /** True when the RouteLLM (Abacus) provider has a valid API key configured. */
  routellmAvailable: boolean;
  /** Model ids present in the current registry (order-independent). */
  registryModelIds: readonly string[];
}

export interface QaModelResolution {
  model: string | null;
  reason: "ok" | "no_routellm" | "no_claude_in_registry";
}

/** Choose the cheapest Claude-capable model available. Pure. */
export function resolveCheapestClaudeModel(snap: QaRegistrySnapshot): QaModelResolution {
  if (!snap.routellmAvailable) return { model: null, reason: "no_routellm" };
  const ids = new Set(snap.registryModelIds);
  for (const m of CLAUDE_MODEL_ORDER) {
    if (ids.has(m)) return { model: m, reason: "ok" };
  }
  return { model: null, reason: "no_claude_in_registry" };
}

/** Snapshot built from the current environment + shared registry. */
export function currentQaRegistrySnapshot(): QaRegistrySnapshot {
  return {
    routellmAvailable: !!process.env.ROUTELLM_API_KEY,
    registryModelIds: ROUTELLM_MODELS.map((m) => m.id),
  };
}
