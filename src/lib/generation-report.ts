// Human-readable summary of a generation cycle. Pairs with VersionMetadata.

import type { VersionMetadata } from "./version-metadata";

export function formatReport(m: VersionMetadata): string {
  const lines: string[] = [];
  lines.push(`Request: ${m.request.slice(0, 120)}${m.request.length > 120 ? "…" : ""}`);
  lines.push(`Strategy: ${m.strategy} (${m.taskType})  ·  model ${m.model} [${m.tier}]`);
  lines.push(`Context: tier ${m.contextTier} (${m.contextChars} chars)`);
  if (m.patchOperations != null) lines.push(`Patch: ${m.patchOperations} operations`);
  lines.push(`Diff: +${m.charsAdded} / -${m.charsRemoved} chars  ·  ${m.durationMs}ms`);
  lines.push(`Validation: ${m.validation.status} — ${m.validation.summary}`);
  if (m.repairAttempts.length) {
    lines.push(
      `Repair: ${m.repairAttempts
        .map((r, i) => `#${i + 1} ${r.kind}${r.usedCredits ? "*" : ""} (${r.fixes.length} fix${r.fixes.length === 1 ? "" : "es"})`)
        .join(", ")}${m.repairAttempts.some((r) => r.usedCredits) ? "  *used AI credits" : ""}`
    );
  }
  return lines.join("\n");
}
