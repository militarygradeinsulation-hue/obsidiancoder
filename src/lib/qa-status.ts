// Per-session QA status: a small, honest, bounded record of the last
// deterministic + optional Claude QA assessment for the CURRENT build.
//
// This module is client-safe. It never talks to a provider. It maps a
// FinalizeResult (from src/lib/finalize-candidate.ts) into a stable,
// serializable status suitable for compact display and version metadata.

import type { FinalizeResult } from "./finalize-candidate";
import { QA_POLICY_VERSION } from "./qa-contract";

export type QaState =
  | "stale"          // raw HTML / theme / blueprint changed after last assess
  | "checking"       // finalization in flight
  | "clean"          // ok, no repairs, no Claude
  | "repaired"       // ok, deterministic repair only, no Claude
  | "claude-repaired"// ok, Claude patch (metered) applied
  | "blocked";       // deterministic or QA rejected

export type QaStatusSource =
  | "deterministic"
  | "claude"
  | "cache"
  | "publish"
  | "runtime"
  | "-";

export interface QaParitySummary {
  ok: boolean;
  deltas: Record<string, number>;
  blockers: string[];
  warnings: string[];
}

export interface QaSessionStatus {
  /** Bump on every schema change. Old sessions are hydrated with defaults. */
  v: 1;
  policyVersion: string;
  state: QaState;
  source: QaStatusSource;
  /** Fingerprint of raw HTML + themeCss + themeName + themeBlueprintId. */
  assessedHash: string;
  assessedAt: number;
  deterministicRepairCount: number;
  qaRouteInvokedThisOperation: boolean;
  providerInvokedThisOperation: boolean;
  resultFromCache: boolean;
  qaModel: string | null;
  parity: QaParitySummary | null;
  blockers: string[];
  warnings: string[];
  /** Human-friendly one-line for UI. */
  message: string;
}

const EMPTY_PARITY: QaParitySummary = { ok: true, deltas: {}, blockers: [], warnings: [] };

export const EMPTY_QA_STATUS: QaSessionStatus = {
  v: 1,
  policyVersion: QA_POLICY_VERSION,
  state: "stale",
  source: "-",
  assessedHash: "",
  assessedAt: 0,
  deterministicRepairCount: 0,
  qaRouteInvokedThisOperation: false,
  providerInvokedThisOperation: false,
  resultFromCache: false,
  qaModel: null,
  parity: null,
  blockers: [],
  warnings: [],
  message: "Stale · recheck required",
};

// -- Fingerprint -------------------------------------------------------------
// A stable, cheap hash covering ONLY the inputs that must invalidate the
// QA verdict: raw HTML, theme CSS, theme display name, blueprint id, and
// the QA policy version. Excludes session id, timestamps, and demoMode.

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

export function computeAssessedHash(inputs: {
  html: string;
  themeCss?: string | null;
  themeName?: string | null;
  themeBlueprintId?: string | null;
}): string {
  const raw = inputs.html || "";
  const css = inputs.themeCss ?? "";
  const parts = [
    "pv", QA_POLICY_VERSION,
    "h", raw.length, fnv(raw),
    "c", css.length, fnv(css),
    "n", fnv(inputs.themeName ?? ""),
    "b", fnv(inputs.themeBlueprintId ?? ""),
  ];
  return fnv(parts.join("|"));
}

// -- Hydration ---------------------------------------------------------------

/** Normalize an unknown persisted value into a valid QaSessionStatus. */
export function hydrateQaStatus(raw: unknown): QaSessionStatus {
  if (!raw || typeof raw !== "object") return { ...EMPTY_QA_STATUS };
  const r = raw as Partial<QaSessionStatus>;
  const state: QaState =
    r.state === "checking" || r.state === "clean" || r.state === "repaired" ||
    r.state === "claude-repaired" || r.state === "blocked"
      ? r.state : "stale";
  return {
    v: 1,
    policyVersion: typeof r.policyVersion === "string" ? r.policyVersion : QA_POLICY_VERSION,
    state,
    source: (typeof r.source === "string" ? r.source : "-") as QaStatusSource,
    assessedHash: typeof r.assessedHash === "string" ? r.assessedHash.slice(0, 32) : "",
    assessedAt: typeof r.assessedAt === "number" ? r.assessedAt : 0,
    deterministicRepairCount: typeof r.deterministicRepairCount === "number" ? r.deterministicRepairCount : 0,
    qaRouteInvokedThisOperation: !!r.qaRouteInvokedThisOperation,
    providerInvokedThisOperation: !!r.providerInvokedThisOperation,
    resultFromCache: !!r.resultFromCache,
    qaModel: typeof r.qaModel === "string" ? r.qaModel : null,
    parity: r.parity && typeof r.parity === "object" ? {
      ok: !!r.parity.ok,
      deltas: (r.parity.deltas && typeof r.parity.deltas === "object") ? r.parity.deltas : {},
      blockers: Array.isArray(r.parity.blockers) ? r.parity.blockers.slice(0, 8).map(String) : [],
      warnings: Array.isArray(r.parity.warnings) ? r.parity.warnings.slice(0, 8).map(String) : [],
    } : null,
    blockers: Array.isArray(r.blockers) ? r.blockers.slice(0, 6).map((s) => String(s).slice(0, 120)) : [],
    warnings: Array.isArray(r.warnings) ? r.warnings.slice(0, 6).map((s) => String(s).slice(0, 120)) : [],
    message: typeof r.message === "string" ? r.message.slice(0, 160) : "Stale · recheck required",
  };
}

// -- Mapping FinalizeResult → QaSessionStatus --------------------------------

export function statusFromFinalize(
  fin: FinalizeResult,
  ctx: {
    html: string;
    themeCss?: string | null;
    themeName?: string | null;
    themeBlueprintId?: string | null;
  },
): QaSessionStatus {
  const assessedHash = computeAssessedHash(ctx);
  const parity: QaParitySummary = {
    ok: fin.finalParity.ok,
    deltas: fin.finalParity.deltas as unknown as Record<string, number>,
    blockers: fin.finalParity.blockers.slice(0, 6),
    warnings: fin.finalParity.warnings.slice(0, 6),
  };

  let state: QaState;
  let source: QaStatusSource;
  let message: string;
  if (!fin.ok) {
    state = "blocked";
    source = fin.claudeResultFromCache ? "cache" : (fin.claudeInvoked ? "claude" : "deterministic");
    const first = fin.blockers[0] ?? "blocked";
    message = `Blocked · ${first.slice(0, 100)}`;
  } else if (fin.source === "clean") {
    state = "clean";
    source = "deterministic";
    message = "Clean · no extra AI call";
  } else if (fin.source === "deterministic-repair") {
    state = "repaired";
    source = "deterministic";
    message = `Repaired locally · no extra AI call (${fin.deterministicRepairs.length} fix${fin.deterministicRepairs.length === 1 ? "" : "es"})`;
  } else if (fin.source === "claude-repair") {
    state = "claude-repaired";
    source = "claude";
    message = `Claude QA · one metered check (${fin.claudeModel ?? "?"})`;
  } else if (fin.source === "cache") {
    state = "claude-repaired";
    source = "cache";
    message = "Cached QA decision · no new AI call";
  } else {
    state = "clean";
    source = "deterministic";
    message = "Clean · no extra AI call";
  }

  return {
    v: 1,
    policyVersion: QA_POLICY_VERSION,
    state,
    source,
    assessedHash,
    assessedAt: Date.now(),
    deterministicRepairCount: fin.deterministicRepairs.length,
    qaRouteInvokedThisOperation: fin.claudeInvoked,
    providerInvokedThisOperation: fin.claudeInvoked,
    resultFromCache: fin.claudeResultFromCache,
    qaModel: fin.claudeModel,
    parity,
    blockers: fin.blockers.slice(0, 6),
    warnings: fin.finalParity.warnings.slice(0, 6),
    message,
  };
}

/** Mark status as blocked from a current-hash runtime blocker. Does NOT
 *  invoke Claude; runtime blockers are deterministic-only. */
export function blockFromRuntime(prev: QaSessionStatus, reason: string): QaSessionStatus {
  return {
    ...prev,
    state: "blocked",
    source: "runtime",
    blockers: [reason.slice(0, 120), ...prev.blockers].slice(0, 6),
    message: `Blocked · runtime: ${reason.slice(0, 90)}`,
    // Runtime path never invokes Claude.
    qaRouteInvokedThisOperation: false,
    providerInvokedThisOperation: false,
    resultFromCache: false,
    assessedAt: Date.now(),
  };
}

/** Publish assessment updates status/source but never pretends Claude ran. */
export function statusFromPublish(
  ok: boolean,
  reason: string,
  ctx: { html: string; themeCss?: string | null; themeName?: string | null; themeBlueprintId?: string | null },
  prev?: QaSessionStatus,
): QaSessionStatus {
  const base = prev ?? { ...EMPTY_QA_STATUS };
  return {
    ...base,
    state: ok ? base.state : "blocked",
    source: "publish",
    assessedHash: computeAssessedHash(ctx),
    assessedAt: Date.now(),
    qaRouteInvokedThisOperation: false,
    providerInvokedThisOperation: false,
    resultFromCache: false,
    blockers: ok ? base.blockers : [reason.slice(0, 120), ...base.blockers].slice(0, 6),
    message: ok
      ? "Publish assessment · deterministic pass"
      : `Blocked · publish: ${reason.slice(0, 90)}`,
  };
}

/** Mark stale when raw html / theme changes and no matching fresh assessment is being committed. */
export function markStaleIfChanged(
  status: QaSessionStatus | undefined,
  ctx: { html: string; themeCss?: string | null; themeName?: string | null; themeBlueprintId?: string | null },
): QaSessionStatus {
  const currentHash = computeAssessedHash(ctx);
  const prev = status ?? { ...EMPTY_QA_STATUS };
  if (prev.assessedHash === currentHash && prev.state !== "stale") return prev;
  if (prev.assessedHash === currentHash) return prev;
  return {
    ...prev,
    state: "stale",
    source: "-",
    assessedHash: currentHash,
    assessedAt: Date.now(),
    message: "Stale · recheck required",
  };
}
