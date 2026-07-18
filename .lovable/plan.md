# Obsidian AI Reliability Hardening

Goal: make it impossible for an upstream error page (Cloudflare 502, proxy HTML, empty body, truncated JSON) to be interpreted as generated code. Preserve the current UI, commit gate, rollback, sandbox, runtime bridge, sessions, streaming, uploads, versions, model selection, and exports.

## Scope

Touches only the AI request boundary and the client submit path. Does not change the shell layout, panels, sidebars, gallery, auth gate, or generation prompts.

## New / changed files

**New**
- `src/lib/ai-errors.ts` — error codes, `AiError`, `sanitizeErrorMessage`, `AiErrorEnvelope` type.
- `src/lib/upstream-guard.ts` — `validateUpstream(response)` and `readTextSafely` (rejects `text/html`, Cloudflare/nginx signatures, empty, oversize, truncated).
- `src/lib/ai-fetch.ts` — `aiFetch(url, init, { totalTimeoutMs, attemptTimeoutMs, retries, signal, breakerKey })` — bounded retries, jitter, `Retry-After`, AbortController plumbing, breaker integration.
- `src/lib/circuit-breaker.ts` — in-memory per-`provider/model` breaker (`closed | open | half-open`), rolling failure window, cooldown, `snapshot()` for /api/health.
- `src/routes/api/health.ts` — 200 JSON with route booleans, provider config booleans, breaker snapshot, timestamp.
- `src/components/BuilderErrorBoundary.tsx` — app-level boundary around the builder shell.
- `src/lib/__tests__/ai-pipeline.test.ts` — unit tests (vitest) for guard, sanitizer, breaker, envelope.

**Changed**
- `src/routes/api/generate.ts` — respond with `AiErrorEnvelope` on every failure (never upstream body); use `aiFetch`; buffer stream and validate first chunk; wrap image plan/gen the same way.
- `src/routes/api/patch.ts` — same envelope + `aiFetch`.
- `src/routes/index.tsx` — submit path branches on `content-type` + envelope; discards non-JSON error bodies; keeps prior HTML/version untouched; adds inline error card (Retry, Copy request ID); resets stage/abort correctly; never enters full-gen fallback on transient failure of a targeted patch.
- `src/routes/__root.tsx` — mount `BuilderErrorBoundary`.
- `src/routes/api/public/self-test.ts` — extend assertions to cover new invariants.

## Error contract (JSON only, `application/json`)

```ts
type AiErrorEnvelope = {
  ok: false;
  code:
    | "ai_rate_limited"       // 429
    | "ai_unauthorized"       // 401/403 or missing key
    | "ai_bad_request"        // 400 / validation
    | "ai_upstream_html"      // proxy/error HTML detected
    | "ai_upstream_malformed" // JSON parse / schema / truncated
    | "ai_upstream_empty"
    | "ai_upstream_5xx"       // 500/502/503/504
    | "ai_timeout"
    | "ai_cancelled"
    | "ai_circuit_open"
    | "ai_internal";
  message: string;   // sanitized, <= 240 chars
  retryable: boolean;
  requestId: string; // crypto.randomUUID
  stage: "plan" | "image" | "generate" | "patch" | "validate";
  retryAfterMs?: number;
};
```

Success remains the current streamed HTML body with `content-type: text/plain; charset=utf-8`. Clients that see anything else treat it as failure.

## Retry / timeout / breaker settings

- Attempt timeout: 45s per upstream fetch.
- Total budget: 90s across attempts.
- Retries: up to 2 (3 attempts total), only on `429`, `502`, `503`, `504`, `ECONNRESET`, `ai_upstream_html`, `ai_upstream_empty`.
- Backoff: `min(retryAfter, 500ms * 2^n) + jitter(0..250ms)`.
- Never retried: `ai_unauthorized`, `ai_bad_request`, `ai_cancelled`, validation failures, missing config.
- Circuit breaker per `provider/model`: opens after 4 transient failures in 30s window, cooldown 20s, half-open probes 1 request.

## Client submit path

- Read `content-type` before touching the body. Non-JSON error → drop body, show "Something went wrong upstream" with request ID.
- JSON envelope → render inline error card (message, Retry, Copy ID). Preserve original prompt and attachments in state.
- On any failure: `currentHtml`, `versions`, iframe `srcDoc`, chat context all untouched. Only a single terminal-log line + error card are appended (never the raw body).
- Duplicate-send guard: disable submit while `stage !== idle`; abort resets stage in `finally`.
- Targeted patch failure with `retryable: false` no longer escalates to full-generation fallback (per requirement 5). Full-gen fallback stays gated to patch-engine failures unrelated to AI transport.

## App shell boundary

`BuilderErrorBoundary` catches render errors in the builder tree only. Fallback shows "Builder hit an internal error", `Reload preview` (soft) and `Reset session` (hard) — no stack, no raw error text.

## Health endpoint

`GET /api/health` returns
```json
{
  "ok": true,
  "timestamp": "...",
  "routes": { "generate": true, "patch": true, "gallery": true },
  "providers": { "lovable_ai": true, "supabase": true },
  "breakers": [{ "key": "lovable/generate", "state": "closed", "failures": 0 }]
}
```
No secrets, no request counts, no user data. Publicly reachable (behind unlock gate is unnecessary — it exposes only booleans).

## Verification

- `bunx vitest run` — new suite must pass; existing self-test must still pass.
- `tsgo` typecheck.
- Playwright script under `/tmp/browser/` mocks `/api/generate` to return a Cloudflare 502 HTML page and asserts: current HTML unchanged, no new version, error card visible, request ID present, Retry works after mock flips to success.
- `invoke-server-function` hits `/api/health` and `/api/public/self-test`.

## Out of scope

- Prompt content, model catalog, image pipeline behavior, gallery, auth gate, styles.
- Persistent breaker state (in-memory per-worker is sufficient for the current single-region deploy).

## Technical notes

- Streamed HTML is buffered up to the first 4 KB before flushing to the client so we can reject an HTML proxy page that arrives with a 200. After first-chunk validation passes, we pass through unchanged (no added latency for good responses beyond the first frame).
- `sanitizeErrorMessage` strips tags, collapses whitespace, and truncates to 240 chars; already-existing `safe-storage.sanitizeErrorMessage` is extended and reused rather than duplicated.
- `AiError` extends `Error`, carries `code`/`stage`/`retryable`/`requestId`, and serializes via `toEnvelope()`.
- No changes to `patch-engine`, `commit-gate`, `runtime-bridge`, `version-history`, or `clean-export` — those already treat failed generations as no-ops once the transport layer stops handing them poison HTML.

Deliverable after approval: file diffs, test totals, mocked-502 Playwright evidence, health-endpoint snapshot, and any remaining risks.
