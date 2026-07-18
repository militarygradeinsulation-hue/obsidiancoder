// Adaptive router — augments the deterministic orchestrator plan with local
// learning signals. Explicit user choices ALWAYS win. Learning may only
// re-weight ambiguous cases; it never overrides an explicit model pick.

import { planFor, type Plan, type PlanInput } from "./orchestrator";
import { buildPerformanceModel, scoreAll, best, type Score } from "./performance-model";
import { loadLedger } from "./adaptive-ledger";
import { loadPreferences, preferenceFor } from "./preference-learning";
import { loadSettings } from "./adaptive-profile";
import { ALLOWED_MODEL_IDS, type ModelId } from "./models";

export interface RoutingDecision {
  plan: Plan;
  chosenModel: ModelId;
  chosenStrategy: string;
  why: string;
  alternatives: Array<{ model: string; strategy: string; successRate: number }>;
  signalsUsed: string[];
  signalsIgnored: string[];
  explicitOverride: boolean;
}

function asModelId(v: string, fallback: ModelId): ModelId {
  return (ALLOWED_MODEL_IDS as readonly string[]).includes(v) ? (v as ModelId) : fallback;
}

export function decide(input: PlanInput): RoutingDecision {
  const plan = planFor(input);
  const settings = loadSettings();
  const signalsUsed: string[] = [];
  const signalsIgnored: string[] = [];

  const explicit = !!input.pickerModel && input.pickerModel !== "auto";
  let chosenModel: ModelId = plan.model;
  const chosenStrategy = plan.classification.strategy;

  if (!settings.enabled) {
    return {
      plan, chosenModel, chosenStrategy,
      why: `${plan.reason} · learning disabled`,
      alternatives: [], signalsUsed, signalsIgnored: ["learning-disabled"],
      explicitOverride: explicit,
    };
  }

  const scores = scoreAll(buildPerformanceModel(loadLedger()));
  const alternatives = scores
    .filter((s) => s.key.startsWith(`${plan.classification.taskType}|`))
    .slice(0, 3)
    .map((s) => {
      const [, strategy, model] = s.key.split("|");
      return { model, strategy, successRate: Number(s.successRate.toFixed(2)) };
    });

  if (explicit) {
    signalsIgnored.push("explicit-model-selection");
    return { plan, chosenModel, chosenStrategy, why: `${plan.reason} · explicit model selected`, alternatives, signalsUsed, signalsIgnored, explicitOverride: true };
  }

  // Confirmed model preference for this task type
  const prefs = loadPreferences();
  const modelPref = preferenceFor(prefs, `model.${plan.classification.taskType}`);
  if (modelPref) {
    signalsUsed.push(`preference:${modelPref.key}`);
    chosenModel = asModelId(modelPref.value, chosenModel);
  }

  // Performance-model recommendation: only if confidence >= 0.5 AND clearly
  // better (>10pp) than default, AND not an explicit override.
  const bestScore: Score | undefined = best(scores, (s) => s.key.startsWith(`${plan.classification.taskType}|`));
  if (bestScore) {
    const parts = bestScore.key.split("|");
    const [, , recommendedModel] = parts;
    if (recommendedModel && recommendedModel !== "any" && recommendedModel !== chosenModel && bestScore.successRate > 0.7) {
      signalsUsed.push(`perf-model:${bestScore.successRate.toFixed(2)}`);
      chosenModel = asModelId(recommendedModel, chosenModel);
    } else if (recommendedModel === chosenModel) {
      signalsUsed.push(`perf-confirms-default`);
    }
  } else {
    signalsIgnored.push("perf-model:low-confidence");
  }

  return {
    plan, chosenModel, chosenStrategy,
    why: `${plan.reason}${signalsUsed.length ? " · " + signalsUsed.join(", ") : ""}`,
    alternatives, signalsUsed, signalsIgnored,
    explicitOverride: false,
  };
}
