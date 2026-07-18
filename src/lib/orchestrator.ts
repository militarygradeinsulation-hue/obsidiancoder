// Orchestrator — pure decision layer that decides *what* to do for a request.
// The route component (src/routes/index.tsx) still owns side-effects (fetch,
// setState); this module keeps the "which path, which model, why" logic
// isolated and testable.

import { classifyTask, type Classification } from "./task-classifier";
import { routeModel, type Tier } from "./model-router";
import type { ModelId } from "./models";

export type Plan = {
  classification: Classification;
  model: ModelId;
  tier: Tier;
  useDeterministic: boolean;
  usePatch: boolean;
  useFullGeneration: boolean;
  advisory: boolean;
  reason: string;
};

export type PlanInput = {
  prompt: string;
  hasHtml: boolean;
  mode: string;
  pickerModel: string | undefined;
  hasAttachments: boolean;
};

export function planFor(input: PlanInput): Plan {
  const c = classifyTask(input.prompt, { mode: input.mode, hasHtml: input.hasHtml });
  const routed = routeModel(input.pickerModel, c);

  const advisory = c.strategy === "advisory";
  const useDeterministic =
    !advisory && c.strategy === "deterministic" && input.hasHtml && !input.hasAttachments;
  const usePatch =
    !advisory && c.strategy === "ai-patch" && input.hasHtml && !input.hasAttachments;
  const useFullGeneration = !advisory && !useDeterministic && !usePatch;

  return {
    classification: c,
    model: routed.model,
    tier: routed.tier,
    useDeterministic,
    usePatch,
    useFullGeneration,
    advisory,
    reason: `${c.reason} · ${routed.reason}`,
  };
}
