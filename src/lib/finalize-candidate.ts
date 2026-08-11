// Client-side finalizer that unifies deterministic QA + at-most-one
// metered Claude QA call across all three commit paths (deterministic,
// ai-patch, full-generation).
//
// Invariants:
//   - assessCandidateForCommit ALWAYS runs fresh on every call.
//   - The decision cache stores ONLY a normalised, bounded QA decision
//     (verdict/patch/error). It NEVER stores finalHtml, assessment,
//     parity, validation, runtime state, or session-scoped bytes.
//   - Clean and deterministic-repair-clean candidates neither read nor
//     write the decision cache.
//   - Runtime blockers cannot be waived — even a valid Claude patch that
//     passes static gates is blocked when runtime blockers remain.
//   - Free demo NEVER invokes Claude and NEVER touches the decision cache.
//
// This module is client-safe: it does not import server-only helpers.

import { assessCandidateForCommit, type AssessResult } from "./candidate-assess";
import { enforceQualityContract } from "./quality-contract";
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
  /** True iff /api/qa was actually dispatched on this run (not on cache hit). */
  claudeInvoked: boolean;
  /** True iff this run's claude decision came from an earlier cached call. */
  claudeResultFromCache: boolean;
  claudeModel: string | null;
  claudeVerdict: "pass" | "repair" | "block" | null;
  claudeExplanation: string;
  /** Human-readable blocker reasons (empty on ok). */
  blockers: string[];
  /** Hash we computed for the ORIGINAL candidate (pre-patch). */
  candidateHash: string;
  /** Deterministic quality-contract repairs applied before assessment. */
  contractFixes: string[];
  /** Families the document names that could not be loaded (not on Google Fonts). */
  unloadableFonts: string[];
  source: FinalizeSource;
}

// -- Decision cache ----------------------------------------------------------
//
// Stores ONLY the normalised outcome of the /api/qa call: the response
// envelope plus provider-invocation metadata. Never any HTML, assessment,
// parity, validation, or session-scoped bytes.
//
// True LRU, max 64. Session state (stableHtml, demoMode) is deliberately
// excluded from the key. demoMode is not part of the key because free
// demo skips the cache entirely; adding it would fragment paid keys for
// no benefit.

interface CachedQaDecision {
  /** The exact envelope returned by the QA route (or a normalised error). */
  response: QaRouteResponse | null;
  /** True iff the physical HTTP dispatch happened when the decision was minted. */
  providerInvoked: boolean;
}

const CACHE = new Map<string, CachedQaDecision>();
const CACHE_MAX = 64;

// Small FNV-1a hash for cache-key composition. Not cryptographic — the
// key needs to distinguish inputs, not resist collisions.
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

function qaKey(
  input: FinalizeInput,
  rawCandidate: string,
  repairedSource: string,
): string {
  return [
    "pv", QA_POLICY_VERSION,
    "rc", rawCandidate.length, hash(rawCandidate),
    "rs", repairedSource.length, hash(repairedSource),
    "tc", (input.themeCss ?? "").length, hash(input.themeCss ?? ""),
    "tn", hash(input.themeName ?? ""),
    "ti", hash(input.themeId ?? ""),
    "tt", input.taskType ?? "-",
    "st", input.strategy ?? "-",
  ].join("|");
}

function cacheGet(key: string): CachedQaDecision | undefined {
  const v = CACHE.get(key);
  if (!v) return undefined;
  // Re-insert to move to MRU — Map iteration order is insertion order.
  CACHE.delete(key);
  CACHE.set(key, v);
  return v;
}

function cachePut(key: string, d: CachedQaDecision): void {
  if (CACHE.has(key)) CACHE.delete(key);
  else if (CACHE.size >= CACHE_MAX) {
    const first = CACHE.keys().next().value as string | undefined;
    if (first) CACHE.delete(first);
  }
  CACHE.set(key, d);
}

export function invalidateFinalizeCache(): void { CACHE.clear(); }
/** Test hook: current size. */
export function finalizeCacheSize(): number { return CACHE.size; }
/** Test hook: ordered keys (LRU → MRU). Never returns cached values. */
export function finalizeCacheKeys(): string[] { return Array.from(CACHE.keys()); }
/** Deprecated: kept as a no-op wrapper so old tests don't break; returns
 *  only whether a key exists, never mutable cached values. */
export function peekFinalizeCache(key: string): boolean { return CACHE.has(key); }

// -- Helpers -----------------------------------------------------------------

/** Everything a commit path needs except the contract stamp added by the wrapper. */
type CoreResult = Omit<FinalizeResult, "contractFixes" | "unloadableFonts">;

function blockedResult(
  input: FinalizeInput,
  assessment: AssessResult,
  hashStr: string,
  blockers: string[],
  claudeMeta: {
    invoked: boolean; fromCache: boolean;
    model: string | null; verdict: "pass" | "repair" | "block" | null; explanation: string;
  },
  source: FinalizeSource = "blocked",
): CoreResult {
  return {
    ok: false,
    finalHtml: input.stableHtml,
    finalValidation: assessment.validation,
    finalAssessment: assessment,
    finalParity: assessment.parity,
    deterministicRepairs: assessment.repairs,
    remainingViolations: assessment.remainingViolations,
    claudeInvoked: claudeMeta.invoked,
    claudeResultFromCache: claudeMeta.fromCache,
    claudeModel: claudeMeta.model,
    claudeVerdict: claudeMeta.verdict,
    claudeExplanation: claudeMeta.explanation,
    blockers: blockers.length ? blockers : ["blocked"],
    candidateHash: hashStr,
    source,
  };
}

// -- Public API --------------------------------------------------------------

/**
 * Run the deterministic quality contract, then fresh assessment; if
 * unresolved and paid, invoke /api/qa at most once for this build hash and
 * apply a valid patch if provided. Returns the authoritative FINAL html +
 * validation for the commit path to use in metadata, diffs, and gates.
 */
export async function finalizeCandidate(
  input: FinalizeInput,
  call: QaProductionCall,
): Promise<FinalizeResult> {
  // Deterministic, local, idempotent: link declared web fonts and guarantee
  // visible focus states BEFORE anything assesses or hashes the candidate.
  const contract = enforceQualityContract(input.candidateHtml);
  const core = await finalizeCore(
    contract.html === input.candidateHtml ? input : { ...input, candidateHtml: contract.html },
    call,
  );
  return { ...core, contractFixes: contract.fixes, unloadableFonts: contract.unloadableFonts };
}

async function finalizeCore(
  input: FinalizeInput,
  call: QaProductionCall,
): Promise<CoreResult> {
  // 0. ALWAYS run deterministic assessment fresh. Never cached.
  const assessment = assessCandidateForCommit({
    html: input.candidateHtml,
    themeCss: input.themeCss ?? null,
    themeName: input.themeName ?? null,
  });
  const rawCandidate = input.candidateHtml;
  const repairedSource = assessment.repairedHtml;
  const contentHash = hash(`${rawCandidate.length}|${hash(rawCandidate)}|${(input.themeCss ?? "").length}|${hash(input.themeCss ?? "")}|${input.themeName ?? ""}`);
  const runtimeBlockers = Math.max(0, input.runtimeBlockersForCandidateHash ?? 0);

  const noClaude = {
    invoked: false, fromCache: false,
    model: null as string | null, verdict: null as "pass" | "repair" | "block" | null, explanation: "",
  };

  // 1. Clean & no runtime blockers → return without touching the cache.
  if (assessment.ok && runtimeBlockers === 0) {
    return {
      ok: true,
      finalHtml: assessment.repairedHtml,
      finalValidation: assessment.validation,
      finalAssessment: assessment,
      finalParity: assessment.parity,
      deterministicRepairs: assessment.repairs,
      remainingViolations: assessment.remainingViolations,
      claudeInvoked: false,
      claudeResultFromCache: false,
      claudeModel: null,
      claudeVerdict: null,
      claudeExplanation: "",
      blockers: [],
      candidateHash: contentHash,
      source: assessment.repairs.length ? "deterministic-repair" : "clean",
    };
  }

  // 2. Clean statically but runtime blockers > 0 → block; no QA call, no cache.
  if (assessment.ok && runtimeBlockers > 0) {
    return blockedResult(
      input, assessment, contentHash,
      [`runtime-blockers:${runtimeBlockers}`], noClaude,
    );
  }

  // 2b. Truncated document — the stream stopped mid-tag. No patch can
  //     rescue half a document, so block immediately and let the caller
  //     regenerate. No QA call, no cache. Style-quality findings do NOT
  //     land here; they are advisory (see candidate-assess).
  if (assessment.design.incomplete) {
    return blockedResult(
      input, assessment, contentHash,
      ["design:incomplete"], noClaude,
    );
  }

  // 3. Free demo — never invoke Claude, never touch decision cache.

  if (input.demoMode) {
    return {
      ...blockedResult(
        input, assessment, contentHash,
        assessment.blockers.length ? assessment.blockers : ["free-demo QA blocked"],
        noClaude, "skipped-free-demo",
      ),
    };
  }

  // 4. Paid unresolved candidate — consult the decision cache first.
  const key = qaKey(input, rawCandidate, repairedSource);
  let decision = cacheGet(key);
  let fromCache = decision !== undefined;
  let claudeInvokedNow = false;

  if (!decision) {
    // Compose the QA request body from the CURRENT fresh assessment.
    const requestBody: QaRequestBody = {
      userRequest: (input.userRequest ?? "").slice(0, 800),
      taskType: input.taskType,
      strategy: input.strategy,
      themeId: input.themeId ?? undefined,
      themeName: input.themeName ?? undefined,
      buildHash: contentHash,
      pageManifest: assessment.parity.editor,
      paritySummary: {
        ok: assessment.parity.ok,
        blockers: assessment.parity.blockers.slice(0, 20),
        warnings: assessment.parity.warnings.slice(0, 20),
        deltas: assessment.parity.deltas as unknown as Record<string, number>,
      },
      runtimeSummary: { errorCount: runtimeBlockers },
      violations: assessment.remainingViolations.slice(0, 40).map((v) => ({
        code: v.code, target: v.target,
      })),
      excerpt: (assessment.publishHtml ?? "").slice(0, 6000),
      failureHints: input.failureHints?.slice(0, 1000),
    };

    let response: QaRouteResponse | null = null;
    try {
      response = await call(requestBody);
    } catch {
      response = null;
    }
    // Any dispatch is a physical provider attempt from the finalizer's POV,
    // regardless of whether the route parsed a provider response.
    claudeInvokedNow = true;
    decision = { response, providerInvoked: true };
    cachePut(key, decision);
  }

  const invoked = claudeInvokedNow;
  const meta = {
    invoked,
    fromCache: fromCache && !claudeInvokedNow,
    model: (decision.response && "actualModel" in decision.response)
      ? decision.response.actualModel
      : null,
    verdict: (decision.response && decision.response.ok === true) ? decision.response.verdict : null,
    explanation:
      decision.response && decision.response.ok === true
        ? decision.response.explanation
        : decision.response && decision.response.ok === false
          ? decision.response.message
          : "",
  } as const;

  const qa = decision.response;

  // 4a. Transport / envelope failure — block with cached decision, no retry.
  if (!qa || qa.ok !== true) {
    const blockerReason = qa && qa.ok === false
      ? `qa-${qa.code}: ${qa.message}`.slice(0, 200)
      : "qa unavailable";
    return blockedResult(
      input, assessment, contentHash,
      [blockerReason, ...assessment.blockers.slice(0, 2)], meta,
    );
  }

  // 4b. Verdict PASS cannot waive deterministic blockers.
  if (qa.verdict === "pass") {
    return blockedResult(
      input, assessment, contentHash,
      [`qa-pass-with-blockers: ${assessment.blockers.slice(0, 3).join("; ")}`], meta,
    );
  }

  // 4c. Verdict BLOCK — retain stable HTML.
  if (qa.verdict === "block" || !qa.patch) {
    return blockedResult(
      input, assessment, contentHash,
      [`qa-block: ${qa.explanation || assessment.blockers[0] || "unresolved defect"}`], meta,
    );
  }

  // 4d. Verdict REPAIR — validate + apply ONCE to CURRENT repaired source.
  const patchValid = patchSchema.safeParse(qa.patch);
  if (!patchValid.success) {
    return blockedResult(
      input, assessment, contentHash,
      ["qa-repair-invalid-patch"], meta,
    );
  }

  const applied = applyPatch(assessment.repairedHtml, patchValid.data);
  if (!applied.ok) {
    return blockedResult(
      input, assessment, contentHash,
      [`qa-repair-apply-failed: ${applied.error.slice(0, 120)}`], meta,
    );
  }

  const patchedValidation = validateHtml(applied.html);
  if (patchedValidation.status === "failed") {
    return {
      ...blockedResult(input, assessment, contentHash,
        ["qa-repair-validation-failed"], meta),
      finalValidation: patchedValidation,
    };
  }

  // Re-run navigation/parity gates against the patched artifact.
  const repatched = assessCandidateForCommit({
    html: applied.html,
    themeCss: input.themeCss ?? null,
    themeName: input.themeName ?? null,
  });
  if (!repatched.ok) {
    return {
      ok: false,
      finalHtml: input.stableHtml,
      finalValidation: repatched.validation,
      finalAssessment: repatched,
      finalParity: repatched.parity,
      deterministicRepairs: repatched.repairs,
      remainingViolations: repatched.remainingViolations,
      claudeInvoked: meta.invoked,
      claudeResultFromCache: meta.fromCache,
      claudeModel: meta.model,
      claudeVerdict: meta.verdict,
      claudeExplanation: meta.explanation,
      blockers: repatched.blockers.map((b) => `qa-repair-post-gate:${b}`),
      candidateHash: contentHash,
      source: "blocked",
    };
  }

  // 4e. Runtime blockers are NON-WAIVABLE, even by a successful Claude patch.
  if (runtimeBlockers > 0) {
    return {
      ...blockedResult(
        input, repatched, contentHash,
        [`qa-repair-runtime-blockers:${runtimeBlockers}`], meta,
      ),
    };
  }

  return {
    ok: true,
    finalHtml: repatched.repairedHtml,
    finalValidation: repatched.validation,
    finalAssessment: repatched,
    finalParity: repatched.parity,
    deterministicRepairs: [...assessment.repairs, ...repatched.repairs],
    remainingViolations: repatched.remainingViolations,
    claudeInvoked: meta.invoked,
    claudeResultFromCache: meta.fromCache,
    claudeModel: meta.model,
    claudeVerdict: meta.verdict,
    claudeExplanation: meta.explanation,
    blockers: [],
    candidateHash: contentHash,
    source: fromCache && !claudeInvokedNow ? "cache" : "claude-repair",
  };
}

// Suppress the unused-Patch warning: kept for downstream consumers.
export type { Patch };
