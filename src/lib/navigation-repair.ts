// Deterministic, resource-safe navigation repair.
//
// Turns an unsafe HTML candidate into a preview/publish-safe HTML string by
// scoping every mutation to *navigation-eligible* controls and *navigation
// expressions* inside scripts. It never touches <link href>, <script src>,
// <img src>, <source srcset>, media assets, CSS url() references, data
// URLs, or any other resource loading.
//
// Contract:
//  - Valid in-page `#existing-id` anchor targets are preserved.
//  - Off-page anchor targets (external, protocol-relative, root-relative,
//    "#", "#missing-id", target=_blank) are disabled in place: label,
//    classes, and inner content are preserved; href/target are removed;
//    data-obsidian-blocked=1, aria-disabled=true, title are added.
//  - Every generated <form> is normalised to local-only in both preview
//    and publish: action/target attributes are removed and the tag is
//    marked with data-obsidian-local-form="1". A single publish-safe form
//    guard script (data-obsidian-form-guard="1") is injected once when
//    any form exists — it installs a capture-phase submit listener and
//    only calls preventDefault(). It does NOT stopPropagation(), so
//    local submit listeners still execute.
//  - <button formaction=…> and <input formaction=…> are stripped
//    unconditionally (any value, including empty or "#").
//  - Meta refresh is stripped.
//  - Inline event handlers (on*) containing navigation expressions are
//    neutralised in place.
//  - Script bodies: navigation-only call expressions and navigation-only
//    assignment expressions are replaced with `(void 0/*obs-nav-blocked*/)`
//    using balanced-bracket extraction, without evaluating the RHS. The
//    marker `obs-nav-blocked` contains no banned navigation tokens so a
//    downstream rescan sees the script as clean. All unrelated statements,
//    literals, arrays, templates, labels, and rendering logic are preserved
//    byte-for-byte around the removed expression. If an expression cannot
//    be safely isolated, the script body is left unchanged and a blocking
//    violation remains for the caller.

import {
  classifyTarget,
  scanNavigationViolations,
  type PreviewViolation,
  type PreviewViolationCode,
} from "./preview-policy";
import { jsLexicalMask } from "./js-lexical-mask";

export interface NavRepair {
  code:
    | "anchor-disabled"
    | "anchor-target-blank-stripped"
    | "placeholder-hash-disabled"
    | "missing-anchor-disabled"
    | "form-localized"
    | "form-guard-injected"
    | "formaction-stripped"
    | "meta-refresh-stripped"
    | "script-window-open-neutralized"
    | "script-location-assign-neutralized"
    | "script-location-replace-neutralized"
    | "script-location-write-neutralized"
    | "inline-handler-neutralized";
  label?: string;
  from?: string;
}

export interface NavRepairResult {
  html: string;
  repairs: NavRepair[];
  remainingViolations: PreviewViolation[];
  changed: boolean;
}

// --------------------------------------------------------------------------
// Attribute helpers
// --------------------------------------------------------------------------

function getAttr(attrs: string, name: string): string | null {
  const rx = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = attrs.match(rx);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? "";
}

function hasAttr(attrs: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`, "i").test(attrs);
}

function removeAttr(attrs: string, name: string): string {
  const rx = new RegExp(`\\s*\\b${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "gi");
  return attrs.replace(rx, "");
}

function upsertAttr(attrs: string, name: string, value: string): string {
  const stripped = removeAttr(attrs, name);
  const escaped = value.replace(/"/g, "&quot;");
  return `${stripped} ${name}="${escaped}"`;
}

function collectIds(html: string): Set<string> {
  const ids = new Set<string>();
  const rx = /\bid\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) ids.add((m[1] ?? m[2] ?? m[3] ?? "").trim());
  return ids;
}

function humanLabelFor(tag: string, attrs: string, inner: string): string {
  const aria = getAttr(attrs, "aria-label");
  if (aria) return aria.slice(0, 80);
  const value = getAttr(attrs, "value");
  if (value && (tag === "input" || tag === "button")) return value.slice(0, 80);
  const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 80);
}

function isValidInternalAnchor(target: string, ids: Set<string>): boolean {
  if (!target || target[0] !== "#") return false;
  const id = target.slice(1);
  if (!id) return false;
  return ids.has(id);
}

// --------------------------------------------------------------------------
// Anchor / area repair
// --------------------------------------------------------------------------

function repairAnchorTags(html: string, ids: Set<string>, repairs: NavRepair[]): string {
  const rx = /<(a|area)\b([^>]*)>/gi;
  return html.replace(rx, (match, tag: string, rawAttrs: string) => {
    const attrs = rawAttrs;
    const href = getAttr(attrs, "href");
    const target = getAttr(attrs, "target");
    const label = humanLabelFor(tag.toLowerCase(), attrs, "");

    if (href == null && target !== "_blank") return match;

    if (target === "_blank") {
      if (href && isValidInternalAnchor(href, ids)) {
        const next = removeAttr(attrs, "target");
        repairs.push({ code: "anchor-target-blank-stripped", label, from: href });
        return `<${tag}${next.trimEnd()}>`;
      }
    }

    if (href == null) return match;

    if (isValidInternalAnchor(href, ids)) return match;

    if (href === "#" || href.startsWith("#")) {
      const code: NavRepair["code"] = href === "#"
        ? "placeholder-hash-disabled"
        : "missing-anchor-disabled";
      let next = removeAttr(attrs, "href");
      next = removeAttr(next, "target");
      next = upsertAttr(next, "data-obsidian-blocked", "1");
      next = upsertAttr(next, "aria-disabled", "true");
      next = upsertAttr(next, "title", href === "#"
        ? "Blocked: placeholder link"
        : `Blocked: missing anchor ${href}`);
      repairs.push({ code, label, from: href });
      return `<${tag}${next.trimEnd()}>`;
    }

    let next = removeAttr(attrs, "href");
    next = removeAttr(next, "target");
    next = upsertAttr(next, "data-obsidian-blocked", "1");
    next = upsertAttr(next, "aria-disabled", "true");
    next = upsertAttr(next, "title", "Blocked: off-page link");
    repairs.push({ code: "anchor-disabled", label, from: href });
    return `<${tag}${next.trimEnd()}>`;
  });
}

// --------------------------------------------------------------------------
// Form repair — every <form> becomes local-only. Bare forms, empty/"#"
// action, off-page action are all normalised to no action + no target +
// data-obsidian-local-form="1". Local submit listeners survive. The form
// guard script (installed later) prevents default browser submission for
// every form in the document (preview AND publish).
// --------------------------------------------------------------------------

function repairFormTags(html: string, _ids: Set<string>, repairs: NavRepair[]): string {
  return html.replace(/<form\b([^>]*)>/gi, (_m, rawAttrs: string) => {
    const attrs = rawAttrs;
    const action = getAttr(attrs, "action");
    const target = getAttr(attrs, "target");
    const already = hasAttr(attrs, "data-obsidian-local-form");
    if (already && action == null && target == null) {
      // Idempotent no-op.
      return `<form${attrs}>`;
    }
    const label = humanLabelFor("form", attrs, "");
    let next = removeAttr(attrs, "action");
    next = removeAttr(next, "target");
    next = upsertAttr(next, "data-obsidian-local-form", "1");
    repairs.push({ code: "form-localized", label, from: action ?? undefined });
    return `<form${next.trimEnd()}>`;
  });
}

// Strip formaction unconditionally — any value can navigate.
function repairFormactionAttrs(html: string, _ids: Set<string>, repairs: NavRepair[]): string {
  return html.replace(/<(button|input)\b([^>]*)>/gi, (m, tag: string, rawAttrs: string) => {
    const attrs = rawAttrs;
    if (!hasAttr(attrs, "formaction")) return m;
    const fa = getAttr(attrs, "formaction");
    const label = humanLabelFor(tag.toLowerCase(), attrs, "");
    let next = removeAttr(attrs, "formaction");
    // Also drop formtarget for completeness.
    next = removeAttr(next, "formtarget");
    next = upsertAttr(next, "data-obsidian-blocked", "1");
    repairs.push({ code: "formaction-stripped", label, from: fa ?? undefined });
    return `<${tag}${next.trimEnd()}>`;
  });
}

// --------------------------------------------------------------------------
// Form guard — injected exactly once when any <form> exists in the repaired
// source. Uses a capture-phase submit listener that only calls
// preventDefault(). NEVER stopPropagation() — local submit listeners must
// still run so in-document state updates work.
// --------------------------------------------------------------------------

const FORM_GUARD_MARK = 'data-obsidian-form-guard="1"';
const FORM_GUARD_SCRIPT =
  `<script ${FORM_GUARD_MARK}>` +
  `(function(){try{document.addEventListener("submit",function(e){` +
  `if(e&&e.target&&e.target.tagName==="FORM"){e.preventDefault();}` +
  `},true);}catch(_){}}())` +
  `;</script>`;

function ensureFormGuard(html: string, repairs: NavRepair[]): string {
  if (!/<form\b/i.test(html)) {
    // No forms → remove any stale guard so parity stays clean.
    if (html.includes(FORM_GUARD_MARK)) {
      return html.replace(
        new RegExp(`<script\\s+${FORM_GUARD_MARK}[^>]*>[\\s\\S]*?</script>`, "gi"),
        "",
      );
    }
    return html;
  }
  if (html.includes(FORM_GUARD_MARK)) return html; // already present, dedupe.
  const inject = FORM_GUARD_SCRIPT;
  repairs.push({ code: "form-guard-injected" });
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${inject}</body>`);
  return `${html}${inject}`;
}

// --------------------------------------------------------------------------
// Meta refresh
// --------------------------------------------------------------------------

function stripMetaRefresh(html: string, repairs: NavRepair[]): string {
  return html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, () => {
    repairs.push({ code: "meta-refresh-stripped" });
    return "";
  });
}

// --------------------------------------------------------------------------
// Inline event-handler attributes with navigation expressions.
// --------------------------------------------------------------------------

function repairInlineHandlers(html: string, repairs: NavRepair[]): string {
  const rx = /(<(?:a|area|button|input|form|div|span|li|tr|td|th|section|nav|header|footer|main|article|aside|figure|figcaption|details|summary|label)\b[^>]*?)\s(on[a-z]+)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  return html.replace(rx, (m, prefix: string, handler: string, _q: string, dq: string | undefined, sq: string | undefined) => {
    const body = dq ?? sq ?? "";
    if (!/(?:window\.open|location\.(?:assign|replace|href)|\btop\.location|\bparent\.location|\bwindow\.location)/i.test(body)) {
      return m;
    }
    repairs.push({ code: "inline-handler-neutralized", from: handler });
    return `${prefix} data-obsidian-blocked="1"`;
  });
}

// --------------------------------------------------------------------------
// Script navigation neutraliser.
// --------------------------------------------------------------------------

interface ScriptRepairResult { body: string; repairs: NavRepair[] }

// Neutralisation marker. Chosen so it contains NONE of the tokens the
// scanner searches for (no `location`, no `window.open`, no `assign`,
// `replace`, or `href`).
const NEUTRAL = "(void 0/*obs-nav-blocked*/)";

const CALL_NAMES: { name: string; code: NavRepair["code"] }[] = [
  { name: "window.open",              code: "script-window-open-neutralized" },
  { name: "window.location.assign",   code: "script-location-assign-neutralized" },
  { name: "window.location.replace",  code: "script-location-replace-neutralized" },
  { name: "top.location.assign",      code: "script-location-assign-neutralized" },
  { name: "top.location.replace",     code: "script-location-replace-neutralized" },
  { name: "parent.location.assign",   code: "script-location-assign-neutralized" },
  { name: "parent.location.replace",  code: "script-location-replace-neutralized" },
  { name: "location.assign",          code: "script-location-assign-neutralized" },
  { name: "location.replace",         code: "script-location-replace-neutralized" },
];

// Assignment LHS patterns, longest-first so `window.location.href` wins over `location`.
const ASSIGN_LHS: { pattern: RegExp; code: NavRepair["code"] }[] = [
  { pattern: /window\s*\.\s*location\s*\.\s*href/g, code: "script-location-write-neutralized" },
  { pattern: /top\s*\.\s*location\s*\.\s*href/g,    code: "script-location-write-neutralized" },
  { pattern: /parent\s*\.\s*location\s*\.\s*href/g, code: "script-location-write-neutralized" },
  { pattern: /window\s*\.\s*location(?!\s*\.)/g,    code: "script-location-write-neutralized" },
  { pattern: /top\s*\.\s*location(?!\s*\.)/g,       code: "script-location-write-neutralized" },
  { pattern: /parent\s*\.\s*location(?!\s*\.)/g,    code: "script-location-write-neutralized" },
  { pattern: /location\s*\.\s*href/g,               code: "script-location-write-neutralized" },
  // Bare `location = expr` — must not be preceded by a name-continuation
  // char and not by a `.`.
  { pattern: /(?<![\w$.])location(?!\s*\.)/g,       code: "script-location-write-neutralized" },
];

function findMatchingParen(s: string, openIdx: number): number {
  let depth = 1;
  let i = openIdx + 1;
  const n = s.length;
  while (i < n && depth > 0) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < n && s[i] !== q) {
        if (s[i] === "\\") { i += 2; continue; }
        i++;
      }
      i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") { while (i < n && s[i] !== "\n") i++; continue; }
    if (c === "/" && s[i + 1] === "*") { i += 2; while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++; i += 2; continue; }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    i++;
  }
  return depth === 0 ? i - 1 : -1;
}

// Walk raw source starting at `from` and find the end of an expression
// statement. Stops (exclusive) at the first `;`, `\n`, or unbalanced
// closing `)`/`}`/`]` at depth 0. Returns -1 if the search runs off
// the buffer without terminating, in which case the caller must NOT
// rewrite (leave the source alone).
function findExpressionEnd(s: string, from: number): number {
  let depth = 0;
  let i = from;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < n && s[i] !== q) {
        if (s[i] === "\\") { i += 2; continue; }
        if (q === "`" && s[i] === "$" && s[i + 1] === "{") {
          i += 2; let dd = 1;
          while (i < n && dd > 0) {
            if (s[i] === "{") dd++;
            else if (s[i] === "}") dd--;
            if (dd > 0) i++;
          }
          if (i < n) i++;
          continue;
        }
        i++;
      }
      if (i < n) i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") { while (i < n && s[i] !== "\n") i++; return i; }
    if (c === "/" && s[i + 1] === "*") { i += 2; while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++; i += 2; continue; }
    if (c === "(" || c === "[" || c === "{") { depth++; i++; continue; }
    if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return i;
      depth--; i++; continue;
    }
    if (depth === 0 && (c === ";" || c === "\n")) return i;
    i++;
  }
  return -1;
}

function neutralizeScriptNavigation(body: string): ScriptRepairResult {
  const repairs: NavRepair[] = [];
  const mask = jsLexicalMask(body);

  // Collect all edits as [start, end, code] non-overlapping ranges.
  type Edit = { start: number; end: number; code: NavRepair["code"]; from: string };
  const edits: Edit[] = [];

  // 1. Calls
  for (const { name, code } of CALL_NAMES) {
    const escaped = name.replace(/\./g, "\\.\\s*");
    // Preceded by non-name-continuation character (or start of buffer).
    const rx = new RegExp(`(?<![\\w$.])${escaped}\\s*\\(`, "g");
    let m: RegExpExecArray | null;
    while ((m = rx.exec(mask)) !== null) {
      const nameStart = m.index;
      const parenIdx = mask.indexOf("(", nameStart);
      const close = findMatchingParen(body, parenIdx);
      if (close < 0) continue;
      // Skip if this range already covered by a longer name.
      if (edits.some((e) => nameStart < e.end && close + 1 > e.start)) continue;
      edits.push({ start: nameStart, end: close + 1, code, from: name });
    }
  }

  // 2. Assignments — LHS pattern followed by `=` (not `==` or `===` or `=>`).
  for (const { pattern, code } of ASSIGN_LHS) {
    const rx = new RegExp(pattern.source, "g");
    let m: RegExpExecArray | null;
    while ((m = rx.exec(mask)) !== null) {
      const lhsStart = m.index;
      const lhsEnd = m.index + m[0].length;
      // Look ahead: optional whitespace, then `=` not part of `==`/`===`/`=>`.
      let k = lhsEnd;
      while (k < mask.length && /\s/.test(mask[k])) k++;
      if (mask[k] !== "=") continue;
      if (mask[k + 1] === "=" || mask[k + 1] === ">") continue;
      const rhsStart = k + 1;
      const stmtEnd = findExpressionEnd(body, rhsStart);
      if (stmtEnd < 0) continue; // cannot isolate — leave and let scan block.
      // Skip if overlapping with an earlier edit (call inside RHS is fine
      // — we replace the whole assignment so the call goes with it).
      if (edits.some((e) => lhsStart < e.end && stmtEnd > e.start)) continue;
      edits.push({ start: lhsStart, end: stmtEnd, code, from: m[0].replace(/\s+/g, "") });
    }
  }

  if (edits.length === 0) return { body, repairs };

  edits.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const e of edits) {
    if (e.start < cursor) continue; // overlapping — skip.
    out += body.slice(cursor, e.start);
    out += NEUTRAL;
    cursor = e.end;
    repairs.push({ code: e.code, from: e.from });
  }
  out += body.slice(cursor);

  return { body: out, repairs };
}

// Export for focused unit testing.
export const __neutralizeScriptNavigationForTest = neutralizeScriptNavigation;

function repairScripts(html: string, repairs: NavRepair[]): string {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs: string, body: string) => {
    if (/\bsrc\s*=/.test(attrs) && !body.trim()) return m; // external, empty body
    const { body: repaired, repairs: r } = neutralizeScriptNavigation(body);
    if (r.length === 0) return m;
    for (const rep of r) repairs.push(rep);
    return `<script${attrs}>${repaired}</script>`;
  });
}

// --------------------------------------------------------------------------
// Public entry point
// --------------------------------------------------------------------------

export function repairNavigation(html: string): NavRepairResult {
  if (!html) {
    return { html: html ?? "", repairs: [], remainingViolations: [], changed: false };
  }
  const repairs: NavRepair[] = [];
  const ids = collectIds(html);

  let out = html;
  out = stripMetaRefresh(out, repairs);
  out = repairInlineHandlers(out, repairs);
  out = repairAnchorTags(out, ids, repairs);
  out = repairFormTags(out, ids, repairs);
  out = repairFormactionAttrs(out, ids, repairs);
  out = repairScripts(out, repairs);
  out = ensureFormGuard(out, repairs);

  const remainingViolations = scanNavigationViolations(out);

  return {
    html: out,
    repairs,
    remainingViolations,
    changed: out !== html,
  };
}

// Backwards compat: unused but preserved for callers that import it.
export function classifyTargetForTest(t: string) { return classifyTarget(t); }

export type { PreviewViolationCode };
