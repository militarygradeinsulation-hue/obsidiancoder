// Capability-based model router. Picks the right model tier for the requested
// task without asking the user. Pure function over the shared MODEL_REGISTRY.

import { DEFAULT_MODEL, MODEL_REGISTRY, resolveModel, type ModelId } from "./models";
import type { Classification, ExecutionPath } from "./task-classifier";

export type Tier = "economy" | "balanced" | "advanced" | "flagship";

// Ordered preferences per tier — first available id wins.
// Preferences map the Auto routing rules:
// - economy → simple text/color/spacing edits → Flash Lite
// - balanced → normal UI/component/page work → Gemini 3.5 Flash
// - advanced → complex logic, debugging, multi-feature → GPT-5.4 Mini
// - flagship → major rebuilds / full-generation → Gemini 3.1 Pro Preview
const TIER_PREFERENCE: Record<Tier, readonly string[]> = {
  economy:  ["google/gemini-3.1-flash-lite", "google/gemini-2.5-flash-lite", "openai/gpt-5.4-nano"],
  balanced: ["google/gemini-3.5-flash", "google/gemini-2.5-flash", "openai/gpt-5.6-terra"],
  advanced: ["openai/gpt-5.4-mini", "openai/gpt-5.6-terra", "google/gemini-3.5-flash"],
  flagship: ["google/gemini-3.1-pro-preview", "openai/gpt-5.5", "google/gemini-2.5-pro"],
};

const REGISTRY_IDS = new Set<string>(MODEL_REGISTRY.map((m) => m.id));

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
  if (isFullGen) return "flagship";                // major rebuilds
  if (path === "deterministic") return "economy";  // simple edits
  if (path === "advanced-ai") return "advanced";   // complex logic / bug-fix / features
  return "balanced";                                // normal UI/component work
}
