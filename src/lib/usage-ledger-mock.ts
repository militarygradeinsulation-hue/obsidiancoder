// Pure in-memory mock of the usage_reserve / usage_finalize / usage_refund
// / usage_balance SQL functions. Kept side-effect free so the self-test
// suite can verify the ledger contract without touching Supabase or making
// any live provider calls. Behaviour MUST mirror the SQL in the runtime
// billing migration (see 20260720_usage_ledger_security_pass.sql).

export type LedgerStatus = "pending" | "committed" | "refunded" | "failed";

export interface LedgerRow {
  id: string;
  requestId: string;
  userId: string;
  env: string;
  operation: string;
  creditsReserved: number;
  creditsCharged: number;
  status: LedgerStatus;
  createdAt: number;
  periodStart: number;
  periodEnd: number;
  meta: Record<string, unknown>;
}

export interface Subscription {
  userId: string;
  env: string;
  status: "active" | "trialing" | "canceled" | "past_due";
  periodStart: number | null;
  periodEnd: number | null;
}

export interface ReserveResult {
  reservationId: string;
  credits: number;
  usedBefore: number;
  remainingAfter: number;
  idempotent: boolean;
  periodStart: number;
  periodEnd: number;
}

export interface FinalizeResult {
  ok: boolean;
  charged: number;
  capLimited: boolean;
}

const OPERATION_RE = /^[a-z][a-z0-9_]{0,63}$/;
const VALID_ENVS = new Set(["sandbox", "live"]);

export class UsageLedger {
  rows = new Map<string, LedgerRow>();
  subs: Subscription[] = [];
  now: () => number = () => Date.now();
  private seq = 0;

  addSub(s: Subscription) { this.subs.push(s); }

  private activePeriod(userId: string, env: string): { start: number; end: number } | null {
    const s = [...this.subs].reverse().find((x) =>
      x.userId === userId && x.env === env && (x.status === "active" || x.status === "trialing"),
    );
    if (!s || s.periodStart == null || s.periodEnd == null) return null;
    const now = this.now();
    if (s.periodStart > now || s.periodEnd <= now) return null;
    return { start: s.periodStart, end: s.periodEnd };
  }

  reserve(
    userId: string, amount: number, cap: number, env: string,
    operation: string, requestId: string,
  ): ReserveResult | null | "no_period" {
    // Input validation — mirrors SQL RAISE EXCEPTIONs.
    if (!VALID_ENVS.has(env)) throw new Error("invalid_environment");
    if (typeof operation !== "string" || !OPERATION_RE.test(operation)) throw new Error("invalid_operation");
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1000) throw new Error("invalid_amount");
    if (!Number.isInteger(cap) || cap < 0 || cap > 1_000_000) throw new Error("invalid_cap");
    if (typeof requestId !== "string" || requestId.length === 0) throw new Error("request_id required");

    // Period must be active BEFORE we honour idempotency — a retry from an
    // expired or different period must be rejected.
    const period = this.activePeriod(userId, env);
    if (!period) return "no_period";

    // Idempotency: same request_id ⇒ existing row, but only when the
    // existing row's stored period matches the CURRENT active period.
    for (const row of this.rows.values()) {
      if (row.env === env && row.requestId === requestId && row.userId === userId) {
        if (row.periodStart !== period.start || row.periodEnd !== period.end) {
          throw new Error("request_id_period_mismatch");
        }
        return {
          reservationId: row.id, credits: row.creditsReserved,
          usedBefore: 0, remainingAfter: 0, idempotent: true,
          periodStart: row.periodStart, periodEnd: row.periodEnd,
        };
      }
    }

    let used = 0;
    for (const row of this.rows.values()) {
      if (row.userId !== userId || row.env !== env) continue;
      if (row.createdAt < period.start || row.createdAt >= period.end) continue;
      if (row.status === "committed") used += row.creditsCharged;
      else if (row.status === "pending") used += row.creditsReserved;
    }
    if (used + amount > cap) return null;

    const id = `res_${++this.seq}`;
    this.rows.set(id, {
      id, requestId, userId, env, operation,
      creditsReserved: amount, creditsCharged: 0,
      status: "pending", createdAt: this.now(),
      periodStart: period.start, periodEnd: period.end,
      meta: {},
    });
    return {
      reservationId: id, credits: amount, usedBefore: used,
      remainingAfter: cap - used - amount, idempotent: false,
      periodStart: period.start, periodEnd: period.end,
    };
  }

  finalize(
    id: string, actualCredits: number, requestId: string,
    status: "committed" | "failed" = "committed", cap: number = 1000,
  ): FinalizeResult {
    if (!Number.isInteger(actualCredits) || actualCredits < 0) throw new Error("actual_credits must be >= 0");
    if (!requestId) throw new Error("request_id required");
    const row = this.rows.get(id);
    if (!row) return { ok: false, charged: 0, capLimited: false };
    if (row.requestId !== requestId) throw new Error("request_id_mismatch");
    if (row.status === "committed" || row.status === "refunded" || row.status === "failed") {
      return { ok: true, charged: row.creditsCharged, capLimited: !!row.meta.cap_limited };
    }
    if (row.status !== "pending") throw new Error(`unexpected status ${row.status}`);

    // Period usage EXCLUDING this pending row (top-up-aware).
    let periodUsed = 0;
    for (const r of this.rows.values()) {
      if (r.id === row.id) continue;
      if (r.userId !== row.userId || r.env !== row.env) continue;
      if (r.createdAt < row.periodStart || r.createdAt >= row.periodEnd) continue;
      if (r.status === "committed") periodUsed += r.creditsCharged;
      else if (r.status === "pending") periodUsed += r.creditsReserved;
    }
    const available = Math.max(0, cap - periodUsed);
    let capLimited = false;
    let charge: number;
    if (actualCredits <= available) {
      charge = actualCredits;
    } else {
      charge = available;
      capLimited = true;
      row.meta = {
        ...row.meta,
        cap_limited: true,
        requested_credits: actualCredits,
        available_credits: available,
      };
    }
    row.creditsReserved = charge;
    row.creditsCharged = charge;
    row.status = status;
    return { ok: true, charged: charge, capLimited };
  }

  refund(id: string): boolean {
    const row = this.rows.get(id);
    if (!row) return false;
    if (row.status === "refunded") return true;
    if (row.status !== "pending") return false;
    row.creditsReserved = 0;
    row.creditsCharged = 0;
    row.status = "refunded";
    return true;
  }

  balance(userId: string, env: string, cap: number): {
    used: number; reserved: number; cap: number; remaining: number;
    periodStart: number | null; periodEnd: number | null; active: boolean;
  } {
    const period = this.activePeriod(userId, env);
    if (!period) {
      const sub = [...this.subs].reverse().find((x) => x.userId === userId && x.env === env);
      return {
        used: 0, reserved: 0, cap, remaining: 0,
        periodStart: sub?.periodStart ?? null, periodEnd: sub?.periodEnd ?? null,
        active: false,
      };
    }
    let used = 0, reserved = 0;
    for (const row of this.rows.values()) {
      if (row.userId !== userId || row.env !== env) continue;
      if (row.createdAt < period.start || row.createdAt >= period.end) continue;
      if (row.status === "committed") used += row.creditsCharged;
      else if (row.status === "pending") reserved += row.creditsReserved;
    }
    const consumed = used + reserved;
    return {
      used, reserved, cap, remaining: Math.max(0, cap - consumed),
      periodStart: period.start, periodEnd: period.end, active: true,
    };
  }
}
