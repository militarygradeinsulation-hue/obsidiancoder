/**
 * RouteLLM (Abacus) API key resolution.
 *
 * Multiple keys may be configured. They are tried in priority order so that a
 * key that has run out of credits does not take the whole system down.
 * ROUTELLM_API_KEY_2 is the freshest key and is preferred.
 */
export function routellmKeys(): string[] {
  const keys = [
    process.env.ROUTELLM_API_KEY_2,
    process.env.ROUTELLM_API_KEY_FALLBACK,
    process.env.ROUTELLM_API_KEY,
  ];
  return Array.from(new Set(keys.filter((k): k is string => !!k && k.trim().length > 0)));
}

/** The key to use for a single-shot request. */
export function routellmKey(): string | undefined {
  return routellmKeys()[0];
}

/**
 * True when an upstream error means "this RouteLLM key cannot be used"
 * (out of credits, unauthorized, over quota) rather than a real request bug.
 * Abacus returns HTTP 400 with a JSON body for credit exhaustion, so we have
 * to sniff the message text.
 */
export function isRouteLLMKeyExhausted(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  return (
    msg.includes("no remaining credits") ||
    msg.includes("out of credits") ||
    msg.includes("credits exhausted") ||
    msg.includes("quota") ||
    msg.includes("invalid api key") ||
    msg.includes("unauthorized")
  );
}

/**
 * Lovable-gateway equivalent for a RouteLLM model, used as a last-resort
 * provider fallback when every RouteLLM key is exhausted. Ids must exist in
 * the Lovable AI gateway catalog.
 */
export function lovableEquivalentFor(routellmModel: string): string {
  const m = routellmModel.replace(/^routellm\//, "");
  if (m.startsWith("claude-opus")) return "openai/gpt-5.5";
  if (m.startsWith("claude-sonnet")) return "openai/gpt-5.4-mini";
  if (m.startsWith("claude-haiku")) return "google/gemini-3.5-flash";
  if (m === "gpt-4o") return "openai/gpt-5.4";
  if (m === "gpt-4o-mini") return "openai/gpt-5.4-mini";
  if (m === "gemini-2.5-pro") return "google/gemini-2.5-pro";
  if (m === "gemini-2.5-flash") return "google/gemini-2.5-flash";
  if (m.startsWith("grok")) return "openai/gpt-5.4";
  return "google/gemini-3.5-flash"; // route-llm auto + anything unknown
}
