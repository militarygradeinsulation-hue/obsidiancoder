// Capability-based model router. Picks the right model tier for the requested
// task without asking the user. Pure function over the shared MODEL_REGISTRY.

import { DEFAULT_MODEL, MODEL_REGISTRY, resolveModel, type ModelId } from "./models";
import type { Classification, ExecutionPath } from "./task-classifier";

export type Tier = "economy" | "balanced" | "advanced";

// Ordered preferences per tier — first available id wins.
const TIER_PREFERENCE: Record<Tier, readonly string[]> = {
  economy:  ["google/gemini-3.1-flash-lite", "openai/gpt-5.6-luna", "google/gemini-3.5-flash"],
  balanced: ["google/gemini-3.5-flash", "openai/gpt-5.6-terra", "openai/gpt-5.4-mini", "google/gemini-3.1-flash-lite"],
  advanced: ["google/gemini-3.1-pro-preview", "openai/gpt-5.6-sol", "google/gemini-2.5-pro", "google/gemini-3.5-flash"],
};

const REGISTRY_IDS = new Set(MODEL_REGISTRY.map((m) => m.id));

export function pickModelForTier(tier: Tier): ModelId {
  for (const id of TIER_PREFERENCE[tier]) {
    if (REGISTRY_IDS.has(id)) return id as ModelId;
  }
  return DEFAULT_MODEL;
}

/**
 * Given a user picker choice and a classification, produce the actual model to call.
 * - "auto" → route by classification tier.
 * - explicit id → honor it, but still map to a supported id if it drifted.
 */
export function routeModel(pick: string | undefined, c: Classification): { model: ModelId; tier: Tier; reason: string } {
  const tier = tierFor(c.executionPath, c.taskType === "full-generation");
  if (!pick || pick === "auto") {
    return { model: pickModelForTier(tier), tier, reason: `Auto-routed by tier "${tier}" from task "${c.taskType}".` };
  }
  return { model: resolveModel(pick), tier, reason: `User-selected model.` };
}

function tierFor(path: ExecutionPath, isFullGen: boolean): Tier {
  if (path === "deterministic") return "economy";
  if (path === "advanced-ai" || isFullGen) return "advanced";
  return "balanced";
}
