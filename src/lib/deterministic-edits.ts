// Deterministic edit engine — mutates the current HTML string for safe,
// well-scoped instructions without calling an AI model.
//
// Every editor returns { ok: true, html, summary, changes } on success or
// { ok: false, reason } when the instruction doesn't match a safe pattern.
// The caller falls back to AI generation on { ok: false }.

export type DeterministicResult =
  | { ok: true; html: string; summary: string; changes: number }
  | { ok: false; reason: string };

const CSS_COLORS: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ef4444", green: "#22c55e",
  blue: "#3b82f6", yellow: "#eab308", orange: "#f97316", purple: "#a855f7",
  pink: "#ec4899", gray: "#6b7280", grey: "#6b7280", gold: "#F4A125",
  amber: "#f59e0b", teal: "#14b8a6", cyan: "#06b6d4", indigo: "#6366f1",
  slate: "#64748b", transparent: "transparent",
};

function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function normalizeColor(word: string): string | null {
  const w = word.trim().toLowerCase();
  if (CSS_COLORS[w]) return CSS_COLORS[w];
  if (/^#[0-9a-f]{3,8}$/i.test(w)) return w;
  if (/^rgb|^hsl|^oklch/i.test(word)) return word.trim();
  return null;
}

// ---------- 1. Explicit text / number / price replacement ----------

const REPLACE_PATTERNS: RegExp[] = [
  /^\s*change\s+["']?(.+?)["']?\s+to\s+["']?(.+?)["']?\s*\.?$/i,
  /^\s*replace\s+["']?(.+?)["']?\s+with\s+["']?(.+?)["']?\s*\.?$/i,
  /^\s*rename\s+["']?(.+?)["']?\s+to\s+["']?(.+?)["']?\s*\.?$/i,
  /^\s*set\s+["']?(.+?)["']?\s+to\s+["']?(.+?)["']?\s*\.?$/i,
];

export function tryTextReplacement(prompt: string, html: string): DeterministicResult {
  for (const rx of REPLACE_PATTERNS) {
    const m = prompt.match(rx);
    if (!m) continue;
    const from = m[1].trim();
    const to = m[2].trim();
    if (!from || from.length < 1) continue;
    if (!html.includes(from)) return { ok: false, reason: `"${from}" not found in current document.` };
    // Avoid touching tag names / attribute names — only replace textual occurrences.
    const rxAll = new RegExp(escapeRegExp(from), "g");
    const count = (html.match(rxAll) ?? []).length;
    const next = html.replace(rxAll, to);
    return { ok: true, html: next, summary: `Replaced "${from}" → "${to}" (${count} occurrence${count === 1 ? "" : "s"}).`, changes: count };
  }
  return { ok: false, reason: "No explicit replace pattern." };
}

// ---------- 2. href / src replacement when unique ----------

export function tryHrefReplacement(prompt: string, html: string): DeterministicResult {
  const m = prompt.match(/(?:change|set|update)\s+(?:the\s+)?(?:link|href|url)(?:\s+of\s+["'](.+?)["'])?\s+to\s+["']?(\S+?)["']?\s*\.?$/i);
  if (!m) return { ok: false, reason: "No href change pattern." };
  const label = m[1]?.trim();
  const to = m[2].trim();
  if (label) {
    const rx = new RegExp(`(<a\\b[^>]*href=)"([^"]*)"([^>]*>\\s*${escapeRegExp(label)})`, "i");
    if (!rx.test(html)) return { ok: false, reason: `No <a> containing "${label}".` };
    return { ok: true, html: html.replace(rx, `$1"${to}"$3`), summary: `Updated link on "${label}" → ${to}.`, changes: 1 };
  }
  const anchors = html.match(/<a\b[^>]*href="[^"]*"/gi) ?? [];
  if (anchors.length !== 1) return { ok: false, reason: "Multiple links present — specify which one." };
  return { ok: true, html: html.replace(/(<a\b[^>]*href=)"[^"]*"/i, `$1"${to}"`), summary: `Updated the link → ${to}.`, changes: 1 };
}

export function tryImageSrcReplacement(prompt: string, html: string): DeterministicResult {
  const m = prompt.match(/(?:change|set|replace|update)\s+(?:the\s+)?(?:image|img|picture|photo)(?:\s+["'](.+?)["'])?\s+(?:to|with)\s+["']?(\S+?)["']?\s*\.?$/i);
  if (!m) return { ok: false, reason: "No image change pattern." };
  const alt = m[1]?.trim();
  const to = m[2].trim();
  if (alt) {
    const rx = new RegExp(`(<img\\b[^>]*?)src="([^"]*)"([^>]*alt="${escapeRegExp(alt)}")`, "i");
    if (!rx.test(html)) return { ok: false, reason: `No <img> with alt="${alt}".` };
    return { ok: true, html: html.replace(rx, `$1src="${to}"$3`), summary: `Updated image "${alt}".`, changes: 1 };
  }
  const imgs = html.match(/<img\b[^>]*src="[^"]*"/gi) ?? [];
  if (imgs.length !== 1) return { ok: false, reason: "Multiple images present — specify which one." };
  return { ok: true, html: html.replace(/(<img\b[^>]*?)src="[^"]*"/i, `$1src="${to}"`), summary: `Updated the image → ${to}.`, changes: 1 };
}

// ---------- 3. CSS property changes (body-scoped or targeted tag) ----------

const SIZE_STEPS = { larger: 1.15, bigger: 1.2, smaller: 0.87 } as const;

// Inject or update a style rule inside the document's <style> tag.
function upsertStyleRule(html: string, selector: string, decl: string, summary: string): DeterministicResult {
  const rule = `${selector} { ${decl} }`;
  if (/<style[^>]*>/i.test(html)) {
    return { ok: true, html: html.replace(/<\/style>/i, `\n${rule}\n</style>`), summary, changes: 1 };
  }
  if (/<head[^>]*>/i.test(html)) {
    return { ok: true, html: html.replace(/<head[^>]*>/i, (m) => `${m}\n<style>${rule}</style>`), summary, changes: 1 };
  }
  return { ok: true, html: html.replace(/<html[^>]*>/i, (m) => `${m}\n<head><style>${rule}</style></head>`), summary, changes: 1 };
}

function targetSelector(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/\bh1|heading|title\b/.test(p)) return "h1";
  if (/\bh2\b/.test(p)) return "h2";
  if (/\bbutton|cta\b/.test(p)) return "button, .button, .btn";
  if (/\blink\b/.test(p)) return "a";
  if (/\bnav|header\b/.test(p)) return "header, nav";
  if (/\bfooter\b/.test(p)) return "footer";
  if (/\bcard\b/.test(p)) return ".card";
  if (/\bbody|page|background\b/.test(p)) return "body";
  return "body";
}

export function tryCssChange(prompt: string, html: string): DeterministicResult {
  const sel = targetSelector(prompt);

  // Color / background
  const colorM = prompt.match(/(?:change|set|make)\s+(?:the\s+)?(?:(background|bg|text|color|colour))?\s*(?:of\s+.+?)?\s*(?:to\s+)?["']?(#[0-9a-f]{3,8}|[a-z]+|rgb\([^)]+\)|hsl\([^)]+\))["']?\s*\.?$/i);
  if (colorM) {
    const kind = (colorM[1] || "").toLowerCase();
    const colorName = colorM[2];
    const color = normalizeColor(colorName);
    if (color) {
      if (kind === "background" || kind === "bg") return upsertStyleRule(html, sel, `background-color: ${color} !important;`, `Set ${sel} background to ${color}.`);
      if (kind === "text" || kind === "color" || kind === "colour" || kind === "") return upsertStyleRule(html, sel, `color: ${color} !important;`, `Set ${sel} color to ${color}.`);
    }
  }

  // Font size steps
  const sizeM = prompt.match(/\b(larger|bigger|smaller)\b/i);
  if (sizeM && /\b(heading|title|h1|h2|h3|font|text|size)\b/i.test(prompt)) {
    const factor = SIZE_STEPS[sizeM[1].toLowerCase() as keyof typeof SIZE_STEPS];
    return upsertStyleRule(html, sel, `font-size: calc(1em * ${factor}) !important;`, `Scaled ${sel} font-size ×${factor}.`);
  }
  const pxM = prompt.match(/\b(font\s*size|text\s*size|size)\s*(?:to\s+)?(\d{1,3})\s*px/i);
  if (pxM) return upsertStyleRule(html, sel, `font-size: ${pxM[2]}px !important;`, `Set ${sel} font-size to ${pxM[2]}px.`);

  // Radius / rounded
  const radM = prompt.match(/\b(?:border[- ]?radius|rounded(?:ness)?|corners?)\s*(?:to\s+)?(\d{1,3})\s*px/i);
  if (radM) return upsertStyleRule(html, sel, `border-radius: ${radM[1]}px !important;`, `Set ${sel} border-radius to ${radM[1]}px.`);
  if (/\bmake\s+.+\s+(rounded|pill)\b/i.test(prompt)) return upsertStyleRule(html, sel, `border-radius: 9999px !important;`, `Rounded ${sel}.`);

  // Padding / margin
  const padM = prompt.match(/\b(padding|margin)\s*(?:to\s+)?(\d{1,3})\s*px/i);
  if (padM) return upsertStyleRule(html, sel, `${padM[1].toLowerCase()}: ${padM[2]}px !important;`, `Set ${sel} ${padM[1]} to ${padM[2]}px.`);

  // Width / height
  const dimM = prompt.match(/\b(width|height)\s*(?:to\s+)?(\d{1,4})\s*(px|%)?/i);
  if (dimM) {
    const unit = dimM[3] || "px";
    return upsertStyleRule(html, sel, `${dimM[1].toLowerCase()}: ${dimM[2]}${unit} !important;`, `Set ${sel} ${dimM[1]} to ${dimM[2]}${unit}.`);
  }

  // Alignment
  if (/\bcent(er|re)\b/i.test(prompt) && /\btext|heading|title|h1|content\b/i.test(prompt)) {
    return upsertStyleRule(html, sel, `text-align: center !important;`, `Centered ${sel} text.`);
  }
  if (/\balign\s+left\b/i.test(prompt)) return upsertStyleRule(html, sel, `text-align: left !important;`, `Left-aligned ${sel}.`);
  if (/\balign\s+right\b/i.test(prompt)) return upsertStyleRule(html, sel, `text-align: right !important;`, `Right-aligned ${sel}.`);

  // Show/hide
  if (/\bhide\b/i.test(prompt)) return upsertStyleRule(html, sel, `display: none !important;`, `Hid ${sel}.`);
  if (/\bshow\b/i.test(prompt) && /\b(footer|header|nav|sidebar|button|card)\b/i.test(prompt)) {
    return upsertStyleRule(html, sel, `display: initial !important; visibility: visible !important;`, `Showed ${sel}.`);
  }

  return { ok: false, reason: "No matching CSS pattern." };
}

// ---------- Orchestrator ----------

export function tryDeterministicEdit(prompt: string, html: string): DeterministicResult {
  if (!html || html.length < 20) return { ok: false, reason: "No current document to edit." };
  const attempts = [tryTextReplacement, tryHrefReplacement, tryImageSrcReplacement, tryCssChange];
  const failures: string[] = [];
  for (const fn of attempts) {
    const r = fn(prompt, html);
    if (r.ok) return r;
    failures.push(r.reason);
  }
  return { ok: false, reason: failures.join(" ") };
}
