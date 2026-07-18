// Tiny line-based diff summary — no dependencies. Not a full LCS; a cheap
// pointer walk that catches contiguous adds/removes well enough for a
// human-readable "what changed" summary.

export type DiffSummary = {
  linesAdded: number;
  linesRemoved: number;
  charsAdded: number;
  charsRemoved: number;
  hunks: { type: "add" | "remove"; line: number; text: string }[];
};

export function diffSummary(before: string, after: string, maxHunks = 8): DiffSummary {
  const a = before.split("\n");
  const b = after.split("\n");
  // Longest common prefix / suffix — captures the typical patched-region case.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA--; endB--; }

  const removed = a.slice(start, endA + 1);
  const added = b.slice(start, endB + 1);

  const hunks: DiffSummary["hunks"] = [];
  for (let i = 0; i < removed.length && hunks.length < maxHunks; i++) {
    hunks.push({ type: "remove", line: start + i + 1, text: removed[i].slice(0, 160) });
  }
  for (let i = 0; i < added.length && hunks.length < maxHunks; i++) {
    hunks.push({ type: "add", line: start + i + 1, text: added[i].slice(0, 160) });
  }

  return {
    linesAdded: added.length,
    linesRemoved: removed.length,
    charsAdded: Math.max(0, after.length - before.length),
    charsRemoved: Math.max(0, before.length - after.length),
    hunks,
  };
}
