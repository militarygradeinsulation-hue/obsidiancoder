// Deterministic candidate assessment. Runs the resource-safe navigation
// repair + parity check on a proposed HTML candidate against a stable
// baseline, using the exact publish artifact for both preview and publish
// surfaces. No AI calls. Safe to run on every commit path.

import { buildArtifact } from "./publish-artifact";
import { checkParity, type ParityReport } from "./parity-check";
import type { NavRepair } from "./navigation-repair";
import type { PreviewViolation } from "./preview-policy";

export interface AssessInput {
  html: string;
  themeCss?: string | null;
  themeName?: string | null;
  /** Prior stable HTML — used as the parity baseline. */
  previousHtml?: string;
}

export interface AssessResult {
  ok: boolean;
  /** Repaired source HTML — commit this back into the session on ok. */
  repairedHtml: string;
  /** Deterministic repairs applied. */
  repairs: NavRepair[];
  /** Remaining nav violations after repair (empty when ok). */
  remainingViolations: PreviewViolation[];
  /** Concise blocker strings for terminal/UI. */
  blockers: string[];
  /** Publish-surface artifact used for verification. */
  publishHtml: string;
  /** Parity report (repaired preview source vs. publish artifact). */
  parity: ParityReport;
}

export function assessCandidateForCommit(input: AssessInput): AssessResult {
  const publishArt = buildArtifact({
    html: input.html,
    themeCss: input.themeCss ?? null,
    themeName: input.themeName ?? null,
    surface: "publish",
  });
  const previewArt = buildArtifact({
    html: input.html,
    themeCss: input.themeCss ?? null,
    themeName: input.themeName ?? null,
    surface: "preview",
  });

  const blockers: string[] = [];

  if (!publishArt.safeToPublish) {
    for (const v of publishArt.violations.slice(0, 3)) {
      blockers.push(`${v.code}${v.target ? `: ${v.target}` : ""}`);
    }
    if (blockers.length === 0) blockers.push("publish artifact unsafe");
  }

  // Parity: repaired preview source vs. publish artifact. When previousHtml
  // is provided and the repaired candidate is identical, parity is trivially
  // OK — skip the check.
  const parity = checkParity(previewArt.html, publishArt.html);
  if (!parity.ok) {
    for (const b of parity.blockers.slice(0, 3)) blockers.push(b);
  }

  return {
    ok: blockers.length === 0,
    repairedHtml: publishArt.repairedSourceHtml,
    repairs: publishArt.repairs,
    remainingViolations: publishArt.violations,
    blockers,
    publishHtml: publishArt.html,
    parity,
  };
}
