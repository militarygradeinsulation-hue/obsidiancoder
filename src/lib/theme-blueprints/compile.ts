// Compile a ThemeBlueprint into a single CSS block that transforms existing
// hard-coded sandbox HTML across all 14 target surfaces. Highly-specific
// selectors + `!important` on structural properties override literal
// inline/style-tag values in emitted fixtures.
//
// Emits ONE `<style data-obsidian-theme-block="<id>">` tag — the deterministic
// apply/reset marker used by the preview injector.

import type { ThemeBlueprint } from "./types";

export const THEME_MARKER_ATTR = "data-obsidian-theme-block";

export type CompiledTheme = {
  id: string;
  name: string;
  css: string;
  linkHref?: string;   // optional <link rel=stylesheet> for remote fonts
};

const IMP = " !important";

function fontLink(bp: ThemeBlueprint): string | undefined {
  return bp.typePairing.googleFontsHref;
}

function scale(base: number, step: number, ratio: number): string {
  const px = Math.round(base * Math.pow(ratio, step) * 100) / 100;
  return `${px}px`;
}

export function compileBlueprint(bp: ThemeBlueprint): CompiledTheme {
  const t = bp.typeRatio;
  const c = bp.color;
  const s = bp.spacing;
  const r = bp.radius;
  const e = bp.edges;
  const el = bp.elevation;
  const m = bp.motion;

  const h1 = scale(t.baseSizePx, 4, t.scale);
  const h2 = scale(t.baseSizePx, 3, t.scale);
  const h3 = scale(t.baseSizePx, 2, t.scale);
  const h4 = scale(t.baseSizePx, 1, t.scale);
  const small = scale(t.baseSizePx, -1, t.scale);

  const css = `
:root, html, body {
  --obs-bg: ${c.bg};
  --obs-surface: ${c.surface};
  --obs-surface-alt: ${c.surfaceAlt};
  --obs-text: ${c.text};
  --obs-text-muted: ${c.textMuted};
  --obs-accent: ${c.accent};
  --obs-accent-contrast: ${c.accentContrast};
  --obs-border: ${c.border};
  --obs-radius-sm: ${r.sm};
  --obs-radius-md: ${r.md};
  --obs-radius-lg: ${r.lg};
  --obs-radius-pill: ${r.pill};
  --obs-step: ${s.step}px;
  --obs-section-y: ${s.sectionYPx}px;
  --obs-gap: ${s.gridGapPx}px;
  --obs-card-pad: ${s.cardPadPx}px;
  --obs-container: ${s.containerMaxPx}px;
  --obs-shadow-card: ${el.card};
  --obs-shadow-hover: ${el.cardHover};
  --obs-shadow-overlay: ${el.overlay};
  --obs-focus: ${el.focusRing};
  --obs-motion-ms: ${m.durationMs}ms;
  --obs-motion-ease: ${m.easing};
  --obs-border-w: ${e.borderWidthPx}px;
  --obs-border-style: ${e.borderStyle};
  color-scheme: ${c.mode};
}

/* Base surface + typography — override literal styles in fixtures. */
html body {
  background: ${c.bg}${IMP};
  color: ${c.text}${IMP};
  font-family: ${bp.typePairing.bodyFamily}${IMP};
  font-size: ${t.baseSizePx}px${IMP};
  font-weight: ${t.bodyWeight}${IMP};
  line-height: ${t.bodyLineHeight}${IMP};
  margin: 0${IMP};
  ${c.gradient ? `background-image: ${c.gradient}${IMP};` : ""}
}

html body h1, html body h2, html body h3, html body h4, html body h5, html body h6 {
  font-family: ${bp.typePairing.headingFamily}${IMP};
  font-weight: ${t.headingWeight}${IMP};
  letter-spacing: ${t.headingTracking}${IMP};
  line-height: ${t.headingLineHeight}${IMP};
  text-transform: ${t.headingCase}${IMP};
  color: ${c.text}${IMP};
}
html body h1 { font-size: ${h1}${IMP}; }
html body h2 { font-size: ${h2}${IMP}; }
html body h3 { font-size: ${h3}${IMP}; }
html body h4 { font-size: ${h4}${IMP}; }
html body small, html body .muted { color: ${c.textMuted}${IMP}; font-size: ${small}${IMP}; }
html body code, html body pre, html body kbd { font-family: ${bp.typePairing.monoFamily}${IMP}; }

/* Section rhythm */
html body section, html body .section {
  padding-top: ${s.sectionYPx}px${IMP};
  padding-bottom: ${s.sectionYPx}px${IMP};
}
html body .container, html body main { max-width: ${s.containerMaxPx}px${IMP}; margin-left: auto${IMP}; margin-right: auto${IMP}; }

/* Grids & gaps */
html body [class*="grid"], html body .grid, html body .cards, html body .row {
  gap: ${s.gridGapPx}px${IMP};
}

/* Cards & surfaces */
html body .card, html body article, html body .panel, html body .tile, html body .surface {
  background: ${c.surface}${IMP};
  color: ${c.text}${IMP};
  border: ${e.borderWidthPx}px ${e.borderStyle} ${c.border}${IMP};
  border-radius: ${r.md}${IMP};
  padding: ${s.cardPadPx}px${IMP};
  box-shadow: ${el.card}${IMP};
  transition: transform var(--obs-motion-ms) var(--obs-motion-ease), box-shadow var(--obs-motion-ms) var(--obs-motion-ease)${IMP};
}
html body .card:hover, html body article:hover, html body .panel:hover, html body .tile:hover {
  box-shadow: ${el.cardHover}${IMP};
  transform: translateY(${m.hoverLiftPx}px)${IMP};
}

/* Buttons */
html body button, html body .btn, html body [role="button"], html body input[type="button"], html body input[type="submit"], html body a.button {
  background: ${c.accent}${IMP};
  color: ${c.accentContrast}${IMP};
  font-family: ${bp.typePairing.bodyFamily}${IMP};
  font-weight: 600${IMP};
  letter-spacing: 0.01em${IMP};
  border: ${e.borderWidthPx}px ${e.borderStyle} ${c.border}${IMP};
  border-radius: ${r.md}${IMP};
  padding: ${Math.max(8, s.step * 1.5)}px ${Math.max(14, s.step * 3)}px${IMP};
  box-shadow: ${el.card === "none" ? "none" : el.card}${IMP};
  cursor: pointer${IMP};
  transition: transform var(--obs-motion-ms) var(--obs-motion-ease), box-shadow var(--obs-motion-ms) var(--obs-motion-ease)${IMP};
  text-transform: ${t.headingCase === "uppercase" ? "uppercase" : "none"}${IMP};
}
html body button:hover, html body .btn:hover, html body [role="button"]:hover {
  box-shadow: ${el.cardHover === "none" ? "none" : el.cardHover}${IMP};
  transform: translateY(${m.hoverLiftPx}px)${IMP};
}
html body button:focus-visible, html body a:focus-visible, html body input:focus-visible, html body [role="button"]:focus-visible {
  outline: ${el.focusRing}${IMP};
  outline-offset: ${e.outlineOffsetPx}px${IMP};
}

/* Secondary / ghost buttons — apply to .btn-secondary / .ghost only */
html body .btn-secondary, html body .btn.ghost, html body button.ghost {
  background: transparent${IMP};
  color: ${c.text}${IMP};
  border: ${Math.max(1, e.borderWidthPx)}px ${e.borderStyle} ${c.border}${IMP};
  box-shadow: none${IMP};
}

/* Inputs */
html body input, html body textarea, html body select {
  background: ${c.surfaceAlt}${IMP};
  color: ${c.text}${IMP};
  font-family: ${bp.typePairing.bodyFamily}${IMP};
  border: ${Math.max(1, e.borderWidthPx)}px ${e.borderStyle} ${c.border}${IMP};
  border-radius: ${r.sm}${IMP};
  padding: ${Math.max(8, s.step * 1.25)}px ${Math.max(10, s.step * 1.5)}px${IMP};
  outline: none;
}

/* Navigation */
html body nav, html body header, html body .navbar {
  background: ${c.mode === "dark" ? c.surface : c.surface}${IMP};
  color: ${c.text}${IMP};
  border-bottom: ${Math.max(1, e.borderWidthPx)}px ${e.borderStyle} ${c.border}${IMP};
  padding: ${Math.max(8, s.step * 2)}px ${Math.max(12, s.step * 3)}px${IMP};
  font-family: ${bp.typePairing.headingFamily}${IMP};
}
html body nav a, html body header a, html body .navbar a {
  color: ${c.text}${IMP};
  text-decoration: none${IMP};
}

/* Tables */
html body table { border-collapse: collapse${IMP}; width: 100%${IMP}; font-family: ${bp.typePairing.bodyFamily}${IMP}; }
html body th, html body td {
  border-bottom: ${e.dividerStyle === "none" ? "0" : "1px"} ${e.borderStyle} ${c.border}${IMP};
  padding: ${Math.max(8, s.step * 1.5)}px ${Math.max(10, s.step * 2)}px${IMP};
  text-align: left${IMP};
  color: ${c.text}${IMP};
}
html body th { background: ${c.surfaceAlt}${IMP}; font-weight: 600${IMP}; }

/* Badges / pills */
html body .badge, html body .chip, html body .pill, html body .tag {
  display: inline-flex${IMP};
  padding: ${Math.max(2, s.step * 0.5)}px ${Math.max(8, s.step * 1.25)}px${IMP};
  border-radius: ${r.pill}${IMP};
  background: ${c.surfaceAlt}${IMP};
  color: ${c.text}${IMP};
  border: 1px ${e.borderStyle} ${c.border}${IMP};
  font-size: ${small}${IMP};
  font-weight: 600${IMP};
}

/* Dividers */
html body hr {
  border: 0${IMP};
  border-top: ${e.dividerStyle === "double" ? "3px double" : e.dividerStyle === "heavy" ? "2px solid" : "1px solid"} ${c.border}${IMP};
  margin: ${s.step * 4}px 0${IMP};
}

/* Motion / reduced-motion safety */
@media (prefers-reduced-motion: reduce) {
  html body *, html body *::before, html body *::after {
    transition-duration: 1ms !important;
    animation-duration: 1ms !important;
  }
}
`.trim();

  return { id: bp.id, name: bp.name, css, linkHref: fontLink(bp) };
}

/** Idempotent injector — replaces any existing marked block; never stacks
 *  duplicates. Accepts full HTML document string. */
export function applyBlueprintToHtml(html: string, compiled: CompiledTheme): string {
  const stripped = stripAppliedBlueprint(html);
  const linkTag = compiled.linkHref
    ? `<link rel="stylesheet" href="${compiled.linkHref}" data-obsidian-theme-link="${compiled.id}">`
    : "";
  const block = `${linkTag}<style ${THEME_MARKER_ATTR}="${compiled.id}" data-obsidian-theme-name="${escapeAttr(compiled.name)}">\n${compiled.css}\n</style>`;
  if (/<\/head>/i.test(stripped)) return stripped.replace(/<\/head>/i, `${block}</head>`);
  if (/<body[^>]*>/i.test(stripped)) return stripped.replace(/<body([^>]*)>/i, `<body$1>${block}`);
  return block + stripped;
}

/** Remove ALL previously-injected blueprint blocks and their optional font
 *  links — idempotent and deterministic. */
export function stripAppliedBlueprint(html: string): string {
  return html
    .replace(/<link[^>]*data-obsidian-theme-link="[^"]*"[^>]*>\s*/gi, "")
    .replace(new RegExp(`<style[^>]*${THEME_MARKER_ATTR}="[^"]*"[^>]*>[\\s\\S]*?</style>\\s*`, "gi"), "");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
