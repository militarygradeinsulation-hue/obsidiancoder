// Single central builder for the exact HTML artifact used by every
// user-facing publish path: sandbox preview source, hidden parity iframe,
// Go Live / share, featured demos, clean HTML export, and cloud save.
//
// Pipeline (single pass, single source of truth):
//   raw source
//     → deterministic navigation repair (resource-safe)
//     → theme injection (exactly once)
//     → surface-specific finishing:
//        preview : + runtime bridge
//        parity  : + runtime bridge (post-repair; same source as publish)
//        publish : + preview markers stripped
//
// Nothing downstream may sanitize again with different regexes.

import { stripPreviewOnly } from "./clean-export";
import { injectRuntimeBridge } from "./runtime-bridge";
import { scanNavigationViolations, type PreviewViolation } from "./preview-policy";
import { repairNavigation, type NavRepair } from "./navigation-repair";

export type ArtifactSurface = "preview" | "parity" | "publish";

export interface ArtifactInput {
  html: string;
  themeCss?: string | null;
  themeName?: string | null;
  surface: ArtifactSurface;
}

export interface Artifact {
  surface: ArtifactSurface;
  html: string;
  /**
   * The repaired *source* HTML — no runtime bridge, no theme injection.
   * Callers may commit this back into their session as the new canonical
   * document. It is byte-identical to the source when repair made no
   * changes.
   */
  repairedSourceHtml: string;
  /** Deterministic repairs applied during this build. */
  repairs: NavRepair[];
  /** Fingerprint of the raw source (pre-repair). */
  sourceHash: string;
  /** Stable fingerprint of html+theme for caching QA/parity results. */
  hash: string;
  /** Nav-policy violations remaining after repair (final emitted HTML). */
  violations: PreviewViolation[];
  /** True if publish is safe (no blocking violations, non-empty body). */
  safeToPublish: boolean;
}

// Theme marker: match on presence of the data-obsidian-theme attribute so
// every prior marker form (numeric, named, empty) is consolidated into
// exactly one theme layer in the final artifact.
const THEME_MARKER_RX = /<style\s+data-obsidian-theme(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*>[\s\S]*?<\/style>/gi;

function stripExistingThemeBlocks(html: string): string {
  return html.replace(THEME_MARKER_RX, "");
}

function ensureThemeInHead(
  html: string,
  themeCss: string | null | undefined,
  themeName?: string | null,
): string {
  const cleaned = stripExistingThemeBlocks(html);
  if (!themeCss || !themeCss.trim()) return cleaned;
  const nameAttr = (themeName ?? "1").replace(/"/g, "&quot;");
  const block = `<style data-obsidian-theme="${nameAttr}">${themeCss}</style>`;
  if (/<\/head>/i.test(cleaned)) return cleaned.replace(/<\/head>/i, `${block}</head>`);
  if (/<head\b[^>]*>/i.test(cleaned)) return cleaned.replace(/<head\b[^>]*>/i, (m) => `${m}${block}`);
  return `${block}${cleaned}`;
}

// FNV-1a — small, dependency-free, good enough for cache keys.
function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

function bodyLooksEmpty(html: string): boolean {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const text = body.replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length < 20;
}

/**
 * Build the exact HTML string for the requested surface. Repair always
 * runs first so preview/parity/publish share the same repaired source.
 */
export function buildArtifact(input: ArtifactInput): Artifact {
  const raw = input.html || "";
  const sourceHash = hashString(raw);

  // 1. Deterministic navigation repair on the RAW source (never on themed
  //    source — theme injection may re-add theme blocks the sanitizer
  //    shouldn't touch).
  const repaired = repairNavigation(raw);
  const repairedSourceHtml = repaired.html;

  // 2. Theme applied exactly once on the repaired source.
  const themed = ensureThemeInHead(repairedSourceHtml, input.themeCss ?? null, input.themeName ?? null);

  // 3. Surface finishing.
  let out: string;
  if (input.surface === "preview") {
    out = injectRuntimeBridge(themed);
  } else if (input.surface === "parity") {
    out = injectRuntimeBridge(themed);
  } else {
    // publish: strip any lingering preview-only markers; do not re-repair.
    out = stripPreviewOnly(themed);
  }

  // 4. Final violation scan (post-repair).
  const violations = repaired.remainingViolations.length > 0
    ? repaired.remainingViolations
    : scanNavigationViolations(out);

  const safeToPublish =
    input.surface === "publish" &&
    !bodyLooksEmpty(out) &&
    violations.length === 0;

  return {
    surface: input.surface,
    html: out,
    repairedSourceHtml,
    repairs: repaired.repairs,
    sourceHash,
    hash: hashString(`${input.surface}|${input.themeName ?? ""}|${input.themeCss ?? ""}|${themed}`),
    violations,
    safeToPublish: input.surface === "publish" ? safeToPublish : true,
  };
}

/** Convenience: publish-surface hash — the cache key parity/QA share. */
export function publishHash(html: string, themeCss?: string | null): string {
  return buildArtifact({ html, themeCss: themeCss ?? null, surface: "publish" }).hash;
}
