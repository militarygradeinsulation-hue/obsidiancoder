// Low-credit Claude QA orchestrator.
//
// Cost rules (enforced here, not by convention):
//   - Clean build ⇒ ZERO extra calls.
//   - Deterministic repair fixed it ⇒ ZERO extra calls.
//   - Remaining ambiguous defect ⇒ AT MOST ONE call per build hash.
//   - Same build hash ⇒ cached; never re-called.
//   - Free-demo mode ⇒ never invoked.
//
// This module does NOT own auth, usage accounting, or the network layer.
// It exposes `runClaudeQA` which accepts a caller-provided `call` function.
// The actual production wiring routes that through the existing metered
// auth-fetch path; tests substitute a mock and assert it was invoked zero
// or one times. Model resolution goes through the existing registry.

import { scanNavigationViolations, type PreviewViolation } from "./preview-policy";
import { checkParity, type ParityReport, snapshot } from "./parity-check";
import { publishHash } from "./publish-artifact";

export interface QaInput {
  editorHtml: string;
  publishHtml: string;
  themeCss?: string | null;
  runtimeErrors: number;
  /** true when the caller is a free-demo visitor. */
  freeDemo: boolean;
  /** Compact excerpt of the user request — no full transcript. */
  userRequest: string;
  /** Task type from the classifier. Used for lesson attribution. */
  taskType?: string;
}

export type QaVerdict = "pass" | "repair" | "block";

export interface QaResult {
  verdict: QaVerdict;
  confidence: number;               // 0..1
  defectCategories: string[];
  explanation: string;
  /** Optional patch operations. Compatible with patch-protocol shape. */
  patchOperations?: unknown[];
  /** Snapshot of the report at decision time. */
  parity: ParityReport;
  violations: PreviewViolation[];
  /** Whether an AI call was actually made for this build hash. */
  aiCallMade: boolean;
  /** How the result was resolved. */
  source: "clean" | "deterministic" | "ai" | "cache" | "skipped-free-demo" | "skipped-blocked";
  buildHash: string;
}

const CACHE = new Map<string, QaResult>();
const CACHE_MAX = 64;

export interface QaCallPayload {
  system: string;
  user: string;
  /** Strict JSON schema hint for the response. */
  schemaHint: string;
}

/**
 * Caller-supplied AI invocation. Must resolve the cheapest available
 * Claude-capable model through the existing registry/fallback chain and
 * return the raw response text. Return null on any failure — the QA
 * orchestrator will fall back gracefully without a second call.
 */
export type QaCall = (payload: QaCallPayload) => Promise<string | null>;

function summarizeViolations(vs: PreviewViolation[]): string {
  if (!vs.length) return "no navigation violations";
  const grouped = new Map<string, number>();
  for (const v of vs) grouped.set(v.code, (grouped.get(v.code) ?? 0) + 1);
  return [...grouped.entries()].map(([k, n]) => `${k}:${n}`).join(", ");
}

function parseAiJson(raw: string): Partial<QaResult> | null {
  try {
    const t = raw.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const block = fence ? fence[1] : t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
    const j = JSON.parse(block) as {
      verdict?: string; confidence?: number; defect_categories?: string[];
      explanation?: string; patch_operations?: unknown[];
    };
    return {
      verdict: j.verdict === "pass" || j.verdict === "repair" || j.verdict === "block" ? j.verdict : "block",
      confidence: typeof j.confidence === "number" ? Math.max(0, Math.min(1, j.confidence)) : 0.4,
      defectCategories: Array.isArray(j.defect_categories) ? j.defect_categories.slice(0, 10).map(String) : [],
      explanation: typeof j.explanation === "string" ? j.explanation.slice(0, 800) : "",
      patchOperations: Array.isArray(j.patch_operations) ? j.patch_operations.slice(0, 20) : undefined,
    };
  } catch { return null; }
}

export async function runClaudeQA(input: QaInput, call: QaCall): Promise<QaResult> {
  const buildHash = publishHash(input.editorHtml, input.themeCss ?? null);
  const cached = CACHE.get(buildHash);
  if (cached) return { ...cached, source: "cache" };

  const parity = checkParity(input.editorHtml, input.publishHtml);
  const violations = scanNavigationViolations(input.publishHtml);
  const editorViolations = scanNavigationViolations(input.editorHtml);
  const allViolations = [...violations, ...editorViolations];
  // Under the strict navigation policy every non-hash navigation is
  // blocking — including nav-external and nav-deep-link. Only the
  // scanner's non-blocking informational codes may be exempt here.
  const blockingViolations = allViolations.filter((v) => v.severity !== "warning");

  // Free demo path — deterministic only, never call Claude.
  if (input.freeDemo) {
    const r: QaResult = {
      verdict: parity.ok && blockingViolations.length === 0 && input.runtimeErrors === 0 ? "pass" : "block",
      confidence: 1,
      defectCategories: blockingViolations.map((v) => v.code),
      explanation: parity.blockers.join("; ") || "free-demo build",
      parity, violations: allViolations, aiCallMade: false,
      source: "skipped-free-demo", buildHash,
    };
    remember(buildHash, r); return r;
  }

  // Clean path — zero AI calls.
  if (parity.ok && blockingViolations.length === 0 && input.runtimeErrors === 0) {
    const r: QaResult = {
      verdict: "pass", confidence: 0.95, defectCategories: [], explanation: "deterministic checks clean",
      parity, violations: allViolations, aiCallMade: false, source: "clean", buildHash,
    };
    remember(buildHash, r); return r;
  }

  // Try to summarise the situation and ask Claude for one compact patch.
  const s = snapshot(input.editorHtml);
  const payload: QaCallPayload = {
    system: `You are Obsidian QA. Review a generated HTML build for user-visible defects and produce a minimal repair. Never introduce navigation to /, /dashboard, /gallery, /demos, /unlock, /auth, /checkout, /admin, obsidianvibe.live, *.lovable.app, mailto/tel/sms, target=_blank, window.open, or any location.href assignment. Same-document interactions only. Return STRICT JSON only.`,
    user: JSON.stringify({
      user_request: input.userRequest.slice(0, 800),
      task_type: input.taskType ?? "unknown",
      page_manifest: s,
      parity_deltas: parity.deltas,
      parity_blockers: parity.blockers,
      parity_warnings: parity.warnings,
      runtime_errors: input.runtimeErrors,
      violations: summarizeViolations(allViolations),
      // Compact code excerpt — first 4KB of publish artifact only.
      publish_excerpt: input.publishHtml.slice(0, 4000),
    }),
    schemaHint: `{"verdict":"pass|repair|block","confidence":0..1,"defect_categories":["..."],"explanation":"...","patch_operations":[]}`,
  };

  let ai: Partial<QaResult> | null = null;
  let aiCallMade = false;
  try {
    const raw = await call(payload);
    aiCallMade = true;
    if (raw) ai = parseAiJson(raw);
  } catch { /* one-call budget consumed either way */ }

  const result: QaResult = {
    verdict: ai?.verdict ?? "block",
    confidence: ai?.confidence ?? 0.3,
    defectCategories: ai?.defectCategories ?? blockingViolations.map((v) => v.code),
    explanation: ai?.explanation ?? (parity.blockers.join("; ") || "unresolved defect"),
    patchOperations: ai?.patchOperations,
    parity, violations: allViolations, aiCallMade,
    source: aiCallMade ? "ai" : "deterministic", buildHash,
  };
  remember(buildHash, result);
  return result;
}

function remember(key: string, r: QaResult): void {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, r);
}

export function invalidateQaCache(hash?: string): void {
  if (hash) CACHE.delete(hash); else CACHE.clear();
}

/** Test hook — inspect whether a build hash was resolved without an AI call. */
export function peekQaCache(hash: string): QaResult | undefined { return CACHE.get(hash); }
