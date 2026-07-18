// Upstream response guard. Rejects HTML proxy/error pages (even on status 200),
// empty bodies, oversize bodies, and truncated JSON — so upstream content
// can never be interpreted as generated code.

const MAX_BYTES = 8 * 1024 * 1024; // 8MB hard cap for buffered upstream reads
const HTML_SNIFF_BYTES = 4096;

/** Detect proxy/error HTML by content-type OR a leading HTML signature. */
export function looksLikeHtml(contentType: string | null | undefined, sample: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/html") || ct.includes("application/xhtml+xml")) return true;
  const head = sample.slice(0, 512).toLowerCase().trimStart();
  return (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.startsWith("<head") ||
    /^<\?xml[^>]*>\s*<html/.test(head)
  );
}

/** Signatures of known error/proxy pages that sometimes ship with status 200. */
const PROXY_SIGNATURES = [
  /cloudflare/i,
  /cf-ray/i,
  /error\s+1020/i,
  /error\s+5\d\d/i,
  /bad\s+gateway/i,
  /gateway\s+time-?out/i,
  /service\s+unavailable/i,
  /\bnginx\b/i,
  /just a moment/i,
  /attention required/i,
  /request rejected/i,
];

export function looksLikeProxyError(sample: string): boolean {
  const head = sample.slice(0, 4096);
  return PROXY_SIGNATURES.some((rx) => rx.test(head));
}

export type UpstreamGuardResult =
  | { ok: true; text: string; contentType: string | null }
  | {
      ok: false;
      reason:
        | "empty"
        | "oversize"
        | "html_body"
        | "proxy_error"
        | "non_ok_status"
        | "read_error"
        | "unexpected_content_type";
      status: number;
      contentType: string | null;
      sample: string;
    };

/**
 * Fully buffer an upstream JSON/text response and validate it before hand-off.
 * Never trusts content-type alone: also sniffs the first bytes for HTML shapes.
 *
 * @param expected — content-type substring the caller expects (default: "application/json")
 */
export async function readGuarded(
  res: Response,
  opts: { expected?: string; maxBytes?: number } = {},
): Promise<UpstreamGuardResult> {
  const expected = (opts.expected ?? "application/json").toLowerCase();
  const maxBytes = Math.min(opts.maxBytes ?? MAX_BYTES, MAX_BYTES);
  const ct = res.headers.get("content-type");
  let text: string;
  try {
    text = await res.text();
  } catch {
    return { ok: false, reason: "read_error", status: res.status, contentType: ct, sample: "" };
  }

  if (text.length > maxBytes) {
    return { ok: false, reason: "oversize", status: res.status, contentType: ct, sample: text.slice(0, 200) };
  }

  const sample = text.slice(0, HTML_SNIFF_BYTES);

  // Sniff HTML shape BEFORE trusting the status.
  if (looksLikeHtml(ct, sample)) {
    return { ok: false, reason: "html_body", status: res.status, contentType: ct, sample };
  }
  if (looksLikeProxyError(sample)) {
    return { ok: false, reason: "proxy_error", status: res.status, contentType: ct, sample };
  }

  if (!res.ok) {
    return { ok: false, reason: "non_ok_status", status: res.status, contentType: ct, sample };
  }

  if (!text.trim()) {
    return { ok: false, reason: "empty", status: res.status, contentType: ct, sample: "" };
  }

  if (expected && ct && !ct.toLowerCase().includes(expected)) {
    // Not fatal for some providers, but callers expecting JSON should treat as malformed.
    return { ok: false, reason: "unexpected_content_type", status: res.status, contentType: ct, sample };
  }

  return { ok: true, text, contentType: ct };
}

/**
 * Validate the first buffered chunk of a streaming SSE response. Used to reject
 * Cloudflare-style HTML pages that arrive with a 200 + text/event-stream lie.
 */
export function firstChunkLooksBad(chunk: string, contentType: string | null): {
  bad: boolean;
  reason?: "html_body" | "proxy_error" | "unexpected_content_type";
} {
  if (!chunk) return { bad: false };
  if (looksLikeHtml(contentType, chunk)) return { bad: true, reason: "html_body" };
  if (looksLikeProxyError(chunk)) return { bad: true, reason: "proxy_error" };
  const ct = (contentType ?? "").toLowerCase();
  if (ct && !(ct.includes("text/event-stream") || ct.includes("text/plain") || ct.includes("application/json"))) {
    return { bad: true, reason: "unexpected_content_type" };
  }
  return { bad: false };
}
