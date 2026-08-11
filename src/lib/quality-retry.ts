// One corrective regeneration pass for builds that fail the design floor.
//
// The generate route streams raw HTML, so a bad build cannot be un-emitted
// server-side. Instead the client — which already accumulates the full
// document before committing — re-runs generation ONCE with a corrective
// instruction and an escalated model, and only commits the better result.

import type { DesignReport } from "./design-floor";
import { checkDesignFloor } from "./design-floor";

/** Cheap/fast ids escalate to a stronger sibling for the corrective pass. */
const ESCALATION: Record<string, string> = {
  "google/gemini-3.1-flash-lite": "google/gemini-3.5-flash",
  "google/gemini-2.5-flash-lite": "google/gemini-2.5-flash",
  "google/gemini-3-flash-preview": "google/gemini-3.1-pro-preview",
  "google/gemini-3.5-flash": "google/gemini-3.1-pro-preview",
  "google/gemini-2.5-flash": "google/gemini-2.5-pro",
  "openai/gpt-5.4-nano": "openai/gpt-5.4-mini",
  "openai/gpt-5.4-mini": "openai/gpt-5.4",
  "openai/gpt-5.4": "openai/gpt-5.5",
  "openai/gpt-5-nano": "openai/gpt-5-mini",
  "openai/gpt-5-mini": "openai/gpt-5",
  "openai/gpt-5.6-luna": "openai/gpt-5.6-terra",
  "openai/gpt-5.6-terra": "openai/gpt-5.6-sol",
  // Claude builds escalate WITHIN the Claude family — jumping to a Gemini id
  // is a sideways move that loses the design quality Claude was chosen for.
  "routellm/claude-haiku-4-5-20251001": "routellm/claude-sonnet-4-5-20250929",
  "routellm/claude-sonnet-4-5-20250929": "routellm/claude-opus-4-1-20250805",
  "claude-haiku-4-5-20251001": "routellm/claude-sonnet-4-5-20250929",
  "claude-sonnet-4-5-20250929": "routellm/claude-opus-4-1-20250805",
};

/** Next model up for a corrective pass. Falls back to a strong default. */
export function escalateModel(model: string | undefined | null): string {
  const m = (model ?? "").trim();
  if (m && ESCALATION[m]) return ESCALATION[m];
  // Any other Claude id (including an already-top Opus) stays on Opus.
  if (/claude/i.test(m)) return "routellm/claude-opus-4-1-20250805";
  if (m.startsWith("openai/")) return "openai/gpt-5.4";
  return "google/gemini-3.1-pro-preview";
}

/** Strip the server diagnostic trailers and any stray markdown fences. */
export function cleanGeneratedHtml(raw: string): string {
  return raw
    .replace(/\s*<!--OBS_TIMING:[\s\S]*?-->\s*$/, "")
    .replace(/\s*<!--OBS_PLACEHOLDERS:[\s\S]*?-->\s*$/, "")
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

export interface QualityRetryOptions {
  /** Same fetch wrapper the caller used for the first attempt. */
  fetcher: (input: string, init: RequestInit) => Promise<Response>;
  /** The exact JSON body of the first attempt. */
  body: Record<string, unknown>;
  /** Failure report from the first attempt. */
  report: DesignReport;
  signal?: AbortSignal;
  /** Progressive paint callback with the cleaned partial document. */
  onChunk?: (partial: string) => void;
  /** Optional extra headers (demo/free flags). */
  headers?: Record<string, string>;
}

export interface QualityRetryResult {
  html: string;
  report: DesignReport;
  model: string;
  /** True when the retry produced a document that clears the floor. */
  improved: boolean;
}

/**
 * Run exactly one corrective regeneration. Returns null when the retry
 * could not run at all (network/envelope failure) — the caller then keeps
 * its previous working build.
 */
export async function regenerateForQuality(
  opts: QualityRetryOptions,
): Promise<QualityRetryResult | null> {
  const basePrompt = typeof opts.body.prompt === "string" ? opts.body.prompt : "";
  const model = escalateModel(opts.body.model as string | undefined);

  const body = {
    ...opts.body,
    model,
    // Never let the server treat this as a user-pinned cheap model.
    pickerModel: undefined,
    // Regeneration is from scratch: do not anchor on the rejected output.
    currentHtml: "",
    advisory: false,
    prompt: `${basePrompt}\n\n---\n${opts.report.repairInstruction}`,
  };

  let res: Response;
  try {
    res = await opts.fetcher("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
      body: JSON.stringify(body),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch {
    return null;
  }

  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  if (!res.ok || !res.body || ctype.includes("application/json")) return null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  let lastPaint = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      if (opts.onChunk) {
        const now = Date.now();
        if (now - lastPaint > 120) {
          lastPaint = now;
          opts.onChunk(cleanGeneratedHtml(acc));
        }
      }
    }
  } catch {
    return null;
  }

  const html = cleanGeneratedHtml(acc);
  if (!html) return null;
  const report = checkDesignFloor(html);
  return { html, report, model, improved: report.ok };
}
