// Sandbox-vs-live parity gate. Pure string analysis over two HTML strings
// (bridge-free render artifact + exact publish artifact). No provider
// calls, no DOM. Results are cached by a hash that covers both strings.

import { buildArtifact } from "./publish-artifact";

export interface ParitySnapshot {
  chars: number;
  headings: number;
  sections: number;
  buttons: number;
  links: number;
  forms: number;
  inputs: number;
  tables: number;
  images: number;
  ids: number;
  scripts: number;
}

export interface ParityReport {
  editor: ParitySnapshot;
  publish: ParitySnapshot;
  publishEmpty: boolean;
  deltas: Record<keyof ParitySnapshot, number>;
  blockers: string[];
  warnings: string[];
  ok: boolean;
  cacheKey: string;
}

function countMatches(html: string, rx: RegExp): number {
  rx.lastIndex = 0;
  let n = 0;
  while (rx.exec(html)) n++;
  return n;
}

function visibleChars(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

export function snapshot(html: string): ParitySnapshot {
  return {
    chars: visibleChars(html),
    headings: countMatches(html, /<h[1-6]\b/gi),
    sections: countMatches(html, /<(?:section|article|main|nav|header|footer|aside)\b/gi),
    buttons: countMatches(html, /<button\b/gi),
    links: countMatches(html, /<a\b[^>]*\bhref=/gi),
    forms: countMatches(html, /<form\b/gi),
    inputs: countMatches(html, /<(?:input|select|textarea)\b/gi),
    tables: countMatches(html, /<table\b/gi),
    images: countMatches(html, /<img\b/gi),
    ids: countMatches(html, /\bid\s*=/gi),
    scripts: countMatches(html, /<script\b/gi),
  };
}

// Independent hash — never call publishHash here, because publishHash
// re-runs the whole artifact pipeline. Parity is meant to compare two
// already-built strings.
function fastHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

const CACHE = new Map<string, ParityReport>();
const CACHE_MAX = 32;

function diff(a: ParitySnapshot, b: ParitySnapshot): Record<keyof ParitySnapshot, number> {
  const out = {} as Record<keyof ParitySnapshot, number>;
  (Object.keys(a) as (keyof ParitySnapshot)[]).forEach((k) => { out[k] = b[k] - a[k]; });
  return out;
}

/**
 * Compare a bridge-free render artifact against the exact publish artifact.
 * Both inputs must already be built strings — do NOT rebuild inside.
 *
 * If the caller passes { themeCss, themeName } as the second argument, we
 * synthesise the publish string via buildArtifact({ surface: "publish" })
 * for convenience.
 */
export function checkParity(
  renderHtml: string,
  publishHtmlOrTheme: string | { themeCss?: string | null; themeName?: string | null },
): ParityReport {
  let publishStr: string;
  if (typeof publishHtmlOrTheme === "string") {
    publishStr = publishHtmlOrTheme;
  } else {
    publishStr = buildArtifact({
      html: renderHtml,
      themeCss: publishHtmlOrTheme.themeCss ?? null,
      themeName: publishHtmlOrTheme.themeName ?? null,
      surface: "publish",
    }).html;
  }

  const cacheKey = `${fastHash(renderHtml)}|${fastHash(publishStr)}`;
  const cached = CACHE.get(cacheKey);
  if (cached) return cached;

  const editor = snapshot(renderHtml);
  const publish = snapshot(publishStr);
  const deltas = diff(editor, publish);

  const blockers: string[] = [];
  const warnings: string[] = [];

  const publishEmpty = publish.chars < 20;
  if (publishEmpty) blockers.push("publish artifact is empty or near-empty");

  if (editor.chars > 200 && deltas.chars < -Math.max(200, editor.chars * 0.25)) {
    blockers.push(`visible text dropped by ${-deltas.chars} chars (>25%)`);
  }
  if (editor.headings > 2 && deltas.headings < -Math.ceil(editor.headings * 0.4)) {
    blockers.push(`headings dropped from ${editor.headings} to ${publish.headings}`);
  }
  if (editor.sections > 2 && deltas.sections < -Math.ceil(editor.sections * 0.4)) {
    blockers.push(`sections dropped from ${editor.sections} to ${publish.sections}`);
  }
  if (editor.buttons > 0 && publish.buttons === 0 && editor.buttons > 1) {
    blockers.push(`all ${editor.buttons} buttons disappeared in publish artifact`);
  }
  if (editor.forms > 0 && publish.forms === 0) {
    warnings.push(`forms dropped: ${editor.forms} → 0`);
  }
  if (editor.scripts > 2 && publish.scripts <= Math.floor(editor.scripts / 2)) {
    blockers.push(`scripts dropped from ${editor.scripts} to ${publish.scripts} (possible content loss)`);
  }
  if (editor.images > 0 && publish.images === 0) warnings.push("all images missing from publish artifact");

  const report: ParityReport = {
    editor,
    publish,
    publishEmpty,
    deltas,
    blockers,
    warnings,
    ok: blockers.length === 0 && !publishEmpty,
    cacheKey,
  };

  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(cacheKey, report);
  return report;
}

export function invalidateParityCache(): void { CACHE.clear(); }
