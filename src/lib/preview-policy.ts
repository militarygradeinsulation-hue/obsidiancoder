// Preview interaction / navigation policy — the deterministic ruleset the
// Vibe Coder enforces on every generated build BEFORE the HTML reaches the
// iframe. Runtime interception (in runtime-bridge.ts) is defense in depth;
// this module is the static half so violations can be caught pre-commit
// and reported as concrete learning events.
//
// Design notes:
//  - PURE string / DOM-regex work. No DOMParser (works in worker/SSR).
//  - Never rewrites the source itself — that job belongs to clean-export
//    which owns the sanitizer. This file only *reports*.
//  - Returned violation codes are stable identifiers used by the failure
//    ledger, so we can accumulate "this build type keeps emitting X".

export type PreviewViolationCode =
  | "nav-creator-route"
  | "nav-external"
  | "nav-protocol-relative"
  | "nav-deep-link"        // mailto/tel/sms/custom
  | "nav-target-blank"
  | "nav-window-open"
  | "nav-location-assign"
  | "nav-form-navigating"
  | "nav-missing-anchor"
  | "nav-placeholder-hash";

export interface PreviewViolation {
  code: PreviewViolationCode;
  message: string;
  /** Best-effort human label for the offending control. */
  label?: string;
  /** Attribute value / URL involved. */
  target?: string;
  /** Char index into the source (for reporting only). */
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
  // Any non-hash scheme is a violation. Only in-page anchors are allowed.
  if (/^(mailto:|tel:|sms:)/i.test(s)) return "nav-deep-link";
  if (/^javascript:/i.test(s)) return "nav-deep-link";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(s)) {
    // http(s), custom schemes, etc. Try to parse for creator-host detection.
    try {
      const u = new URL(s);
      if (CREATOR_HOSTS.test(u.host)) return "nav-creator-route";
      return "nav-external";
    } catch { return "nav-external"; }
  }
  if (s.startsWith("//")) return "nav-protocol-relative";
  if (s.startsWith("/")) {
    // Any root-relative path is off-page. Creator paths still get their
    // specific label so failure-learning can accumulate targeted hints.
    try {
      const u = new URL(s, "https://placeholder.local");
      return isCreatorPath(u.pathname) ? "nav-creator-route" : "nav-external";
    } catch { return "nav-external"; }
  }
  // Bare/relative like "pricing", "next.html", "sub/page?x". Off-page unless
  // it is an in-page fragment (handled above).
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

/**
 * Static scan of a built HTML document for navigation-policy violations.
 * Deterministic, allocation-bounded, never longer than O(html.length).
 */
export function scanNavigationViolations(html: string): PreviewViolation[] {
  const out: PreviewViolation[] = [];
  if (!html) return out;

  const ids = collectIds(html);

  // <a>, <button>, <form>, <input type=submit>
  const tagRx = /<(a|button|form|input)\b([^>]*)>([\s\S]*?)(?:<\/\1>|(?=<))/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRx.exec(html))) {
    const tag = m[1].toLowerCase();
    const attrs = m[2] ?? "";
    const inner = m[3] ?? "";
    const idx = m.index;
    const label = labelForTag(inner) || getAttr(attrs, "aria-label") || getAttr(attrs, "value") || "";

    const target = getAttr(attrs, tag === "form" ? "action" : "href")
      ?? getAttr(attrs, "formaction");

    if (getAttr(attrs, "target") === "_blank") {
      out.push({ code: "nav-target-blank", message: "target=_blank is blocked in preview", label, target: target || undefined, index: idx });
    }

    if (tag === "form") {
      const method = (getAttr(attrs, "method") ?? "get").toLowerCase();
      if (target && classifyTarget(target)) {
        const code = classifyTarget(target)!;
        out.push({ code, message: `form action targets ${code}`, label, target, index: idx });
      } else if (!target && method !== "get") {
        out.push({ code: "nav-form-navigating", message: "form has no local handler and would navigate", label, index: idx });
      }
      continue;
    }

    if (!target) continue;
    if (target === "#") {
      out.push({ code: "nav-placeholder-hash", message: 'href="#" placeholder', label, target, index: idx });
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
      out.push({ code, message: `${tag} target rejected: ${code}`, label, target, index: idx });
    }
  }

  // window.open / location.href = "..." literal scans
  const scriptRx = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = scriptRx.exec(html))) {
    const body = sm[1] ?? "";
    if (/\bwindow\.open\s*\(/.test(body)) {
      out.push({ code: "nav-window-open", message: "window.open() is blocked in preview", index: sm.index });
    }
    if (/\blocation\.(?:assign|replace|href)\b/.test(body)) {
      // If a blocked literal appears alongside it, upgrade to creator-route.
      const literalRx = /["']([^"'\n]{1,300})["']/g;
      let lm: RegExpExecArray | null;
      let flagged = false;
      while ((lm = literalRx.exec(body))) {
        const code = classifyTarget(lm[1]);
        if (code) { out.push({ code, message: `script navigates to ${code}`, target: lm[1], index: sm.index }); flagged = true; }
      }
      if (!flagged) {
        out.push({ code: "nav-location-assign", message: "script uses location.assign/replace/href", index: sm.index });
      }
    }
  }

  return out;
}

function getAttr(attrs: string, name: string): string | undefined {
  const rx = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = attrs.match(rx);
  if (!m) return undefined;
  return m[2] ?? m[3] ?? m[4];
}

export function summarizeViolations(vs: PreviewViolation[]): Record<PreviewViolationCode, number> {
  const out = {} as Record<PreviewViolationCode, number>;
  for (const v of vs) out[v.code] = (out[v.code] ?? 0) + 1;
  return out;
}
