// Clean-export sanitizer.
//
// Historical scope: neutralize preview-only instrumentation and navigation
// that would leak back into the Obsidian creator surface (or leave the
// document). This module now delegates navigation policy to
// `navigation-repair.ts`, which is resource-safe: it only touches
// navigation-eligible tags (<a>, <area>, <form>, <button>, <input>) and
// navigation *expressions* inside <script> bodies. Resource-loading
// attributes (<link href>, <script src>, <img src/srcset>, <source
// srcset>, media assets, CSS url()) are never rewritten.
//
// Exports remain backward compatible: callers of stripCreatorLinks /
// containsCreatorLinks / sanitizeForExport still work.

import { repairNavigation } from "./navigation-repair";

const PREVIEW_MARKERS = [
  /<script>\s*\(function\(\)\{[\s\S]*?obsidian\.runtime[\s\S]*?\}\)\(\);\s*<\/script>/g,
  /<script data-obsidian-preview=(?:"[^"]*"|'[^']*')[\s\S]*?<\/script>/g,
  /<script>\s*\(function\(\)\{[\s\S]*?obsidian\.(?:inspector|flow)[\s\S]*?\}\)\(\);\s*<\/script>/g,
];

export function stripPreviewOnly(html: string): string {
  if (!html) return html;
  let out = html;
  for (const rx of PREVIEW_MARKERS) out = out.replace(rx, "");
  return out;
}

export function containsPreviewOnly(html: string): boolean {
  return PREVIEW_MARKERS.some((rx) => { rx.lastIndex = 0; return rx.test(html); });
}

/**
 * True if `target` is anything other than an allowed in-page anchor.
 * Kept for backward compatibility — the semantic is "target that violates
 * the internal-only navigation policy". Resource URLs are NOT navigation
 * targets, so this function must never be applied to <link href>,
 * <script src>, <img src>, etc.
 */
export function isCreatorTarget(target: string): boolean {
  if (!target) return false;
  const raw = target.trim();
  if (!raw) return false;
  if (raw.startsWith("#")) return false;
  return true;
}

/**
 * Backward-compatible navigation neutralizer. Delegates to the resource-
 * safe deterministic repair pass.
 */
export function stripCreatorLinks(html: string): string {
  if (!html) return html;
  return repairNavigation(html).html;
}

/**
 * True if the document contains a navigational control (anchor, form,
 * formaction, script navigation expression) pointing off-page. This
 * mirrors what stripCreatorLinks would repair. Resource tags are ignored.
 */
export function containsCreatorLinks(html: string): boolean {
  if (!html) return false;
  const rep = repairNavigation(html);
  return rep.changed || rep.remainingViolations.length > 0;
}

/** Single entry point for anything leaving the sandbox. */
export function sanitizeForExport(html: string): string {
  return stripCreatorLinks(stripPreviewOnly(html));
}
