// Auto-repair — deterministic fixes for common blocking validation issues.
// No AI. Returns a repaired HTML string plus a list of fixes applied.
// Callers should re-run validation after applying and, if still blocking,
// restore the previous stable snapshot.

import type { ValidationIssue } from "./validation";
import { jsLexicalMask } from "./js-lexical-mask";

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
        // A malformed inline script cannot execute in the browser anyway, but it
        // used to make the safety gate discard the entire otherwise-renderable
        // build. Quarantine only the malformed executable block(s). This keeps
        // the document visible/saveable without guessing at missing source.
        out = out.replace(/(<script\b([^>]*)>)([\s\S]*?)(<\/script>)/gi, (m, open, attrs, code, close) => {
          if (/\bsrc\s*=/i.test(attrs)) return m;
          const type = String(attrs).match(/\btype\s*=\s*("([^"]*)"|'([^']*)')/i);
          const scriptType = (type?.[2] ?? type?.[3] ?? "").trim().toLowerCase();
          if (scriptType && !/^(text\/javascript|application\/javascript|module|text\/babel)$/.test(scriptType)) return m;
          // Reuse the validator on a minimal document so string/template/comment
          // contents are handled by the same lexical rules as the original scan.
          const probe = `<!doctype html><html><body>${open}${code}${close}</body></html>`;
          const stillBroken = validateScriptProbe(probe);
          if (!stillBroken) return m;
          fixes.push("Quarantined a malformed script so the build can still open and save.");
          return `${open}console.warn("Obsidian isolated a malformed generated script.");${close}`;
        });
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

function validateScriptProbe(html: string): boolean {
  const match = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  const source = match?.[1] ?? "";
  let masked: string;
  try {
    masked = jsLexicalMask(source);
  } catch {
    return false;
  }
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  for (const ch of masked) {
    if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.pop() !== pairs[ch]) return true;
    }
  }
  return stack.length > 0;
}

/** Was every blocking issue at least attempted? */
export function coversAllBlocking(result: RepairResult, issues: ValidationIssue[]): boolean {
  const blocking = issues.filter((i) => i.severity === "blocking").map((i) => i.code);
  return blocking.every((c) => result.attempted.includes(c));
}
