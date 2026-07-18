// Shared model registry — the single source of truth for both the client picker
// and the server-side generation routes. Every id here must be accepted by the
// Lovable AI gateway.
export const DEFAULT_MODEL = "google/gemini-3.1-flash-lite" as const;

export const MODEL_REGISTRY = [
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (fastest)" },
  { id: "google/gemini-3.5-flash",       label: "Gemini 3.5 Flash" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { id: "google/gemini-2.5-pro",         label: "Gemini 2.5 Pro" },
  { id: "openai/gpt-5.4-mini",           label: "GPT-5.4 Mini" },
  { id: "openai/gpt-5.6-luna",           label: "GPT-5.6 Luna (fast)" },
  { id: "openai/gpt-5.6-terra",          label: "GPT-5.6 Terra (balanced)" },
  { id: "openai/gpt-5.6-sol",            label: "GPT-5.6 Sol (flagship)" },
] as const;

export const ALLOWED_MODEL_IDS = MODEL_REGISTRY.map((m) => m.id);
export type ModelId = (typeof MODEL_REGISTRY)[number]["id"];

// UI-only: "auto" is a client alias that resolves to DEFAULT_MODEL before hitting the API.
export const MODEL_PICKER_OPTIONS = [
  { id: "auto", label: "Automatic (fastest reliable)" } as const,
  ...MODEL_REGISTRY,
];

export function resolveModel(id: string | undefined): ModelId {
  if (!id || id === "auto") return DEFAULT_MODEL;
  return (ALLOWED_MODEL_IDS as readonly string[]).includes(id) ? (id as ModelId) : DEFAULT_MODEL;
}
