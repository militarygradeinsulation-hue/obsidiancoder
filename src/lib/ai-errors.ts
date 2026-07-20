// Shared AI error contract. Used by /api/generate, /api/patch, and any
// route that proxies an upstream AI provider. Errors are ALWAYS returned as
// JSON with this shape — never as raw upstream HTML, never as a bare string.

import { sanitizeErrorMessage } from "./safe-storage";

export type AiErrorCode =
  | "ai_rate_limited"       // 429
  | "ai_unauthorized"       // 401/403 or missing key
  | "ai_bad_request"        // 400 / validation
  | "ai_upstream_html"      // proxy/error HTML detected (even on 200)
  | "ai_upstream_malformed" // JSON parse / schema / truncated body
  | "ai_upstream_empty"     // empty body
  | "ai_upstream_5xx"       // 500/502/503/504
  | "ai_timeout"
  | "ai_cancelled"
  | "ai_circuit_open"
  | "billing_settlement_error" // usage_finalize/usage_refund DB error after provider work
  | "ai_internal";

export type AiErrorStage = "plan" | "image" | "generate" | "patch" | "validate";

export interface AiErrorEnvelope {
  ok: false;
  code: AiErrorCode;
  message: string;   // sanitized, <= 240 chars
  retryable: boolean;
  requestId: string;
  stage: AiErrorStage;
  retryAfterMs?: number;
}

const RETRYABLE: Record<AiErrorCode, boolean> = {
  ai_rate_limited: true,
  ai_unauthorized: false,
  ai_bad_request: false,
  ai_upstream_html: true,
  ai_upstream_malformed: false,
  ai_upstream_empty: true,
  ai_upstream_5xx: true,
  ai_timeout: true,
  ai_cancelled: false,
  ai_circuit_open: true,
  ai_internal: false,
};

const DEFAULT_MESSAGES: Record<AiErrorCode, string> = {
  ai_rate_limited: "Rate limit reached. Try again in a moment.",
  ai_unauthorized: "AI provider is not authorised for this workspace.",
  ai_bad_request: "The request was rejected as invalid.",
  ai_upstream_html: "Upstream returned a proxy error page. The last stable build is still in place.",
  ai_upstream_malformed: "Upstream response was malformed and was discarded.",
  ai_upstream_empty: "Upstream returned an empty response.",
  ai_upstream_5xx: "Upstream provider is temporarily unavailable.",
  ai_timeout: "The request took too long and was cancelled.",
  ai_cancelled: "Cancelled.",
  ai_circuit_open: "AI provider is temporarily cooling down after repeated failures.",
  ai_internal: "Something went wrong on our side.",
};

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly stage: AiErrorStage;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(opts: {
    code: AiErrorCode;
    stage: AiErrorStage;
    requestId: string;
    message?: string;
    retryAfterMs?: number;
    retryable?: boolean;
  }) {
    const message =
      sanitizeErrorMessage(opts.message ?? DEFAULT_MESSAGES[opts.code], DEFAULT_MESSAGES[opts.code]);
    super(message);
    this.code = opts.code;
    this.stage = opts.stage;
    this.requestId = opts.requestId;
    this.retryable = opts.retryable ?? RETRYABLE[opts.code];
    this.retryAfterMs = opts.retryAfterMs;
  }

  toEnvelope(): AiErrorEnvelope {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      requestId: this.requestId,
      stage: this.stage,
      retryAfterMs: this.retryAfterMs,
    };
  }

  toResponse(): Response {
    const status = statusForCode(this.code);
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Request-Id": this.requestId,
    };
    if (this.retryAfterMs && this.retryAfterMs > 0) {
      headers["Retry-After"] = String(Math.max(1, Math.round(this.retryAfterMs / 1000)));
    }
    return new Response(JSON.stringify(this.toEnvelope()), { status, headers });
  }
}

export function statusForCode(code: AiErrorCode): number {
  switch (code) {
    case "ai_rate_limited": return 429;
    case "ai_unauthorized": return 401;
    case "ai_bad_request": return 400;
    case "ai_circuit_open": return 503;
    case "ai_timeout": return 504;
    case "ai_cancelled": return 499;
    case "ai_upstream_html":
    case "ai_upstream_malformed":
    case "ai_upstream_empty":
    case "ai_upstream_5xx":
      return 502;
    case "ai_internal":
    default:
      return 500;
  }
}

export function newRequestId(): string {
  try {
    // globalThis.crypto is available on Workers and modern browsers.
    return globalThis.crypto?.randomUUID?.() ?? fallbackId();
  } catch {
    return fallbackId();
  }
}

function fallbackId(): string {
  return `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Type guard for the envelope on the client. */
export function isAiErrorEnvelope(v: unknown): v is AiErrorEnvelope {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.ok === false && typeof o.code === "string" && typeof o.message === "string" && typeof o.requestId === "string";
}

/** Never let raw upstream text bleed into user-facing surfaces. */
export function sanitizeUpstreamMessage(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  // Strip tags first (proxy pages are HTML), then delegate to the shared sanitizer.
  const noTags = raw.replace(/<[^>]{0,400}>/g, " ").replace(/&nbsp;/gi, " ");
  return sanitizeErrorMessage(noTags, fallback);
}
