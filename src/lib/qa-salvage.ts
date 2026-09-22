/**
 * QA salvage.
 *
 * The final QA gate used to be all-or-nothing: any blocker — including a
 * transport failure on the QA provider call itself, or an advisory style
 * violation — reverted the whole finished document back to the previous
 * stable version. To the user that reads as "it built for two minutes and
 * then errored out", with nothing to save or interact with.
 *
 * A finished, structurally valid document is worth far more to the user than
 * a clean QA verdict. So blockers are split in two:
 *
 *  - HARD: the artifact is genuinely unusable — truncated mid-tag, failed
 *    HTML validation, or carrying runtime errors. These still revert.
 *  - SOFT: everything else (QA unavailable, QA verdict disagreements, parity
 *    and style violations). The build commits, and the findings are surfaced
 *    as a warning on the message instead of as a failure.
 */

export interface SalvageInput {
  ok: boolean;
  blockers: string[];
  finalValidationStatus: "passed" | "warnings" | "failed" | string;
  /** Deterministically repaired candidate from the assessment, when present. */
  repairedHtml?: string | null;
}

export interface SalvageDecision {
  /** True when the build should be committed despite the QA blockers. */
  commit: boolean;
  /** Blockers that forced a revert (empty when commit is true). */
  hardBlockers: string[];
  /** Advisory findings to show alongside a committed build. */
  softBlockers: string[];
}

const HARD_PATTERNS = [
  "design:incomplete",
  "runtime-blockers",
];

export function isHardBlocker(blocker: string): boolean {
  const b = blocker.toLowerCase();
  return HARD_PATTERNS.some((p) => b.includes(p));
}

export function decideSalvage(input: SalvageInput): SalvageDecision {
  if (input.ok) return { commit: true, hardBlockers: [], softBlockers: [] };

  const hardBlockers = input.blockers.filter(isHardBlocker);
  const softBlockers = input.blockers.filter((b) => !isHardBlocker(b));

  // Validation failures should normally have been deterministically repaired
  // before this point. If one remains, do not claim the raw artifact is safe.
  if (input.finalValidationStatus === "failed") {
    return {
      commit: false,
      hardBlockers: hardBlockers.length ? hardBlockers : ["document failed validation"],
      softBlockers,
    };
  }
  if (hardBlockers.length) return { commit: false, hardBlockers, softBlockers };
  return { commit: true, hardBlockers: [], softBlockers };
}

/**
 * The best document to commit when salvaging: the deterministically repaired
 * candidate when the assessment produced one, otherwise the raw candidate.
 * Never the stable document — that is what reverting means.
 */
export function salvageHtml(repairedHtml: string | null | undefined, candidateHtml: string): string {
  const r = (repairedHtml ?? "").trim();
  return r.length > 0 ? repairedHtml! : candidateHtml;
}

/** One-line note appended to the assistant message on a salvaged commit. */
export function salvageNote(softBlockers: string[]): string {
  if (!softBlockers.length) return "";
  return `\n\n_QA flagged this build but it was kept so you can review and save it: ${softBlockers.slice(0, 2).join("; ").slice(0, 200)}_`;
}

/**
 * Wrap a finalize result so a soft-blocked build commits instead of reverting.
 * Hard blockers pass through untouched, so genuinely broken documents still
 * revert exactly as before.
 */
export function applySalvage<T extends {
  ok: boolean;
  blockers: string[];
  finalHtml: string;
  finalValidation: { status: string };
  finalAssessment?: { repairedHtml?: string };
}>(fin: T, candidateHtml: string): T & { salvaged: boolean; salvageNote: string } {
  const decision = decideSalvage({
    ok: fin.ok,
    blockers: fin.blockers,
    finalValidationStatus: fin.finalValidation.status,
  });
  if (fin.ok || !decision.commit) {
    return { ...fin, salvaged: false, salvageNote: "" };
  }
  return {
    ...fin,
    ok: true,
    blockers: [],
    finalHtml: salvageHtml(fin.finalAssessment?.repairedHtml, candidateHtml),
    salvaged: true,
    salvageNote: salvageNote(decision.softBlockers),
  };
}
