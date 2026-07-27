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
//        render  : themed repaired source, no bridge (parity comparisons)
//        publish : preview-only instrumentation stripped
//
// Nothing downstream may sanitize again with different regexes.

import { stripPreviewOnly } from "./clean-export";
import { injectRuntimeBridge } from "./runtime-bridge";
import { scanNavigationViolations, type PreviewViolation } from "./preview-policy";
import { repairNavigation, type NavRepair } from "./navigation-repair";

export type ArtifactSurface = "preview" | "render" | "parity" | "publish";

export interface ArtifactInput {
  html: string;
  themeCss?: string | null;
  themeName?: string | null;
  surface: ArtifactSurface;
}

export interface Artifact {
  surface: ArtifactSurface;
  html: string;
  repairedSourceHtml: string;
  repairs: NavRepair[];
  sourceHash: string;
  hash: string;
  violations: PreviewViolation[];
  safeToPublish: boolean;
}

const THEME_MARKER_RX = /<style\s+data-obsidian-theme(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*>[\s\S]*?<\/style>/gi;

function stripExistingThemeBlocks(html: string): string {
  return html.replace(THEME_MARKER_RX, "");
}

function ensureThemeInHead(html: string, themeCss: string | null | undefined, themeName?: string | null): string {
  const cleaned = stripExistingThemeBlocks(html);
  if (!themeCss || !themeCss.trim()) return cleaned;
  const nameAttr = (themeName ?? "1").replace(/"/g, "&quot;");
  const block = `<style data-obsidian-theme="${nameAttr}">${themeCss}</style>`;
  if (/<\/head>/i.test(cleaned)) return cleaned.replace(/<\/head>/i, `${block}</head>`);
  if (/<head\b[^>]*>/i.test(cleaned)) return cleaned.replace(/<head\b[^>]*>/i, (m) => `${m}${block}`);
  return `${block}${cleaned}`;
}

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

export function buildArtifact(input: ArtifactInput): Artifact {
  const raw = input.html || "";
  const sourceHash = hashString(raw);

  const repaired = repairNavigation(raw);
  const repairedSourceHtml = repaired.html;

  const themed = ensureThemeInHead(repairedSourceHtml, input.themeCss ?? null, input.themeName ?? null);

  let out: string;
  if (input.surface === "preview" || input.surface === "parity") {
    out = injectRuntimeBridge(themed);
  } else if (input.surface === "render") {
    // Themed repaired source WITHOUT runtime bridge — for parity comparisons.
    out = themed;
  } else {
    out = stripPreviewOnly(themed);
  }

  // Violations are computed over the repaired source (theme block and the
  // runtime bridge never contain navigation controls). This is what the
  // scanner is authoritative over — the emitted `out` is a superset.
  const violations = repaired.remainingViolations.length > 0
    ? repaired.remainingViolations
    : scanNavigationViolations(repairedSourceHtml);

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
    // Cache key includes raw source, repaired source, theme name and CSS.
    // Changing any of these invalidates the cache naturally.
    hash: hashString(`${input.surface}|${input.themeName ?? ""}|${(input.themeCss ?? "").length}|${sourceHash}|${hashString(repairedSourceHtml)}|${hashString(input.themeCss ?? "")}`),
    violations,
    safeToPublish: input.surface === "publish" ? safeToPublish : true,
  };
}

/** Convenience: publish-surface hash — the cache key parity/QA share. */
export function publishHash(html: string, themeCss?: string | null, themeName?: string | null): string {
  return buildArtifact({ html, themeCss: themeCss ?? null, themeName: themeName ?? null, surface: "publish" }).hash;
}
