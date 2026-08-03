// Pocket Memory — lightweight prompt-based project memory for Pocket builds.
//
// Pocket has no memory panel, so this module:
//  1. Extracts project facts from the user's prompt on the first build.
//  2. Merges new facts from subsequent prompts (never overwrites explicit values).
//  3. Returns a filled ProjectMemory ready to send with /api/generate.
//
// The extraction is 100% deterministic regex — no AI call, zero latency.
// It's intentionally conservative: only captures clearly-stated facts.

import type { ProjectMemory } from "./project-memory";
import { EMPTY_MEMORY, mergeMemory } from "./project-memory";

// ---- pattern bank ----

const PURPOSE_RX = [
  /\b(?:build|create|make|design)\s+(?:a|an|the)\s+(.{6,80}?)\s*(?:for|with|that|\.|$)/i,
  /\bsite\s+(?:for|about)\s+(.{4,80})/i,
  /\bapp\s+(?:for|about|that)\s+(.{4,80})/i,
];

const AUDIENCE_RX = [
  /\bfor\s+((?:small\s+)?businesses?|startups?|agencies?|freelancers?|developers?|designers?|founders?|restaurants?|lawyers?|doctors?|contractors?|real\s+estate\s+agents?)/i,
  /\btargeting\s+(.{4,60})/i,
];

const COLOR_RX = [
  /\bcolor(?:s)?\s*[:\-–]?\s*([#A-Za-z0-9, ]{4,60})/i,
  /\buse(?:s)?\s+((?:#[0-9a-f]{3,8}|(?:black|white|blue|red|green|purple|gold|amber|teal|navy|slate|grey|gray|orange|pink|indigo)(?:\s+and\s+(?:#[0-9a-f]{3,8}|\w+))?(?:\s+accents?)?))(?:\s+(?:as\s+)?(?:the\s+)?(?:colors?|palette|brand\s+colors?))?/i,
  /\b((?:dark\s+navy|navy|indigo|midnight)\s+and\s+(?:gold|amber|brass))/i,
  /\b(dark|light)\s+(?:mode|theme|design)/i,
];

const FONT_RX = [
  /\bfont(?:s)?\s*[:\-–]?\s*([A-Za-z][A-Za-z0-9 ,]{2,60})/i,
  /\buse\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:font|typeface)/i,
];

const BRAND_RX = [
  /\bcompany\s+(?:name\s+is|called)\s+["']?([A-Za-z][A-Za-z0-9 ]{1,40})["']?/i,
  /\bbrand\s+(?:name|called)\s+["']?([A-Za-z][A-Za-z0-9 ]{1,40})["']?/i,
];

const DONT_CHANGE_RX = [
  /\bkeep\s+(.{4,80}?)\s+(?:as[\s-]is|unchanged|the same|exactly)/i,
  /\bdo\s+not\s+(?:change|touch|modify|remove)\s+(.{4,80})/i,
  /\bpreserve\s+(.{4,80})/i,
];

const FRAMEWORK_RX = [
  /\b(react|vue|svelte|angular|next\.?js|nuxt|astro|remix|tailwind|bootstrap)\b/i,
];

function firstMatch(text: string, patterns: RegExp[]): string {
  for (const rx of patterns) {
    const m = text.match(rx);
    if (m?.[1]) return m[1].trim().slice(0, 200);
  }
  return "";
}

/**
 * Extract project facts from a prompt string.
 * Returns partial ProjectMemory — only populated fields.
 */
export function extractMemoryFromPrompt(prompt: string): Partial<ProjectMemory> {
  if (!prompt || prompt.length < 10) return {};
  const partial: Partial<ProjectMemory> = {};

  const purpose = firstMatch(prompt, PURPOSE_RX);
  if (purpose) partial.purpose = purpose;

  const audience = firstMatch(prompt, AUDIENCE_RX);
  if (audience) partial.audience = audience;

  const colors = firstMatch(prompt, COLOR_RX);
  if (colors) partial.brandColors = colors;

  const fonts = firstMatch(prompt, FONT_RX);
  if (fonts) partial.fonts = fonts;

  const doNotChange = firstMatch(prompt, DONT_CHANGE_RX);
  if (doNotChange) partial.doNotChange = doNotChange;

  const fw = firstMatch(prompt, FRAMEWORK_RX);
  if (fw) partial.framework = fw;

  return partial;
}

/**
 * Merge new prompt facts into an existing memory without overwriting
 * explicitly set values. Pass EMPTY_MEMORY on the first build.
 */
export function updateMemoryFromPrompt(
  existing: ProjectMemory,
  prompt: string,
): ProjectMemory {
  const extracted = extractMemoryFromPrompt(prompt);
  // Only fill empty fields — never overwrite what the user or a previous
  // extraction already set, unless the field is explicitly empty.
  const fillOnly: Partial<ProjectMemory> = {};
  for (const [k, v] of Object.entries(extracted) as [keyof ProjectMemory, string][]) {
    const current = existing[k];
    if (typeof current === "string" && current.trim() === "" && v) {
      (fillOnly as Record<string, string>)[k] = v;
    }
  }
  return mergeMemory(existing, fillOnly);
}

/** True when the memory has at least one non-empty user-visible field. */
export function hasMemory(mem: ProjectMemory): boolean {
  const fields: (keyof ProjectMemory)[] = [
    "purpose", "audience", "design", "brandColors", "fonts",
    "constraints", "doNotChange", "workingFeatures",
  ];
  return fields.some((k) => {
    const v = mem[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

/** Produce a compact one-line summary for display in the Pocket UI. */
export function memorySummary(mem: ProjectMemory): string {
  const parts: string[] = [];
  if (mem.purpose?.trim()) parts.push(mem.purpose.trim().slice(0, 60));
  if (mem.audience?.trim()) parts.push(`for ${mem.audience.trim().slice(0, 40)}`);
  if (mem.brandColors?.trim()) parts.push(mem.brandColors.trim().slice(0, 30));
  return parts.join(" · ").slice(0, 120);
}

/** Initial empty memory for Pocket sessions. */
export function newPocketMemory(): ProjectMemory {
  return { ...EMPTY_MEMORY };
}
