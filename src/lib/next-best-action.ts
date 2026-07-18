// Next-best-action — deterministic ranked coach. Every suggestion cites a
// real signal from validation / scanners / runtime / patterns / restores.
// Never invents readiness or issues. Never auto-executes.

import type { ValidationReport } from "./validation";
import type { ScanReport } from "./scanners";
import type { ProjectPatterns } from "./project-patterns";
import type { LedgerEvent } from "./adaptive-ledger";

export type ActionSeverity = "critical" | "important" | "nice";

export interface CoachAction {
  id: string;
  title: string;
  reason: string;         // one sentence, cites the evidence
  severity: ActionSeverity;
  effort: "quick" | "medium" | "deep";
  reversible: boolean;
  evidenceRefs: string[]; // ids of validation issues / findings / event ids
}

const SEV_RANK: Record<ActionSeverity, number> = { critical: 3, important: 2, nice: 1 };
const EFF_RANK = { quick: 3, medium: 2, deep: 1 } as const;

export interface CoachInputs {
  validation?: ValidationReport;
  scans?: { security?: ScanReport; accessibility?: ScanReport; performance?: ScanReport; detective?: ScanReport };
  patterns?: ProjectPatterns;
  runtimeErrors?: number;
  recentEvents?: LedgerEvent[];
}

export function computeNextBestActions(inputs: CoachInputs, max = 3): CoachAction[] {
  const actions: CoachAction[] = [];

  if (inputs.validation) {
    const blockers = inputs.validation.issues.filter((i) => i.severity === "blocking");
    if (blockers.length) {
      actions.push({
        id: "fix-validation",
        title: `Fix ${blockers.length} blocking validation issue${blockers.length === 1 ? "" : "s"}`,
        reason: `Validation reports ${blockers.length} blocker(s): ${blockers[0].message.slice(0, 80)}`,
        severity: "critical", effort: "quick", reversible: true,
        evidenceRefs: blockers.slice(0, 3).map((_, i) => `val:${i}`),
      });
    }
  }
  if ((inputs.runtimeErrors ?? 0) > 0) {
    actions.push({
      id: "fix-runtime",
      title: `Resolve ${inputs.runtimeErrors} runtime error${inputs.runtimeErrors === 1 ? "" : "s"}`,
      reason: `Runtime bridge captured ${inputs.runtimeErrors} error(s) in the sandbox.`,
      severity: "critical", effort: "medium", reversible: true, evidenceRefs: ["runtime"],
    });
  }
  if (inputs.scans?.security?.findings?.some((f: { severity: string }) => f.severity === "critical")) {
    const f = inputs.scans.security.findings.find((x: { severity: string }) => x.severity === "critical")!;
    actions.push({
      id: `sec:${f.id}`, title: `Address security issue: ${f.id}`, reason: f.message,
      severity: "critical", effort: "medium", reversible: true, evidenceRefs: [`sec:${f.id}`],
    });
  }
  if (inputs.scans?.accessibility?.findings?.length) {
    const f = inputs.scans.accessibility.findings[0];
    actions.push({
      id: `a11y:${f.id}`, title: "Improve accessibility",
      reason: `Accessibility scan: ${f.message.slice(0, 100)}`,
      severity: "important", effort: "quick", reversible: true, evidenceRefs: [`a11y:${f.id}`],
    });
  }
  const colorPatterns = inputs.patterns?.patterns.filter((p) => p.kind === "color-token" && p.count >= 3) ?? [];
  if (colorPatterns.length) {
    actions.push({
      id: "tokenize-colors",
      title: `Extract ${colorPatterns[0].value} into a design token`,
      reason: `${colorPatterns[0].value} appears ${colorPatterns[0].count}× — moving it to a variable centralises theming.`,
      severity: "nice", effort: "quick", reversible: true, evidenceRefs: colorPatterns.slice(0, 2).map((p) => p.id),
    });
  }
  const restores = (inputs.recentEvents ?? []).filter((e) => e.kind === "version-restored");
  if (restores.length >= 2) {
    const target = restores.find((r) => r.elementIds?.length)?.elementIds?.[0];
    if (target) {
      actions.push({
        id: `protect:${target}`,
        title: `Consider locking #${target}`,
        reason: `You've restored changes touching #${target} ${restores.length} times recently.`,
        severity: "important", effort: "quick", reversible: true, evidenceRefs: restores.slice(0, 3).map((r) => r.id),
      });
    }
  }

  // Deterministic ranking: severity desc, then effort (quick first), then evidence count.
  actions.sort((a, b) => {
    const s = SEV_RANK[b.severity] - SEV_RANK[a.severity];
    if (s) return s;
    return EFF_RANK[b.effort] - EFF_RANK[a.effort];
  });
  return actions.slice(0, max);
}
