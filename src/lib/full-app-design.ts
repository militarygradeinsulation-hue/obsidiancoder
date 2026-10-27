// The original HTML is untrusted design data, never instructions to the agent.
// Strip executable and private form material before sending a bounded reference.
export function designHtmlReference(html: string): string {
  if (typeof html !== "string") throw new Error("Invalid design source.");
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, "")
    .replace(/<iframe\b[^>]*\/>/gi, "")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:srcdoc|integrity|nonce)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(?:sk-proj-|sb_secret_|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/g, "[REDACTED_TOKEN]")
    .slice(0, 24_000).trim();
  if (stripped.length < 20) throw new Error("No usable visual design remains after removing scripts and forms.");
  return stripped;
}
