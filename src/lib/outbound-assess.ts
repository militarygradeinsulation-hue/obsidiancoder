// One authoritative outbound-artifact helper. Every user-facing outbound
// path (Go Live, Featured Demos, Export, Save-to-Gallery) MUST call
// assessOutbound(rawHtml, ctx) and refuse to proceed unless ok === true.
//
// Guarantees:
//   1. Runs the same deterministic pipeline as commit-time assessment:
//      buildArtifact (clean + neutralize + repair scripts) →
//      applyNavigationRepair → static preview policy → parity check.
//   2. Never invokes Claude. Outbound gating is deterministic-only for
//      cost predictability. Claude QA happens at COMMIT time via
//      finalizeCandidate.
//   3. Returns the EXACT finalHtml that must be sent outbound. Callers
//      must send `result.finalHtml` — not the raw stableHtml — so that
//      Go Live, Demos, Export, and metadata all agree on one artifact.
//   4. Emits a compact `provenance` object suitable for logging into
//      QaSessionStatus / VersionMetadata.

import { buildArtifact } from "./publish-artifact";
import { repairNavigation, type NavRepair } from "./navigation-repair";
import { scanNavigationViolations, type PreviewViolation } from "./preview-policy";
import { checkParity, type ParityReport } from "./parity-check";
import { computeAssessedHash } from "./qa-status";

export interface OutboundContext {
  themeCss?: string | null;
  themeName?: string | null;
  themeBlueprintId?: string | null;
  /** Optional label to include in the provenance for logs. */
  surface?: "go-live" | "featured-demo" | "export" | "save-gallery" | string;
}

export interface OutboundAssessment {
  ok: boolean;
  finalHtml: string;
  repairs: NavRepair[];
  violations: PreviewViolation[];
  parity: ParityReport;
  blockers: string[];
  provenance: {
    surface: string;
    assessedHash: string;
    at: number;
    deterministicRepairCount: number;
    parityOk: boolean;
    charDelta: number;
  };
}

/** Convert a preview policy violation into a short human blocker string. */
function violationLabel(v: PreviewViolation): string {
  const target = "target" in v && v.target ? ` "${String((v as { target: unknown }).target).slice(0, 60)}"` : "";
  return `${v.code}${target}`;
}

/**
 * Deterministically assess raw HTML for outbound use. Never mutates inputs.
 * Callers should treat `finalHtml` as the ONLY safe artifact to send.
 */
export function assessOutbound(rawHtml: string, ctx: OutboundContext = {}): OutboundAssessment {
  const surface = ctx.surface ?? "outbound";
  const stableHtml = rawHtml || "";

  // Deterministic build pipeline (clean + neutralize + script mask + theme).
  const artifact = buildArtifact({
    html: stableHtml,
    themeCss: ctx.themeCss ?? null,
    themeName: ctx.themeName ?? null,
    surface: "publish",
  });
  const built = artifact.html;

  // Second-pass navigation repair against the built artifact.
  const nav = repairNavigation(built);
  const repaired = nav.html;

  // Preview policy: static gate.
  const violations = scanNavigationViolations(repaired);
  const blockingViolations = violations;

  // Parity against the ORIGINAL raw html to detect silent content loss.
  const parity = checkParity(stableHtml, repaired);

  const blockers: string[] = [];
  for (const v of blockingViolations) blockers.push(violationLabel(v));
  if (!parity.ok) for (const b of parity.blockers) blockers.push(b);

  const ok = blockers.length === 0;
  const finalHtml = ok ? repaired : stableHtml;

  const provenance = {
    surface,
    assessedHash: computeAssessedHash({
      html: stableHtml,
      themeCss: ctx.themeCss ?? null,
      themeName: ctx.themeName ?? null,
      themeBlueprintId: ctx.themeBlueprintId ?? null,
    }),
    at: Date.now(),
    deterministicRepairCount: (artifact.repairs?.length ?? 0) + nav.repairs.length,
    parityOk: parity.ok,
    charDelta: repaired.length - stableHtml.length,
  };

  return {
    ok,
    finalHtml,
    repairs: [...(artifact.repairs ?? []), ...nav.repairs],
    violations,
    parity,
    blockers,
    provenance,
  };
}
