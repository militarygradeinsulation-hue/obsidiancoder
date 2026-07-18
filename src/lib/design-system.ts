// Deterministic design-system extractor. Scans a document's CSS and inline
// style attributes to summarize colors, fonts, spacing, radii, and shadows.
// Also exposes a token-mutation helper for global edits without AI.

export type DesignTokens = {
  colors: string[];
  fonts: string[];
  radii: string[];
  shadows: string[];
  spacing: string[];
};

const COLOR_RX = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\)/g;
const FONT_RX = /font-family\s*:\s*([^;{}"']+)/gi;
const RADIUS_RX = /border-radius\s*:\s*([^;{}]+)/gi;
const SHADOW_RX = /box-shadow\s*:\s*([^;{}]+)/gi;
const SPACING_RX = /\b(?:padding|margin|gap)\s*:\s*([^;{}]+)/gi;

function collect(text: string, rx: RegExp, group = 0): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(rx.source, rx.flags);
  while ((m = re.exec(text)) !== null) {
    const val = (group === 0 ? m[0] : m[group] ?? "").trim();
    if (val) out.add(val);
  }
  return Array.from(out);
}

export function extractDesignTokens(html: string): DesignTokens {
  const styles = Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    .map((m) => m[1])
    .join("\n");
  const inlineStyles = Array.from(html.matchAll(/style\s*=\s*"([^"]+)"/gi))
    .map((m) => m[1])
    .join(";");
  const source = `${styles}\n${inlineStyles}`;

  return {
    colors: collect(source, COLOR_RX).slice(0, 24),
    fonts: collect(source, FONT_RX, 1).slice(0, 12),
    radii: collect(source, RADIUS_RX, 1).slice(0, 12),
    shadows: collect(source, SHADOW_RX, 1).slice(0, 12),
    spacing: collect(source, SPACING_RX, 1).slice(0, 12),
  };
}

/** Replace every occurrence of `from` color with `to` inside CSS/style. */
export function replaceColor(html: string, from: string, to: string): { html: string; changes: number } {
  if (!from || !to) return { html, changes: 0 };
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = new RegExp(escaped, "gi");
  const matches = html.match(rx) ?? [];
  return { html: matches.length ? html.replace(rx, to) : html, changes: matches.length };
}

/** Set a global CSS variable, appending to the last <style> or creating one. */
export function setCssVariable(html: string, name: string, value: string): { html: string; changed: boolean } {
  const varName = name.startsWith("--") ? name : `--${name}`;
  const rule = `:root { ${varName}: ${value}; }`;
  if (/<style\b[^>]*>[\s\S]*?<\/style>/i.test(html)) {
    return {
      html: html.replace(/<\/style>/i, `\n${rule}\n</style>`),
      changed: true,
    };
  }
  if (/<head\b[^>]*>/i.test(html)) {
    return {
      html: html.replace(/<head\b[^>]*>/i, (m) => `${m}\n<style>${rule}</style>`),
      changed: true,
    };
  }
  return { html: `<style>${rule}</style>\n${html}`, changed: true };
}
