// Staged context — escalates from minimal snippets to full document.
// Each tier is pure and inexpensive; the caller decides when to escalate.

import { anchorsFromPrompt, budgetSnippets, snippetsAround, snippetsToPrompt, type Snippet } from "./context-manager";
import { extractOutline } from "./document-outline";

export type ContextTier = "minimal" | "nearby" | "sections" | "full";

export type StagedContext = {
  tier: ContextTier;
  text: string;
  chars: number;
  fullChars: number;
  savings: number; // 0..1 fraction saved vs full
  reason: string;
};

const BUDGETS: Record<ContextTier, number> = {
  minimal: 1500,
  nearby: 4000,
  sections: 8000,
  full: 40_000,
};

/** Build a context bundle at the requested tier. */
export function buildContext(
  html: string,
  prompt: string,
  tier: ContextTier,
  selectedAnchor?: string,
): StagedContext {
  const fullChars = html.length;
  const anchors = anchorsFromPrompt(prompt);
  if (selectedAnchor) anchors.unshift(selectedAnchor);

  if (tier === "full") {
    const text = html.length > BUDGETS.full ? html.slice(0, BUDGETS.full) + "\n<!-- truncated -->" : html;
    return { tier, text, chars: text.length, fullChars, savings: 1 - text.length / Math.max(1, fullChars), reason: "full document" };
  }

  let radius = 200;
  if (tier === "nearby") radius = 500;
  if (tier === "sections") radius = 1200;

  const snips: Snippet[] = snippetsAround(html, anchors, radius);
  if (tier === "sections") {
    const outline = extractOutline(html);
    if (outline.headings.length) {
      snips.unshift({ reason: "document outline", text: outline.headings.map((h) => `${"#".repeat(h.level)} ${h.text}`).join("\n") });
    }
  }
  const budgeted = budgetSnippets(snips, BUDGETS[tier]);
  const text = snippetsToPrompt(budgeted);
  return {
    tier,
    text,
    chars: text.length,
    fullChars,
    savings: 1 - text.length / Math.max(1, fullChars),
    reason: `tier=${tier} anchors=${anchors.length}`,
  };
}

/** Escalate to the next tier when the current context is judged insufficient. */
export function nextTier(t: ContextTier): ContextTier | null {
  const order: ContextTier[] = ["minimal", "nearby", "sections", "full"];
  const i = order.indexOf(t);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}
