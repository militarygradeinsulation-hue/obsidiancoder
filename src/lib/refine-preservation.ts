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

function structuralCount(html: string): number {
  const matches = html.match(/<(?:header|nav|main|section|aside|footer)\b/gi);
  return matches?.length ?? 0;
}

export function checkRefinePreservation(
  stableHtml: string,
  candidateHtml: string,
  userRequest: string,
): RefinePreservationReport {
  if (!stableHtml || !candidateHtml) return { ok: true, blockers: [] };

  const request = (userRequest || "").toLowerCase();
  const allowsPalette = /\b(colou?r|palette|background|gradient|theme|brand)\b/.test(request);
  const allowsTypography = /\b(font|typeface|typography|text style|heading style)\b/.test(request);
  const allowsStructure = /\b(add|remove|delete|move|reorder|section|layout|grid|column|sidebar|header|footer|nav|navigation)\b/.test(request);

  const before = extractStyleFingerprint(stableHtml);
  const after = extractStyleFingerprint(candidateHtml);
  const blockers: string[] = [];

  if (!allowsPalette && before.colors.length >= 3) {
    const ratio = retainedRatio(before.colors, after.colors);
    if (ratio < 0.55) blockers.push(`palette drift (${Math.round(ratio * 100)}% retained)`);
  }

  if (!allowsTypography && before.fonts.length) {
    const ratio = retainedRatio(before.fonts, after.fonts);
    if (ratio < 0.75) blockers.push(`font drift (${Math.round(ratio * 100)}% retained)`);
  }

  if (!allowsStructure) {
    const oldCount = structuralCount(stableHtml);
    const newCount = structuralCount(candidateHtml);
    const allowedDelta = Math.max(2, Math.ceil(oldCount * 0.4));
    if (oldCount >= 2 && Math.abs(newCount - oldCount) > allowedDelta) {
      blockers.push(`section structure drift (${oldCount} -> ${newCount})`);
    }
  }

  return { ok: blockers.length === 0, blockers };
}
