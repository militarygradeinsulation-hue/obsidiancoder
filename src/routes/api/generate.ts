import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveModel } from "@/lib/models";
import { AiError, newRequestId, sanitizeUpstreamMessage } from "@/lib/ai-errors";
import { aiFetch } from "@/lib/ai-fetch";
import { readGuarded, firstChunkLooksBad } from "@/lib/upstream-guard";
import { recordFailure, recordSuccess } from "@/lib/circuit-breaker";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const inputSchema = z.object({
  prompt: z.string().min(1).max(6_000_000),
  currentHtml: z.string().max(6_000_000).optional().default(""),
  history: z.array(messageSchema).max(8).optional().default([]),
  model: z.string().optional().transform((m) => resolveModel(m)),
  advisory: z.boolean().optional().default(false),
});



const SYSTEM_PROMPT = `You are Aetheris Coder — an elite AI front-end engineer.
Understand the user's intent immediately. Do not ask clarifying questions. Do not narrate.
OUTPUT: exactly one complete, production-grade standalone HTML document that satisfies the latest request while preserving every feature that already worked.

Hard rules:
- Return ONLY the raw HTML document, starting with <!doctype html>. No markdown fences, no prose.
- Inline all CSS in a <style> tag and all JS in a <script> tag. No external CSS, no external JS, no external fonts.
- Images ARE allowed and encouraged when they improve the design. If GENERATED IMAGES are provided in system context, use those data URLs verbatim. Otherwise use inline SVG or an https placeholder (unsplash/picsum/dicebear). Set width, height, alt.
- If the user attaches an image (data: URL or https URL) in the prompt, embed it exactly.
- Accessibility: semantic HTML, WCAG AA contrast, keyboard focus, labels.
- Responsive mobile-first, no horizontal scroll at 320px.
- Aesthetic: dark background, warm amber/gold accents, refined typography.
- Never remove previously-built features unless asked.
- No third-party scripts, no tracking, no external network calls beyond image URLs.
- Speed matters: begin streaming the <!doctype html> immediately. No preamble.`;

const ADVISORY_PROMPT = `You are Aetheris Obsidian, a senior product engineer acting as a strategic advisor.
The user is in CHAT or PLAN mode — you MUST NOT produce HTML, code, or a full document.
Reply in concise GitHub-flavored markdown: short headings, tight bullets, numbered steps, and small fenced code snippets ONLY when illustrating a specific technique.
Focus on: intent, architecture, tradeoffs, risks, milestones, and next best actions. Never include <!doctype>, <html>, <style>, or <script> blocks.
Keep the reply skimmable — under ~400 words unless the user explicitly asks for depth.`;


type PlannedImage = { slot: string; prompt: string; url: string; providerUsed: "leonardo" | "higgsfield" | "gemini" };

const VISUAL_KEYWORDS = /\b(generate (?:an? )?(?:image|photo|picture|illustration|logo|banner|avatar|poster|artwork)|with (?:an? |real )?(?:image|photo|picture|illustration|logo|banner|avatar|poster|artwork)s?|make (?:me )?(?:an? )?(?:image|logo|banner|poster|illustration))\b/i;

// Multi-provider image helpers — mirror aetheris.functions.ts but scoped to
// the streaming route with its own AbortSignal.
async function providerLeonardo(prompt: string, requestId: string, signal: AbortSignal): Promise<string | null> {
  const key = process.env.LEONARDO_API_KEY;
  if (!key) return null;
  try {
    const create = await aiFetch(
      "https://cloud.leonardo.ai/api/rest/v1/generations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, Accept: "application/json" },
        body: JSON.stringify({
          prompt: prompt.slice(0, 1400),
          modelId: "6b645e3a-d64f-4341-a6d8-7a3690fbf042",
          width: 1024, height: 1024, num_images: 1,
          alchemy: false, contrast: 3.5, enhancePrompt: false,
          presetStyle: "DYNAMIC", public: false,
        }),
      },
      { breakerKey: "leonardo/create", stage: "image", requestId, signal, maxAttempts: 1, totalTimeoutMs: 7_000 },
    );
    const cj = (await create.response.json()) as { sdGenerationJob?: { generationId?: string } };
    const genId = cj.sdGenerationJob?.generationId;
    if (!genId) return null;
    const deadline = Date.now() + 18_000;
    let backoff = 1500;
    while (Date.now() < deadline) {
      if (signal.aborted) return null;
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(3000, Math.round(backoff * 1.25));
      try {
        const poll = await aiFetch(
          `https://cloud.leonardo.ai/api/rest/v1/generations/${genId}`,
          { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } },
          { breakerKey: "leonardo/poll", stage: "image", requestId, signal, maxAttempts: 1, totalTimeoutMs: 6_000 },
        );
        const pj = (await poll.response.json()) as { generations_by_pk?: { status?: string; generated_images?: Array<{ url?: string }> } };
        const g = pj.generations_by_pk;
        if (g?.status === "COMPLETE") {
          const url = g.generated_images?.[0]?.url;
          if (!url) return null;
          const img = await fetch(url, { signal });
          if (!img.ok) return null;
          const buf = await img.arrayBuffer();
          return `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
        }
        if (g?.status === "FAILED") return null;
      } catch { /* keep polling */ }
    }
    return null;
  } catch { return null; }
}

async function providerHiggsfield(prompt: string, requestId: string, signal: AbortSignal): Promise<string | null> {
  const keyId = process.env.HIGGSFIELD_API_KEY_ID;
  const keySecret = process.env.HIGGSFIELD_API_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  const headers = { "Content-Type": "application/json", Accept: "application/json", "hf-api-key": keyId, "hf-secret": keySecret };
  try {
    const create = await aiFetch(
      "https://platform.higgsfield.ai/v1/text2image/soul",
      { method: "POST", headers, body: JSON.stringify({ params: { prompt: prompt.slice(0, 1400), width_and_height: "1024x1024", quality: "1080p", batch_size: 1, seed: Math.floor(Math.random() * 1_000_000), enhance_prompt: false } }) },
      { breakerKey: "higgsfield/create", stage: "image", requestId, signal, maxAttempts: 1, totalTimeoutMs: 7_000 },
    );
    const cj = (await create.response.json()) as { id?: string; job_set_id?: string };
    const jobId = cj.id ?? cj.job_set_id;
    if (!jobId) return null;
    const deadline = Date.now() + 20_000;
    let backoff = 1500;
    while (Date.now() < deadline) {
      if (signal.aborted) return null;
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(3000, Math.round(backoff * 1.25));
      try {
        const poll = await aiFetch(
          `https://platform.higgsfield.ai/v1/job-sets/${jobId}`,
          { headers },
          { breakerKey: "higgsfield/poll", stage: "image", requestId, signal, maxAttempts: 1, totalTimeoutMs: 6_000 },
        );
        const pj = (await poll.response.json()) as { status?: string; jobs?: Array<{ status?: string; results?: { raw?: { url?: string }; min?: { url?: string } } }> };
        const job = pj.jobs?.[0];
        const status = (job?.status ?? pj.status ?? "").toLowerCase();
        if (status === "completed" || status === "complete" || status === "succeeded") {
          const url = job?.results?.raw?.url ?? job?.results?.min?.url;
          if (!url) return null;
          const img = await fetch(url, { signal });
          if (!img.ok) return null;
          const buf = await img.arrayBuffer();
          return `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
        }
        if (status === "failed" || status === "canceled" || status === "cancelled") return null;
      } catch { /* keep polling */ }
    }
    return null;
  } catch { return null; }
}

async function providerGemini(apiKey: string, prompt: string, requestId: string, signal: AbortSignal): Promise<string | null> {
  try {
    const r = await aiFetch(
      "https://ai.gateway.lovable.dev/v1/images/generations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "google/gemini-3-pro-image", messages: [{ role: "user", content: prompt }], modalities: ["image", "text"] }),
      },
      { breakerKey: "lovable/image", stage: "image", requestId, signal, maxAttempts: 1, totalTimeoutMs: 12_000 },
    );
    const g = await readGuarded(r.response, { expected: "application/json" });
    if (!g.ok) return null;
    const j = JSON.parse(g.text) as { data?: Array<{ b64_json?: string }> };
    const b64 = j.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  } catch (err) {
    if (err instanceof AiError && (err.code === "ai_unauthorized" || err.code === "ai_bad_request")) throw err;
    return null;
  }
}

async function generateOneImage(apiKey: string, prompt: string, slot: string, requestId: string, signal: AbortSignal): Promise<PlannedImage | null> {
  const leo = await providerLeonardo(prompt, requestId, signal);
  if (leo) return { slot, prompt, url: leo, providerUsed: "leonardo" };
  const hf = await providerHiggsfield(prompt, requestId, signal);
  if (hf) return { slot, prompt, url: hf, providerUsed: "higgsfield" };
  const gm = await providerGemini(apiKey, prompt, requestId, signal);
  if (gm) return { slot, prompt, url: gm, providerUsed: "gemini" };
  return null;
}

async function planAndGenerateImages(
  apiKey: string,
  prompt: string,
  currentHtml: string,
  requestId: string,
  signal: AbortSignal,
): Promise<PlannedImage[]> {
  if (!VISUAL_KEYWORDS.test(prompt)) return [];
  try {
    const planRes = await aiFetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-lite",
          messages: [
            { role: "system", content: 'Decide if this web build needs real generated images. Return ONLY JSON: {"images":[{"slot":"hero|card|logo|bg|icon","prompt":"detailed visual prompt, no text-in-image"}]}. Include images ONLY if the user explicitly asks for a visual OR the build is inherently visual (portfolio, gallery, product landing). Otherwise {"images":[]}. Max 2.' },
            { role: "user", content: `USER REQUEST: ${prompt}\n\nCURRENT HTML: ${currentHtml.slice(0, 1500)}` },
          ],
          response_format: { type: "json_object" },
        }),
      },
      { breakerKey: "lovable/plan", stage: "plan", requestId, attemptTimeoutMs: 4000, totalTimeoutMs: 6000, maxAttempts: 1, signal },
    );
    const guarded = await readGuarded(planRes.response, { expected: "application/json" });
    if (!guarded.ok) return [];
    const planJson = JSON.parse(guarded.text) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(planJson.choices?.[0]?.message?.content ?? "{}");
    const plans: Array<{ slot?: string; prompt: string }> = Array.isArray(parsed.images)
      ? parsed.images.filter((x: unknown) => !!x && typeof (x as { prompt?: unknown }).prompt === "string").slice(0, 2)
      : [];
    if (!plans.length) return [];
    const results = await Promise.all(plans.map((p) => generateOneImage(apiKey, p.prompt, p.slot ?? "image", requestId, signal)));
    return results.filter((x): x is PlannedImage => !!x);
  } catch {
    return [];
  }
}


export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = newRequestId();
        try {
          const { isUnlockedServer } = await import("@/lib/gate.server");
          if (!(await isUnlockedServer())) {
            throw new AiError({ code: "ai_unauthorized", stage: "validate", requestId, message: "Session is locked." });
          }
          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            throw new AiError({ code: "ai_unauthorized", stage: "validate", requestId, message: "AI is not configured." });
          }

          let data: z.infer<typeof inputSchema>;
          try {
            data = inputSchema.parse(await request.json());
          } catch (err) {
            throw new AiError({
              code: "ai_bad_request",
              stage: "validate",
              requestId,
              message: err instanceof Error ? err.message : "Invalid input.",
            });
          }

          // TEST HOOK — honoured only outside production so it can't be abused
          // against the live deployment.
          if (process.env.NODE_ENV !== "production") {
            const mock = request.headers.get("x-obs-mock-upstream");
            if (mock === "cf-502") {
              throw new AiError({
                code: "ai_upstream_html",
                stage: "generate",
                requestId,
                message: "Mock: Cloudflare 502 HTML page.",
              });
            }
            if (mock === "empty") {
              throw new AiError({ code: "ai_upstream_empty", stage: "generate", requestId });
            }
            if (mock === "unauthorized") {
              throw new AiError({ code: "ai_unauthorized", stage: "generate", requestId });
            }
          }

          const clientAbort = request.signal;
          const images = data.advisory
            ? []
            : await planAndGenerateImages(apiKey, data.prompt, data.currentHtml, requestId, clientAbort);

          const messages: Array<{ role: string; content: string }> = [
            { role: "system", content: data.advisory ? ADVISORY_PROMPT : SYSTEM_PROMPT },
            ...data.history,
          ];
          if (!data.advisory && data.currentHtml) {
            messages.push({
              role: "system",
              content: `The current HTML document is:\n\n${data.currentHtml}\n\nBuild upon it.`,
            });
          }
          if (data.advisory && data.currentHtml) {
            messages.push({
              role: "system",
              content: `For reference only — the user's current build (do NOT rewrite it, just advise):\n\n${data.currentHtml.slice(0, 8000)}`,
            });
          }
          if (!data.advisory && images.length) {
            messages.push({
              role: "system",
              content:
                `GENERATED IMAGES AVAILABLE — embed each as <img src="..."> using the EXACT data URLs below. Do NOT swap for Unsplash/placeholders.\n\n` +
                images
                  .map((img, i) => `[image ${i + 1} — slot=${img.slot}] prompt: ${img.prompt}\nURL: ${img.url}`)
                  .join("\n\n"),
            });
          }
          messages.push({ role: "user", content: data.prompt });


          const upstreamRes = await aiFetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: data.model,
                messages,
                stream: true,
                ...(data.model.startsWith("openai/gpt-5.6") ? { reasoning_effort: "none" } : {}),
              }),
            },
            {
              breakerKey: `lovable/generate:${data.model}`,
              stage: "generate",
              requestId,
              signal: clientAbort,
              stream: true,
            },
          );

          const upstream = upstreamRes.response;
          if (!upstream.body) {
            recordFailure(`lovable/generate:${data.model}`);
            throw new AiError({ code: "ai_upstream_empty", stage: "generate", requestId });
          }

          // First-chunk validation: if the "stream" is actually a proxy HTML page,
          // reject BEFORE emitting anything to the client.
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();
          const reader = upstream.body.getReader();
          let sniffBuffer = "";
          const contentType = upstream.headers.get("content-type");

          // Read up to ~4KB or first useful chunk for sniffing.
          let firstChunk: { done: boolean; value: Uint8Array | undefined } | null = null;
          while (sniffBuffer.length < 4096) {
            const r = await reader.read();
            firstChunk = r;
            if (r.done) break;
            sniffBuffer += decoder.decode(r.value, { stream: true });
            if (sniffBuffer.trim().length > 0) break;
          }

          const guard = firstChunkLooksBad(sniffBuffer, contentType);
          if (guard.bad) {
            try { await reader.cancel(); } catch { /* ignore */ }
            recordFailure(`lovable/generate:${data.model}`);
            const code =
              guard.reason === "html_body" || guard.reason === "proxy_error"
                ? "ai_upstream_html"
                : "ai_upstream_malformed";
            throw new AiError({
              code,
              stage: "generate",
              requestId,
              message: sanitizeUpstreamMessage(sniffBuffer, "Upstream returned a non-stream response."),
            });
          }

          // Do NOT recordSuccess yet — only after the stream has produced at
          // least one valid content delta. A stream that emits zero content is
          // treated as ai_upstream_empty and counts as a breaker failure.
          const breakerKeyGen = `lovable/generate:${data.model}`;

          // Compose an SSE parser over the buffered sniff bytes + rest of the stream.
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              let buffer = sniffBuffer;
              let emittedBytes = 0;
              try {
                const drain = () => {
                  let idx;
                  while ((idx = buffer.indexOf("\n")) !== -1) {
                    const line = buffer.slice(0, idx).trim();
                    buffer = buffer.slice(idx + 1);
                    if (!line.startsWith("data:")) continue;
                    const payload = line.slice(5).trim();
                    if (payload === "[DONE]") {
                      if (emittedBytes === 0) {
                        recordFailure(breakerKeyGen);
                        controller.error(new Error("ai_upstream_empty"));
                        return true;
                      }
                      recordSuccess(breakerKeyGen);
                      controller.close();
                      return true;
                    }
                    try {
                      const j = JSON.parse(payload);
                      const delta = j.choices?.[0]?.delta?.content;
                      if (typeof delta === "string" && delta.length) {
                        emittedBytes += delta.length;
                        controller.enqueue(encoder.encode(delta));
                      }
                    } catch { /* skip malformed */ }
                  }
                  return false;
                };
                if (drain()) return;
                if (firstChunk?.done) {
                  if (emittedBytes === 0) {
                    recordFailure(breakerKeyGen);
                    controller.error(new Error("ai_upstream_empty"));
                  } else {
                    recordSuccess(breakerKeyGen);
                    controller.close();
                  }
                  return;
                }
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  if (drain()) return;
                }
                if (emittedBytes === 0) {
                  recordFailure(breakerKeyGen);
                  controller.error(new Error("ai_upstream_empty"));
                } else {
                  recordSuccess(breakerKeyGen);
                  controller.close();
                }
              } catch (err) {
                recordFailure(breakerKeyGen);
                controller.error(err);
              }
            },
          });

          const providersSummary = images.length
            ? images.map((i) => `${i.slot}:${i.providerUsed}`).join(",")
            : "none";
          return new Response(stream, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
              "X-Accel-Buffering": "no",
              "X-Request-Id": requestId,
              "X-Obs-Image-Providers": providersSummary,
              "X-Obs-Image-Count": String(images.length),
              "Access-Control-Expose-Headers": "X-Request-Id, X-Obs-Image-Providers, X-Obs-Image-Count",
            },
          });
        } catch (err) {
          const aiErr = err instanceof AiError
            ? err
            : new AiError({
                code: "ai_internal",
                stage: "generate",
                requestId,
                message: err instanceof Error ? err.message : "Unexpected error.",
              });
          return aiErr.toResponse();
        }
      },
    },
  },
});
