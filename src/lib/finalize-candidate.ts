// Client-side finalizer that unifies QA + at-most-one metered Claude QA
// call across all three commit paths (deterministic, ai-patch, full
// generation). The strict navigation policy already treats every
// scanner-reported violation as blocking.
//
// Rules enforced here:
//   - Free demo   ⇒ NEVER invokes the metered /api/qa route.
//   - Clean       ⇒ zero calls (deterministic assessment passes).
//   - Unresolved  ⇒ at most one call per (html + theme) hash.
//   - Malformed / paywall / provider error ⇒ block + cache; no second call.
//   - Same hash retry ⇒ cache hit; zero calls.
//   - Verdict pass CANNOT waive deterministic blockers; still block.
//   - Verdict repair ⇒ validate patch via patchSchema, applyPatch ONCE,
//                       re-run assess. Commit only if the patched result
//                       is fully clean. No second Claude call.
//
// This module is client-safe: it does not import server-only helpers.

import { assessCandidateForCommit, type AssessResult } from "./candidate-assess";
import { publishHash } from "./publish-artifact";
import { patchSchema } from "./patch-protocol";
import { applyPatch } from "./patch-engine";
import { validateHtml, type ValidationReport } from "./validation";
import type { ParityReport } from "./parity-check";
import type { PreviewViolation } from "./preview-policy";
import type { NavRepair } from "./navigation-repair";
import {
  QA_POLICY_VERSION,
  type QaRequestBody,
  type QaRouteResponse,
  type Patch,
} from "./qa-contract";

export type { QaRequestBody, QaRouteResponse } from "./qa-contract";

// -- Public types ------------------------------------------------------------

export type QaRouteResponse =
  | {
      ok: true;
      verdict: "pass" | "repair" | "block";
      confidence: number;
      defectCategories: string[];
      explanation: string;
      patch: Patch | null;
      expectedImprovement: string;
      actualModel: string;
      fallbackUsed: boolean;
      requestId: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      actualModel: string | null;
      requestId: string;
    };

export type QaProductionCall = (req: QaRequestBody) => Promise<QaRouteResponse | null>;

export interface FinalizeInput {
  candidateHtml: string;
  stableHtml: string;
  themeCss: string | null;
  themeName: string | null;
  themeId?: string | null;
  demoMode: boolean;
  userRequest: string;
  taskType?: string;
  strategy?: "deterministic" | "ai-patch" | "full-generation" | "advisory";
  /** Runtime blocker count belonging to the CANDIDATE hash (0 if unrelated). */
  runtimeBlockersForCandidateHash?: number;
  /** Compact learned defect hints — bounded, no full transcripts. */
  failureHints?: string;
}

export type FinalizeSource =
  | "clean"
  | "deterministic-repair"
  | "claude-repair"
  | "cache"
  | "skipped-free-demo"
  | "blocked";

export interface FinalizeResult {
  ok: boolean;
  /** Repaired-and-committed HTML on success, else stableHtml. */
  finalHtml: string;
  /** Validation report over finalHtml — authoritative for metadata. */
  finalValidation: ValidationReport;
  /** Assessment against the FINAL candidate (post-patch when applicable). */
  finalAssessment: AssessResult;
  /** Parity report against the final artifact. */
  finalParity: ParityReport;
  /** Navigation repairs applied by the deterministic pass. */
  deterministicRepairs: NavRepair[];
  /** Remaining violations on the final artifact (empty on ok). */
  remainingViolations: PreviewViolation[];
  /** True iff /api/qa was actually invoked. */
  claudeInvoked: boolean;
  claudeModel: string | null;
  claudeVerdict: "pass" | "repair" | "block" | null;
  claudeExplanation: string;
  /** Human-readable blocker reasons (empty on ok). */
  blockers: string[];
  /** Hash we computed for the ORIGINAL candidate (pre-patch). */
  candidateHash: string;
  source: FinalizeSource;
}

// -- Cache -------------------------------------------------------------------

const CACHE = new Map<string, FinalizeResult>();
const CACHE_MAX = 64;
function remember(key: string, r: FinalizeResult): void {
  if (CACHE.size >= CACHE_MAX) {
    const first = CACHE.keys().next().value as string | undefined;
    if (first) CACHE.delete(first);
  }
  CACHE.set(key, r);
}
export function invalidateFinalizeCache(): void { CACHE.clear(); }
/** Test hook. */
export function peekFinalizeCache(hash: string): FinalizeResult | undefined {
  return CACHE.get(hash);
}

// -- Public API --------------------------------------------------------------

/**
 * Run deterministic assessment; if unresolved and paid, invoke /api/qa
 * at most once for this build hash and apply a valid patch if provided.
 * Returns the authoritative FINAL html + validation for the commit path
 * to use in metadata, diffs, and downstream gates.
 */
export async function finalizeCandidate(
  input: FinalizeInput,
  call: QaProductionCall,
): Promise<FinalizeResult> {
  const hash = publishHash(input.candidateHtml, input.themeCss ?? null, input.themeName ?? null);
  const cached = CACHE.get(hash);
  if (cached) return { ...cached, source: "cache" };

  const assessment = assessCandidateForCommit({
    html: input.candidateHtml,
    themeCss: input.themeCss ?? null,
    themeName: input.themeName ?? null,
  });

  const runtimeBlockers = Math.max(0, input.runtimeBlockersForCandidateHash ?? 0);
  const clean = assessment.ok && runtimeBlockers === 0;

  // 1. Clean deterministic path — zero AI cost.
  if (clean) {
    const result: FinalizeResult = {
      ok: true,
      finalHtml: assessment.repairedHtml,
      finalValidation: assessment.validation,
      finalAssessment: assessment,
      finalParity: assessment.parity,
      deterministicRepairs: assessment.repairs,
      remainingViolations: assessment.remainingViolations,
      claudeInvoked: false,
      claudeModel: null,
      claudeVerdict: null,
      claudeExplanation: "",
      blockers: [],
      candidateHash: hash,
      source: assessment.repairs.length ? "deterministic-repair" : "clean",
    };
    remember(hash, result);
    return result;
  }

  // 2. Free demo — NEVER invoke Claude.
  if (input.demoMode) {
    const result: FinalizeResult = {
      ok: false,
      finalHtml: input.stableHtml,
      finalValidation: assessment.validation,
      finalAssessment: assessment,
      finalParity: assessment.parity,
      deterministicRepairs: assessment.repairs,
      remainingViolations: assessment.remainingViolations,
      claudeInvoked: false,
      claudeModel: null,
      claudeVerdict: null,
      claudeExplanation: "",
      blockers: assessment.blockers.length
        ? assessment.blockers
        : ["free-demo QA blocked"],
      candidateHash: hash,
      source: "skipped-free-demo",
    };
    remember(hash, result);
    return result;
  }

  // 3. Paid unresolved candidate — one metered QA call.
  const requestBody: QaRequestBody = {
    userRequest: (input.userRequest ?? "").slice(0, 800),
    taskType: input.taskType,
    strategy: input.strategy,
    themeId: input.themeId ?? undefined,
    themeName: input.themeName ?? undefined,
    buildHash: hash,
    pageManifest: assessment.parity.editor,
    paritySummary: {
      ok: assessment.parity.ok,
      blockers: assessment.parity.blockers.slice(0, 20),
      warnings: assessment.parity.warnings.slice(0, 20),
      deltas: assessment.parity.deltas as unknown as Record<string, number>,
    },
    runtimeSummary: {
      errorCount: runtimeBlockers,
    },
    violations: assessment.remainingViolations.slice(0, 40).map((v) => ({
      code: v.code, target: v.target,
    })),
    excerpt: (assessment.publishHtml ?? "").slice(0, 6000),
    failureHints: input.failureHints?.slice(0, 1000),
  };

  let qa: QaRouteResponse | null = null;
  try {
    qa = await call(requestBody);
  } catch {
    qa = null;
  }

  // Any transport failure or non-ok envelope ⇒ block and cache (no second call).
  if (!qa || qa.ok !== true) {
    const result: FinalizeResult = {
      ok: false,
      finalHtml: input.stableHtml,
      finalValidation: assessment.validation,
      finalAssessment: assessment,
      finalParity: assessment.parity,
      deterministicRepairs: assessment.repairs,
      remainingViolations: assessment.remainingViolations,
      claudeInvoked: qa != null, // true only if the route returned something we could read
      claudeModel: (qa && "actualModel" in qa) ? qa.actualModel : null,
      claudeVerdict: null,
      claudeExplanation: qa && qa.ok === false ? qa.message : "",
      blockers: assessment.blockers.length
        ? assessment.blockers
        : ["qa unavailable"],
      candidateHash: hash,
      source: "blocked",
    };
    remember(hash, result);
    return result;
  }

  const successBase = {
    claudeInvoked: true,
    claudeModel: qa.actualModel,
    claudeVerdict: qa.verdict,
    claudeExplanation: qa.explanation,
  };

  // 4. Verdict PASS cannot waive deterministic blockers.
  if (qa.verdict === "pass") {
    const result: FinalizeResult = {
      ok: false,
      finalHtml: input.stableHtml,
      finalValidation: assessment.validation,
      finalAssessment: assessment,
      finalParity: assessment.parity,
      deterministicRepairs: assessment.repairs,
      remainingViolations: assessment.remainingViolations,
      blockers: [`qa-pass-with-blockers: ${assessment.blockers.slice(0, 3).join("; ")}`],
      candidateHash: hash,
      source: "blocked",
      ...successBase,
    };
    remember(hash, result);
    return result;
  }

  // 5. Verdict BLOCK — retain stable HTML.
  if (qa.verdict === "block" || !qa.patch) {
    const result: FinalizeResult = {
      ok: false,
      finalHtml: input.stableHtml,
      finalValidation: assessment.validation,
      finalAssessment: assessment,
      finalParity: assessment.parity,
      deterministicRepairs: assessment.repairs,
      remainingViolations: assessment.remainingViolations,
      blockers: [`qa-block: ${qa.explanation || assessment.blockers[0] || "unresolved defect"}`],
      candidateHash: hash,
      source: "blocked",
      ...successBase,
    };
    remember(hash, result);
    return result;
  }

  // 6. Verdict REPAIR — validate + apply ONCE + re-assess.
  const patchValid = patchSchema.safeParse(qa.patch);
  if (!patchValid.success) {
    const result: FinalizeResult = {
      ok: false,
      finalHtml: input.stableHtml,
      finalValidation: assessment.validation,
      finalAssessment: assessment,
      finalParity: assessment.parity,
      deterministicRepairs: assessment.repairs,
      remainingViolations: assessment.remainingViolations,
      blockers: [`qa-repair-invalid-patch`],
      candidateHash: hash,
      source: "blocked",
      ...successBase,
    };
    remember(hash, result);
    return result;
  }

  const applied = applyPatch(assessment.repairedHtml, patchValid.data);
  if (!applied.ok) {
    const result: FinalizeResult = {
      ok: false,
      finalHtml: input.stableHtml,
      finalValidation: assessment.validation,
      finalAssessment: assessment,
      finalParity: assessment.parity,
      deterministicRepairs: assessment.repairs,
      remainingViolations: assessment.remainingViolations,
      blockers: [`qa-repair-apply-failed: ${applied.error.slice(0, 120)}`],
      candidateHash: hash,
      source: "blocked",
      ...successBase,
    };
    remember(hash, result);
    return result;
  }

  const patchedValidation = validateHtml(applied.html);
  if (patchedValidation.status === "failed") {
    const result: FinalizeResult = {
      ok: false,
      finalHtml: input.stableHtml,
      finalValidation: patchedValidation,
      finalAssessment: assessment,
      finalParity: assessment.parity,
      deterministicRepairs: assessment.repairs,
      remainingViolations: assessment.remainingViolations,
      blockers: [`qa-repair-validation-failed`],
      candidateHash: hash,
      source: "blocked",
      ...successBase,
    };
    remember(hash, result);
    return result;
  }

  // Re-assess the patched artifact against navigation/parity gates.
  const repatched = assessCandidateForCommit({
    html: applied.html,
    themeCss: input.themeCss ?? null,
    themeName: input.themeName ?? null,
  });
  if (!repatched.ok) {
    const result: FinalizeResult = {
      ok: false,
      finalHtml: input.stableHtml,
      finalValidation: repatched.validation,
      finalAssessment: repatched,
      finalParity: repatched.parity,
      deterministicRepairs: repatched.repairs,
      remainingViolations: repatched.remainingViolations,
      blockers: repatched.blockers.map((b) => `qa-repair-post-gate:${b}`),
      candidateHash: hash,
      source: "blocked",
      ...successBase,
    };
    remember(hash, result);
    return result;
  }

  const result: FinalizeResult = {
    ok: true,
    finalHtml: repatched.repairedHtml,
    finalValidation: repatched.validation,
    finalAssessment: repatched,
    finalParity: repatched.parity,
    deterministicRepairs: [...assessment.repairs, ...repatched.repairs],
    remainingViolations: repatched.remainingViolations,
    blockers: [],
    candidateHash: hash,
    source: "claude-repair",
    ...successBase,
  };
  remember(hash, result);
  return result;
}
