// Validation v2 — regex-based, deterministic, fast. Structured issues with
// severity (blocking | warning | info). Keeps the legacy `status` field
// (passed | warnings | failed) so existing callers continue to work.
import { jsLexicalMask } from "./js-lexical-mask";

export type Severity = "blocking" | "warning" | "info";
export type ValidationLevel = "passed" | "warnings" | "failed";

export type ValidationIssue = {
  severity: Severity;
  code: string;
  message: string;
  /** legacy field kept for backward compatibility */
  level: "warn" | "fail";
};

export type ValidationReport = {
  status: ValidationLevel;
  issues: ValidationIssue[];
  summary: string;
};

function issue(severity: Severity, code: string, message: string): ValidationIssue {
  return { severity, code, message, level: severity === "blocking" ? "fail" : "warn" };
}

function balanced(source: string): boolean {
  // Mask out strings, template text, comments, and regex literals so braces
  // inside them never count. Then match brackets with a real stack — a plain
  // count treats "}{" as balanced and mismatches as fine.
  let stripped: string;
  try {
    stripped = jsLexicalMask(source);
  } catch {
    return true; // never block on a masker failure
  }
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const stack: string[] = [];
  for (const ch of stripped) {
    if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return stack.length === 0;
}

/** Script blocks that hold executable JavaScript (inline, non-external). */
function isExecutableScript(tag: string): boolean {
  if (/\bsrc\s*=/i.test(tag)) return false;
  const type = tag.match(/\btype\s*=\s*("([^"]*)"|'([^']*)')/i);
  const t = (type?.[2] ?? type?.[3] ?? "").trim().toLowerCase();
  if (!t) return true;
  return /^(text\/javascript|application\/javascript|module|text\/babel)$/.test(t);
}


export function validateHtml(html: string): ValidationReport {
  const issues: ValidationIssue[] = [];

  if (!html || html.length < 20) {
    return {
      status: "failed",
      summary: "Empty document.",
      issues: [issue("blocking", "empty", "Empty or missing document.")],
    };
  }

  // Structure ---------------------------------------------------------------
  if (!/<!doctype/i.test(html)) issues.push(issue("warning", "doctype", "Missing <!doctype html>."));
  if (!/<html[\s>]/i.test(html)) issues.push(issue("blocking", "html-open", "Missing <html> root."));
  if (!/<\/html>/i.test(html)) issues.push(issue("blocking", "html-close", "Unclosed <html>."));
  if (!/<body[\s>]/i.test(html)) issues.push(issue("warning", "body", "Missing <body>."));
  if (!/<title[\s>][^<]*<\/title>/i.test(html)) issues.push(issue("info", "title", "Missing or empty <title>."));

  // Links & sources ---------------------------------------------------------
  const badHref = html.match(/\bhref\s*=\s*["'](?:\s*|#|javascript:void\(0\))["']/gi) ?? [];
  if (badHref.length) issues.push(issue("warning", "placeholder-href", `${badHref.length} anchor(s) with empty or placeholder href.`));
  const badSrc = html.match(/<img\b[^>]*\bsrc\s*=\s*["']\s*["']/gi) ?? [];
  if (badSrc.length) issues.push(issue("warning", "empty-src", `${badSrc.length} <img> with empty src.`));
  const noAlt = html.match(/<img\b(?![^>]*\balt=)[^>]*>/gi) ?? [];
  if (noAlt.length) issues.push(issue("info", "img-alt", `${noAlt.length} <img> without alt text.`));

  // Broken internal anchors -------------------------------------------------
  const hashHrefs = Array.from(html.matchAll(/\bhref\s*=\s*["']#([A-Za-z_][\w-]*)["']/g)).map((m) => m[1]);
  const idSet = new Set(Array.from(html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)).map((m) => m[1]));
  const broken = hashHrefs.filter((h) => !idSet.has(h));
  if (broken.length) issues.push(issue("warning", "broken-anchor", `Broken in-page anchor(s): ${broken.slice(0, 5).join(", ")}.`));

  // Duplicate ids -----------------------------------------------------------
  const ids = Array.from(html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)).map((m) => m[1]);
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) { if (seen.has(id)) dupes.add(id); else seen.add(id); }
  if (dupes.size) issues.push(issue("warning", "duplicate-id", `Duplicate id(s): ${Array.from(dupes).slice(0, 5).join(", ")}.`));

  // Interactive controls ----------------------------------------------------
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) ?? [];
  const inert = buttons.filter((b) => !/onclick=|type=["']submit["']|data-action=|aria-controls=|form=/i.test(b));
  if (inert.length) issues.push(issue("warning", "inert-button", `${inert.length} button(s) with no obvious action.`));
  const emptyBtn = buttons.filter((b) => !/>[\s\S]*?[A-Za-z0-9][\s\S]*?<\/button>/i.test(b) && !/aria-label=/i.test(b));
  if (emptyBtn.length) issues.push(issue("warning", "empty-button", `${emptyBtn.length} button(s) with no visible label or aria-label.`));

  // Form controls -----------------------------------------------------------
  const inputs = Array.from(html.matchAll(/<(input|textarea|select)\b([^>]*)>/gi));
  let unlabeled = 0;
  for (const [, , attrs] of inputs) {
    if (/\btype\s*=\s*["'](hidden|submit|button|image|reset)["']/i.test(attrs)) continue;
    const hasLabel = /\baria-label=|\baria-labelledby=|\bplaceholder=|\btitle=/i.test(attrs);
    const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    const forTarget = idMatch && new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*["']${idMatch[1]}["']`, "i").test(html);
    if (!hasLabel && !forTarget) unlabeled++;
  }
  if (unlabeled) issues.push(issue("warning", "unlabeled-input", `${unlabeled} form control(s) with no label/aria-label/placeholder.`));

  // Forms without action or handler -----------------------------------------
  const forms = Array.from(html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi));
  for (const [, attrs, body] of forms) {
    const hasAction = /\baction\s*=/i.test(attrs) || /\bonsubmit\s*=/i.test(attrs);
    const hasJsSubmit = /addEventListener\(\s*["']submit["']/.test(html);
    const hasSubmitBtn = /<button\b[^>]*type=["']submit["']|<input\b[^>]*type=["']submit["']/i.test(body);
    if (!hasAction && !hasJsSubmit && !hasSubmitBtn) {
      issues.push(issue("warning", "form-no-action", "Form has no action, submit handler, or submit button."));
      break;
    }
  }

  // Iframe sandbox ----------------------------------------------------------
  const iframes = html.match(/<iframe\b[^>]*>/gi) ?? [];
  const unsandboxed = iframes.filter((f) => !/\bsandbox\s*=/i.test(f));
  if (unsandboxed.length) issues.push(issue("warning", "iframe-sandbox", `${unsandboxed.length} <iframe> without sandbox attribute.`));

  // Suspicious secrets ------------------------------------------------------
  const secretHits = [
    /sk_live_[A-Za-z0-9]{10,}/,
    /rk_live_[A-Za-z0-9]{10,}/,
    /AIza[0-9A-Za-z\-_]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  ].some((rx) => rx.test(html));
  if (secretHits) issues.push(issue("blocking", "secret", "Document contains a value that looks like a secret/API key."));

  // Unsafe scripts ----------------------------------------------------------
  if (/\beval\s*\(/.test(html)) issues.push(issue("warning", "eval", "Use of eval() detected."));
  if (/\bdocument\.write\s*\(/.test(html)) issues.push(issue("info", "document-write", "document.write() is discouraged."));

  // Script syntax -----------------------------------------------------------
  const scripts = Array.from(html.matchAll(/(<script\b[^>]*>)([\s\S]*?)<\/script>/gi));
  for (const [, tag, code] of scripts) {
    if (!isExecutableScript(tag)) continue;
    if (!balanced(code)) {
      issues.push(issue("blocking", "js-syntax", "Script block has unbalanced brackets."));
      break;
    }
  }

  // CSS syntax --------------------------------------------------------------
  const styles = Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi));
  for (const [, code] of styles) {
    const open = (code.match(/\{/g) ?? []).length;
    const close = (code.match(/\}/g) ?? []).length;
    if (open !== close) {
      issues.push(issue("blocking", "css-syntax", `CSS block has unbalanced braces (${open} open, ${close} close).`));
      break;
    }
  }

  // Mobile overflow risk ----------------------------------------------------
  if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html)) {
    issues.push(issue("info", "viewport", "Missing viewport meta — may not render well on mobile."));
  }
  const overflowRisk = /width\s*:\s*\d{4,}px/.test(html); // 1000px+ hard widths
  if (overflowRisk) issues.push(issue("info", "hard-width", "Hard pixel widths ≥1000px may overflow on mobile."));

  const blocking = issues.filter((i) => i.severity === "blocking").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const info = issues.filter((i) => i.severity === "info").length;
  const status: ValidationLevel = blocking ? "failed" : warnings ? "warnings" : "passed";
  const summary =
    status === "passed" && !info
      ? "All checks passed."
      : `${blocking} blocking, ${warnings} warnings, ${info} info.`;
  return { status, issues, summary };
}

export function blockingIssues(report: ValidationReport): ValidationIssue[] {
  return report.issues.filter((i) => i.severity === "blocking");
}
