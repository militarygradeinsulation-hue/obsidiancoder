/**
 * Direct Google (Gemini) provider used as the PRIMARY build provider.
 *
 * Builds try Google first. As soon as the key runs out of quota (or is
 * rejected/rate limited), the attempt chain automatically falls back to the
 * existing ChatLLM (Abacus RouteLLM) keys and finally the Lovable gateway.
 *
 * Gemini exposes an OpenAI-compatible chat/completions surface, so the same
 * request body and SSE parsing used for every other provider work unchanged.
 */

export const GOOGLE_OPENAI_CHAT_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export function googleAiKey(): string | undefined {
  const k = process.env.GOOGLE_AI_API_KEY;
  return k && k.trim().length > 0 ? k.trim() : undefined;
}

/**
 * Map any requested model id (RouteLLM, Lovable gateway, or bare) to the
 * closest Google model, so the Google-first attempt keeps request intent.
 */
export function googleModelFor(model: string): string {
  const m = model.replace(/^routellm\//, "").replace(/^google\//, "").toLowerCase();
  if (m.includes("flash-lite") || m.includes("nano") || m.includes("haiku")) {
    return "gemini-2.5-flash-lite";
  }
  if (
    m.includes("opus") ||
    m.includes("pro") ||
    m.includes("gpt-5.5") ||
    m.includes("gpt-5.6-sol") ||
    m.includes("o1") ||
    m.includes("thinking")
  ) {
    return "gemini-2.5-pro";
  }
  return "gemini-2.5-flash";
}

/**
 * True when a Google failure means "stop using this key for now" — quota
 * exhausted, billing off, key invalid/expired, or rate limited. Anything that
 * matches here (and any other upstream failure on the Google attempt) makes
 * the chain move on to ChatLLM.
 */
export function isGoogleKeyExhausted(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("billing") ||
    msg.includes("api key") ||
    msg.includes("api_key") ||
    msg.includes("permission") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("403") ||
    msg.includes("401")
  );
}
