/**
 * Spec extractor — deterministic, zero-cost structural analysis of a user prompt.
 *
 * For complex prompts (full-generation, multi-feature, long), extract a structured
 * spec: detected sections, data entities, interactions, and open questions.
 * This runs BEFORE generation and augments the prompt sent to the model.
 *
 * Philosophy:
 * - Fully deterministic (regex + heuristics, no AI call)
 * - Never blocks generation — returns partial spec if ambiguous
 * - The spec is injected as a structured block in the system message
 * - Only fires for full-generation prompts (not patches/edits)
 */

export interface ExtractedSpec {
  /** Detected page sections / major UI blocks. */
  sections: string[];
  /** Named data types or entities mentioned. */
  entities: string[];
  /** Interaction verbs detected (click, submit, filter, …). */
  interactions: string[];
  /** Unanswered questions — things the prompt implies but doesn't specify. */
  openQuestions: string[];
  /** Whether this prompt is complex enough to benefit from spec injection. */
  complex: boolean;
  /** Estimated page count (1 = SPA/single page, 2+ = multi-page app). */
  estimatedPages: number;
}

// ── Section vocabulary ───────────────────────────────────────────────────────
const SECTION_PATTERNS: Array<{ rx: RegExp; name: string }> = [
  { rx: /\b(hero|above.?the.?fold|splash)\b/i, name: "Hero section" },
  { rx: /\b(nav(bar)?|header|menu|top.?bar)\b/i, name: "Navigation" },
  { rx: /\b(footer|bottom.?bar)\b/i, name: "Footer" },
  { rx: /\b(pricing|plans?|tiers?|packages?)\b/i, name: "Pricing" },
  { rx: /\b(features?|benefits?|why.?us|selling.?points?)\b/i, name: "Features" },
  { rx: /\b(testimonials?|reviews?|social.?proof|quotes?)\b/i, name: "Testimonials" },
  { rx: /\b(about|our.?story|team|company)\b/i, name: "About" },
  { rx: /\b(contact|get.?in.?touch|support|help)\b/i, name: "Contact" },
  { rx: /\b(faq|frequently.?asked|questions?)\b/i, name: "FAQ" },
  { rx: /\b(dashboard|analytics|metrics?|stats?|kpis?)\b/i, name: "Dashboard" },
  { rx: /\b(gallery|portfolio|work|projects?|showcase)\b/i, name: "Gallery" },
  { rx: /\b(blog|news|articles?|posts?)\b/i, name: "Blog" },
  { rx: /\b(sign.?up|register|onboard|create.?account)\b/i, name: "Sign-up form" },
  { rx: /\b(sign.?in|log.?in|login|auth)\b/i, name: "Login form" },
  { rx: /\b(checkout|cart|order|payment|billing)\b/i, name: "Checkout / payment" },
  { rx: /\b(settings?|preferences?|profile)\b/i, name: "Settings" },
  { rx: /\b(table|list|grid|data.?view|records?)\b/i, name: "Data table / list" },
  { rx: /\b(map|location|address)\b/i, name: "Map / location" },
  { rx: /\b(search|filter|sort)\b/i, name: "Search & filter" },
  { rx: /\b(chat|message|inbox|conversation)\b/i, name: "Chat / messaging" },
  { rx: /\b(calendar|schedule|events?|booking)\b/i, name: "Calendar / scheduler" },
  { rx: /\b(chart|graph|visualiz)\b/i, name: "Data visualization" },
  { rx: /\b(modal|dialog|popup|overlay)\b/i, name: "Modal / dialog" },
  { rx: /\b(notification|alert|toast|banner)\b/i, name: "Notifications" },
];

// ── Entity vocabulary ────────────────────────────────────────────────────────
const ENTITY_PATTERNS: Array<{ rx: RegExp; name: string }> = [
  { rx: /\b(users?|members?|customers?|clients?|accounts?)\b/i, name: "User" },
  { rx: /\b(products?|items?|listings?|inventory)\b/i, name: "Product" },
  { rx: /\b(orders?|transactions?|purchases?)\b/i, name: "Order" },
  { rx: /\b(posts?|articles?|content)\b/i, name: "Post / content" },
  { rx: /\b(tasks?|todos?|items?|tickets?)\b/i, name: "Task" },
  { rx: /\b(events?|meetings?|appointments?)\b/i, name: "Event" },
  { rx: /\b(projects?|workspaces?)\b/i, name: "Project" },
  { rx: /\b(messages?|notifications?)\b/i, name: "Message" },
  { rx: /\b(files?|documents?|attachments?)\b/i, name: "File" },
  { rx: /\b(categories?|tags?|labels?)\b/i, name: "Category / tag" },
];

// ── Interaction vocabulary ───────────────────────────────────────────────────
const INTERACTION_PATTERNS: Array<{ rx: RegExp; name: string }> = [
  { rx: /\b(click(able)?|on.?click|tap)\b/i, name: "click" },
  { rx: /\b(submit|send|post)\b/i, name: "submit" },
  { rx: /\b(filter|sort|search)\b/i, name: "filter/sort/search" },
  { rx: /\b(drag|drop|drag.?and.?drop)\b/i, name: "drag-and-drop" },
  { rx: /\b(scroll|infinite.?scroll|load.?more)\b/i, name: "scroll" },
  { rx: /\b(toggle|switch|show.?hide|expand|collapse)\b/i, name: "toggle" },
  { rx: /\b(upload|import)\b/i, name: "file upload" },
  { rx: /\b(download|export)\b/i, name: "download/export" },
  { rx: /\b(live|real.?time|realtime|auto.?refresh|poll)\b/i, name: "real-time updates" },
  { rx: /\b(multi.?step|wizard|stepper|onboard)\b/i, name: "multi-step flow" },
  { rx: /\b(zoom|pan|resize)\b/i, name: "zoom/pan" },
  { rx: /\b(copy|clipboard)\b/i, name: "copy to clipboard" },
];

// ── Open question heuristics ─────────────────────────────────────────────────
function detectOpenQuestions(prompt: string, sections: string[], entities: string[]): string[] {
  const questions: string[] = [];
  const p = prompt.toLowerCase();

  // Color / theme not specified
  if (!/(color|colour|theme|dark|light|blue|red|green|purple|orange|teal|brand)/i.test(prompt)) {
    questions.push("Color scheme / brand colors not specified — will use the active theme.");
  }
  // Checkout but no currency
  if (/(checkout|payment|pricing|price)/i.test(prompt) && !/(usd|\$|eur|€|gbp|£|cad|aud)/i.test(prompt)) {
    questions.push("Currency not specified — will use USD.");
  }
  // Data table but no columns
  if (/(table|data.?view|records?)/i.test(prompt) && !/(column|field|property)/i.test(prompt)) {
    questions.push("Table columns/fields not specified — will infer from context.");
  }
  // Sign-up but no required fields
  if (/(sign.?up|register)/i.test(prompt) && !/(email|password|name|phone)/i.test(prompt)) {
    questions.push("Registration fields not specified — will use email + password.");
  }
  // Multi-page signals but no page list
  if (/(multiple\s+pages?|multi.?page|several\s+pages?)/i.test(prompt) && sections.length < 2) {
    questions.push("Multiple pages mentioned but structure not specified — will build single-page with sections.");
  }

  return questions;
}

// ── Page count estimate ──────────────────────────────────────────────────────
function estimatePages(prompt: string): number {
  if (/(multiple\s+pages?|multi.?page|several\s+pages?)/i.test(prompt)) return 3;
  if (/(two\s+pages?|2\s+pages?)/i.test(prompt)) return 2;
  // Long prompt with many sections suggests a multi-section SPA
  return 1;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Extract a structured spec from a prompt.
 * @param prompt - The user's generation prompt.
 * @param opts - Context options.
 */
export function extractSpec(
  prompt: string,
  opts: { minComplexityWords?: number } = {},
): ExtractedSpec {
  const minWords = opts.minComplexityWords ?? 12;
  const wordCount = prompt.trim().split(/\s+/).length;

  const sections = SECTION_PATTERNS
    .filter(({ rx }) => rx.test(prompt))
    .map(({ name }) => name);

  const entities = ENTITY_PATTERNS
    .filter(({ rx }) => rx.test(prompt))
    .map(({ name }) => name);

  const interactions = INTERACTION_PATTERNS
    .filter(({ rx }) => rx.test(prompt))
    .map(({ name }) => name);

  const openQuestions = detectOpenQuestions(prompt, sections, entities);

  // Complex if: long prompt, multiple sections, or multiple entities
  const complex =
    wordCount >= minWords ||
    sections.length >= 2 ||
    (sections.length >= 1 && entities.length >= 1);

  return {
    sections: [...new Set(sections)],
    entities: [...new Set(entities)],
    interactions: [...new Set(interactions)],
    openQuestions,
    complex,
    estimatedPages: estimatePages(prompt),
  };
}

/**
 * Render the spec as a compact system message block.
 * Injected before the user prompt in the generation system message.
 */
export function specToSystemBlock(spec: ExtractedSpec): string {
  if (!spec.complex) return "";
  const lines: string[] = ["DETECTED BUILD SPEC:"];
  if (spec.sections.length) lines.push(`Sections: ${spec.sections.join(", ")}`);
  if (spec.entities.length) lines.push(`Data entities: ${spec.entities.join(", ")}`);
  if (spec.interactions.length) lines.push(`Interactions: ${spec.interactions.join(", ")}`);
  if (spec.estimatedPages > 1) lines.push(`Scope: ~${spec.estimatedPages} pages (build as single SPA with routing)`);
  if (spec.openQuestions.length) lines.push(`Assumptions: ${spec.openQuestions.join(" | ")}`);
  lines.push("Build the complete implementation. Do not omit any detected section.");
  return lines.join("\n");
}
