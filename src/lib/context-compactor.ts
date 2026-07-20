// Context compactor — shrinks HTML sent back to the AI so we stay far under
// the model's token limit and start streaming faster. Pure; no side effects.
//
// - Rewrites large base64 data URLs to a placeholder so we don't re-ship the
//   full binary on every turn (a single 512x512 PNG can be ~700KB of base64).
// - Truncates giant inline <style> / <script> blocks (kept fully client-side —
//   the AI only needs the shape, not every byte).
// - Caps the final string so a runaway document can never blow the budget.

const DATA_URL_BASE64_RE = /data:([^;,\s"']+);base64,([A-Za-z0-9+/=_-]+)/g;
const HARD_CAP_BYTES = 60_000;
const BLOCK_CAP_BYTES = 8_000;

export interface CompactResult {
  html: string;
  originalBytes: number;
  bytes: number;
  dataUrlsStripped: number;
  blocksTruncated: number;
  cappedAtEnd: boolean;
}

export function compactHtmlForContext(input: string, opts?: { maxBytes?: number }): CompactResult {
  const originalBytes = input.length;
  const maxBytes = Math.max(4_000, opts?.maxBytes ?? HARD_CAP_BYTES);
  let dataUrlsStripped = 0;
  let blocksTruncated = 0;

  let out = input.replace(DATA_URL_BASE64_RE, (_m, mime, b64) => {
    if (b64.length < 200) return `data:${mime};base64,${b64}`;
    dataUrlsStripped += 1;
    return `data:${mime};base64,PLACEHOLDER_${b64.length}B`;
  });

  out = out.replace(/<(style|script)([^>]*)>([\s\S]*?)<\/\1>/gi, (_m, tag, attrs, body) => {
    if (body.length <= BLOCK_CAP_BYTES) return `<${tag}${attrs}>${body}</${tag}>`;
    blocksTruncated += 1;
    return `<${tag}${attrs}>${body.slice(0, BLOCK_CAP_BYTES)}\n/* …truncated ${body.length - BLOCK_CAP_BYTES}B for context… */\n</${tag}>`;
  });

  let cappedAtEnd = false;
  if (out.length > maxBytes) {
    cappedAtEnd = true;
    out = out.slice(0, maxBytes) + `\n<!-- …context truncated at ${maxBytes}B (was ${out.length}B) -->`;
  }

  return { html: out, originalBytes, bytes: out.length, dataUrlsStripped, blocksTruncated, cappedAtEnd };
}
