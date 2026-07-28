// Shared model registry — the single source of truth for both the client picker
// and the server-side generation routes. Every id here must be accepted by the
// Lovable AI gateway.

// Fast is the default: quick UI/component builds without over-paying.
export const DEFAULT_MODEL = "google/gemini-3.5-flash" as const;

export const MODEL_REGISTRY = [
  // Google — current generation
  { id: "google/gemini-3.1-flash-lite",  label: "Gemini 3.1 Flash Lite (fastest)" },
  { id: "google/gemini-3.5-flash",       label: "Gemini 3.5 Flash" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  // Google — previews / prior generation
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (preview)" },
  { id: "google/gemini-2.5-pro",         label: "Gemini 2.5 Pro (advanced)" },
  { id: "google/gemini-2.5-flash",       label: "Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-flash-lite",  label: "Gemini 2.5 Flash Lite" },
  // OpenAI — GPT-5.6 current
  { id: "openai/gpt-5.6-luna",           label: "GPT-5.6 Luna (fast)" },
  { id: "openai/gpt-5.6-terra",          label: "GPT-5.6 Terra (balanced)" },
  { id: "openai/gpt-5.6-sol",            label: "GPT-5.6 Sol (flagship)" },
  // OpenAI — GPT-5.5 / 5.4 current
  { id: "openai/gpt-5.5",                label: "GPT-5.5 (frontier)" },
  { id: "openai/gpt-5.4",                label: "GPT-5.4" },
  { id: "openai/gpt-5.4-mini",           label: "GPT-5.4 Mini" },
  { id: "openai/gpt-5.4-nano",           label: "GPT-5.4 Nano" },
  // OpenAI — GPT-5 / 5.2 prior
  { id: "openai/gpt-5.2",                label: "GPT-5.2" },
  { id: "openai/gpt-5",                  label: "GPT-5" },
  { id: "openai/gpt-5-mini",             label: "GPT-5 Mini" },
  { id: "openai/gpt-5-nano",             label: "GPT-5 Nano" },
] as const;

// RouteLLM (Abacus) — OpenAI-compatible gateway at https://routellm.abacus.ai/v1
// The `routellm/` prefix is stripped before the request is sent upstream, so
// `routellm/route-llm` posts { model: "route-llm", stream: true } exactly like
// the OpenAI SDK example in the Abacus docs.
export const ROUTELLM_MODELS = [
  { id: "routellm/route-llm",                  label: "RouteLLM · Auto (route-llm)" },
  { id: "routellm/claude-haiku-4-5-20251001",  label: "RouteLLM · Claude Haiku 4.5" },
  { id: "routellm/claude-sonnet-4-5-20250929", label: "RouteLLM · Claude Sonnet 4.5" },
  { id: "routellm/claude-opus-4-1-20250805",   label: "RouteLLM · Claude Opus 4.1" },
  { id: "routellm/gpt-4o",                     label: "RouteLLM · GPT-4o" },
  { id: "routellm/gpt-4o-mini",                label: "RouteLLM · GPT-4o Mini" },
  { id: "routellm/gemini-2.5-pro",             label: "RouteLLM · Gemini 2.5 Pro" },
  { id: "routellm/gemini-2.5-flash",           label: "RouteLLM · Gemini 2.5 Flash" },
  { id: "routellm/grok-4.3",                   label: "RouteLLM · Grok 4.3" },
] as const;

export const ROUTELLM_PREFIX = "routellm/";
export function isRouteLLMModel(id: string): boolean {
  return id.startsWith(ROUTELLM_PREFIX);
}
export function stripRouteLLMPrefix(id: string): string {
  return id.startsWith(ROUTELLM_PREFIX) ? id.slice(ROUTELLM_PREFIX.length) : id;
}

const ROUTELLM_IDS = ROUTELLM_MODELS.map((m) => m.id);
export const ALLOWED_MODEL_IDS = [
  ...MODEL_REGISTRY.map((m) => m.id),
  ...ROUTELLM_IDS,
];
export type ModelId = (typeof MODEL_REGISTRY)[number]["id"] | (typeof ROUTELLM_MODELS)[number]["id"];

// User-facing modes: friendly names that map to a concrete supported model.
// Kept in one place so both the picker UI and resolveModel() agree.
export const MODE_TO_MODEL = {
  auto:     DEFAULT_MODEL,                     // routed dynamically by adaptive-router
  fast:     "google/gemini-3.5-flash",         // default — quick UI/component builds
  economy:  "google/gemini-3.1-flash-lite",    // simple text/color/spacing edits
  balanced: "openai/gpt-5.4-mini",             // complex logic, debugging, multi-feature
  deep:     "google/gemini-3.1-pro-preview",   // major rebuilds
  routellm: "routellm/claude-haiku-4-5-20251001", // Abacus RouteLLM default (Haiku 4.5)
} as const satisfies Record<string, ModelId>;

export type ModeId = keyof typeof MODE_TO_MODEL;
export const MODE_IDS = Object.keys(MODE_TO_MODEL) as ModeId[];

// UI picker: mode chips first, then a small "Advanced" list of raw ids for
// users who want to pin a specific model.
export const MODEL_PICKER_OPTIONS = [
  { id: "auto",     label: "Auto (smart routing)" },
  { id: "fast",     label: "Fast — Gemini 3.5 Flash (default)" },
  { id: "economy",  label: "Economy — Flash Lite" },
  { id: "balanced", label: "Balanced — GPT-5.4 Mini" },
  { id: "deep",     label: "Deep Build — Gemini 3.1 Pro" },
  { id: "routellm", label: "RouteLLM — Claude Haiku 4.5" },
  ...MODEL_REGISTRY,
  ...ROUTELLM_MODELS,
] as const;

export function isModeId(v: string | undefined): v is ModeId {
  return !!v && Object.prototype.hasOwnProperty.call(MODE_TO_MODEL, v);
}

export function resolveModel(id: string | undefined): ModelId {
  if (!id) return DEFAULT_MODEL;
  if (isModeId(id)) return MODE_TO_MODEL[id];
  return (ALLOWED_MODEL_IDS as readonly string[]).includes(id) ? (id as ModelId) : DEFAULT_MODEL;
}


// Model tiers — used by the server to decide whether to fall back to the
// fastest reliable model when time-to-first-byte exceeds budget.
export const FAST_MODEL_IDS: readonly string[] = [
  "google/gemini-3.1-flash-lite",
  "google/gemini-3.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-3-flash-preview",
  "openai/gpt-5.6-luna",
  "openai/gpt-5.4-nano",
  "openai/gpt-5-nano",
];

export function isFastTier(id: string): boolean {
  return FAST_MODEL_IDS.includes(id);
}
