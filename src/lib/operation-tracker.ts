// Operation tracker — pure, side-effect-free helpers shared by hooks, panels,
// and self-tests. Owns operation IDs, image-provider ordering, ledger
// deduplication by operationId, and rail-width math (extracted so keyboard
// resize logic is testable without a DOM).
//
// No React, no window/localStorage access — safe from any environment.

import type { LedgerEvent } from "./adaptive-ledger";

// -------------------- Operation identifiers --------------------

export function newOperationId(): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `op_${uuid}`;
  } catch { /* fall through */ }
  return `op_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// -------------------- Image provider ordering --------------------

/** Canonical fallback order — Leonardo first, Higgsfield mid, Gemini last. */
export const IMAGE_PROVIDER_ORDER = ["leonardo", "higgsfield", "gemini"] as const;
export type ImageProviderName = (typeof IMAGE_PROVIDER_ORDER)[number];

/** Filter+order a set of "available" provider ids to canonical priority.
 *  Unknown providers are dropped; duplicates collapsed. */
export function orderImageProviders(available: readonly string[]): ImageProviderName[] {
  const set = new Set(available.map((s) => s.toLowerCase().trim()));
  return IMAGE_PROVIDER_ORDER.filter((p) => set.has(p));
}

/** Parse an X-Obs-Image-Providers header value ("hero:higgsfield,card:gemini")
 *  into an ordered, deduplicated provider chain. Returns [] on malformed input. */
export function parseProviderHeader(header: string | null | undefined): ImageProviderName[] {
  if (!header || header === "none") return [];
  const found: string[] = [];
  for (const part of header.split(",")) {
    const [, provider] = part.split(":").map((s) => s?.trim().toLowerCase());
    if (provider) found.push(provider);
  }
  return orderImageProviders(found);
}

// -------------------- Rail-width math (keyboard + drag) --------------------

export const RAIL_MIN = 260;
export const RAIL_HARD_MAX = 900;

export function railMax(viewportWidth: number, sidebarReserve = 320): number {
  return Math.min(RAIL_HARD_MAX, Math.max(RAIL_MIN, viewportWidth - sidebarReserve));
}

export function clampRail(width: number, viewportWidth: number): number {
  const max = railMax(viewportWidth);
  return Math.max(RAIL_MIN, Math.min(max, Math.round(width)));
}

/** Compute the new width for an arrow-key event. Returns `current` on other keys. */
export function nextRailWidthForKey(
  key: string,
  current: number,
  viewportWidth: number,
  shiftKey = false,
): number {
  const step = shiftKey ? 40 : 16;
  if (key === "ArrowLeft") return clampRail(current + step, viewportWidth);
  if (key === "ArrowRight") return clampRail(current - step, viewportWidth);
  if (key === "Home") return clampRail(320, viewportWidth);
  return current;
}

// -------------------- Ledger deduplication by operationId --------------------

/** Extended ledger event that carries an optional operationId. Kept structural
 *  so we don't force a schema migration on the ledger module. */
export type OpEvent = LedgerEvent & { operationId?: string; providerChain?: string[]; rollbackId?: string };

/** True when the events array already contains an event of `kind` for `opId`. */
export function hasOperationEvent(events: readonly OpEvent[], opId: string, kind: LedgerEvent["kind"]): boolean {
  for (const e of events) {
    if ((e as OpEvent).operationId === opId && e.kind === kind) return true;
  }
  return false;
}

/** Append `event` iff (operationId, kind) is not already present. Returns the
 *  new array (never mutates). Used to guard against React strict-mode double
 *  fires and network retries that would otherwise inflate learning stats. */
export function dedupeAppendOperation(events: readonly OpEvent[], event: OpEvent): OpEvent[] {
  if (event.operationId && hasOperationEvent(events, event.operationId, event.kind)) {
    return events.slice();
  }
  return [...events, event];
}

// -------------------- Operation summary (for panels + version metadata) --------------------

export interface OperationSummary {
  operationId: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  requestedModel: string;
  actualModel: string;
  strategy: string;
  taskType: string;
  providerChain: string[];      // e.g. ["leonardo","gemini"] or ["primary","fallback:openai/gpt-5"]
  imageProviders?: string;      // raw header value if any
  imageCount?: number;
  validationStatus?: "passed" | "warnings" | "failed";
  runtimeErrors?: number;
  outcome: "pending" | "ok" | "fail" | "restored" | "rejected";
  rollbackId?: string;          // version.id to roll back to on restore
  learningSignals?: string[];   // signalsUsed from RoutingDecision
  reason?: string;              // short human note (sanitized upstream)
}

export function summarizeOperation(op: OperationSummary): string {
  const bits = [
    op.strategy,
    op.actualModel !== op.requestedModel ? `${op.requestedModel} → ${op.actualModel}` : op.actualModel,
    op.providerChain.length ? `via ${op.providerChain.join("→")}` : null,
    op.durationMs != null ? `${Math.round(op.durationMs)}ms` : null,
    op.validationStatus ? `validation:${op.validationStatus}` : null,
    op.runtimeErrors != null ? `runtime:${op.runtimeErrors}` : null,
    op.outcome,
  ].filter(Boolean);
  return bits.join(" · ");
}
