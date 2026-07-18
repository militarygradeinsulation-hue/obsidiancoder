// Server-side upstream fetch with bounded retries, per-attempt + total-budget
// timeouts, cancellation forwarding, and circuit-breaker integration.
//
// Streaming callers pass { stream: true } so we do NOT read the body here;
// the caller inspects response.body itself. Non-stream callers use readGuarded
// after aiFetch returns.

import { AiError, newRequestId, type AiErrorStage } from "./ai-errors";
import { canAttempt, recordFailure, recordSuccess } from "./circuit-breaker";

export const AI_FETCH_DEFAULTS = {
  ATTEMPT_TIMEOUT_MS: 45_000,
  TOTAL_TIMEOUT_MS: 90_000,
  MAX_ATTEMPTS: 3,
  BASE_BACKOFF_MS: 500,
  MAX_BACKOFF_MS: 8_000,
  JITTER_MS: 250,
} as const;

export interface AiFetchOptions {
  breakerKey: string;
  stage: AiErrorStage;
  requestId?: string;
  attemptTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
  /** true = do not buffer body here; caller reads response.body itself */
  stream?: boolean;
}

export interface AiFetchResult {
  response: Response;
  attempts: number;
  requestId: string;
  breakerState: "closed" | "open" | "half-open";
}

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * AI_FETCH_DEFAULTS.JITTER_MS);
}

function backoffMs(attempt: number, retryAfterMs?: number): number {
  const base = Math.min(
    AI_FETCH_DEFAULTS.MAX_BACKOFF_MS,
    AI_FETCH_DEFAULTS.BASE_BACKOFF_MS * Math.pow(2, attempt),
  );
  const raw = retryAfterMs && retryAfterMs > 0 ? Math.max(retryAfterMs, base) : base;
  return jitter(Math.min(raw, AI_FETCH_DEFAULTS.MAX_BACKOFF_MS));
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.round(n * 1000);
  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

export async function aiFetch(url: string, init: RequestInit, opts: AiFetchOptions): Promise<AiFetchResult> {
  const requestId = opts.requestId ?? newRequestId();
  const attemptTimeoutMs = opts.attemptTimeoutMs ?? AI_FETCH_DEFAULTS.ATTEMPT_TIMEOUT_MS;
  const totalTimeoutMs = opts.totalTimeoutMs ?? AI_FETCH_DEFAULTS.TOTAL_TIMEOUT_MS;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? AI_FETCH_DEFAULTS.MAX_ATTEMPTS);
  const startedAt = Date.now();

  const canAttemptRes = canAttempt(opts.breakerKey);
  if (!canAttemptRes.allowed) {
    throw new AiError({
      code: "ai_circuit_open",
      stage: opts.stage,
      requestId,
      retryAfterMs: canAttemptRes.retryAfterMs,
    });
  }

  let lastError: AiError | null = null;
  let attempts = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts++;
    if (opts.signal?.aborted) {
      throw new AiError({ code: "ai_cancelled", stage: opts.stage, requestId });
    }
    const elapsed = Date.now() - startedAt;
    const remaining = totalTimeoutMs - elapsed;
    if (remaining <= 0) {
      throw lastError ?? new AiError({ code: "ai_timeout", stage: opts.stage, requestId });
    }
    const perAttempt = Math.min(attemptTimeoutMs, remaining);

    const attemptController = new AbortController();
    const onUserAbort = () => attemptController.abort();
    opts.signal?.addEventListener("abort", onUserAbort, { once: true });
    const timer = setTimeout(() => attemptController.abort(), perAttempt);

    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: attemptController.signal });
    } catch (err) {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onUserAbort);
      if (opts.signal?.aborted) {
        throw new AiError({ code: "ai_cancelled", stage: opts.stage, requestId });
      }
      // Attempt-level abort = per-attempt timeout
      const isTimeout = attemptController.signal.aborted;
      lastError = new AiError({
        code: isTimeout ? "ai_timeout" : "ai_upstream_5xx",
        stage: opts.stage,
        requestId,
        message: isTimeout ? "Upstream did not respond in time." : (err as Error)?.message,
      });
      if (attempt < maxAttempts - 1) {
        await sleep(backoffMs(attempt));
        continue;
      }
      recordFailure(opts.breakerKey);
      throw lastError;
    }
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onUserAbort);

    // Transport-level success. Classify.
    if (res.ok) {
      recordSuccess(opts.breakerKey);
      return { response: res, attempts, requestId, breakerState: canAttemptRes.state };
    }

    const retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));

    // Auth / config / billing failures are NOT transient. Do not count them
    // toward the transient circuit breaker (that would trip the breaker on a
    // stable config problem and hide it as a "cooldown").
    if (res.status === 401 || res.status === 403) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      throw new AiError({ code: "ai_unauthorized", stage: opts.stage, requestId });
    }
    if (res.status === 400) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      throw new AiError({ code: "ai_bad_request", stage: opts.stage, requestId });
    }
    if (res.status === 402) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      throw new AiError({
        code: "ai_unauthorized",
        stage: opts.stage,
        requestId,
        message: "AI credits exhausted for this workspace.",
      });
    }

    const isTransient = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
    // Drain the body so the underlying connection can be reused / released.
    try { await res.body?.cancel(); } catch { /* ignore */ }

    if (!isTransient) {
      recordFailure(opts.breakerKey);
      throw new AiError({
        code: "ai_upstream_5xx",
        stage: opts.stage,
        requestId,
        message: `Upstream status ${res.status}`,
      });
    }

    lastError = new AiError({
      code: res.status === 429 ? "ai_rate_limited" : "ai_upstream_5xx",
      stage: opts.stage,
      requestId,
      retryAfterMs,
      message: `Upstream status ${res.status}`,
    });

    if (attempt < maxAttempts - 1) {
      await sleep(backoffMs(attempt, retryAfterMs));
      continue;
    }
    recordFailure(opts.breakerKey);
    throw lastError;
  }

  recordFailure(opts.breakerKey);
  throw lastError ?? new AiError({ code: "ai_internal", stage: opts.stage, requestId });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
