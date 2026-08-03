/**
 * Extended intent patterns for the task classifier.
 * These cover natural-language descriptions that don't match simple keywords
 * but have clear execution paths. Scored by specificity — more specific
 * patterns score higher confidence.
 *
 * Philosophy: a pattern that uniquely identifies intent scores 0.85+.
 * Patterns that are suggestive but ambiguous score 0.55–0.70.
 * Nothing here overrides an explicit model selection.
 */

import type { Classification, TaskType, ExecutionPath } from "./task-classifier";

interface Pattern {
  rx: RegExp;
  taskType: TaskType;
  executionPath: ExecutionPath;
  confidence: number;
  reason: string;
}

// ── Aesthetic / feel ────────────────────────────────────────────────────────
// "more premium", "feel expensive", "luxurious look", "clean and minimal"
const AESTHETIC_PATTERNS: Pattern[] = [
  {
    rx: /\b(premium|luxury|luxurious|high.?end|elegant|expensive.?feel|polished|refined)\b/i,
    taskType: "style-edit", executionPath: "deterministic", confidence: 0.75,
    reason: "Aesthetic premium/luxury intent.",
  },
  {
    rx: /\b(minimal(ist)?|clean|simple|less.?clutter|more.?white.?space|breathing.?room)\b/i,
    taskType: "style-edit", executionPath: "deterministic", confidence: 0.72,
    reason: "Minimalism/whitespace aesthetic.",
  },
  {
    rx: /\b(dark.?mode|light.?mode|dark.?theme|light.?theme|night.?mode)\b/i,
    taskType: "style-edit", executionPath: "deterministic", confidence: 0.88,
    reason: "Explicit theme mode switch.",
  },
  {
    rx: /\b(more.?modern|more.?professional|more.?corporate|enterprise.?look)\b/i,
    taskType: "style-edit", executionPath: "deterministic", confidence: 0.70,
    reason: "Modern/professional aesthetic.",
  },
  {
    rx: /\b(playful|fun|vibrant|energetic|bold.?design|pop.?of.?color)\b/i,
    taskType: "style-edit", executionPath: "deterministic", confidence: 0.68,
    reason: "Playful/vibrant aesthetic.",
  },
];

// ── Structural / layout ──────────────────────────────────────────────────────
const STRUCTURAL_PATTERNS: Pattern[] = [
  {
    rx: /\b(two.?column|three.?column|split.?layout|side.?by.?side)\b/i,
    taskType: "layout-edit", executionPath: "low-cost-ai", confidence: 0.82,
    reason: "Multi-column layout request.",
  },
  {
    rx: /\b(sticky|fixed.?(top|bottom))\b.{0,20}\b(header|nav|footer|bar)\b|\b(header|nav|footer|bar)\b.{0,20}\b(sticky|fixed)\b/i,
    taskType: "layout-edit", executionPath: "low-cost-ai", confidence: 0.84,
    reason: "Sticky/fixed positioning.",
  },
  {
    rx: /\b(hero.?section|above.?the.?fold|landing.?section)\b/i,
    taskType: "new-feature", executionPath: "advanced-ai", confidence: 0.78,
    reason: "Hero/landing section addition.",
  },
  {
    rx: /\b(responsive|mobile.?friendly|works.?on.?mobile|phone.?layout)\b/i,
    taskType: "layout-edit", executionPath: "low-cost-ai", confidence: 0.80,
    reason: "Responsive/mobile layout.",
  },
];

// ── Content / copy ───────────────────────────────────────────────────────────
const CONTENT_PATTERNS: Pattern[] = [
  {
    rx: /\b(placeholder|dummy.?text|lorem|sample.?content|fill.?in)\b/i,
    taskType: "content-replacement", executionPath: "deterministic", confidence: 0.78,
    reason: "Placeholder content swap.",
  },
  {
    rx: /\b(translate|in.?(french|spanish|german|japanese|portuguese|arabic|hindi))\b/i,
    taskType: "content-replacement", executionPath: "deterministic", confidence: 0.85,
    reason: "Translation request.",
  },
  {
    rx: /\b(update.?(text|copy|wording|label|title)|reword|rephrase)\b/i,
    taskType: "content-replacement", executionPath: "deterministic", confidence: 0.80,
    reason: "Text/copy update.",
  },
];

// ── Interaction / behaviour ─────────────────────────────────────────────────
const INTERACTION_PATTERNS: Pattern[] = [
  {
    rx: /\b(hover.?effect|on.?hover|hover.?state|hover.?animation)\b/i,
    taskType: "style-edit", executionPath: "deterministic", confidence: 0.82,
    reason: "Hover effect.",
  },
  {
    rx: /\b(animate|animation|transition|fade|slide.?in|bounce|pulse|spin)\b/i,
    taskType: "component-change", executionPath: "low-cost-ai", confidence: 0.72,
    reason: "Animation/transition.",
  },
  {
    rx: /\b(click.?(to|able|handler)|on.?click|button.?action|link.?to)\b/i,
    taskType: "component-change", executionPath: "low-cost-ai", confidence: 0.75,
    reason: "Click interaction.",
  },
  {
    rx: /\b(form.?validation|required.?field|error.?message|submit.?handler)\b/i,
    taskType: "component-change", executionPath: "low-cost-ai", confidence: 0.80,
    reason: "Form interaction.",
  },
];

// ── Full rebuild signals ─────────────────────────────────────────────────────
const REBUILD_PATTERNS: Pattern[] = [
  {
    rx: /\b(completely.?(different|new|redesign|redo)|totally.?new|overhaul|makeover|redo.?(it|this|everything)|redesign.?(this|it|everything)|completely\s+redesign)\b/i,
    taskType: "full-generation", executionPath: "advanced-ai", confidence: 0.85,
    reason: "Complete overhaul signal.",
  },
  {
    rx: /\b(inspired.?by|like|similar.?to|in.?the.?style.?of)\s+\w/i,
    taskType: "full-generation", executionPath: "advanced-ai", confidence: 0.72,
    reason: "Design reference/inspiration.",
  },
];

export const ALL_INTENT_PATTERNS: Pattern[] = [
  ...AESTHETIC_PATTERNS,
  ...STRUCTURAL_PATTERNS,
  ...CONTENT_PATTERNS,
  ...INTERACTION_PATTERNS,
  ...REBUILD_PATTERNS,
];

/**
 * Try to match extended intent patterns against a prompt.
 * Returns the best match (highest confidence) or null if nothing matches
 * above the minimum threshold.
 *
 * Only used when the primary classifier returns confidence < 0.6, so these
 * patterns augment — never override — clear primary classifications.
 */
export function matchIntentPatterns(prompt: string): Classification | null {
  let best: (Pattern & { idx: number }) | null = null;
  for (let i = 0; i < ALL_INTENT_PATTERNS.length; i++) {
    const p = ALL_INTENT_PATTERNS[i];
    if (p.rx.test(prompt) && (!best || p.confidence > best.confidence)) {
      best = { ...p, idx: i };
    }
  }
  if (!best || best.confidence < 0.55) return null;
  // Derive strategy same way the main classifier does.
  const hasHtml = true; // extended patterns only apply when html exists
  const strategy =
    best.taskType === "full-generation" ? "full-generation" :
    best.executionPath === "deterministic" ? "deterministic" :
    best.taskType === "advisory-chat" ? "advisory" :
    "ai-patch";
  return {
    taskType: best.taskType,
    executionPath: best.executionPath,
    strategy,
    confidence: best.confidence,
    reason: best.reason,
  };
}
