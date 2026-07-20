// Context compactor — LOSSLESS. The only transformation we ever apply is
// swapping large embedded image data URLs for stable, uniquely-tagged
// placeholders so we don't ship megabytes of base64 to the model on every
// turn. CSS, JavaScript, HTML structure, prose, and the tail of the document
// are ALL preserved verbatim. Whatever placeholders we hand to the model must
// come back byte-for-byte identical, or we reject the model's output and keep
// the prior stable document.
//
// Round-trip contract:
//   compact(input)  -> { html, placeholders }
//   restoreAndVerify(modelOutput, placeholders)
//     -> { ok, html, restored, corrupted, unknown }
//   If ok === false, the caller MUST discard modelOutput and revert.

// A base64 data URL big enough to be worth swapping. Small inline icons stay
// as-is — the round-trip cost isn't worth it and it keeps output smaller.
const IMAGE_MIN_BYTES = 400;

// Matches a base64 data URL for any image-ish MIME type. We intentionally do
// NOT touch non-base64 (`data:...,` without ";base64,") or non-image types.
const DATA_URL_RE = /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=_-]+)/g;

// Placeholder token shape — deliberately impossible to occur naturally in HTML,
// CSS, JS, or user prose. Any partial fragment in model output = corruption.
const PLACEHOLDER_ID_RE = /^[a-f0-9]{10}$/;
const PLACEHOLDER_TOKEN_STRICT = /__OBS_IMG_ph_([a-f0-9]{10})_END__/g;
const PLACEHOLDER_MARKER_LOOSE = /__OBS_IMG_ph_/g;

// The full wrapped form as it appears in the compacted context.
const WRAPPED_PLACEHOLDER_RE = /data:(image\/[a-zA-Z0-9.+-]+);base64,__OBS_IMG_ph_([a-f0-9]{10})_END__/g;

export interface CompactResult {
  /** Compacted HTML with placeholders swapped in for large base64 images. */
  html: string;
  /**
   * Map from the FULL wrapped placeholder string
   * (`data:image/png;base64,__OBS_IMG_ph_XXXXXXXXXX_END__`) to the original
   * full base64 data URL. Callers pass this to `restoreAndVerify`.
   */
  placeholders: Record<string, string>;
  originalBytes: number;
  bytes: number;
  imagesReplaced: number;
}

function makePlaceholderId(seed: number): string {
  const rand =
    typeof globalThis.crypto?.getRandomValues === "function"
      ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(4)))
          .map((b) => b.toString(16).padStart(2, "0")).join("")
      : Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return `${(seed & 0xff).toString(16).padStart(2, "0")}${rand}`.slice(0, 10);
}

export function compactHtmlForContext(input: string): CompactResult {
  const placeholders: Record<string, string> = {};
  let count = 0;
  const html = input.replace(DATA_URL_RE, (match, mime: string, body: string) => {
    if (body.length < IMAGE_MIN_BYTES) return match;
    count += 1;
    // Guarantee ID uniqueness within one compaction — 40 bits of entropy is
    // plenty for a handful of images per turn, and we retry on collision just
    // in case the RNG surprises us.
    let id = makePlaceholderId(count);
    let wrapped = `data:${mime};base64,__OBS_IMG_ph_${id}_END__`;
    while (Object.prototype.hasOwnProperty.call(placeholders, wrapped)) {
      id = makePlaceholderId(count + Math.floor(Math.random() * 0xffff));
      wrapped = `data:${mime};base64,__OBS_IMG_ph_${id}_END__`;
    }
    placeholders[wrapped] = match;
    return wrapped;
  });
  return {
    html,
    placeholders,
    originalBytes: input.length,
    bytes: html.length,
    imagesReplaced: count,
  };
}

export interface RestoreResult {
  /** True iff every placeholder token that appeared in the output was a
   *  well-formed, previously-issued placeholder we could restore, AND no
   *  partial/mutated marker fragments were left in the output. */
  ok: boolean;
  html: string;
  /** Number of placeholders successfully substituted back to originals. */
  restored: number;
  /** Number of well-formed placeholder tokens present in the output but not
   *  issued by us (hallucinated) — always a hard reject. */
  unknown: number;
  /** Number of partial/mutated `__OBS_IMG_ph_...` fragments left over — the
   *  model corrupted a placeholder. Always a hard reject. */
  corrupted: number;
  /** Placeholders we issued that the model DROPPED (didn't return at all).
   *  Not counted as corruption — the model may have intentionally removed the
   *  image — but reported so the caller can decide. */
  dropped: number;
}

export function restoreAndVerify(
  output: string,
  placeholders: Record<string, string>,
): RestoreResult {
  let restored = 0;
  let unknown = 0;
  const seenIds = new Set<string>();

  // Pass 1: replace the FULL wrapped form we originally issued. This is the
  // only "safe" restoration — the surrounding `data:MIME;base64,` prefix
  // guarantees we're swapping inside an image src, not a random text run.
  const html = output.replace(WRAPPED_PLACEHOLDER_RE, (match, _mime, id: string) => {
    seenIds.add(id);
    const original = placeholders[match];
    if (original) {
      restored += 1;
      return original;
    }
    unknown += 1;
    return match; // keep as-is; caller will reject
  });

  // Pass 2: after restoration, no `__OBS_IMG_ph_` marker should remain. Any
  // leftover is a corrupted / mutated placeholder — reject.
  const corrupted = (html.match(PLACEHOLDER_MARKER_LOOSE) ?? []).length;

  // Also flag any well-formed token that appeared bare (outside a data URL) —
  // the strict regex catches those too and they'd be counted in `corrupted`
  // above, but we still want a defensive check.
  const strictBare = html.match(PLACEHOLDER_TOKEN_STRICT) ?? [];
  const bareCount = strictBare.length; // any well-formed bare token = corrupted usage
  const corruptedTotal = corrupted; // loose marker already includes bare + partial

  let dropped = 0;
  for (const wrapped of Object.keys(placeholders)) {
    const idMatch = wrapped.match(/__OBS_IMG_ph_([a-f0-9]{10})_END__/);
    const id = idMatch?.[1];
    if (id && !seenIds.has(id)) dropped += 1;
  }

  const ok = unknown === 0 && corruptedTotal === 0 && bareCount === 0;
  return { ok, html, restored, unknown, corrupted: corruptedTotal, dropped };
}

// Small helper for external callers that just want the id regex.
export function isPlaceholderId(s: string): boolean {
  return PLACEHOLDER_ID_RE.test(s);
}
