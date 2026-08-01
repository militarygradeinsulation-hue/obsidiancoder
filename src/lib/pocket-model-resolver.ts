// Obsidian Pocket — dynamic "strongest available Claude" resolver.
//
// Pure + deterministic. Never hard-codes a model id that is not already
// present in the configured registry, so when a verified `claude-opus-5-*`
// id is added to ROUTELLM_MODELS this resolver picks it up automatically.

import {
  ALLOWED_MODEL_IDS,
  DEFAULT_MODEL,
  MODEL_REGISTRY,
  ROUTELLM_MODELS,
  resolveModel,
  type ModelId,
} from "./models";
import type { PocketProfile } from "./pocket-creative";

export type RegistryEntry = { id: string; label: string };

export function defaultRegistry(): RegistryEntry[] {
  return [
    ...MODEL_REGISTRY.map((m) => ({ id: m.id, label: m.label })),
    ...ROUTELLM_MODELS.map((m) => ({ id: m.id, label: m.label })),
  ];
}

export type PocketModelChoice = {
  model: string;
  /** True only when the selected entry is genuinely a Claude model. */
  isClaude: boolean;
  /** UI label: "Best available Claude" vs "Best available model". */
  statusLabel: string;
  /** Human name of the selected entry, for logs/tooltips. */
  entryLabel: string;
  reason: string;
};

const CLAUDE_RE = /claude/i;

export function isClaudeEntry(e: RegistryEntry): boolean {
  return CLAUDE_RE.test(e.id) || CLAUDE_RE.test(e.label);
}

/** Extract a numeric family version, e.g. "opus-4-8" → 4.8, "Sonnet 4.5" → 4.5. */
function familyVersion(text: string, family: "opus" | "sonnet" | "haiku"): number | null {
  const re = new RegExp(`${family}[^0-9]{0,4}(\\d+)(?:[._-](\\d+))?`, "i");
  const m = re.exec(text);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(major)) return null;
  return major + minor / 10;
}

type Ranked = {
  entry: RegistryEntry;
  family: "opus" | "sonnet" | "haiku" | "other";
  version: number;
  /** Higher = stronger. */
  capability: number;
};

/**
 * Capability ranking, deterministic and version-driven:
 *   Opus  → 3000 + version*10
 *   Sonnet→ 2000 + version*10
 *   Haiku → 1000 + version*10
 *   other Claude → 500
 * This yields Opus 5 > Opus 4.8 > … > Sonnet 5 > Sonnet 4.6 > … automatically,
 * with no exact id ever hard-coded.
 */
export function rankClaude(entries: readonly RegistryEntry[]): Ranked[] {
  const ranked: Ranked[] = [];
  for (const entry of entries) {
    if (!isClaudeEntry(entry)) continue;
    const text = `${entry.id} ${entry.label}`;
    const opus = familyVersion(text, "opus");
    const sonnet = familyVersion(text, "sonnet");
    const haiku = familyVersion(text, "haiku");
    if (opus != null)
      ranked.push({ entry, family: "opus", version: opus, capability: 3000 + opus * 10 });
    else if (sonnet != null)
      ranked.push({ entry, family: "sonnet", version: sonnet, capability: 2000 + sonnet * 10 });
    else if (haiku != null)
      ranked.push({ entry, family: "haiku", version: haiku, capability: 1000 + haiku * 10 });
    else ranked.push({ entry, family: "other", version: 0, capability: 500 });
  }
  ranked.sort((a, b) => b.capability - a.capability || a.entry.id.localeCompare(b.entry.id));
  return ranked;
}

/**
 * Documented Studio cost/performance policy:
 * Studio prefers the newest Sonnet over an OLDER Opus generation (Sonnet major
 * version strictly greater than the best Opus major version), because a
 * newer-generation Sonnet is both cheaper and stronger than a prior-generation
 * Opus. When Opus is same-or-newer generation, raw capability wins.
 * Cinematic always takes raw capability.
 */
export function applyStudioPolicy(ranked: Ranked[]): Ranked | null {
  if (!ranked.length) return null;
  const bestOpus = ranked.find((r) => r.family === "opus") ?? null;
  const bestSonnet = ranked.find((r) => r.family === "sonnet") ?? null;
  if (bestOpus && bestSonnet && Math.floor(bestSonnet.version) > Math.floor(bestOpus.version)) {
    return bestSonnet;
  }
  return ranked[0];
}

function allowed(id: string): boolean {
  return (ALLOWED_MODEL_IDS as readonly string[]).includes(id);
}

/** Strongest configured non-Claude deep model, used when no Claude exists. */
function bestNonClaudeFallback(entries: readonly RegistryEntry[]): RegistryEntry | null {
  const routeLlmAuto = entries.find((e) => e.id === "routellm/route-llm");
  if (routeLlmAuto) return routeLlmAuto;
  const deepOrder = [
    "openai/gpt-5.6-sol",
    "openai/gpt-5.5",
    "google/gemini-3.1-pro-preview",
    "openai/gpt-5.4",
    "google/gemini-2.5-pro",
  ];
  for (const id of deepOrder) {
    const hit = entries.find((e) => e.id === id);
    if (hit) return hit;
  }
  return entries[0] ?? null;
}

export function resolvePocketModel(input: {
  profile: PocketProfile;
  /** A raw model id the user pinned in the advanced picker. */
  pinnedModel?: string;
  registry?: readonly RegistryEntry[];
  /** Optional availability snapshot: ids known to be unusable right now. */
  unavailableIds?: readonly string[];
}): PocketModelChoice {
  const registry = (input.registry ?? defaultRegistry()).filter(
    (e) => allowed(e.id) && !(input.unavailableIds ?? []).includes(e.id),
  );

  // A pinned raw model always wins — including for Fast.
  if (
    input.pinnedModel &&
    allowed(input.pinnedModel) &&
    !(input.unavailableIds ?? []).includes(input.pinnedModel)
  ) {
    const entry = registry.find((e) => e.id === input.pinnedModel);
    const claude = entry ? isClaudeEntry(entry) : CLAUDE_RE.test(input.pinnedModel);
    return {
      model: input.pinnedModel,
      isClaude: claude,
      statusLabel: entry?.label ?? input.pinnedModel,
      entryLabel: entry?.label ?? input.pinnedModel,
      reason: "user-pinned model",
    };
  }

  if (input.profile === "fast") {
    const model = resolveModel(DEFAULT_MODEL) as ModelId;
    const entry = registry.find((e) => e.id === model);
    return {
      model,
      isClaude: false,
      statusLabel: entry?.label ?? model,
      entryLabel: entry?.label ?? model,
      reason: "fast profile uses the configured default model",
    };
  }

  const ranked = rankClaude(registry);
  const chosen = input.profile === "studio" ? applyStudioPolicy(ranked) : (ranked[0] ?? null);

  if (chosen) {
    return {
      model: chosen.entry.id,
      isClaude: true,
      statusLabel: "Best available Claude",
      entryLabel: chosen.entry.label,
      reason: `strongest configured Claude (${chosen.family} ${chosen.version || "?"})`,
    };
  }

  const fallback = bestNonClaudeFallback(registry);
  const model = fallback?.id ?? (resolveModel(undefined) as string);
  return {
    model,
    isClaude: false,
    statusLabel: "Best available model",
    entryLabel: fallback?.label ?? model,
    reason: "no Claude model is configured in this gateway",
  };
}

/**
 * Planner model: a lower-cost capable Claude when one exists (Haiku/Sonnet
 * tier), otherwise a fast configured model. Planning payloads are small.
 */
export function resolvePocketPlannerModel(registry?: readonly RegistryEntry[]): PocketModelChoice {
  const list = (registry ?? defaultRegistry()).filter((e) => allowed(e.id));
  const ranked = rankClaude(list);
  const cheapClaude =
    ranked.filter((r) => r.family === "haiku").sort((a, b) => b.version - a.version)[0] ??
    ranked.filter((r) => r.family === "sonnet").sort((a, b) => b.version - a.version)[0] ??
    null;
  if (cheapClaude) {
    return {
      model: cheapClaude.entry.id,
      isClaude: true,
      statusLabel: "Best available Claude",
      entryLabel: cheapClaude.entry.label,
      reason: "lower-cost capable Claude for concept planning",
    };
  }
  const fast = list.find((e) => e.id === "google/gemini-3.5-flash") ?? list[0] ?? null;
  const model = fast?.id ?? DEFAULT_MODEL;
  return {
    model,
    isClaude: false,
    statusLabel: "Best available model",
    entryLabel: fast?.label ?? model,
    reason: "no Claude configured; using a fast configured model for planning",
  };
}
