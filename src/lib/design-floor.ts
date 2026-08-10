// Design floor — deterministic, dependency-free quality gate.
//
// Structural validation (see ./validation.ts) happily passes a document
// that has ZERO styling: default serif headings, blue underlined links,
// no layout. That is the single most common "bad build" the pipeline used
// to commit. This module catches it before commit.
//
// No AI. No network. Cheap regex + counting only. Blocking checks are
// deliberately conservative: they fire on documents that are objectively
// undesigned or structurally incomplete, never on merely plain taste.

export type DesignSeverity = "blocking" | "warning";

export interface DesignIssue {
  severity: DesignSeverity;
  code: string;
  message: string;
}

export interface DesignReport {
  ok: boolean;
  /** True when the document looks cut off mid-stream. */
  incomplete: boolean;
  issues: DesignIssue[];
  blockers: string[];
  warnings: string[];
  /** Compact corrective text handed to a regeneration retry. */
  repairInstruction: string;
  /** Total CSS bytes found in <style> blocks. */
  cssBytes: number;
}

/** Documents smaller than this are treated as fragments, not full builds. */
const MIN_DOCUMENT_BYTES = 500;
/** Below this much CSS a full page cannot be meaningfully designed. */
const MIN_CSS_BYTES = 160;

/**
 * True when the document is styled by something other than a <style> block:
 * an external stylesheet, a utility-CSS CDN (Tailwind and friends), or a
 * meaningful number of inline style="" attributes. Byte-counting <style>
 * alone marks these documents as "undesigned" when they are not.
 */
function hasExternalStyling(html: string): boolean {
  if (/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(html)) return true;
  if (/<script\b[^>]*src\s*=\s*["'][^"']*(tailwind|bulma|bootstrap|water\.css|pico)/i.test(html)) return true;
  return inlineStyleBytes(html) >= 200;
}

/** Total bytes of style="" attribute values. */
function inlineStyleBytes(html: string): number {
  let n = 0;
  for (const m of html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)) n += (m[1] ?? "").length;
  for (const m of html.matchAll(/\bstyle\s*=\s*'([^']*)'/gi)) n += (m[1] ?? "").length;
  return n;
}

function styleBlocks(html: string): string[] {
  return Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)).map((m) => m[1] ?? "");
}

function bodyOf(html: string): string {
  return html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
}

function visibleText(html: string): string {
  return bodyOf(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the stream stopped mid-document. */
export function looksIncomplete(html: string): boolean {
  const s = (html ?? "").trim();
  if (!s) return true;
  // Trailing partial tag: an unclosed '<' after the last '>'.
  const lastOpen = s.lastIndexOf("<");
  const lastClose = s.lastIndexOf(">");
  if (lastOpen > lastClose) return true;
  if (!/<html[\s>]/i.test(s)) return false; // fragment; nothing to conclude
  return !/<\/html\s*>/i.test(s);
}

export function checkDesignFloor(html: string): DesignReport {
  const issues: DesignIssue[] = [];
  const src = html ?? "";
  const add = (severity: DesignSeverity, code: string, message: string) =>
    issues.push({ severity, code, message });

  const incomplete = looksIncomplete(src);
  if (incomplete) {
    add("blocking", "incomplete", "The document is cut off — it never closed </html> or ends mid-tag.");
  }

  const css = styleBlocks(src).join("\n");
  const cssBytes = css.replace(/\s+/g, " ").trim().length + inlineStyleBytes(src);
  const externallyStyled = hasExternalStyling(src);
  // A document styled by a linked sheet or a utility CDN is not "undesigned";
  // the styling simply is not inline. Note it, never block on it.
  const styleSeverity: DesignSeverity = externallyStyled ? "warning" : "blocking";
  const isFullPage = /<!doctype/i.test(src) || /<html[\s>]/i.test(src) || /<body[\s>]/i.test(src);
  const text = visibleText(src);
  // A full page counts as a real build once it carries meaningful content —
  // a short but complete unstyled page is exactly the failure mode we catch.
  const substantial = isFullPage && (src.length >= MIN_DOCUMENT_BYTES || text.length >= 24);

  if (substantial) {
    if (cssBytes === 0) {
      add(styleSeverity, "no-css", "No <style> block at all — the page renders with browser default styling.");
    } else if (cssBytes < MIN_CSS_BYTES) {
      add(styleSeverity, "thin-css", `Only ${cssBytes} bytes of CSS — far below a designed page.`);
    }

    if (cssBytes > 0) {
      if (!/(background|background-color|\bcolor\s*:|--[a-z0-9-]+\s*:)/i.test(css)) {
        add(styleSeverity, "no-color", "The stylesheet sets no colors or design tokens.");
      }
      if (!/(display\s*:\s*(flex|grid)|grid-template|max-width\s*:|margin\s*:\s*0\s+auto)/i.test(css)) {
        add(styleSeverity, "no-layout", "The stylesheet defines no layout system (flex, grid, or a centered container).");
      }
      if (!/font-family\s*:/i.test(css)) {
        add("warning", "no-typography", "No font-family is set — headings fall back to the browser serif.");
      }
      if (!/(@media|clamp\s*\()/i.test(css)) {
        add("warning", "no-responsive", "No media queries or clamp() sizing — the layout is not responsive.");
      }
      if (!/(transition|:hover|animation)/i.test(css)) {
        add("warning", "no-interaction", "No hover states, transitions, or motion.");
      }
    }

    // Default-anchor look: many links, none of them styled in any way.
    const anchors = Array.from(src.matchAll(/<a\b[^>]*>/gi));
    if (anchors.length >= 5) {
      const anyStyledAttr = anchors.some((m) => /\b(class|style)\s*=/i.test(m[0]));
      const anySelector = /(^|[^\w-])a\s*(\{|,|:|\.|\[)/im.test(css) || /text-decoration/i.test(css);
      if (!anyStyledAttr && !anySelector) {
        add(styleSeverity, "default-anchors", `${anchors.length} links render as default blue underlined text.`);
      }
    }

    if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(src)) {
      add("warning", "no-viewport", "Missing the responsive viewport meta tag.");
    }
    if (!/<(main|header|section|nav|footer)\b/i.test(src)) {
      add("warning", "no-landmarks", "No semantic landmarks (header / main / section / footer).");
    }
    const sections = (src.match(/<section\b/gi) ?? []).length;
    if (text.length > 400 && sections < 2) {
      add("warning", "thin-composition", "The page is a single block — no distinct sections.");
    }
  }

  const blockers = issues.filter((i) => i.severity === "blocking").map((i) => i.code);
  const warnings = issues.filter((i) => i.severity === "warning").map((i) => i.code);

  const failing = issues.filter((i) => i.severity === "blocking");
  const repairInstruction = failing.length
    ? [
        "Your previous output FAILED the design floor and was rejected. Problems found:",
        ...failing.map((i) => `- ${i.message}`),
        ...issues.filter((i) => i.severity === "warning").slice(0, 4).map((i) => `- (also) ${i.message}`),
        "",
        "Regenerate the ENTIRE document from scratch. Non-negotiable:",
        "1. The first element inside <head> after the meta tags is a <style> block with a :root design-token palette (background, surface, text, accent, border).",
        "2. Style every element you emit — no browser defaults anywhere, links included.",
        "3. Use a real layout system (flex/grid, a max-width container, generous spacing).",
        "4. Ship a full narrative: sticky nav, hero, feature grid, supporting sections, CTA, footer.",
        "5. Responsive with clamp() and at least one media query; hover/transition states on interactive elements.",
        "6. Output ONLY the complete HTML document, starting with <!doctype html> and ending with </html>.",
      ].join("\n")
    : "";

  return {
    ok: failing.length === 0,
    incomplete,
    issues,
    blockers,
    warnings,
    repairInstruction,
    cssBytes,
  };
}
