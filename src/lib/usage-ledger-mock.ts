// Pure in-memory mock of the usage_reserve / usage_finalize / usage_refund
// / usage_balance SQL functions. Kept side-effect free so the self-test
// suite can verify the ledger contract without touching Supabase or making
// any live provider calls. Behaviour MUST mirror the SQL in the runtime
// billing migration.

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
    if (amount <= 0) throw new Error("amount must be positive");
    if (cap < 0) throw new Error("cap must be non-negative");
    if (!requestId) throw new Error("request_id required");

    // Idempotency: same request_id ⇒ existing row.
    for (const row of this.rows.values()) {
      if (row.env === env && row.requestId === requestId && row.userId === userId) {
        return {
          reservationId: row.id, credits: row.creditsReserved,
          usedBefore: 0, remainingAfter: 0, idempotent: true,
          periodStart: row.periodStart, periodEnd: row.periodEnd,
        };
      }
    }

    const period = this.activePeriod(userId, env);
    if (!period) return "no_period";

    let used = 0;
    for (const row of this.rows.values()) {
      if (row.userId === userId && row.env === env
          && (row.status === "pending" || row.status === "committed")
          && row.createdAt >= period.start && row.createdAt < period.end) {
        used += row.creditsReserved;
      }
    }
    if (used + amount > cap) return null;

    const id = `res_${++this.seq}`;
    this.rows.set(id, {
      id, requestId, userId, env, operation,
      creditsReserved: amount, creditsCharged: 0,
      status: "pending", createdAt: this.now(),
      periodStart: period.start, periodEnd: period.end,
    });
    return {
      reservationId: id, credits: amount, usedBefore: used,
      remainingAfter: cap - used - amount, idempotent: false,
      periodStart: period.start, periodEnd: period.end,
    };
  }

  finalize(id: string, actualCredits: number, status: "committed" | "failed" = "committed"): boolean {
    if (actualCredits < 0) throw new Error("actual_credits must be >= 0");
    const row = this.rows.get(id);
    if (!row) return false;
    if (row.status === "committed" || row.status === "refunded" || row.status === "failed") return true;
    if (row.status !== "pending") throw new Error(`unexpected status ${row.status}`);
    const charge = Math.max(0, Math.min(actualCredits, row.creditsReserved));
    row.creditsReserved = charge;
    row.creditsCharged = charge;
    row.status = status;
    return true;
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
