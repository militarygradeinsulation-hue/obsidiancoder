/**
 * Direct Anthropic (Claude) API integration.
 *
 * Every other provider in this app (Google direct, RouteLLM/Abacus, the
 * Lovable gateway) speaks the OpenAI chat/completions wire protocol, so one
 * shared attempt loop in generate.ts can talk to all of them. Anthropic does
 * not:
 *
 *   - Auth is `x-api-key` + `anthropic-version` headers, not
 *     `Authorization: Bearer`.
 *   - The system prompt is a top-level `system` field, never a role:"system"
 *     entry inside `messages`.
 *   - `max_tokens` is REQUIRED on every request.
 *   - Streaming is Anthropic's own SSE event set (message_start,
 *     content_block_start, content_block_delta, message_delta, message_stop,
 *     ping) — not OpenAI's `choices[].delta` chunks.
 *
 * This module is the entire translation surface. It converts our existing
 * OpenAI-shaped message array into an Anthropic request, and converts
 * Anthropic's SSE stream back into OpenAI-shaped `data:` lines so the
 * existing generate.ts reader — which already expects
 * `j.choices?.[0]?.delta?.content` — needs no changes at all.
 *
 * Everything here is additive and INERT until ANTHROPIC_API_KEY is set in
 * the environment. With no key configured, isAnthropicModel() is the only
 * function ever called, the attempt is never added to the provider chain,
 * and zero existing behavior changes.
 */

export const ANTHROPIC_MODELS = [
  { id: "anthropic/claude-sonnet-5",  label: "Claude Sonnet 5 (balanced, flagship default)" },
  { id: "anthropic/claude-opus-4-8",  label: "Claude Opus 4.8 (deepest reasoning)" },
  { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest)" },
] as const;

const ANTHROPIC_PREFIX = "anthropic/";

export function isAnthropicModel(id: string): boolean {
  return id.startsWith(ANTHROPIC_PREFIX);
}

/** Maps our picker id to the real Anthropic API model string. */
export function anthropicWireModel(id: string): string {
  const m = id.startsWith(ANTHROPIC_PREFIX) ? id.slice(ANTHROPIC_PREFIX.length) : id;
  if (m === "claude-haiku-4-5") return "claude-haiku-4-5-20251001";
  return m; // claude-sonnet-5, claude-opus-4-8 are already correct wire ids
}

export function anthropicApiKey(): string | undefined {
  const k = process.env.ANTHROPIC_API_KEY;
  return k && k.trim().length > 0 ? k : undefined;
}

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
export const ANTHROPIC_MAX_TOKENS = 8192;

interface OpenAIStyleMessage { role: string; content: string }

export interface AnthropicRequestBody {
  model: string;
  system?: string;
  max_tokens: number;
  stream: true;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * Convert the app's existing OpenAI-shaped message array into an Anthropic
 * request body. Pure function — no network, fully unit-testable.
 *
 * Handles two things Anthropic requires that OpenAI-style callers never
 * think about: system messages must be pulled out of the array entirely,
 * and consecutive same-role turns must be merged (Anthropic rejects
 * back-to-back user/user or assistant/assistant messages).
 */
export function toAnthropicRequest(
  messages: OpenAIStyleMessage[],
  wireModel: string,
  maxTokens: number = ANTHROPIC_MAX_TOKENS,
): AnthropicRequestBody {
  const systemParts: string[] = [];
  const rest: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.role === "system") { systemParts.push(m.content); continue; }
    rest.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  }
  const merged: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of rest) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else merged.push({ ...m });
  }
  if (merged.length === 0 || merged[0].role !== "user") {
    merged.unshift({ role: "user", content: "(continue)" });
  }
  return {
    model: wireModel,
    ...(systemParts.length ? { system: systemParts.join("\n\n") } : {}),
    max_tokens: maxTokens,
    stream: true,
    messages: merged,
  };
}

interface AnthropicEvent { event: string; data: Record<string, unknown> }

function parseAnthropicSSEBlock(block: string): AnthropicEvent | null {
  let event = "";
  let dataLine = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
  }
  if (!event || !dataLine) return null;
  try {
    return { event, data: JSON.parse(dataLine) as Record<string, unknown> };
  } catch {
    return null;
  }
}

export interface AnthropicTranslation {
  /** OpenAI-compatible `data: {...}` lines, ready for the existing parser. */
  lines: string[];
  /** Leftover partial block to prepend to the next chunk. */
  remainder: string;
  /** Set once message_stop is seen. */
  done: boolean;
  usage: { inputTokens?: number; outputTokens?: number };
}

/**
 * Pure translator: takes a buffer of raw Anthropic SSE bytes (which may end
 * mid-block) and returns OpenAI-shaped `data:` lines plus whatever
 * incomplete tail should carry forward into the next call.
 *
 * This is the entire integration surface with the rest of the app — nothing
 * downstream needs to know Anthropic's wire format exists.
 */
export function translateAnthropicSSE(buffer: string): AnthropicTranslation {
  const blocks = buffer.split("\n\n");
  const remainder = blocks.pop() ?? "";
  const lines: string[] = [];
  const usage: { inputTokens?: number; outputTokens?: number } = {};
  let done = false;

  for (const block of blocks) {
    const evt = parseAnthropicSSEBlock(block);
    if (!evt) continue;

    if (evt.event === "content_block_delta") {
      const delta = evt.data.delta as { type?: string; text?: string } | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        lines.push(`data: ${JSON.stringify({ choices: [{ delta: { content: delta.text } }] })}`);
      }
      continue;
    }
    if (evt.event === "message_start") {
      const u = (evt.data.message as { usage?: { input_tokens?: number } } | undefined)?.usage;
      if (typeof u?.input_tokens === "number") usage.inputTokens = u.input_tokens;
      continue;
    }
    if (evt.event === "message_delta") {
      const u = evt.data.usage as { output_tokens?: number } | undefined;
      if (typeof u?.output_tokens === "number") usage.outputTokens = u.output_tokens;
      continue;
    }
    if (evt.event === "message_stop") { done = true; continue; }
    // ping, content_block_start, content_block_stop — intentionally ignored.
  }

  if (done) {
    lines.push(
      `data: ${JSON.stringify({
        usage: {
          prompt_tokens: usage.inputTokens ?? 0,
          completion_tokens: usage.outputTokens ?? 0,
          total_tokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
        },
      })}`,
    );
    lines.push("data: [DONE]");
  }

  return { lines, remainder, done, usage };
}

/**
 * Wrap a raw fetch Response body from api.anthropic.com into a
 * ReadableStream of OpenAI-shaped SSE bytes, so it can be handed to the
 * exact same downstream reader every other provider already uses.
 */
export function anthropicResponseToOpenAIStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = body.getReader();
  let buffer = "";
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) {
          const t = translateAnthropicSSE(buffer + "\n\n");
          for (const l of t.lines) controller.enqueue(encoder.encode(l + "\n\n"));
        }
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const t = translateAnthropicSSE(buffer);
      buffer = t.remainder;
      for (const l of t.lines) controller.enqueue(encoder.encode(l + "\n\n"));
      if (t.done) controller.close();
    },
    cancel() {
      try { reader.cancel(); } catch { /* ignore */ }
    },
  });
}
