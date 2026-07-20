// Pure credit math and entitlement rules — no I/O, no imports.
// Kept side-effect free so it is safely runnable from the self-test suite.

export const COST_PER_CREDIT_USD = 0.005;

/** Monthly cap per plan, in credits. */
export const CAP_FREE_MONTHLY = 0;
export const CAP_PRO_MONTHLY = 1000;

/** Every server-visible paid operation. */
export type Operation =
  | "generate_html"
  | "generate_html_patch"
  | "generate_image"
  | "enhance_prompt"
  | "cloud_save"
  | "cloud_share"
  | "github_deploy";

/** Cost, in credits, PER SUCCESSFUL operation. Kept coarse and predictable. */
export const OPERATION_COST: Record<Operation, number> = {
  generate_html: 10,
  generate_html_patch: 3,
  generate_image: 20,
  enhance_prompt: 1,
  cloud_save: 1,
  cloud_share: 1,
  github_deploy: 2,
};

/** All known operation names — used by callers to defend against typos. */
export const KNOWN_OPERATIONS: readonly Operation[] = Object.freeze([
  "generate_html",
  "generate_html_patch",
  "generate_image",
  "enhance_prompt",
  "cloud_save",
  "cloud_share",
  "github_deploy",
]);

export function costForOperation(op: Operation): number {
  const c = OPERATION_COST[op];
  if (!Number.isFinite(c) || c <= 0) {
    throw new Error(`Unknown operation: ${String(op)}`);
  }
  return c;
}

/**
 * RESERVATION_ENVELOPE — conservative UPPER BOUND, in credits, held on the
 * pending ai_usage row for the duration of an operation. This is a TEMPORARY
 * HOLD, not the final charge. Final settlement uses actual/estimated provider
 * cost (via credits-for-usd + per-op minimum) and automatically releases any
 * unused reserved credits via usage_finalize's in-place UPDATE.
 *
 * Envelopes are intentionally larger than OPERATION_COST minimums so a single
 * request cannot silently exceed its hold and force the DB into cap-limited
 * top-up mode. Never surface these numbers to end users as "cost".
 */
export const RESERVATION_ENVELOPE: Record<Operation, number> = {
  generate_html: 60,
  generate_html_patch: 20,
  generate_image: 40,
  enhance_prompt: 5,
  cloud_save: 1,
  cloud_share: 1,
  github_deploy: 2,
};

export function reservationForOperation(op: Operation): number {
  const c = RESERVATION_ENVELOPE[op];
  if (!Number.isFinite(c) || c <= 0) {
    throw new Error(`Unknown operation (reservation): ${String(op)}`);
  }
  return c;
}

export function usdForCredits(credits: number): number {
  if (!Number.isFinite(credits) || credits < 0) return 0;
  return +(credits * COST_PER_CREDIT_USD).toFixed(4);
}

/** Cap for a given plan. Free = 0 (all paid ops blocked). */
export function capForPlan(plan: "free" | "pro"): number {
  return plan === "pro" ? CAP_PRO_MONTHLY : CAP_FREE_MONTHLY;
}

export interface Balance { used: number; reserved: number; cap: number; remaining: number }

export function balanceFor(used: number, cap: number, reserved: number = 0): Balance {
  const u = Math.max(0, Math.floor(used));
  const r = Math.max(0, Math.floor(reserved));
  const c = Math.max(0, Math.floor(cap));
  return { used: u, reserved: r, cap: c, remaining: Math.max(0, c - u - r) };
}

/**
 * Convert an actual (or estimated) provider USD cost to whole credits at
 * $0.005/credit, applying the per-operation minimum charge. Failed calls
 * with no provider usage pass usd=0 → charge = 0.
 */
export function creditsForUsd(usd: number, operation?: Operation): number {
  const raw = Number.isFinite(usd) && usd > 0 ? Math.ceil(usd / COST_PER_CREDIT_USD) : 0;
  if (!operation) return raw;
  return raw === 0 ? 0 : Math.max(1, raw);
}

/**
 * Centralized per-model token pricing table ($ per 1K tokens). Used when
 * the provider does not return an actual cost. Conservative defaults;
 * unknown models fall through to a safe minimum.
 */
export const TOKEN_RATES_PER_1K_USD: Record<string, { input: number; output: number }> = {
  "google/gemini-3.1-flash-lite": { input: 0.0001, output: 0.0004 },
  "google/gemini-3.1-flash":      { input: 0.0003, output: 0.0012 },
  "google/gemini-3.1-pro-preview":{ input: 0.00125, output: 0.005 },
  "openai/gpt-5.5":                { input: 0.0025, output: 0.01 },
  "openai/gpt-5.6":                { input: 0.005,  output: 0.02 },
};
export const MIN_CALL_COST_USD = 0.001;

export function estimateUsdFromTokens(model: string, inTok: number, outTok: number): number {
  const rate = TOKEN_RATES_PER_1K_USD[model];
  if (!rate) return MIN_CALL_COST_USD;
  const usd = (inTok / 1000) * rate.input + (outTok / 1000) * rate.output;
  return usd > 0 ? +usd.toFixed(6) : MIN_CALL_COST_USD;
}

/** Can we spend `amount` credits given current `used`/`cap`? */
export function canSpend(used: number, cap: number, amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  return used + amount <= cap;
}

/**
 * Pure in-memory reservation ledger — models the atomic RPC's contract so we
 * can verify concurrency-safety in unit tests without touching a DB.
 * Not exported for runtime use.
 */
export class ReservationLedger {
  private used = 0;
  constructor(private readonly cap: number) {}

  /** Returns the reservation id, or null when the cap would be exceeded. */
  reserve(amount: number): string | null {
    if (!canSpend(this.used, this.cap, amount)) return null;
    this.used += amount;
    const id = `res_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${this.used}`;
    this.pending.set(id, amount);
    return id;
  }
  commit(id: string): boolean {
    if (!this.pending.has(id)) return false;
    this.pending.delete(id);
    this.committed.add(id);
    return true;
  }
  refund(id: string): boolean {
    const amt = this.pending.get(id);
    if (amt === undefined) return false;
    this.pending.delete(id);
    this.used = Math.max(0, this.used - amt);
    return true;
  }
  balance(): Balance { return balanceFor(this.used, this.cap); }

  private pending = new Map<string, number>();
  private committed = new Set<string>();
}

/** Client-facing envelope for a 402 response. */
export interface CreditsRequiredEnvelope {
  ok: false;
  code: "credits_required" | "not_pro" | "auth_required";
  message: string;
  operation?: Operation;
  needed?: number;
  used?: number;
  cap?: number;
  remaining?: number;
  suggestedPriceId?: string;
}

export function creditsRequiredEnvelope(args: {
  code: CreditsRequiredEnvelope["code"];
  operation?: Operation;
  used?: number;
  cap?: number;
  needed?: number;
  message?: string;
}): CreditsRequiredEnvelope {
  const remaining = args.used !== undefined && args.cap !== undefined
    ? Math.max(0, args.cap - args.used)
    : undefined;
  return {
    ok: false,
    code: args.code,
    message: args.message
      ?? (args.code === "auth_required"
        ? "Sign in to use this feature."
        : args.code === "not_pro"
          ? "This feature requires Obsidian Pro."
          : `Monthly credit limit reached. Free local editing remains available.`),
    operation: args.operation,
    needed: args.needed,
    used: args.used,
    cap: args.cap,
    remaining,
    suggestedPriceId: args.code === "not_pro" || args.code === "credits_required"
      ? "obsidian_creator_monthly"
      : undefined,
  };
}

export function isCreditsRequiredEnvelope(v: unknown): v is CreditsRequiredEnvelope {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.ok === false && (o.code === "credits_required" || o.code === "not_pro" || o.code === "auth_required");
}
