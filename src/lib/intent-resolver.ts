// Intent resolver — turns a free-form user request into a compact,
// structured interpretation grounded in the current selection, active file,
// recent operations, and version diff. No AI call. Deterministic.

export type Risk = "low" | "medium" | "high";

export interface ResolutionContext {
  selectedAnchor?: string;
  activeFileId?: string;
  recentOperationSummary?: string;
  hasHtml: boolean;
  attachmentsCount: number;
}

export interface ResolvedIntent {
  outcome: string;
  scope: "text" | "style" | "structure" | "content" | "system";
  mustPreserve: string[];
  likelyTargets: string[];
  risk: Risk;
  ambiguity: number;   // 0..1
  needsClarification: boolean;
  reference?: "selection" | "last-change" | "active-file" | "none";
}

const DESTRUCTIVE = /\b(delete|remove|wipe|clear all|reset|purge|revert everything)\b/i;
const SECURITY = /\b(auth|password|secret|token|api ?key|admin|role)\b/i;
const DEPLOY = /\b(deploy|publish|go live|domain|dns|env(ironment)? var)\b/i;
const BILLING = /\b(stripe|checkout|charge|refund|price|paywall)\b/i;
const REFERENCE_SELECTION = /\b(this|that|it|these|those|the selected|highlighted|current|above|below)\b/i;
const REFERENCE_LAST = /\b(undo|revert|last change|previous|earlier|the color|the spacing|redo)\b/i;
const STYLE_HINTS = /\b(color|font|spacing|padding|margin|radius|shadow|dark|light|theme|palette|smaller|larger|bigger|bold|italic)\b/i;
const TEXT_HINTS = /\b(rename|change ".+?" to|copy|wording|title|heading|label|button text)\b/i;
const STRUCTURE_HINTS = /\b(add (a )?(section|hero|nav|footer|card|grid|form)|move|swap|reorder|split|combine|refactor)\b/i;

export function resolveIntent(prompt: string, ctx: ResolutionContext): ResolvedIntent {
  const p = prompt.trim();
  const lower = p.toLowerCase();

  let scope: ResolvedIntent["scope"] = "structure";
  if (TEXT_HINTS.test(lower)) scope = "text";
  else if (STYLE_HINTS.test(lower)) scope = "style";
  else if (STRUCTURE_HINTS.test(lower)) scope = "structure";
  else if (SECURITY.test(lower) || DEPLOY.test(lower)) scope = "system";
  else if (/\b(text|paragraph|copy|about|bio|section content)\b/.test(lower)) scope = "content";

  const risk: Risk =
    DESTRUCTIVE.test(lower) || SECURITY.test(lower) || DEPLOY.test(lower) || BILLING.test(lower) ? "high" :
    (scope === "structure" || scope === "system") ? "medium" : "low";

  const usesRef = REFERENCE_SELECTION.test(lower) || REFERENCE_LAST.test(lower);
  const reference: ResolvedIntent["reference"] =
    REFERENCE_SELECTION.test(lower) && ctx.selectedAnchor ? "selection" :
    REFERENCE_LAST.test(lower) && ctx.recentOperationSummary ? "last-change" :
    ctx.activeFileId ? "active-file" : "none";

  // Ambiguity: unresolved references + short prompts + no HTML context.
  const words = lower.split(/\s+/).filter(Boolean).length;
  let ambiguity = 0;
  if (usesRef && reference === "none") ambiguity += 0.5;
  if (words < 4) ambiguity += 0.3;
  if (!ctx.hasHtml && scope !== "structure") ambiguity += 0.2;
  ambiguity = Math.min(1, ambiguity);

  const likelyTargets: string[] = [];
  if (ctx.selectedAnchor && reference === "selection") likelyTargets.push(ctx.selectedAnchor);
  const idMatches = Array.from(p.matchAll(/#([a-zA-Z][\w-]{1,60})/g)).map((m) => m[1]);
  likelyTargets.push(...idMatches);
  const quoted = Array.from(p.matchAll(/"([^"]{2,80})"/g)).map((m) => m[1]);
  likelyTargets.push(...quoted);

  const mustPreserve: string[] = [];
  if (/\b(keep|preserve|but keep|don'?t (change|touch|remove))\b/i.test(p)) {
    const m = p.match(/keep\s+(?:the\s+)?([\w \-]{2,40})/i);
    if (m) mustPreserve.push(m[1].trim());
  }

  // Only ask a question for high risk OR very high ambiguity on a
  // structural/system change. Low-risk reversible edits should proceed.
  const needsClarification =
    (risk === "high" && ambiguity > 0.3) ||
    (scope !== "text" && scope !== "style" && ambiguity >= 0.7);

  return {
    outcome: p.slice(0, 200),
    scope,
    mustPreserve,
    likelyTargets: Array.from(new Set(likelyTargets)).slice(0, 6),
    risk,
    ambiguity: Number(ambiguity.toFixed(2)),
    needsClarification,
    reference,
  };
}
