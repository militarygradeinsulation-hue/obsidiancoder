// Auto-repair — deterministic fixes for common blocking validation issues.
// No AI. Returns a repaired HTML string plus a list of fixes applied.
// Callers should re-run validation after applying and, if still blocking,
// restore the previous stable snapshot.

import type { ValidationIssue } from "./validation";

export type RepairResult = {
  html: string;
  fixes: string[];
  attempted: string[];
};

export function repairHtml(html: string, issues: ValidationIssue[]): RepairResult {
  let out = html;
  const fixes: string[] = [];
  const attempted: string[] = [];

  for (const i of issues.filter((x) => x.severity === "blocking")) {
    attempted.push(i.code);
    switch (i.code) {
      case "html-close":
        if (!/<\/html>/i.test(out)) {
          out = out.trimEnd() + "\n</html>\n";
          fixes.push("Appended missing </html>.");
        }
        break;
      case "html-open":
        if (!/<html[\s>]/i.test(out)) {
          out = `<!doctype html><html>\n${out}\n</html>`;
          fixes.push("Wrapped document in <html>.");
        }
        break;
      case "css-syntax": {
        // Attempt: balance top-level braces per <style> block by trimming trailing "{"
        out = out.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (m, code) => {
          const open = (code.match(/\{/g) ?? []).length;
          const close = (code.match(/\}/g) ?? []).length;
          if (open === close) return m;
          if (open > close) {
            const patched = code + "\n" + "}".repeat(open - close);
            return m.replace(code, patched);
          }
          return m; // extra closes are harder to safely repair
        });
        fixes.push("Balanced CSS braces where possible.");
        break;
      }
      case "js-syntax":
        // We do NOT auto-patch JS — silent brace insertion is riskier than reverting.
        break;
      case "secret":
        // Redact detected secret-looking strings.
        out = out
          .replace(/sk_live_[A-Za-z0-9]{10,}/g, "sk_live_[REDACTED]")
          .replace(/rk_live_[A-Za-z0-9]{10,}/g, "rk_live_[REDACTED]")
          .replace(/AIza[0-9A-Za-z\-_]{20,}/g, "AIza[REDACTED]")
          .replace(/AKIA[0-9A-Z]{16}/g, "AKIA[REDACTED]")
          .replace(/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]");
        fixes.push("Redacted secret-like values.");
        break;
      default:
        break;
    }
  }

  return { html: out, fixes, attempted };
}

/** Was every blocking issue at least attempted? */
export function coversAllBlocking(result: RepairResult, issues: ValidationIssue[]): boolean {
  const blocking = issues.filter((i) => i.severity === "blocking").map((i) => i.code);
  return blocking.every((c) => result.attempted.includes(c));
}
