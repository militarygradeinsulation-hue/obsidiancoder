// Preview interaction / navigation policy — the deterministic ruleset the
// Vibe Coder enforces on every generated build BEFORE the HTML reaches the
// iframe. Runtime interception (in runtime-bridge.ts) is defense in depth;
// this module is the static half so violations can be caught pre-commit
// and reported as concrete learning events.
//
// Design notes:
//  - PURE string / DOM-regex work. No DOMParser (works in worker/SSR).
//  - Never inspects resource-loading attributes (<link href>, <script src>,
//    <img src/srcset>, <source ...>, media assets, CSS url() references,
//    data URLs) — those are always safe to preserve byte-for-byte.
//  - Ignores navigation tokens that live inside JS string literals,
//    template bodies, or comments (via jsLexicalMask).
//  - Treats `<form data-obsidian-local-form="1">` as safe. Any other form
//    without a local (hash) action is flagged so navigation-repair can
//    normalise it.

import { jsLexicalMask } from "./js-lexical-mask";

export type PreviewViolationCode =
  | "nav-creator-route"
  | "nav-external"
  | "nav-protocol-relative"
  | "nav-deep-link"
  | "nav-target-blank"
  | "nav-window-open"
  | "nav-location-assign"
  | "nav-form-navigating"
  | "nav-missing-anchor"
  | "nav-placeholder-hash";

export interface PreviewViolation {
  code: PreviewViolationCode;
  message: string;
  label?: string;
  target?: string;
  index?: number;
}

const CREATOR_HOSTS = /(?:^|\.)(?:obsidianvibe\.live|lovable\.app)$/i;
const CREATOR_PATH_SEGMENTS = new Set([
  "", "dashboard", "gallery", "demos", "unlock", "auth", "checkout", "admin",
]);

function isCreatorPath(pathname: string): boolean {
  if (!pathname || pathname === "/" || /^\/index(\.html)?$/i.test(pathname)) return true;
  const head = pathname.replace(/^\//, "").split("/")[0].toLowerCase();
  return CREATOR_PATH_SEGMENTS.has(head);
}

export function classifyTarget(raw: string): PreviewViolationCode | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s === "#") return "nav-placeholder-hash";
  if (s.startsWith("#")) return null;
  if (/^(mailto:|tel:|sms:)/i.test(s)) return "nav-deep-link";
  if (/^javascript:/i.test(s)) return "nav-deep-link";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(s)) {
    try {
      const u = new URL(s);
      if (CREATOR_HOSTS.test(u.host)) return "nav-creator-route";
      return "nav-external";
    } catch { return "nav-external"; }
  }
  if (s.startsWith("//")) return "nav-protocol-relative";
  if (s.startsWith("/")) {
    try {
      const u = new URL(s, "https://placeholder.local");
      return isCreatorPath(u.pathname) ? "nav-creator-route" : "nav-external";
    } catch { return "nav-external"; }
  }
  const head = s.split(/[/?#]/)[0].toLowerCase();
  if (CREATOR_PATH_SEGMENTS.has(head) && head !== "") return "nav-creator-route";
  return "nav-external";
}

function collectIds(html: string): Set<string> {
  const ids = new Set<string>();
  const rx = /\bid\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) ids.add((m[1] ?? m[2] ?? m[3] ?? "").trim());
  return ids;
}

function labelForTag(fragment: string): string {
  const text = fragment.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 80);
}

function getAttr(attrs: string, name: string): string | undefined {
  const rx = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = attrs.match(rx);
  if (!m) return undefined;
  return m[2] ?? m[3] ?? m[4];
}

function hasAttr(attrs: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`, "i").test(attrs);
}

/**
 * Static scan of a built HTML document for navigation-policy violations.
 * Tag-scoped: only opens of <a>, <area>, <button>, <form>, <input> are
 * inspected. Resource-loading tags are never inspected.
 */
export function scanNavigationViolations(html: string): PreviewViolation[] {
  const out: PreviewViolation[] = [];
  if (!html) return out;

  const ids = collectIds(html);

  scanAnchorLike(html, ids, out, /<(a|area)\b([^>]*)>([\s\S]*?)<\/\1>/gi, /* label from inner */ true);
  // Self-closing / void elements need a separate pass because /<a>...</a>/ can
  // miss malformed adjacency (unclosed <a> before a <div>, self-closing area).
  scanAnchorLike(html, ids, out, /<(a|area)\b([^>]*?)\/?>(?!\s*<\/\1)/gi, false);

  scanButtonLike(html, out);
  scanFormLike(html, out);
  scanScripts(html, out);

  // De-duplicate: same code+index+target is redundant when both regex
  // families flagged the same tag.
  const seen = new Set<string>();
  return out.filter((v) => {
    const key = `${v.code}|${v.index ?? -1}|${v.target ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scanAnchorLike(
  html: string, ids: Set<string>, out: PreviewViolation[],
  rx: RegExp, withInner: boolean,
): void {
  let m: RegExpExecArray | null;
  rx.lastIndex = 0;
  while ((m = rx.exec(html))) {
    const attrs = m[2] ?? "";
    const inner = withInner ? (m[3] ?? "") : "";
    const idx = m.index;
    const label = labelForTag(inner) || getAttr(attrs, "aria-label") || "";
    const target = getAttr(attrs, "href");

    if (getAttr(attrs, "target") === "_blank" && !hasAttr(attrs, "data-obsidian-blocked")) {
      out.push({ code: "nav-target-blank", message: "target=_blank is blocked in preview", label, target: target || undefined, index: idx });
    }

    if (!target) continue;
    if (target === "#") {
      if (!hasAttr(attrs, "data-obsidian-blocked")) {
        out.push({ code: "nav-placeholder-hash", message: 'href="#" placeholder', label, target, index: idx });
      }
      continue;
    }
    if (target.startsWith("#")) {
      const id = target.slice(1);
      if (id && !ids.has(id)) {
        out.push({ code: "nav-missing-anchor", message: `anchor #${id} does not exist`, label, target, index: idx });
      }
      continue;
    }
    const code = classifyTarget(target);
    if (code) {
      out.push({ code, message: `anchor target rejected: ${code}`, label, target, index: idx });
    }
  }
}

function scanButtonLike(html: string, out: PreviewViolation[]): void {
  const rx = /<(button|input)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) {
    const attrs = m[2] ?? "";
    const idx = m.index;
    if (getAttr(attrs, "target") === "_blank" && !hasAttr(attrs, "data-obsidian-blocked")) {
      out.push({ code: "nav-target-blank", message: "target=_blank is blocked in preview", label: getAttr(attrs, "aria-label") || getAttr(attrs, "value") || "", index: idx });
    }
    const fa = getAttr(attrs, "formaction");
    if (fa !== undefined && !hasAttr(attrs, "data-obsidian-blocked")) {
      // Any formaction (including empty/"#") can override the form action.
      const code = classifyTarget(fa) ?? (fa === "" || fa === "#" ? "nav-placeholder-hash" : null);
      if (code) {
        out.push({ code, message: `formaction rejected: ${code}`, target: fa, index: idx });
      }
    }
  }
}

function scanFormLike(html: string, out: PreviewViolation[]): void {
  const rx = /<form\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) {
    const attrs = m[1] ?? "";
    const idx = m.index;
    const label = getAttr(attrs, "aria-label") || "";
    const marked = hasAttr(attrs, "data-obsidian-local-form");
    const action = getAttr(attrs, "action");

    // Marked local forms are safe. Their action was already stripped by
    // the repair pass; even if a user hand-authored an action alongside
    // the marker, the publish-time form guard cancels navigation.
    if (marked) continue;

    if (getAttr(attrs, "target") === "_blank") {
      out.push({ code: "nav-target-blank", message: "form target=_blank blocked", label, index: idx });
    }

    if (action === undefined) {
      // Bare form with no marker → would default-navigate.
      out.push({ code: "nav-form-navigating", message: "form has no local guard and would navigate", label, index: idx });
      continue;
    }
    if (action === "" || action === "#") {
      out.push({ code: "nav-form-navigating", message: `form action="${action}" would reload the page`, label, target: action, index: idx });
      continue;
    }
    if (action.startsWith("#")) continue; // hash to existing id — treated as local
    const code = classifyTarget(action);
    if (code) {
      out.push({ code, message: `form action rejected: ${code}`, label, target: action, index: idx });
    }
  }
}

function scanScripts(html: string, out: PreviewViolation[]): void {
  const rx = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) {
    const attrs = m[1] ?? "";
    if (/\bsrc\s*=/.test(attrs)) continue; // external script — src is a resource
    const body = m[2] ?? "";
    // Skip our own guard/bridge scripts — they contain navigation tokens
    // that are deliberately safe by construction.
    if (/data-obsidian-form-guard|obsidian\.runtime/.test(attrs) || /obsidian\.runtime/.test(body)) continue;
    const mask = jsLexicalMask(body);
    if (/(?<![\w$.])window\s*\.\s*open\s*\(/.test(mask)) {
      out.push({ code: "nav-window-open", message: "window.open() in script", index: m.index });
    }
    if (/(?<![\w$.])(?:window\s*\.\s*|top\s*\.\s*|parent\s*\.\s*)?location\s*\.\s*(?:assign|replace|href)\s*(?:\(|=(?!=))/.test(mask)) {
      out.push({ code: "nav-location-assign", message: "script writes to location", index: m.index });
    }
    if (/(?<![\w$.])location\s*=(?!=)/.test(mask)) {
      out.push({ code: "nav-location-assign", message: "script writes to location", index: m.index });
    }
  }
}

export function summarizeViolations(vs: PreviewViolation[]): Record<PreviewViolationCode, number> {
  const out = {} as Record<PreviewViolationCode, number>;
  for (const v of vs) out[v.code] = (out[v.code] ?? 0) + 1;
  return out;
}
