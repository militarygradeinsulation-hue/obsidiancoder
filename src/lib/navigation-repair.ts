// Deterministic, resource-safe navigation repair.
//
// Turns an unsafe HTML candidate into a preview/publish-safe HTML string by
// scoping every mutation to *navigation-eligible* controls and *navigation
// expressions*. It never touches <link href>, <script src>, <img src>,
// <source srcset>, media assets, CSS url() references, data URLs, or any
// other resource loading. It never rewrites string literals inside scripts.
//
// Contract: valid in-page `#existing-id` targets are preserved. Invalid or
// off-page navigation is *disabled in place* (label, classes, content
// preserved; href/target removed; data-obsidian-blocked, aria-disabled,
// title added). If a script contains dynamic navigation that cannot be
// safely isolated, the script body is left alone and a blocking violation
// remains; callers must gate on remainingViolations.

import {
  classifyTarget,
  scanNavigationViolations,
  type PreviewViolation,
  type PreviewViolationCode,
} from "./preview-policy";

export interface NavRepair {
  code:
    | "anchor-disabled"
    | "anchor-target-blank-stripped"
    | "placeholder-hash-disabled"
    | "missing-anchor-disabled"
    | "form-action-stripped"
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
// Tag-scoped attribute helpers
// --------------------------------------------------------------------------

function getAttr(attrs: string, name: string): string | null {
  const rx = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = attrs.match(rx);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? "";
}

function removeAttr(attrs: string, name: string): string {
  const rx = new RegExp(`\\s*\\b${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "i");
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

// True if href/action is an in-page anchor to an existing id.
function isValidInternalAnchor(target: string, ids: Set<string>): boolean {
  if (!target || target[0] !== "#") return false;
  const id = target.slice(1);
  if (!id) return false;
  return ids.has(id);
}

// --------------------------------------------------------------------------
// Anchor / area repair (never touches <link>, <script src>, images, etc.)
// --------------------------------------------------------------------------

function repairAnchorTags(html: string, ids: Set<string>, repairs: NavRepair[]): string {
  // Match opening <a ...> and <area ...> tags only.
  const rx = /<(a|area)\b([^>]*)>/gi;
  return html.replace(rx, (match, tag: string, rawAttrs: string) => {
    const attrs = rawAttrs;
    const href = getAttr(attrs, "href");
    const target = getAttr(attrs, "target");
    const label = humanLabelFor(tag.toLowerCase(), attrs, "");

    if (href == null && target !== "_blank") return match;

    // target=_blank on a valid internal anchor: strip target, keep href.
    if (target === "_blank") {
      if (href && isValidInternalAnchor(href, ids)) {
        const next = removeAttr(attrs, "target");
        repairs.push({ code: "anchor-target-blank-stripped", label, from: href });
        return `<${tag}${next.trimEnd()}>`;
      }
      // target=_blank on off-page/invalid href → fully disabled below.
    }

    if (href == null) return match; // nothing to do; target already handled

    // Valid internal anchor → keep as-is.
    if (isValidInternalAnchor(href, ids)) return match;

    // Placeholder "#" or "#" with no id → disable.
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

    // Off-page / external / any other target → disable.
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
// Form repair — strip off-page actions; bare forms lose their action so the
// browser cannot default-navigate. Local submit listeners still fire; the
// runtime bridge preventDefault()s all submits in the preview iframe too.
// --------------------------------------------------------------------------

function repairFormTags(html: string, ids: Set<string>, repairs: NavRepair[]): string {
  return html.replace(/<form\b([^>]*)>/gi, (match, rawAttrs: string) => {
    const attrs = rawAttrs;
    const action = getAttr(attrs, "action");
    if (action == null) return match;
    if (isValidInternalAnchor(action, ids)) return match;
    if (!action || action === "#") return match; // nothing to strip
    if (!classifyTarget(action)) return match; // treated as safe (already hash)

    const label = humanLabelFor("form", attrs, "");
    let next = removeAttr(attrs, "action");
    next = upsertAttr(next, "data-obsidian-blocked", "1");
    repairs.push({ code: "form-action-stripped", label, from: action });
    return `<form${next.trimEnd()}>`;
  });
}

function repairFormactionAttrs(html: string, ids: Set<string>, repairs: NavRepair[]): string {
  // Only <button ...> and <input type=submit|image ...> may carry formaction.
  return html.replace(/<(button|input)\b([^>]*)>/gi, (match, tag: string, rawAttrs: string) => {
    const attrs = rawAttrs;
    const fa = getAttr(attrs, "formaction");
    if (fa == null) return match;
    if (isValidInternalAnchor(fa, ids)) return match;
    if (!fa || fa === "#" || !classifyTarget(fa)) return match;

    const label = humanLabelFor(tag.toLowerCase(), attrs, "");
    let next = removeAttr(attrs, "formaction");
    next = upsertAttr(next, "data-obsidian-blocked", "1");
    repairs.push({ code: "formaction-stripped", label, from: fa });
    return `<${tag}${next.trimEnd()}>`;
  });
}

// --------------------------------------------------------------------------
// Meta refresh
// --------------------------------------------------------------------------

function stripMetaRefresh(html: string, repairs: NavRepair[]): string {
  return html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, (m) => {
    repairs.push({ code: "meta-refresh-stripped" });
    return "";
  });
}

// --------------------------------------------------------------------------
// Inline event-handler attributes with navigation expressions.
// --------------------------------------------------------------------------

function repairInlineHandlers(html: string, repairs: NavRepair[]): string {
  const rx = /(<(?:a|area|button|input|form|div|span|li|tr|td|th|section|nav|header|footer|main|article|aside|figure|figcaption|details|summary|label)\b[^>]*?)\s(on[a-z]+)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  return html.replace(rx, (m, prefix: string, handler: string, _quoted: string, dq: string | undefined, sq: string | undefined) => {
    const body = dq ?? sq ?? "";
    if (!/(?:window\.open|location\.(?:assign|replace|href)|\btop\.location|\bparent\.location|\bwindow\.location)/i.test(body)) {
      return m;
    }
    repairs.push({ code: "inline-handler-neutralized", from: handler });
    return `${prefix} data-obsidian-blocked="1"`;
  });
}

// --------------------------------------------------------------------------
// Script navigation neutralizer — targeted expression rewriting only.
// Never rewrites unrelated string literals, rendering logic, JSON, class
// names, or labels. If dynamic navigation cannot be isolated, the script
// body is left unchanged and a blocking violation remains.
// --------------------------------------------------------------------------

interface ScriptRepairResult { body: string; repairs: NavRepair[] }

function neutralizeScriptNavigation(body: string): ScriptRepairResult {
  const repairs: NavRepair[] = [];
  let out = body;

  // 1. Call expressions with balanced-parens: window.open(...),
  //    location.assign(...), location.replace(...).
  const CALLS: { name: string; code: NavRepair["code"] }[] = [
    { name: "window.open", code: "script-window-open-neutralized" },
    { name: "location.assign", code: "script-location-assign-neutralized" },
    { name: "location.replace", code: "script-location-replace-neutralized" },
    { name: "window.location.assign", code: "script-location-assign-neutralized" },
    { name: "window.location.replace", code: "script-location-replace-neutralized" },
    { name: "top.location.assign", code: "script-location-assign-neutralized" },
    { name: "top.location.replace", code: "script-location-replace-neutralized" },
    { name: "parent.location.assign", code: "script-location-assign-neutralized" },
    { name: "parent.location.replace", code: "script-location-replace-neutralized" },
  ];

  for (const { name, code } of CALLS) {
    const rx = new RegExp(`(^|[^\\w.])${name.replace(/\./g, "\\.")}\\s*\\(`, "g");
    let rewritten = "";
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(out)) !== null) {
      const openIdx = m.index + m[0].length - 1; // position of '('
      const closeIdx = findMatchingParen(out, openIdx);
      if (closeIdx < 0) break; // unmatched — leave rest alone
      rewritten += out.slice(last, m.index + m[1].length);
      rewritten += `(void 0 /* obsidian blocked ${name} */)`;
      last = closeIdx + 1;
      repairs.push({ code, from: name });
      rx.lastIndex = closeIdx + 1;
    }
    rewritten += out.slice(last);
    out = rewritten;
  }

  // 2. Assignment expressions: LHS = RHS  →  LHS, undefined == RHS
  //    Evaluates LHS (a getter → no side effect) and compares to RHS,
  //    discarding the boolean. Cannot navigate.
  //    Covers: location = ..., location.href = ..., window.location = ...,
  //    window.location.href = ..., top.location[.href] = ..., parent.location[.href] = ....
  //
  //    Word-boundary guard prevents matching document.location property
  //    dereferences that don't perform navigation (e.g., a read).
  const ASSIGN_RXES: { rx: RegExp; code: NavRepair["code"] }[] = [
    { rx: /(^|[^\w.])(window\s*\.\s*location\s*\.\s*href)\s*=(?!=)/g, code: "script-location-write-neutralized" },
    { rx: /(^|[^\w.])(top\s*\.\s*location\s*\.\s*href)\s*=(?!=)/g, code: "script-location-write-neutralized" },
    { rx: /(^|[^\w.])(parent\s*\.\s*location\s*\.\s*href)\s*=(?!=)/g, code: "script-location-write-neutralized" },
    { rx: /(^|[^\w.])(window\s*\.\s*location)\s*=(?!=)/g, code: "script-location-write-neutralized" },
    { rx: /(^|[^\w.])(top\s*\.\s*location)\s*=(?!=)/g, code: "script-location-write-neutralized" },
    { rx: /(^|[^\w.])(parent\s*\.\s*location)\s*=(?!=)/g, code: "script-location-write-neutralized" },
    { rx: /(^|[^\w.])(location\s*\.\s*href)\s*=(?!=)/g, code: "script-location-write-neutralized" },
    { rx: /(^|[^\w.])(location)\s*=(?!=)/g, code: "script-location-write-neutralized" },
  ];

  for (const { rx, code } of ASSIGN_RXES) {
    let touched = false;
    out = out.replace(rx, (_m, pre: string, lhs: string) => {
      touched = true;
      return `${pre}${lhs}, undefined == `;
    });
    if (touched) repairs.push({ code });
  }

  return { body: out, repairs };
}

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
    if (c === "/" && s[i + 1] === "/") {
      while (i < n && s[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    i++;
  }
  return depth === 0 ? i - 1 : -1;
}

function repairScripts(html: string, repairs: NavRepair[]): string {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs: string, body: string) => {
    // External scripts have no inline body — nothing to neutralize.
    if (/\bsrc\s*=/.test(attrs) && !body.trim()) return m;
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

  // Re-scan the repaired source. Anchors we disabled no longer carry href, so
  // scanNavigationViolations must not flag them; disabled forms lose action.
  const remainingViolations = scanNavigationViolations(out).filter((v) => !isBenignAfterRepair(v));

  return {
    html: out,
    repairs,
    remainingViolations,
    changed: out !== html,
  };
}

// Some scan codes describe conditions that repair converts into inert
// disabled controls. If a downstream scan still reports them, they're
// legitimate (repair could not neutralize the surface), so we don't filter.
// Kept as a small helper in case we add lenient codes later.
function isBenignAfterRepair(_v: PreviewViolation): boolean {
  return false;
}

export type { PreviewViolationCode };
