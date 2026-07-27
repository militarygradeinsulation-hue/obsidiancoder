// Sandbox-vs-live parity gate. Pure string analysis over two HTML strings
// (editor rendering + exact publish artifact). No provider calls, no DOM.
// Results are cached by (editorHash|publishHash) so re-clicking Go Live
// on an unchanged build never recomputes.

import { buildArtifact, publishHash } from "./publish-artifact";

export interface ParitySnapshot {
  chars: number;             // visible text char count
  headings: number;
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
  /** Absolute deltas keyed by field, e.g. { chars: -420 }. */
  deltas: Record<keyof ParitySnapshot, number>;
  /** Blocking reasons — publish MUST be repaired before Go Live. */
  blockers: string[];
  /** Non-blocking notices. */
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

const CACHE = new Map<string, ParityReport>();
const CACHE_MAX = 32;

function diff(a: ParitySnapshot, b: ParitySnapshot): Record<keyof ParitySnapshot, number> {
  const out = {} as Record<keyof ParitySnapshot, number>;
  (Object.keys(a) as (keyof ParitySnapshot)[]).forEach((k) => { out[k] = b[k] - a[k]; });
  return out;
}

/**
 * Compare the editor rendering against the exact publish artifact.
 * Both inputs must already be built strings — do NOT rebuild inside.
 */
export function checkParity(editorHtml: string, publishHtmlOrTheme: string | { themeCss?: string | null }): ParityReport {
  // Convenience overload: pass the raw source + theme and we'll construct
  // the publish string via buildArtifact.
  let publishStr: string;
  if (typeof publishHtmlOrTheme === "string") {
    publishStr = publishHtmlOrTheme;
  } else {
    publishStr = buildArtifact({ html: editorHtml, themeCss: publishHtmlOrTheme.themeCss ?? null, surface: "publish" }).html;
  }

  const cacheKey = `${publishHash(editorHtml)}|${publishHash(publishStr)}`;
  const cached = CACHE.get(cacheKey);
  if (cached) return cached;

  const editor = snapshot(editorHtml);
  const publish = snapshot(publishStr);
  const deltas = diff(editor, publish);

  const blockers: string[] = [];
  const warnings: string[] = [];

  const publishEmpty = publish.chars < 20;
  if (publishEmpty) blockers.push("publish artifact is empty or near-empty");

  // Meaningful content loss: >25% chars or >40% headings/sections dropped.
  if (editor.chars > 200 && deltas.chars < -Math.max(200, editor.chars * 0.25)) {
    blockers.push(`visible text dropped by ${-deltas.chars} chars (>25%)`);
  }
  if (editor.headings > 2 && deltas.headings < -Math.ceil(editor.headings * 0.4)) {
    blockers.push(`headings dropped from ${editor.headings} to ${publish.headings}`);
  }
  if (editor.buttons > 0 && publish.buttons === 0 && editor.buttons > 1) {
    blockers.push(`all ${editor.buttons} buttons disappeared in publish artifact`);
  }
  if (editor.forms > 0 && publish.forms === 0) {
    warnings.push(`forms dropped: ${editor.forms} → 0`);
  }
  // Script loss can be legit (bridge stripped) but a >50% drop in a build
  // that actually had scripts suggests destructive sanitization.
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
