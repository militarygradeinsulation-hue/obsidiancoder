// Image slots — the contract between the generation prompt and the
// post-generation image fill.
//
// Why this exists: real generated images were technically wired into
// generate.ts, but only BEFORE the HTML was written, inside a hard 4-second
// enrichment budget. Image models take 5-20s, so in practice the phase never
// finished: zero generate_image operations across 79 real builds in 30 days,
// and 47 of the 60 most recent builds had no <img> at all.
//
// New contract: the model writes the page immediately and marks the 1-3
// images that matter with a data-obs-image="<visual prompt>" attribute and a
// lightweight placeholder src. After the page is on screen, a separate fill
// request generates those images and swaps the real URLs in. The user sees
// the build instantly; the photography lands seconds later.

export const IMAGE_SLOT_ATTR = "data-obs-image";
export const FILLED_ATTR = "data-obs-image-filled";

export interface ImageSlot {
  /** The full original <img ...> tag, used as the replacement key. */
  tag: string;
  /** The visual prompt the model wrote for this slot. */
  prompt: string;
}

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SLOT_ATTR_RE = /\bdata-obs-image\s*=\s*("([^"]*)"|'([^']*)')/i;

function decodeAttr(v: string): string {
  return v
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Find unfilled image slots, in document order, de-duplicated by tag.
 * Tags already carrying data-obs-image-filled are skipped so a refill never
 * regenerates (and re-bills) an image that already landed.
 */
export function extractImageSlots(html: string, limit = 3): ImageSlot[] {
  if (typeof html !== "string" || !html) return [];
  const out: ImageSlot[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(IMG_TAG_RE)) {
    const tag = m[0];
    if (seen.has(tag)) continue;
    if (tag.includes(FILLED_ATTR)) continue;
    const a = SLOT_ATTR_RE.exec(tag);
    if (!a) continue;
    const prompt = decodeAttr((a[2] ?? a[3] ?? "").trim());
    if (prompt.length < 4) continue;
    seen.add(tag);
    out.push({ tag, prompt: prompt.slice(0, 600) });
    if (out.length >= limit) break;
  }
  return out;
}

/** Only https URLs from our own storage are ever written back into a build. */
export function isSafeImageUrl(url: string): boolean {
  if (typeof url !== "string") return false;
  if (!/^https:\/\/[a-z0-9.-]+\/storage\/v1\/object\/public\/build-images\/[A-Za-z0-9._/-]+$/i.test(url)) return false;
  return !/["'<>\s]/.test(url);
}

/**
 * Replace each filled slot's src with its real URL and mark it filled.
 * Any URL failing isSafeImageUrl is ignored, leaving that slot's
 * placeholder untouched rather than injecting anything unexpected.
 */
export function applyImageUrls(html: string, filled: Array<{ tag: string; url: string }>): string {
  let out = html;
  for (const { tag, url } of filled) {
    if (!isSafeImageUrl(url)) continue;
    let next: string;
    if (/\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.test(tag)) {
      next = tag.replace(/\ssrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, ` src="${url}"`);
    } else {
      next = tag.replace(/^<img\b/i, `<img src="${url}"`);
    }
    next = next.replace(/\s*\/?>$/, (end) => ` ${FILLED_ATTR}="1"${end.trim() === "/>" ? " />" : ">"}`);
    out = out.split(tag).join(next);
  }
  return out;
}

/** Prompt suffix that keeps every generated image on the 21st.dev-grade bar. */
export function finishImagePrompt(slotPrompt: string): string {
  return `${slotPrompt.trim()}. Premium, high-end commercial quality, clean modern composition, natural lighting, sharp focus. No text, no letters, no logos, no watermark, no UI elements.`;
}
