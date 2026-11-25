import { extractStyleFingerprint } from "./style-lock";

export interface RefinePreservationReport {
  ok: boolean;
  blockers: string[];
}

function retainedRatio(before: readonly string[], after: readonly string[]): number {
  if (!before.length) return 1;
  const afterSet = new Set(after.map((value) => value.toLowerCase()));
  let retained = 0;
  for (const value of before) {
    if (afterSet.has(value.toLowerCase())) retained += 1;
  }
  return retained / before.length;
}

function stripSignature(html: string): string {
  return html.replace(/<footer\b[^>]*data-obs-build-signature[\s\S]*?<\/footer>/gi, "");
}

function structuralTags(html: string): string[] {
  return Array.from(
    stripSignature(html).matchAll(/<(header|nav|main|section|aside|footer)\b/gi),
    (match) => match[1].toLowerCase(),
  ).slice(0, 80);
}

function structuralCount(html: string): number {
  return structuralTags(html).length;
}

function classNames(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of stripSignature(html).matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)) {
    for (const token of match[1].split(/\s+/)) {
      const value = token.trim();
      if (!value || value.length > 100 || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
      if (out.length >= 120) return out;
    }
  }
  return out;
}

function styleBytes(html: string): number {
  let total = 0;
  for (const match of stripSignature(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    total += match[1].length;
  }
  return total;
}

function lcsRatio(before: readonly string[], after: readonly string[]): number {
  if (!before.length) return 1;
  if (!after.length) return 0;
  const rows = new Array(after.length + 1).fill(0);
  for (let i = 1; i <= before.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= after.length; j += 1) {
      const prior = rows[j];
      if (before[i - 1] === after[j - 1]) rows[j] = diagonal + 1;
      else rows[j] = Math.max(rows[j], rows[j - 1]);
      diagonal = prior;
    }
  }
  return rows[after.length] / before.length;
}

export function checkRefinePreservation(
  stableHtml: string,
  candidateHtml: string,
  userRequest: string,
): RefinePreservationReport {
  if (!stableHtml || !candidateHtml) return { ok: true, blockers: [] };

  const request = (userRequest || "").toLowerCase();
  const broadRedesign =
    /\b(redesign|re-?design|retheme|re-theme|overhaul|start over|new visual style|completely change|replace the design|replace the layout|change the whole design|change the entire design)\b/.test(request);
  const allowsPalette = broadRedesign || /\b(colou?r|palette|background|gradient|theme|brand colors?)\b/.test(request);
  const allowsTypography = broadRedesign || /\b(font|typeface|typography|text style|heading style)\b/.test(request);
  const allowsReorder = broadRedesign || /\b(move|reorder|swap|rearrange)\b/.test(request);
  const allowsSectionDelta = broadRedesign || /\b(add|remove|delete)\b[^.]{0,40}\b(section|header|footer|nav|sidebar|panel)\b/.test(request);

  const before = extractStyleFingerprint(stableHtml);
  const after = extractStyleFingerprint(candidateHtml);
  const blockers: string[] = [];

  if (!allowsPalette && before.colors.length >= 3) {
    const ratio = retainedRatio(before.colors, after.colors);
    if (ratio < 0.72) blockers.push(`palette drift (${Math.round(ratio * 100)}% retained)`);
  }

  if (!allowsTypography && before.fonts.length) {
    const ratio = retainedRatio(before.fonts, after.fonts);
    if (ratio < 0.85) blockers.push(`font drift (${Math.round(ratio * 100)}% retained)`);
  }

  if (!broadRedesign) {
    const oldClasses = classNames(stableHtml);
    const newClasses = classNames(candidateHtml);
    if (oldClasses.length >= 6) {
      const ratio = retainedRatio(oldClasses, newClasses);
      if (ratio < 0.68) blockers.push(`component/class drift (${Math.round(ratio * 100)}% retained)`);
    }

    const oldStyleBytes = styleBytes(stableHtml);
    const newStyleBytes = styleBytes(candidateHtml);
    if (oldStyleBytes >= 500 && newStyleBytes < oldStyleBytes * 0.72) {
      blockers.push(`existing CSS was replaced or heavily removed (${Math.round((newStyleBytes / oldStyleBytes) * 100)}% retained by size)`);
    }

    const oldStructure = structuralTags(stableHtml);
    const newStructure = structuralTags(candidateHtml);
    if (oldStructure.length >= 3) {
      const ratio = lcsRatio(oldStructure, newStructure);
      const floor = allowsReorder ? 0.58 : 0.78;
      if (ratio < floor) blockers.push(`primary section order drift (${Math.round(ratio * 100)}% retained)`);
    }

    const oldCount = structuralCount(stableHtml);
    const newCount = structuralCount(candidateHtml);
    const allowedDelta = allowsSectionDelta ? Math.max(2, Math.ceil(oldCount * 0.25)) : 1;
    if (oldCount >= 2 && Math.abs(newCount - oldCount) > allowedDelta) {
      blockers.push(`section structure drift (${oldCount} -> ${newCount})`);
    }
  }

  return { ok: blockers.length === 0, blockers };
}
