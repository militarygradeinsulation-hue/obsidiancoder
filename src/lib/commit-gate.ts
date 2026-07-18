// Central transactional commit gate. Every mutation path — deterministic
// edits, AI patches, full generation, repair, inspector edits, design-system
// edits, component library inserts, file entry edits, template clones, and
// restore actions — should evaluate its candidate HTML here before the host
// touches session state. Pure and dependency-light: no React, no storage, no
// network. The caller keeps ownership of state; the gate only reports.

import { validateHtml, blockingIssues, type ValidationReport } from "./validation";
import { buildGraph } from "./knowledge-graph";
import { runRules, blockingViolations, type Rule, type RuleViolation } from "./rules-engine";
import { repairHtml } from "./repair";
import { diffSummary } from "./diff-summary";

export type CommitSource =
  | "deterministic"
  | "ai-patch"
  | "full-generation"
  | "repair"
  | "inspector"
  | "design-system"
  | "component-library"
  | "file-edit"
  | "restore"
  | "template-clone";

export type CommitInput = {
  previousHtml: string;
  candidateHtml: string;
  source: CommitSource;
  rules?: Rule[];
  /** If true, one deterministic repair pass is attempted on validation failure. */
  allowRepair?: boolean;
  request?: string;
};

export type CommitReport = {
  ok: boolean;
  html: string;                    // final HTML (post-repair if applied)
  changed: boolean;
  source: CommitSource;
  validation: ValidationReport;
  ruleViolations: RuleViolation[];
  blockingRules: RuleViolation[];
  blockers: string[];              // human-readable blocker reasons
  repaired: boolean;
  repairFixes: string[];
  diff: { charsAdded: number; charsRemoved: number };
};

/**
 * Evaluate a candidate commit. Never mutates caller state.
 * `ok: false` means the caller MUST keep previousHtml and surface `blockers`.
 */
export function evaluateCommit(input: CommitInput): CommitReport {
  const rules = input.rules ?? [];
  let html = input.candidateHtml;
  const repairFixes: string[] = [];
  let repaired = false;

  let validation = validateHtml(html);
  if (validation.status === "failed" && input.allowRepair) {
    const r = repairHtml(html, validation.issues);
    if (r.fixes.length) {
      const revalid = validateHtml(r.html);
      if (revalid.status !== "failed") {
        html = r.html;
        validation = revalid;
        repairFixes.push(...r.fixes);
        repaired = true;
      }
    }
  }

  const graph = buildGraph(html);
  const ruleViolations = runRules(rules, html, graph);
  const blockingRules = blockingViolations(ruleViolations);
  const validationBlockers = blockingIssues(validation);

  const blockers: string[] = [
    ...validationBlockers.map((i) => `validation: ${i.message}`),
    ...blockingRules.map((v) => `rule ${v.ruleId}: ${v.message}`),
  ];

  const diff = diffSummary(input.previousHtml, html);
  const changed = html !== input.previousHtml;

  return {
    ok: blockers.length === 0,
    html,
    changed,
    source: input.source,
    validation,
    ruleViolations,
    blockingRules,
    blockers,
    repaired,
    repairFixes,
    diff,
  };
}
