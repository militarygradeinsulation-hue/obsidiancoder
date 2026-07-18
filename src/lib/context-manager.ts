// Context manager — extracts compact, relevant snippets from a large HTML
// document so the AI patch route can operate on far less than the whole file.
// Pure regex; never evaluates scripts.

const MAX_SNIPPET = 4000;

export type Snippet = {
  reason: string;
  text: string;
};

/** Pull snippets around the first occurrence of each of the given anchors. */
export function snippetsAround(html: string, anchors: string[], radius = 400): Snippet[] {
  const out: Snippet[] = [];
  const seen = new Set<string>();
  for (const anchor of anchors) {
    if (!anchor || seen.has(anchor)) continue;
    seen.add(anchor);
    const idx = html.indexOf(anchor);
    if (idx === -1) continue;
    const start = Math.max(0, idx - radius);
    const end = Math.min(html.length, idx + anchor.length + radius);
    out.push({ reason: `context around "${anchor.slice(0, 40)}"`, text: html.slice(start, end) });
  }
  return out;
}

/** Naïvely extract candidate anchors from a natural-language prompt. */
export function anchorsFromPrompt(prompt: string): string[] {
  const anchors = new Set<string>();
  const q = prompt.match(/["“”'‘’]([^"“”'‘’]{2,60})["“”'‘’]/g) ?? [];
  for (const m of q) anchors.add(m.replace(/^["“”'‘’]|["“”'‘’]$/g, ""));
  const words = prompt.match(/#[A-Za-z_][A-Za-z0-9_-]{2,40}/g) ?? [];
  for (const w of words) anchors.add(w);
  return Array.from(anchors).slice(0, 8);
}

/** De-duplicate and truncate snippets to a hard character budget. */
export function budgetSnippets(snips: Snippet[], budget = MAX_SNIPPET): Snippet[] {
  const dedup: Snippet[] = [];
  const seen = new Set<string>();
  for (const s of snips) {
    const k = s.text.slice(0, 200);
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(s);
  }
  let used = 0;
  const out: Snippet[] = [];
  for (const s of dedup) {
    const remaining = budget - used;
    if (remaining <= 200) break;
    const text = s.text.length > remaining ? s.text.slice(0, remaining) + "…" : s.text;
    out.push({ reason: s.reason, text });
    used += text.length;
  }
  return out;
}

export function snippetsToPrompt(snips: Snippet[]): string {
  if (!snips.length) return "";
  return snips
    .map((s, i) => `--- snippet ${i + 1} (${s.reason}) ---\n${s.text}`)
    .join("\n\n");
}
