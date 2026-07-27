// Single central builder for the exact HTML artifact used by every
// user-facing publish path: sandbox preview source, hidden parity iframe,
// Go Live / share, featured demos, clean HTML export, and cloud save.
//
// The rule is: build ONCE, verify that string, publish that same string.
// Nothing downstream may sanitize again with different regexes.

import { sanitizeForExport } from "./clean-export";
import { injectRuntimeBridge } from "./runtime-bridge";
import { scanNavigationViolations, type PreviewViolation } from "./preview-policy";

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
  /** Stable fingerprint of html+theme for caching QA/parity results. */
  hash: string;
  /** Nav-policy violations found in the FINAL emitted HTML. */
  violations: PreviewViolation[];
  /** True if publish is safe (no blocking violations, non-empty body). */
  safeToPublish: boolean;
}

// Theme marker: value is opaque (may be "1", a theme name, or empty). Match
// on presence of the data-obsidian-theme attribute so legacy marker forms
// consolidate into exactly one theme layer in the final artifact.
const THEME_MARKER_RX = /<style\s+data-obsidian-theme=(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>[\s\S]*?<\/style>/gi;

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
 * Build the exact HTML string for the requested surface.
 *
 * - preview  → theme applied once, runtime bridge injected, NO sanitizer.
 * - parity   → theme applied once, sanitizer applied, runtime bridge kept.
 * - publish  → theme applied once, sanitizer applied, runtime bridge stripped.
 */
export function buildArtifact(input: ArtifactInput): Artifact {
  const themed = ensureThemeInHead(input.html || "", input.themeCss ?? null, input.themeName ?? null);

  let out: string;
  if (input.surface === "preview") {
    out = injectRuntimeBridge(themed);
  } else if (input.surface === "parity") {
    out = injectRuntimeBridge(sanitizeForExport(themed));
  } else {
    out = sanitizeForExport(themed);
  }

  const violations = scanNavigationViolations(out);
  // Per policy: every off-page navigation category is blocking. No exemptions.
  const blocking = violations.length;
  const safeToPublish =
    input.surface === "publish" &&
    !bodyLooksEmpty(out) &&
    blocking === 0;

  return {
    surface: input.surface,
    html: out,
    hash: hashString(`${input.surface}|${input.themeName ?? ""}|${input.themeCss ?? ""}|${themed}`),
    violations,
    safeToPublish: input.surface === "publish" ? safeToPublish : true,
  };
}

/** Convenience: publish-surface hash — the cache key parity/QA share. */
export function publishHash(html: string, themeCss?: string | null): string {
  return buildArtifact({ html, themeCss: themeCss ?? null, surface: "publish" }).hash;
}
