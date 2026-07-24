// 21st.dev telemetry. In-memory ring buffer of the last N planner rounds so
// the admin /demos portal can see hit-rate, auth status, and recent queries
// at a glance. Process-scoped — resets on cold start, which is fine for the
// low-cardinality "is the pipeline working?" question this answers.

export type TwentyfirstEvent = {
  at: number;
  requestId: string;
  queries: string[];
  hitCount: number;
  componentNames: string[];
  injectedBytes: number;
  authOk: boolean;
  durationMs: number;
};

const MAX = 50;
const RING: TwentyfirstEvent[] = [];
let AUTH_OK: boolean | null = null;
let AUTH_CHECKED_AT = 0;

export function recordTwentyfirstEvent(ev: TwentyfirstEvent): void {
  RING.push(ev);
  if (RING.length > MAX) RING.shift();
  AUTH_OK = ev.authOk;
  AUTH_CHECKED_AT = ev.at;
}

export function markTwentyfirstAuth(ok: boolean): void {
  AUTH_OK = ok;
  AUTH_CHECKED_AT = Date.now();
}

export type TwentyfirstHealth = {
  hasKey: boolean;
  authOk: boolean | null;
  authCheckedAt: number;
  totalRounds: number;
  totalHits: number;
  hitRate: number;
  avgHitsPerRound: number;
  avgDurationMs: number;
  recent: TwentyfirstEvent[];
};

export function getTwentyfirstHealth(): TwentyfirstHealth {
  const hasKey = !!process.env.TWENTYFIRST_API_KEY;
  const rounds = RING.length;
  const totalHits = RING.reduce((s, e) => s + e.hitCount, 0);
  const withAny = RING.filter((e) => e.hitCount > 0).length;
  const avgDur = rounds ? Math.round(RING.reduce((s, e) => s + e.durationMs, 0) / rounds) : 0;
  return {
    hasKey,
    authOk: AUTH_OK,
    authCheckedAt: AUTH_CHECKED_AT,
    totalRounds: rounds,
    totalHits,
    hitRate: rounds ? Math.round((withAny / rounds) * 100) : 0,
    avgHitsPerRound: rounds ? Math.round((totalHits / rounds) * 10) / 10 : 0,
    avgDurationMs: avgDur,
    recent: [...RING].slice(-15).reverse(),
  };
}
