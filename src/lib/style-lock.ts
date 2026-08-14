// Style Lock — freeze the visual identity of an existing build while the
// user keeps adding data, sections, and features.
//
// Deterministic and client-safe: it reads the committed HTML, extracts a
// compact style fingerprint (CSS custom properties, colour literals, font
// families, radii, shadows) and turns it into a prompt directive that
// forbids restyling.

export interface StyleFingerprint {
  /** `--token: value` pairs declared in the document (bounded). */
  tokens: string[];
  /** Distinct colour literals in source order (bounded). */
  colors: string[];
  /** Distinct font families named by the document. */
  fonts: string[];
  /** Distinct border-radius values. */
  radii: string[];
  /** Distinct box-shadow values (truncated). */
  shadows: string[];
  /** Google Fonts / stylesheet hrefs the document links. */
  fontLinks: string[];
}

const MAX_TOKENS = 40;
const MAX_COLORS = 24;
const MAX_FONTS = 8;
const MAX_RADII = 8;
const MAX_SHADOWS = 4;
const MAX_LINKS = 4;

function uniq(list: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = raw.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** Extract a bounded, deterministic style fingerprint from a full document. */
export function extractStyleFingerprint(html: string): StyleFingerprint {
  const src = typeof html === "string" ? html : "";

  const tokens = uniq(
    Array.from(src.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}{]{1,80})[;}]/gi)).map(
      (m) => `${m[1]}: ${m[2].trim()}`,
    ),
    MAX_TOKENS,
  );

  const colors = uniq(
    Array.from(
      src.matchAll(
        /(#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla|oklch|lab|lch|color-mix)\([^()]{0,90}\))/gi,
      ),
    ).map((m) => m[1]),
    MAX_COLORS,
  );

  const fonts = uniq(
    Array.from(src.matchAll(/font-family\s*:\s*([^;}{]{1,120})[;}]/gi)).flatMap((m) =>
      m[1]
        .split(",")
        .map((f) => f.replace(/["']/g, "").trim())
        .filter((f) => f && !/^var\(/i.test(f)),
    ),
    MAX_FONTS,
  );

  const radii = uniq(
    Array.from(src.matchAll(/border-radius\s*:\s*([^;}{]{1,60})[;}]/gi)).map((m) => m[1].trim()),
    MAX_RADII,
  );

  const shadows = uniq(
    Array.from(src.matchAll(/box-shadow\s*:\s*([^;}{]{1,120})[;}]/gi)).map((m) =>
      m[1].trim().slice(0, 120),
    ),
    MAX_SHADOWS,
  );

  const fontLinks = uniq(
    Array.from(src.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi))
      .map((m) => m[1])
      .filter((h) => /fonts\.googleapis|fonts\.gstatic|\.css(\?|$)/i.test(h)),
    MAX_LINKS,
  );

  return { tokens, colors, fonts, radii, shadows, fontLinks };
}

export function isFingerprintEmpty(fp: StyleFingerprint): boolean {
  return (
    fp.tokens.length === 0 &&
    fp.colors.length === 0 &&
    fp.fonts.length === 0 &&
    fp.radii.length === 0 &&
    fp.shadows.length === 0 &&
    fp.fontLinks.length === 0
  );
}

/**
 * Prompt fragment appended to a refinement request when Style Lock is on.
 * Returns "" when there is nothing to lock (no committed build).
 */
export function styleLockDirective(html: string): string {
  if (!html || !html.trim()) return "";
  const fp = extractStyleFingerprint(html);
  if (isFingerprintEmpty(fp)) return "";

  const lines: string[] = [
    "[STYLE LOCK — HIGHEST PRIORITY, OVERRIDES ALL ART DIRECTION]",
    "The visual identity of the current document is LOCKED. Add the requested data, sections, and features ONLY.",
    "Hard rules:",
    "1. Do NOT change the colour palette, background, gradients, fonts, type scale, spacing rhythm, radii, borders, shadows, or motion.",
    "2. Do NOT redesign, re-theme, restructure, or 'improve' existing sections; keep their markup and classes intact.",
    "3. New UI MUST reuse the existing CSS variables, classes, and component patterns below — never invent new colours or fonts.",
    "4. Keep every existing <link> stylesheet/font tag exactly as-is.",
  ];

  if (fp.tokens.length) lines.push(`Locked tokens: ${fp.tokens.join("; ")}`);
  if (fp.colors.length) lines.push(`Locked colours: ${fp.colors.join(", ")}`);
  if (fp.fonts.length) lines.push(`Locked fonts: ${fp.fonts.join(", ")}`);
  if (fp.radii.length) lines.push(`Locked radii: ${fp.radii.join(", ")}`);
  if (fp.shadows.length) lines.push(`Locked shadows: ${fp.shadows.join(" | ")}`);
  if (fp.fontLinks.length) lines.push(`Locked stylesheets: ${fp.fontLinks.join(", ")}`);

  return lines.join("\n");
}
