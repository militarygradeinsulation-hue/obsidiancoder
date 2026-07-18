// Lightweight in-memory circuit breaker per provider/model. Fail-fast after
// repeated transient failures, recover after cooldown. Not persistent — a
// Worker restart resets state, which is acceptable for a short cooldown.

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerSnapshot {
  key: string;
  state: BreakerState;
  failures: number;
  openedAt?: number;
  cooldownMs: number;
}

interface Entry {
  key: string;
  failures: number[];  // timestamps within window
  state: BreakerState;
  openedAt: number;
  halfOpenInFlight: boolean;
}

const WINDOW_MS = 30_000;
const COOLDOWN_MS = 20_000;
const FAILURE_THRESHOLD = 4;

const breakers = new Map<string, Entry>();

function getEntry(key: string): Entry {
  let e = breakers.get(key);
  if (!e) {
    e = { key, failures: [], state: "closed", openedAt: 0, halfOpenInFlight: false };
    breakers.set(key, e);
  }
  return e;
}

/** Called before making an upstream request. Throws-in-caller model: return status. */
export function canAttempt(key: string, now = Date.now()): { allowed: boolean; state: BreakerState; retryAfterMs?: number } {
  const e = getEntry(key);
  if (e.state === "closed") return { allowed: true, state: "closed" };
  if (e.state === "open") {
    if (now - e.openedAt >= COOLDOWN_MS) {
      e.state = "half-open";
      e.halfOpenInFlight = false;
      return { allowed: true, state: "half-open" };
    }
    return { allowed: false, state: "open", retryAfterMs: COOLDOWN_MS - (now - e.openedAt) };
  }
  // half-open: only one probe at a time
  if (e.halfOpenInFlight) {
    return { allowed: false, state: "half-open", retryAfterMs: 500 };
  }
  e.halfOpenInFlight = true;
  return { allowed: true, state: "half-open" };
}

export function recordSuccess(key: string): void {
  const e = getEntry(key);
  e.failures = [];
  e.state = "closed";
  e.openedAt = 0;
  e.halfOpenInFlight = false;
}

export function recordFailure(key: string, now = Date.now()): void {
  const e = getEntry(key);
  e.halfOpenInFlight = false;
  e.failures = e.failures.filter((t) => now - t < WINDOW_MS);
  e.failures.push(now);
  if (e.state === "half-open") {
    e.state = "open";
    e.openedAt = now;
    return;
  }
  if (e.failures.length >= FAILURE_THRESHOLD) {
    e.state = "open";
    e.openedAt = now;
  }
}

export function snapshotAll(now = Date.now()): BreakerSnapshot[] {
  return Array.from(breakers.values()).map((e) => ({
    key: e.key,
    state: e.state,
    failures: e.failures.filter((t) => now - t < WINDOW_MS).length,
    openedAt: e.openedAt || undefined,
    cooldownMs: COOLDOWN_MS,
  }));
}

/** Test helper — safe to call in production too. */
export function resetBreaker(key?: string): void {
  if (key) breakers.delete(key);
  else breakers.clear();
}

export const BREAKER_CONFIG = { WINDOW_MS, COOLDOWN_MS, FAILURE_THRESHOLD };
