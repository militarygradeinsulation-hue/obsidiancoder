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
