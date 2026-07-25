export type SafeSuggestion = {
  label: string;
  snippet: string;
};

// These expressions are safety boundaries, not prompt content. They keep
// vertical-specific output from entering generic composer and chat flows.
const EXPLICIT_TRADES_CONTEXT_RE = /\b(?:hvac|refrigerant|nfpa\s*25|epa\s*608|fire\s+(?:protection|sprinkler)|commercial\s+glazing|glazier|electrical\s+subcontractor|mechanical\s+contractor|plumbing\s+contractor|specialty\s+trade|field\s+technician|field\s+techs?|servicetitan|procore|jobber|housecall\s*pro|quickbooks\s+online\s+(?:sync|integration)|itm\s+report|deficiency[- ]to[- ]quote|refrigerant\s+compliance)\b/i;

// Deliberately narrow: only phrases that are unambiguously part of the
// Aetheris trades vertical (never triggered by general prompts mentioning
// "contractor", "deficiency", "L2", "quickbooks", etc.).
const TRADES_ONLY_OUTPUT_RE = /(?:\bplugs?\s+l(?:[1-9]|10)\b|\btwo[- ]tap\b|\bfollow[- ]up\s+repair\s+quote\b|\bdeficiency[- ]to[- ]quote\b|\bnfpa\s*25\b|\bepa\s*608\b|\bitm\s+report\b|\brefrigerant\s+compliance\b|\b(?:servicetitan|procore|housecall\s*pro|jobber)\b|\bquickbooks\s+online\s+(?:sync|integration)\b)/i;

export function isExplicitTradesContext(text: string): boolean {
  return EXPLICIT_TRADES_CONTEXT_RE.test(text);
}

export function containsTradesOnlyLanguage(text: string): boolean {
  return TRADES_ONLY_OUTPUT_RE.test(text);
}

export function suggestionAllowed(text: string, allowTrades: boolean): boolean {
  return allowTrades || !containsTradesOnlyLanguage(text);
}

export function neutralEnhancementFallbacks(
  source: string,
  hasHtml: boolean,
  count = 3,
): SafeSuggestion[] {
  const text = source.toLowerCase();
  const candidates: SafeSuggestion[] = [];
  const add = (label: string, snippet: string) => {
    if (!text.includes(snippet.toLowerCase().slice(0, 28))) candidates.push({ label, snippet });
  };

  if (/\b(?:list|catalog|directory|library|recipe|product|article|gallery)\b/.test(text)) {
    add("+ Search and filters", "Add fast search, useful filters, and a clear no-results state for this content.");
  }
  if (/\b(?:form|signup|sign up|login|contact|checkout|booking|survey)\b/.test(text)) {
    add("+ Form states", "Add inline validation plus clear submitting, success, and error states for every form.");
  }
  if (/\b(?:dashboard|analytics|report|chart|table|finance|tracker)\b/.test(text)) {
    add("+ Export and filters", "Add relevant date filters and an export action that preserves the current view.");
  }
  if (/\b(?:game|quiz|puzzle|arcade|trivia)\b/.test(text)) {
    add("+ Game settings", "Add a concise first-run guide, sound controls, and persistent progress for returning players.");
  }
  if (/\b(?:editor|generator|builder|calculator|tool|planner)\b/.test(text)) {
    add("+ Saved work", "Persist the user's work locally and add clear reset, export, and share actions.");
  }

  add("+ Complete states", "Add purposeful empty, loading, error, and success states that match this app's current workflow.");
  add("+ Helpful settings", "Add a compact settings area containing only options relevant to this app's existing features.");
  add("+ Quick onboarding", "Add a short first-use onboarding flow that demonstrates the app's primary action.");
  add("+ Accessible polish", "Improve keyboard navigation, focus visibility, labels, contrast, and reduced-motion behavior throughout.");
  add("+ Responsive polish", "Refine spacing, controls, and content hierarchy for narrow phones and wide desktop screens.");
  if (hasHtml) add("+ Preserve behavior", "Keep every working feature intact while integrating the new states and controls consistently.");

  return candidates.slice(0, Math.max(1, count));
}

export function filterGenericSuggestions<T extends SafeSuggestion>(items: T[]): T[] {
  return items.filter((item) => !containsTradesOnlyLanguage(`${item.label} ${item.snippet}`));
}