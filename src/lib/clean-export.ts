// Clean-export sanitizer. Anything user-visible saved outside the preview
// (versions, gallery, downloads, project JSON, template payloads, Go Live
// shares, featured demos) must not contain preview-only instrumentation
// AND must not link back into the Obsidian creator app. Pure string ops.

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

// ---------------------------------------------------------------------------
// Creator-link sanitizer
// ---------------------------------------------------------------------------
// Any published build (Go Live share, featured demo, downloaded HTML, saved
// project) that contains an <a>, <form>, <button formaction>, inline handler,
// <meta refresh>, or <script>-driven navigation targeting the Obsidian
// creator surface (/, /dashboard, /gallery, /demos, /unlock, /auth,
// /checkout*, /admin*, obsidianvibe.live root, *.lovable.app) must have
// that navigation neutralized. In-page anchors (#foo), mailto:, tel:, and
// third-party URLs are left alone.

// Only creator-app paths that no standalone export would legitimately use.
// Explicitly excludes "/", "/checkout", "/dashboard", "/gallery", "/demos"
// because those are common in generic apps (a landscaping demo linking to
// "/checkout" or a portfolio's Home logo href="/" must keep working).
const BLOCKED_PATH_PREFIXES = [
  "/unlock",
  "/auth",
  "/admin",
];

const BLOCKED_HOSTS = new Set([
  "obsidianvibe.live",
  "www.obsidianvibe.live",
]);

function hostIsBlocked(host: string): boolean {
  const h = host.toLowerCase();
  if (BLOCKED_HOSTS.has(h)) return true;
  if (h.endsWith(".lovable.app")) return true;
  return false;
}

function pathIsBlocked(pathname: string): boolean {
  if (!pathname) return false;
  for (const p of BLOCKED_PATH_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?") || pathname.startsWith(p + "#")) {
      return true;
    }
  }
  return false;
}


/**
 * True if `target` (the value of an href/action/formaction attribute or a
 * navigation URL inside a script) points back into the Obsidian creator app.
 */
export function isCreatorTarget(target: string): boolean {
  if (!target) return false;
  const raw = target.trim();
  if (!raw) return false;
  // In-page anchors, mailto/tel, javascript:void — leave alone.
  if (raw.startsWith("#")) return false;
  if (/^(mailto:|tel:|sms:|data:)/i.test(raw)) return false;
  if (/^javascript:\s*(void\(0\)|;?)\s*$/i.test(raw)) return false;

  // Protocol-relative "//host/..."
  if (raw.startsWith("//")) {
    try {
      const u = new URL("https:" + raw);
      return hostIsBlocked(u.host) || pathIsBlocked(u.pathname);
    } catch { return true; }
  }

  // Absolute URL
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
    try {
      const u = new URL(raw);
      if (hostIsBlocked(u.host)) return true;
      // Non-blocked hosts (stripe.com, etc.) are fine regardless of path.
      return false;
    } catch { return false; }
  }

  // Root-relative
  if (raw.startsWith("/")) {
    try {
      const u = new URL(raw, "https://placeholder.local");
      return pathIsBlocked(u.pathname);
    } catch { return true; }
  }

  // Bare/relative link like "dashboard" or "unlock?x=1" — treat conservatively.
  const firstSeg = raw.split(/[/?#]/)[0].toLowerCase();
  if (["unlock", "auth", "admin"].includes(firstSeg)) {
    return true;
  }
  return false;
}

// Match an href/action/formaction attribute. Value may be quoted or unquoted.
function replaceNavAttrs(html: string, attr: "href" | "action" | "formaction"): string {
  const rx = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "gi");
  return html.replace(rx, (_m, _all, dq, sq, uq) => {
    const val = dq ?? sq ?? uq ?? "";
    if (!isCreatorTarget(val)) return `${attr}="${val}"`;
    return `${attr}="#" data-obsidian-blocked="1"`;
  });
}

// Neutralize inline event handlers that navigate to a blocked target.
function neutralizeInlineHandlers(html: string): string {
  const rx = /\son[a-z]+\s*=\s*("([^"]*)"|'([^']*)')/gi;
  return html.replace(rx, (m, _all, dq, sq) => {
    const val = dq ?? sq ?? "";
    if (!/(location|window\.open|top\.location|parent\.location)/i.test(val)) return m;
    // Extract quoted string arguments and test them.
    const strings = val.match(/"([^"]*)"|'([^']*)'/g) ?? [];
    for (const s of strings) {
      const inner = s.slice(1, -1);
      if (isCreatorTarget(inner)) return ' data-obsidian-blocked="1"';
    }
    return m;
  });
}

// Remove <meta http-equiv="refresh" ... url=/dashboard">
function stripMetaRefresh(html: string): string {
  return html.replace(
    /<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi,
    (m) => {
      const content = m.match(/content\s*=\s*("([^"]*)"|'([^']*)')/i);
      const val = content?.[2] ?? content?.[3] ?? "";
      const urlMatch = val.match(/url\s*=\s*([^;]+)/i);
      const target = (urlMatch?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
      if (!target) return m;
      return isCreatorTarget(target) ? "" : m;
    },
  );
}

export function stripCreatorLinks(html: string): string {
  if (!html) return html;
  let out = html;
  // Neutralize inline handlers first so their quoted URL literals don't get
  // rewritten as if they were real href/action attributes.
  out = neutralizeInlineHandlers(out);
  out = replaceNavAttrs(out, "href");
  out = replaceNavAttrs(out, "action");
  out = replaceNavAttrs(out, "formaction");
  out = stripMetaRefresh(out);
  // Note: <script> bodies are NOT rewritten. Standalone builds often include
  // their own SPA router, redirect logic, or checkout scripts with quoted
  // path literals — blanket-wiping those scripts breaks legitimate demos.
  return out;
}

export function containsCreatorLinks(html: string): boolean {
  if (!html) return false;
  const attrRx = /\b(href|action|formaction)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRx.exec(html))) {
    const val = m[3] ?? m[4] ?? m[5] ?? "";
    if (isCreatorTarget(val)) return true;
  }
  return false;
}

/** Single entry point for anything leaving the sandbox. */
export function sanitizeForExport(html: string): string {
  return stripCreatorLinks(stripPreviewOnly(html));
}
