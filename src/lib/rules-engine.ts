// Protected architecture rules. Pure deterministic checks over HTML.
// Each rule has an id, label, enabled flag, severity, and a check function.
// Blocking violations should stop commits at the call site.

import type { KnowledgeGraph } from "./knowledge-graph";

export type RuleSeverity = "blocking" | "warning" | "info";
export type RuleViolation = { ruleId: string; severity: RuleSeverity; message: string; where?: string };
export type Rule = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  severity: RuleSeverity;
  check: (html: string, g: KnowledgeGraph) => RuleViolation[];
};

const SECRET_PATTERNS: RegExp[] = [
  /sk_(live|test)_[A-Za-z0-9]{16,}/,
  /AKIA[0-9A-Z]{16}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /-----BEGIN (RSA |EC |)PRIVATE KEY-----/,
];

export const DEFAULT_RULES: Rule[] = [
  {
    id: "never-expose-secrets",
    label: "Never expose secrets",
    description: "Block commits that include API keys, tokens, or private keys.",
    enabled: true,
    severity: "blocking",
    check: (html) => SECRET_PATTERNS.some((rx) => rx.test(html))
      ? [{ ruleId: "never-expose-secrets", severity: "blocking", message: "Document contains an exposed secret pattern." }]
      : [],
  },
  {
    id: "preserve-mobile-nav",
    label: "Preserve mobile navigation",
    description: "Require a responsive viewport meta on any page with a <nav>.",
    enabled: true,
    severity: "blocking",
    check: (html, g) => (/<nav\b/i.test(html) && !g.meta.hasViewport)
      ? [{ ruleId: "preserve-mobile-nav", severity: "blocking", message: "Navigation present but responsive viewport meta is missing." }]
      : [],
  },
  {
    id: "accessible-labels",
    label: "Require accessible labels",
    description: "Every interactive element must have visible text or aria-label.",
    enabled: true,
    severity: "warning",
    check: (_html, g) => {
      const out: RuleViolation[] = [];
      for (const b of g.buttons) if (!b.text) out.push({ ruleId: "accessible-labels", severity: "warning", message: `Button lacks accessible name${b.id ? ` (#${b.id})` : ""}`, where: b.id });
      return out;
    },
  },
  {
    id: "no-eval",
    label: "No eval / arbitrary code execution",
    description: "Block use of eval() in shipped HTML.",
    enabled: true,
    severity: "blocking",
    check: (html) => /\beval\s*\(/.test(html)
      ? [{ ruleId: "no-eval", severity: "blocking", message: "Document uses eval() — arbitrary code execution risk." }]
      : [],
  },
  {
    id: "https-scripts",
    label: "External scripts must use https://",
    description: "Reject mixed-content script sources.",
    enabled: true,
    severity: "blocking",
    check: (_html, g) => g.scripts
      .filter((s) => s.src && /^http:\/\//.test(s.src))
      .map((s) => ({ ruleId: "https-scripts", severity: "blocking" as const, message: `Insecure script: ${s.src}` })),
  },
  {
    id: "primary-token-buttons",
    label: "Use design tokens for buttons",
    description: "Buttons should use CSS variables / classes, not inline hex.",
    enabled: false,
    severity: "info",
    check: (html) => /<button\b[^>]*style="[^"]*#[0-9a-f]{3,6}/i.test(html)
      ? [{ ruleId: "primary-token-buttons", severity: "info", message: "Button uses inline color — prefer design tokens." }]
      : [],
  },
];

export function runRules(rules: Rule[], html: string, g: KnowledgeGraph): RuleViolation[] {
  const out: RuleViolation[] = [];
  for (const r of rules) if (r.enabled) out.push(...r.check(html, g));
  return out;
}

export function blockingViolations(vs: RuleViolation[]): RuleViolation[] {
  return vs.filter((v) => v.severity === "blocking");
}
