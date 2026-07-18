// Lightweight HTML validation — regex-based (no DOM parser in the worker).
// Produces Passed / Warnings / Failed with a plain-English list.

export type ValidationLevel = "passed" | "warnings" | "failed";
export type ValidationIssue = { level: "warn" | "fail"; message: string };
export type ValidationReport = {
  status: ValidationLevel;
  issues: ValidationIssue[];
};

export function validateHtml(html: string): ValidationReport {
  const issues: ValidationIssue[] = [];

  if (!html || html.length < 20) {
    return { status: "failed", issues: [{ level: "fail", message: "Empty or missing document." }] };
  }
  if (!/<!doctype/i.test(html)) issues.push({ level: "warn", message: "Missing <!doctype html>." });
  if (!/<html[\s>]/i.test(html)) issues.push({ level: "fail", message: "Missing <html> root." });
  if (!/<\/html>/i.test(html)) issues.push({ level: "fail", message: "Unclosed <html>." });
  if (!/<body[\s>]/i.test(html)) issues.push({ level: "warn", message: "Missing <body>." });

  // href / src emptiness
  const badHref = html.match(/\bhref\s*=\s*["'](?:\s*|#|javascript:void\(0\))["']/gi) ?? [];
  if (badHref.length) issues.push({ level: "warn", message: `${badHref.length} anchor(s) with empty or placeholder href.` });
  const badSrc = html.match(/<img\b[^>]*\bsrc\s*=\s*["']\s*["']/gi) ?? [];
  if (badSrc.length) issues.push({ level: "warn", message: `${badSrc.length} <img> with empty src.` });

  // Duplicate ids
  const ids = Array.from(html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)).map((m) => m[1]);
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) { if (seen.has(id)) dupes.add(id); else seen.add(id); }
  if (dupes.size) issues.push({ level: "warn", message: `Duplicate id(s): ${Array.from(dupes).slice(0, 5).join(", ")}.` });

  // Buttons with no action
  const buttons = html.match(/<button\b[^>]*>/gi) ?? [];
  const inertButtons = buttons.filter((b) => !/onclick=|type=["']submit["']|data-action=|aria-controls=/i.test(b));
  if (inertButtons.length) issues.push({ level: "warn", message: `${inertButtons.length} button(s) with no obvious action.` });

  // Forms without submit action
  const forms = Array.from(html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi));
  for (const [, attrs, body] of forms) {
    const hasAction = /\baction\s*=/i.test(attrs) || /\bonsubmit\s*=/i.test(attrs);
    const hasJsSubmit = /addEventListener\(\s*["']submit["']/.test(html);
    const hasSubmitBtn = /<button\b[^>]*type=["']submit["']|<input\b[^>]*type=["']submit["']/i.test(body);
    if (!hasAction && !hasJsSubmit && !hasSubmitBtn) {
      issues.push({ level: "warn", message: "Form has no action, submit handler, or submit button." });
      break;
    }
  }

  // Iframe sandbox
  const iframes = html.match(/<iframe\b[^>]*>/gi) ?? [];
  const unsandboxed = iframes.filter((f) => !/\bsandbox\s*=/i.test(f));
  if (unsandboxed.length) issues.push({ level: "warn", message: `${unsandboxed.length} <iframe> without sandbox attribute.` });

  // Very light script syntax check — brace/paren balance inside <script> blocks.
  const scripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi));
  for (const [, code] of scripts) {
    // strip strings and comments cheaply before counting braces
    const stripped = code
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "");
    const open = (stripped.match(/[{(\[]/g) ?? []).length;
    const close = (stripped.match(/[})\]]/g) ?? []).length;
    if (open !== close) {
      issues.push({ level: "fail", message: `Script block has unbalanced brackets (${open} open, ${close} close).` });
      break;
    }
  }

  const status: ValidationLevel = issues.some((i) => i.level === "fail")
    ? "failed"
    : issues.length ? "warnings" : "passed";
  return { status, issues };
}
