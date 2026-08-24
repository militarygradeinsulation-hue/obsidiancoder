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

/**
 * Faithful, working implementation of the same API contract
 * memory-director.ts promises every generated build: async set/get/list/
 * delete, plus onChange for reactive re-render. Backed by localStorage and
 * scoped per-build (keyed by a stable hash of the document itself) so two
 * different published builds opened in the same browser never collide.
 *
 * Semantics honestly narrow to what a single standalone page CAN provide:
 * persistence survives a reload in the same browser, and change events
 * propagate across tabs of the SAME browser (via the native `storage`
 * event) -- there is no second device to sync with once a build has left
 * the authenticated Pocket workspace, so onChange firing for a genuinely
 * remote change is the one thing this cannot replicate. Everything else
 * -- the exact method names, argument shapes, and Promise-returning async
 * contract -- matches the real bridge exactly, so build code written
 * against ObsidianMemory needs no awareness that it's running standalone.
 */
function obsidianMemoryShimScript(): string {
  return `<script data-obsidian-memory-shim="1">(function(){
if (window.ObsidianMemory) return;
var NS = 'obs_export_mem:' + (function(){
  var s = document.title + location.pathname, h = 0;
  for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
})() + ':';
var listeners = [];
function safeParse(raw) { try { return raw == null ? null : JSON.parse(raw); } catch (e) { return null; } }
function notify(key, value) { listeners.forEach(function (fn) { try { fn(key, value); } catch (e) {} }); }
window.addEventListener('storage', function (e) {
  if (!e.key || e.key.indexOf(NS) !== 0) return;
  notify(e.key.slice(NS.length), safeParse(e.newValue));
});
window.ObsidianMemory = {
  set: function (key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch (e) {}
    notify(key, value);
    return Promise.resolve(true);
  },
  get: function (key) {
    try { return Promise.resolve(safeParse(localStorage.getItem(NS + key))); }
    catch (e) { return Promise.resolve(null); }
  },
  list: function () {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(NS) === 0) out.push({ key: k.slice(NS.length), value: safeParse(localStorage.getItem(k)) });
      }
    } catch (e) {}
    return Promise.resolve(out);
  },
  delete: function (key) {
    try { localStorage.removeItem(NS + key); } catch (e) {}
    notify(key, null);
    return Promise.resolve(true);
  },
  onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
};
})();</script>`;
}

/**
 * Insert the shim as early as possible so it is guaranteed to run before
 * any later inline script in the document, including the build's own.
 * Browsers execute non-deferred, non-module <script> tags in document
 * order, so placement right after <head> opens is sufficient -- no need
 * to touch anything else in the document.
 */
function injectObsidianMemoryShim(html: string): string {
  if (!html) return html;
  if (/window\.ObsidianMemory\s*=/.test(html)) return html; // already provided
  const shim = obsidianMemoryShimScript();
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n${shim}`);
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (m) => `${m}\n${shim}`);
  return `${shim}\n${html}`;
}

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
  return injectObsidianMemoryShim(stripCreatorLinks(stripPreviewOnly(html)));
}
