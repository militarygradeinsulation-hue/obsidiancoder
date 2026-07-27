// StyleSignature computation + distance function.
// Distance is dominated by non-color, structural axes so Surprise-Me and
// uniqueness tests reject "same layout, different palette" pairs.

import type { StyleSignature, ThemeBlueprint } from "./types";

function firstFamily(stack: string): string {
  const first = stack.split(",")[0].trim().replace(/^"|"$/g, "");
  return first.toLowerCase();
}

function parsePx(s: string): number {
  const m = /(-?\d+(?:\.\d+)?)\s*px/i.exec(s);
  return m ? Number(m[1]) : 0;
}

function hexToHue(hex: string): number {
  // Accepts #rgb, #rrggbb, rgb(...). Non-hex falls back to a hash-derived hue.
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    let h = 0;
    for (let i = 0; i < hex.length; i++) h = (h * 31 + hex.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  let r: number, g: number, b: number;
  if (m[1].length === 3) {
    r = parseInt(m[1][0] + m[1][0], 16);
    g = parseInt(m[1][1] + m[1][1], 16);
    b = parseInt(m[1][2] + m[1][2], 16);
  } else {
    r = parseInt(m[1].slice(0, 2), 16);
    g = parseInt(m[1].slice(2, 4), 16);
    b = parseInt(m[1].slice(4, 6), 16);
  }
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let hue = 0;
  if (max === rn) hue = ((gn - bn) / d + (gn < bn ? 6 : 0));
  else if (max === gn) hue = ((bn - rn) / d + 2);
  else hue = ((rn - gn) / d + 4);
  return Math.round((hue * 60) % 360);
}

export function computeSignature(bp: ThemeBlueprint): StyleSignature {
  return {
    id: bp.id,
    layout: bp.layout,
    typeHead: firstFamily(bp.typePairing.headingFamily),
    typeBody: firstFamily(bp.typePairing.bodyFamily),
    ratio: bp.typeRatio.scale,
    headingWeight: bp.typeRatio.headingWeight,
    headingCase: bp.typeRatio.headingCase,
    step: bp.spacing.step,
    sectionY: bp.spacing.sectionYPx,
    radiusMdPx: parsePx(bp.radius.md),
    borderWidth: bp.edges.borderWidthPx,
    hasShadow: bp.elevation.card !== "none",
    motionDuration: bp.motion.durationMs,
    hoverLift: bp.motion.hoverLiftPx,
    mode: bp.color.mode,
    accentHue: hexToHue(bp.color.accent),
  };
}

/** Distance metric. Non-color axes weighted heavier than color so that two
 *  blueprints sharing only palette differences are still "close". */
export function signatureDistance(a: StyleSignature, b: StyleSignature): number {
  let d = 0;
  d += a.layout === b.layout ? 0 : 8;
  d += a.typeHead === b.typeHead ? 0 : 4;
  d += a.typeBody === b.typeBody ? 0 : 3;
  d += Math.min(6, Math.abs(a.ratio - b.ratio) * 8);
  d += Math.min(4, Math.abs(a.headingWeight - b.headingWeight) / 100);
  d += a.headingCase === b.headingCase ? 0 : 3;
  d += Math.min(4, Math.abs(a.step - b.step) / 2);
  d += Math.min(6, Math.abs(a.sectionY - b.sectionY) / 24);
  d += Math.min(6, Math.abs(a.radiusMdPx - b.radiusMdPx) / 6);
  d += Math.min(4, Math.abs(a.borderWidth - b.borderWidth) * 1.5);
  d += a.hasShadow === b.hasShadow ? 0 : 3;
  d += Math.min(4, Math.abs(a.motionDuration - b.motionDuration) / 80);
  d += Math.min(3, Math.abs(a.hoverLift - b.hoverLift));
  d += a.mode === b.mode ? 0 : 2;
  const hueDiff = Math.min(Math.abs(a.accentHue - b.accentHue), 360 - Math.abs(a.accentHue - b.accentHue));
  d += Math.min(2, hueDiff / 90);
  return d;
}

/** Count of non-color axes on which two signatures differ. Uniqueness tests
 *  use this to require difference in >= N structural dimensions. */
export function nonColorAxesDiffCount(a: StyleSignature, b: StyleSignature): number {
  let n = 0;
  if (a.layout !== b.layout) n++;
  if (a.typeHead !== b.typeHead) n++;
  if (a.typeBody !== b.typeBody) n++;
  if (Math.abs(a.ratio - b.ratio) > 0.001) n++;
  if (a.headingWeight !== b.headingWeight) n++;
  if (a.headingCase !== b.headingCase) n++;
  if (a.step !== b.step) n++;
  if (Math.abs(a.sectionY - b.sectionY) > 4) n++;
  if (Math.abs(a.radiusMdPx - b.radiusMdPx) > 1) n++;
  if (a.borderWidth !== b.borderWidth) n++;
  if (a.hasShadow !== b.hasShadow) n++;
  if (Math.abs(a.motionDuration - b.motionDuration) > 20) n++;
  if (a.hoverLift !== b.hoverLift) n++;
  return n;
}

/** Return the blueprint whose signature is FARTHEST from `current`. */
export function pickFarthest(
  candidates: ThemeBlueprint[],
  current: ThemeBlueprint | null,
): ThemeBlueprint | null {
  if (!candidates.length) return null;
  if (!current) return candidates[0];
  const cur = computeSignature(current);
  let best = candidates[0];
  let bestD = -1;
  for (const c of candidates) {
    if (c.id === current.id) continue;
    const d = signatureDistance(computeSignature(c), cur);
    if (d > bestD) { bestD = d; best = c; }
  }
  return best;
}
