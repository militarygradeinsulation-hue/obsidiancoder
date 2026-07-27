// Barrel + helpers used by UI, generation, and tests.
export type { ThemeBlueprint, StyleSignature } from "./types";
export { BUILT_IN_BLUEPRINTS, getBuiltIn } from "./built-ins";
export {
  compileBlueprint,
  applyBlueprintToHtml,
  stripAppliedBlueprint,
  THEME_MARKER_ATTR,
  type CompiledTheme,
} from "./compile";
export { computeSignature, signatureDistance, nonColorAxesDiffCount, pickFarthest } from "./signature";
export { normalizeRemoteToBlueprint, type RemoteThemeHit } from "./normalize";
export { renderPreviewHtml } from "./preview";

import type { ThemeBlueprint } from "./types";

/** Compact, model-friendly summary. Fed into the AI system prompt so
 *  follow-up generations honour the selected blueprint. */
export function blueprintToSystemPrompt(bp: ThemeBlueprint): string {
  const c = bp.color, t = bp.typeRatio, s = bp.spacing, r = bp.radius, e = bp.edges, el = bp.elevation, m = bp.motion;
  return `ACTIVE THEME BLUEPRINT — preserve on every edit and generation.
id: ${bp.id}  name: ${bp.name}  layout-archetype: ${bp.layout}  mode: ${c.mode}
Type — heading family: ${bp.typePairing.headingFamily}; body family: ${bp.typePairing.bodyFamily}; mono: ${bp.typePairing.monoFamily}
Type ratio — base ${t.baseSizePx}px, scale ${t.scale}, heading weight ${t.headingWeight}, heading case ${t.headingCase}, tracking ${t.headingTracking}
Spacing — step ${s.step}px, section-y ${s.sectionYPx}px, grid gap ${s.gridGapPx}px, card pad ${s.cardPadPx}px, container ${s.containerMaxPx}px
Radius — sm ${r.sm}, md ${r.md}, lg ${r.lg}, pill ${r.pill}
Edges — border ${e.borderWidthPx}px ${e.borderStyle} ${e.borderColor}; divider ${e.dividerStyle}
Elevation — card: ${el.card}; hover: ${el.cardHover}; overlay: ${el.overlay}; focus ring: ${el.focusRing}
Motion — ${m.durationMs}ms ${m.easing}; hover-lift ${m.hoverLiftPx}px; reduced-motion safe: ${m.reducedMotionSafe}
Color — bg ${c.bg}, surface ${c.surface}, surface-alt ${c.surfaceAlt}, text ${c.text}, muted ${c.textMuted}, accent ${c.accent} (contrast ${c.accentContrast}), border ${c.border}${c.gradient ? `; gradient ${c.gradient}` : ""}
Rules: apply these tokens instead of inventing new colors/spacing; do not switch layout archetype without an explicit request; keep radius/border consistent across every surface.`;
}
