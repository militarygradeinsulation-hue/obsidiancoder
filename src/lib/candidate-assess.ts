// Deterministic candidate assessment. Runs the resource-safe navigation
// repair, HTML validation, and parity check on a proposed HTML candidate
// against the exact publish artifact. No AI calls. Safe to run on every
// commit path.
//
// Comparison surfaces:
//   render  — themed repaired source, no runtime bridge, no preview
//             instrumentation. This is the closest analogue of what the
//             user sees in the sandbox without the diagnostic bridge.
//   publish — themed repaired source with preview-only instrumentation
//             stripped. Exact byte string that ships.

import { buildArtifact, type Artifact } from "./publish-artifact";
import { checkParity, type ParityReport } from "./parity-check";
import { validateHtml, type ValidationReport } from "./validation";
import { checkDesignFloor, type DesignReport } from "./design-floor";
import type { NavRepair } from "./navigation-repair";
import type { PreviewViolation } from "./preview-policy";

export interface AssessInput {
  html: string;
  themeCss?: string | null;
  themeName?: string | null;
}

export interface AssessResult {
  ok: boolean;
  /** Repaired source HTML — commit this back into the session on ok. */
  repairedHtml: string;
  /** Deterministic repairs applied during this assessment. */
  repairs: NavRepair[];
  /** Remaining nav violations after repair (empty when ok). */
  remainingViolations: PreviewViolation[];
  /** Concise blocker strings for terminal/UI. */
  blockers: string[];
  /** Publish-surface artifact string (exact bytes to ship). */
  publishHtml: string;
  /** Bridge-free render surface used for parity comparison. */
  renderHtml: string;
  /** Publish artifact object for callers that need `safeToPublish`. */
  publishArtifact: Artifact;
  /** Validation report over the *repaired* HTML. Authoritative. */
  validation: ValidationReport;
  /** Design-floor report over the *repaired* HTML. */
  design: DesignReport;
  /** Parity report (render surface vs. publish surface). */
  parity: ParityReport;
}

// LRU cache keyed by (surface-independent) inputs. Cache changes with
// raw HTML, theme name, or theme CSS bytes.
const CACHE = new Map<string, AssessResult>();
const CACHE_MAX = 32;

function cacheKey(input: AssessInput): string {
  const raw = input.html || "";
  const themeCss = input.themeCss ?? "";
  const themeName = input.themeName ?? "";
  // Simple length+content fingerprint keeps the key bounded but
  // strong enough to distinguish different documents/themes.
  return `${raw.length}:${themeName}:${themeCss.length}:${hash(raw)}:${hash(themeCss)}`;
}
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

export function invalidateAssessCache(): void { CACHE.clear(); }

export function assessCandidateForCommit(input: AssessInput): AssessResult {
  const key = cacheKey(input);
  const cached = CACHE.get(key);
  if (cached) return cached;

  const publishArt = buildArtifact({
    html: input.html,
    themeCss: input.themeCss ?? null,
    themeName: input.themeName ?? null,
    surface: "publish",
  });
  const renderArt = buildArtifact({
    html: input.html,
    themeCss: input.themeCss ?? null,
    themeName: input.themeName ?? null,
    surface: "render",
  });

  const blockers: string[] = [];

  // Rerun validation on the REPAIRED source (not the pre-repair candidate).
  // Repair only removes attributes/expressions; it should never introduce
  // structural HTML errors. If it did, we must catch it here.
  const validation = validateHtml(publishArt.repairedSourceHtml);
  if (validation.status === "failed") {
    for (const issue of validation.issues.filter((i) => i.severity === "blocking").slice(0, 3)) {
      blockers.push(`validation:${issue.code}`);
    }
    if (blockers.length === 0) blockers.push("validation:failed");
  }

  // Design floor. ONLY truncation blocks a commit: a document that stopped
  // mid-stream is objectively broken. Taste-level findings (thin CSS, no
  // layout system, default anchors) are reported for the UI and the
  // regeneration decision, but they must never revert a user's build —
  // blocking on them made every lightly-styled page and every patch to one
  // permanently uncommittable.
  const design = checkDesignFloor(publishArt.repairedSourceHtml);
  if (design.incomplete) blockers.push("design:incomplete");



  if (!publishArt.safeToPublish) {
    for (const v of publishArt.violations.slice(0, 3)) {
      blockers.push(`${v.code}${v.target ? `: ${v.target}` : ""}`);
    }
    if (blockers.length === 0 && !publishArt.safeToPublish) {
      blockers.push("publish artifact unsafe");
    }
  }

  // Parity: bridge-free render vs. publish. Both surfaces derive from the
  // same repaired source, so a healthy pipeline should produce near-zero
  // deltas. Any large drop points at a destructive difference.
  const parity = checkParity(renderArt.html, publishArt.html);
  if (!parity.ok) {
    for (const b of parity.blockers.slice(0, 3)) blockers.push(`parity:${b}`);
  }

  const result: AssessResult = {
    ok: blockers.length === 0,
    repairedHtml: publishArt.repairedSourceHtml,
    repairs: publishArt.repairs,
    remainingViolations: publishArt.violations,
    blockers,
    publishHtml: publishArt.html,
    renderHtml: renderArt.html,
    publishArtifact: publishArt,
    validation,
    design,
    parity,
  };

  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, result);
  return result;
}
