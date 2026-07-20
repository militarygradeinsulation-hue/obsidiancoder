// Shared, pure usage helpers — no I/O, no imports outside credit-gate.
// Used by every server route that meters AI cost. Kept side-effect-free
// so the self-test suite can exercise it deterministically.
//
// Invariant: the object we hand to Supabase (`ai_usage.meta`) MUST NOT
// contain user prompts, generated HTML, source code, or image bytes.
// The `sanitizeMeta` helper enforces that by rejecting long strings and
// data-URL/base64 payloads.

import {
  COST_PER_CREDIT_USD,
  MIN_CALL_COST_USD,
  TOKEN_RATES_PER_1K_USD,
  creditsForUsd,
  estimateUsdFromTokens,
  type Operation,
} from "./credit-gate";

/** Per-image provider cost (USD) used when the image provider does not
 *  return a per-call price. Conservative baseline. */
export const IMAGE_COST_USD = 0.02;

/** How the cost figure was derived. */
export type CostBasis = "actual" | "estimated" | "minimum";

/** Terminal state we persist to `ai_usage.status`. */
export type UsageStatus = "committed" | "failed" | "refunded";

/**
 * One row of AI usage evidence. Fields map 1:1 to columns of `public.ai_usage`
 * plus a small `meta` bag for non-PII debug context. Every field is optional
 * at construction — helpers below fill in sensible defaults.
 */
export interface UsageRecord {
  provider: string;                  // e.g. "lovable" | "leonardo" | "higgsfield" | "gemini" | "internal"
  model: string | null;              // full model id when available (e.g. "google/gemini-3.1-flash-lite")
  operation: Operation;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  imageCount: number;
  actualCostUsd: number | null;      // when provider returned a real cost
  estimatedCostUsd: number | null;   // token-derived estimate we used to charge
  costBasis: CostBasis;              // "actual" if the provider gave us a cost
  credits: number;                   // whole credits charged (ceil(usd/0.005) with op minimum)
  providerUsed: boolean;             // true iff the provider actually did work
  status: UsageStatus;               // committed / failed / refunded
  errorCode?: string;                // short machine-readable error tag
  meta?: Record<string, unknown>;    // optional non-PII debug (fallback flag, timing_ms, ...)
}

/**
 * Build a UsageRecord with sensible defaults. Numeric fields are floored /
 * clamped so persisted data never has NaN or negatives. `credits` are
 * recomputed from the chosen cost basis so a caller never has to hand-roll it.
 */
export function makeUsage(input: Partial<UsageRecord> & { operation: Operation }): UsageRecord {
  const inTok = clampInt(input.inputTokens);
  const outTok = clampInt(input.outputTokens);
  const totTok = input.totalTokens != null ? clampInt(input.totalTokens) : inTok + outTok;
  const imgCount = clampInt(input.imageCount);
  const actual = numOrNull(input.actualCostUsd);
  const estimated = numOrNull(input.estimatedCostUsd);
  const providerUsed = input.providerUsed ?? (
    actual != null || estimated != null || totTok > 0 || imgCount > 0
  );
  const status: UsageStatus = input.status ?? (providerUsed ? "committed" : "refunded");
  // Cost basis picks the strongest signal we have. Minimum floor is applied
  // whenever the provider did work but the resolved USD is 0.
  let costBasis: CostBasis = input.costBasis ?? (actual != null ? "actual" : estimated != null ? "estimated" : "minimum");
  let usd = actual ?? estimated ?? 0;
  if (providerUsed && usd <= 0) { usd = MIN_CALL_COST_USD; costBasis = "minimum"; }
  const opMinimum = providerUsed ? 1 : 0;
  const rawCredits = usd > 0 ? Math.max(opMinimum, creditsForUsd(usd, input.operation)) : 0;
  const credits = input.credits != null && Number.isFinite(input.credits)
    ? Math.max(0, Math.floor(input.credits))
    : rawCredits;
  return {
    provider: input.provider ?? "internal",
    model: input.model ?? null,
    operation: input.operation,
    inputTokens: inTok,
    outputTokens: outTok,
    totalTokens: totTok,
    imageCount: imgCount,
    actualCostUsd: actual,
    estimatedCostUsd: estimated,
    costBasis,
    credits,
    providerUsed,
    status,
    errorCode: input.errorCode,
    meta: input.meta ? sanitizeMeta(input.meta) : undefined,
  };
}

function clampInt(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0;
  return v < 0 ? 0 : v;
}
function numOrNull(n: unknown): number | null {
  if (n == null) return null;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Aggregate multiple usage records (primary + repair, primary + N image calls,
 * etc.) into a single billable record. Costs are summed; the resulting
 * `costBasis` degrades to the weakest basis in the set (actual > estimated >
 * minimum) so we never oversell certainty. `providerUsed` is true if any of
 * the merged records did work. Status is committed unless every merged record
 * is refunded.
 */
export function mergeUsage(operation: Operation, records: UsageRecord[]): UsageRecord {
  if (records.length === 0) {
    return makeUsage({ operation, providerUsed: false, status: "refunded" });
  }
  let inTok = 0, outTok = 0, totTok = 0, imgCount = 0;
  let actual = 0, hasActual = false;
  let estimated = 0, hasEst = false;
  let providerUsed = false;
  let allRefunded = true;
  let anyFailed = false;
  const providers = new Set<string>();
  const models = new Set<string>();
  for (const r of records) {
    inTok += r.inputTokens; outTok += r.outputTokens; totTok += r.totalTokens;
    imgCount += r.imageCount;
    if (r.actualCostUsd != null) { actual += r.actualCostUsd; hasActual = true; }
    if (r.estimatedCostUsd != null) { estimated += r.estimatedCostUsd; hasEst = true; }
    if (r.providerUsed) providerUsed = true;
    if (r.status !== "refunded") allRefunded = false;
    if (r.status === "failed") anyFailed = true;
    providers.add(r.provider);
    if (r.model) models.add(r.model);
  }
  const usd = hasActual ? actual : hasEst ? estimated : 0;
  const basis: CostBasis = records.every((r) => r.costBasis === "actual") && hasActual
    ? "actual"
    : hasActual || hasEst ? "estimated" : "minimum";
  const status: UsageStatus = !providerUsed && allRefunded
    ? "refunded"
    : anyFailed && !records.some((r) => r.status === "committed") ? "failed" : "committed";
  return makeUsage({
    operation,
    provider: providers.size === 1 ? [...providers][0] : "mixed",
    model: models.size === 1 ? [...models][0] : records[0].model ?? null,
    inputTokens: inTok, outputTokens: outTok, totalTokens: totTok,
    imageCount: imgCount,
    actualCostUsd: hasActual ? +usd.toFixed(6) : null,
    estimatedCostUsd: !hasActual && hasEst ? +usd.toFixed(6) : null,
    costBasis: basis,
    providerUsed,
    status,
    meta: mergeSafeMeta(records),
  });
}

function mergeSafeMeta(records: UsageRecord[]): Record<string, unknown> | undefined {
  const combined: Record<string, unknown> = {};
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.meta) combined[`r${i}`] = r.meta;
  }
  return Object.keys(combined).length ? combined : undefined;
}

/**
 * Try to parse a `usage` object out of a non-streaming OpenAI/Anthropic-style
 * chat completions JSON body. Returns null when no usage field is present.
 * Never throws.
 */
export function parseUsageFromChatJson(body: unknown): {
  inputTokens: number; outputTokens: number; totalTokens: number; model?: string;
} | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const u = (b.usage ?? null) as Record<string, unknown> | null;
  if (!u || typeof u !== "object") return null;
  const inTok = pickInt(u, ["input_tokens", "prompt_tokens"]);
  const outTok = pickInt(u, ["output_tokens", "completion_tokens"]);
  const totTok = pickInt(u, ["total_tokens"]) || inTok + outTok;
  const model = typeof b.model === "string" ? b.model : undefined;
  if (inTok === 0 && outTok === 0 && totTok === 0) return null;
  return { inputTokens: inTok, outputTokens: outTok, totalTokens: totTok, model };
}

function pickInt(obj: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.floor(v);
  }
  return 0;
}

/**
 * Streaming accumulator. Feed each decoded SSE chunk to `push`; on a
 * `[DONE]` marker the accumulator returns the last observed usage (if any).
 * Handles both OpenAI's `stream_options: {include_usage:true}` (final chunk
 * carries `usage`) and Gemini's `usageMetadata` variant.
 */
export class StreamingUsageAccumulator {
  private inputTokens = 0;
  private outputTokens = 0;
  private totalTokens = 0;
  private model: string | undefined;
  private seenUsage = false;

  push(line: string): void {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const j = JSON.parse(payload) as Record<string, unknown>;
      if (typeof j.model === "string") this.model = j.model;
      const usage = (j.usage ?? j.usageMetadata ?? null) as Record<string, unknown> | null;
      if (usage) {
        const inTok = pickInt(usage, ["input_tokens", "prompt_tokens", "promptTokenCount"]);
        const outTok = pickInt(usage, ["output_tokens", "completion_tokens", "candidatesTokenCount"]);
        const totTok = pickInt(usage, ["total_tokens", "totalTokenCount"]) || inTok + outTok;
        if (inTok || outTok || totTok) {
          this.inputTokens = Math.max(this.inputTokens, inTok);
          this.outputTokens = Math.max(this.outputTokens, outTok);
          this.totalTokens = Math.max(this.totalTokens, totTok);
          this.seenUsage = true;
        }
      }
    } catch { /* ignore malformed chunk */ }
  }
  hasUsage(): boolean { return this.seenUsage; }
  snapshot(): { inputTokens: number; outputTokens: number; totalTokens: number; model?: string } {
    return { inputTokens: this.inputTokens, outputTokens: this.outputTokens, totalTokens: this.totalTokens, model: this.model };
  }
}

/**
 * Central token-cost estimator: prefers the provider's actual usage, otherwise
 * derives USD from the shared TOKEN_RATES_PER_1K_USD table, otherwise falls
 * back to MIN_CALL_COST_USD when the provider did work but we have no signal.
 * Returns 0 when nothing was consumed (no provider work happened).
 */
export function estimateUsdForCall(args: {
  actualCostUsd?: number | null;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  providerUsed: boolean;
}): { usd: number; basis: CostBasis } {
  if (args.actualCostUsd != null && args.actualCostUsd >= 0) {
    return { usd: +args.actualCostUsd.toFixed(6), basis: "actual" };
  }
  const inTok = Math.max(0, Math.floor(args.inputTokens ?? 0));
  const outTok = Math.max(0, Math.floor(args.outputTokens ?? 0));
  const imgCount = Math.max(0, Math.floor(args.imageCount ?? 0));
  let usd = 0;
  if (args.model && (inTok > 0 || outTok > 0)) {
    usd += estimateUsdFromTokens(args.model, inTok, outTok);
  }
  if (imgCount > 0) usd += imgCount * IMAGE_COST_USD;
  if (usd > 0) return { usd: +usd.toFixed(6), basis: "estimated" };
  return args.providerUsed ? { usd: MIN_CALL_COST_USD, basis: "minimum" } : { usd: 0, basis: "minimum" };
}

/**
 * Ensure `meta` never leaks prompts, generated HTML, source code, or base64
 * image bytes. Strings are truncated hard at 240 chars; any obvious base64
 * / data-URL payloads are dropped. Nested objects are shallow-copied one
 * level deep to keep the JSON small.
 */
export function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (value: unknown, depth: number): unknown => {
    if (value == null) return value;
    if (typeof value === "string") {
      if (looksLikeBinaryOrLongPayload(value)) return `[redacted:${value.length}c]`;
      return value.length > 240 ? value.slice(0, 240) + "…" : value;
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) {
      if (depth >= 2) return `[array:${value.length}]`;
      return value.slice(0, 20).map((v) => walk(v, depth + 1));
    }
    if (typeof value === "object") {
      if (depth >= 2) return "[object]";
      const o: Record<string, unknown> = {};
      const src = value as Record<string, unknown>;
      let count = 0;
      for (const k of Object.keys(src)) {
        if (count++ >= 20) break;
        if (isSuspiciousKey(k)) continue;
        o[k] = walk(src[k], depth + 1);
      }
      return o;
    }
    return undefined;
  };
  for (const k of Object.keys(meta)) {
    if (isSuspiciousKey(k)) continue;
    const v = walk(meta[k], 0);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const SUSPICIOUS_KEY = /(prompt|content|html|body|source|code|image|images|b64|base64|data_url|dataurl|user_input|user_prompt|messages)/i;
function isSuspiciousKey(k: string): boolean { return SUSPICIOUS_KEY.test(k); }

function looksLikeBinaryOrLongPayload(s: string): boolean {
  if (s.length > 4000) return true;
  if (s.startsWith("data:") && s.length > 200) return true;
  // long unbroken base64/hex sequence
  if (/^[A-Za-z0-9+/=]{200,}$/.test(s)) return true;
  if (/<!doctype|<html|<script|<style/i.test(s) && s.length > 240) return true;
  return false;
}

// Re-exports so callers only need one import path.
export {
  COST_PER_CREDIT_USD,
  MIN_CALL_COST_USD,
  TOKEN_RATES_PER_1K_USD,
  creditsForUsd,
  estimateUsdFromTokens,
};
