// AI gateway resolver — one place that decides which OpenAI-compatible
// endpoint the non-primary AI calls go to (planners, prompt enhancer, ideas,
// build chat, image fallback, transcription).
//
// Why: those call sites hardcoded https://ai.gateway.lovable.dev with
// LOVABLE_API_KEY, so the moment this code ran anywhere other than Lovable
// they silently returned nothing. The primary build path already supported
// Google direct (google-ai.ts); this extends the same portability everywhere.
//
// Resolution order (first match wins):
//   1. AI_GATEWAY_URL + AI_GATEWAY_KEY  -> any OpenAI-compatible base URL
//      (e.g. https://openrouter.ai/api/v1). Optional AI_GATEWAY_MODEL forces
//      one model for every call (useful on free tiers with one model).
//   2. LOVABLE_API_KEY                  -> Lovable gateway. UNCHANGED from the
//      original behavior, so the current Lovable deployment is unaffected.
//   3. GOOGLE_AI_API_KEY                -> Google AI Studio's OpenAI-compatible
//      endpoint (has a free tier). Model ids are mapped via googleModelFor.
//   none                               -> Lovable URLs with no key; callers
//      already treat a missing key as "feature unavailable".

import { googleAiKey, googleModelFor } from "./google-ai";

export type GatewayKind = "custom" | "lovable" | "google" | "none";

const LOVABLE_BASE = "https://ai.gateway.lovable.dev/v1";
const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export interface Gateway {
  kind: GatewayKind;
  base: string;
  key: string | undefined;
}

export function resolveGateway(): Gateway {
  const customBase = env("AI_GATEWAY_URL");
  const customKey = env("AI_GATEWAY_KEY");
  if (customBase && customKey) return { kind: "custom", base: customBase.replace(/\/+$/, ""), key: customKey };
  const lovable = env("LOVABLE_API_KEY");
  if (lovable) return { kind: "lovable", base: LOVABLE_BASE, key: lovable };
  const google = googleAiKey();
  if (google) return { kind: "google", base: GOOGLE_BASE, key: google };
  return { kind: "none", base: LOVABLE_BASE, key: undefined };
}

export function gatewayKey(): string | undefined {
  return resolveGateway().key;
}

export function gatewayChatUrl(): string {
  return `${resolveGateway().base}/chat/completions`;
}

/**
 * Image generation endpoint, or null when the active gateway can't do it.
 * Google's free tier has no image generation on the OpenAI-compatible
 * surface, so off-Lovable images come from Leonardo/Higgsfield keys or an
 * explicit AI_IMAGE_URL (+ AI_IMAGE_MODEL), and otherwise degrade gracefully.
 */
export function gatewayImagesUrl(): string | null {
  const explicit = env("AI_IMAGE_URL");
  if (explicit) return explicit;
  const g = resolveGateway();
  if (g.kind === "lovable" || g.kind === "custom") return `${g.base}/images/generations`;
  return null;
}

export function gatewayImageModel(defaultModel: string): string {
  return env("AI_IMAGE_MODEL") ?? defaultModel;
}

/** Audio transcription endpoint (OpenAI-compatible), or null if unsupported. */
export function gatewayTranscribeUrl(): string | null {
  const g = resolveGateway();
  if (g.kind === "lovable" || g.kind === "custom") return `${g.base}/audio/transcriptions`;
  return null;
}

/** Translate a model id for whichever gateway is active. Lovable: unchanged. */
export function gatewayModel(model: string): string {
  const g = resolveGateway();
  if (g.kind === "custom") return env("AI_GATEWAY_MODEL") ?? model;
  if (g.kind === "google") return googleModelFor(model);
  return model;
}

/** True when the given URL is the active gateway's chat URL (for provider labels). */
export function isGatewayChatUrl(url: string): boolean {
  return url === gatewayChatUrl() || url.startsWith(LOVABLE_BASE);
}
