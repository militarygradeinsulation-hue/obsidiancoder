import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { resolveModel } from "./models";
import { aiFetch } from "./ai-fetch";
import { AiError, newRequestId } from "./ai-errors";
import {
  requirePaidOperation,
  settleOperation,
} from "./credit-gate.server";
import { creditsRequiredEnvelope, type CreditsRequiredEnvelope } from "./credit-gate";
import { makeUsage, estimateUsdForCall, mergeUsage, parseUsageFromChatJson, IMAGE_COST_USD, type UsageRecord } from "./usage-record";

/** Structured paywall error the client recognizes. */
class PaywallError extends Error {
  status: number;
  envelope: CreditsRequiredEnvelope;
  constructor(env: CreditsRequiredEnvelope) {
    super(env.message);
    this.name = "PaywallError";
    this.status = env.code === "auth_required" ? 401 : 402;
    this.envelope = env;
  }
}
void creditsRequiredEnvelope;

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const inputSchema = z.object({
  prompt: z.string().min(1).max(6_000_000),
  currentHtml: z.string().max(6_000_000).optional().default(""),
  history: z.array(messageSchema).max(8).optional().default([]),
  model: z.string().optional().transform((m) => resolveModel(m)),
});

export type ImageProvider = "leonardo" | "higgsfield" | "gemini";
export interface ImageResult {
  dataUrl: string;
  providerUsed: ImageProvider;
  providersTried: ImageProvider[];
  requestId: string;
}

const SYSTEM_PROMPT = `You are Aetheris Coder — an elite AI front-end engineer.
Understand the user's intent immediately. Do not ask clarifying questions. Do not narrate.
OUTPUT: exactly one complete, production-grade standalone HTML document that satisfies the latest request while preserving every feature that already worked.

Hard rules:
- Return ONLY the raw HTML document, starting with <!doctype html>. No markdown fences, no prose.
- Inline all CSS in a <style> tag and all JS in a <script> tag. No external CSS, no external JS, no external fonts.
- Images ARE allowed and encouraged when they improve the design. Use one of:
  • Inline SVG (preferred for icons, logos, decorative shapes).
  • https URLs from placeholder providers: https://images.unsplash.com/... , https://picsum.photos/<w>/<h> , https://source.unsplash.com/<w>x<h>/?<keyword> , https://api.dicebear.com/... .
  • Any https URL the user explicitly provided.
  Always set width, height, and descriptive alt text. Use object-fit: cover for hero/card images.
- If the user uploads or pastes an image (data: URL or https URL) in the prompt, embed it exactly as given — do not replace it with a placeholder.
- Accessibility: semantic HTML, proper heading order, labels for inputs, aria-* where needed, visible keyboard focus, WCAG AA contrast.
- Responsive: mobile-first, fluid layouts, no horizontal scroll at 320px.
- Aesthetic: dark background, warm amber/gold accents, subtle glass/shine, refined typography.
- Never remove previously-built features unless explicitly asked.
- Safe: no third-party scripts, no tracking, no network calls beyond loading the images described above.

Image-generator builds — strict fidelity rules, no exceptions:
- The user's typed prompt is the single source of truth. Send it VERBATIM. No silent rewrites, style suffixes, or moralizing.
- If you expose an "Enhance prompt" affordance, it must be a separate button that shows the rewritten prompt in the input first and lets the user accept, edit, or reject it. The raw prompt path stays default.
- Show the exact string sent to the model beside each result (a "Prompt used" caption). If any transformation happened, show before → after.
- Never fabricate a result. On error/moderation/empty payload, render a clear error state — never a stock/placeholder/previous image.
- Only render images that actually came back from a generation call in this session.
- Wire the generator to a real endpoint (default POST /v1/images/generations). Never simulate with setTimeout + a hardcoded URL. If no key, render a disabled state.
- Seed/size/model/count controls must map 1:1 to the request body. Remove any control not wired.
- Preserve every character of the user's prompt in state and request.`;

// ---------- Image providers ----------

async function tryLeonardo(prompt: string, requestId: string, signal?: AbortSignal): Promise<string | null> {
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
      { breakerKey: "leonardo/create", stage: "image", requestId, signal, maxAttempts: 2, totalTimeoutMs: 20_000 },
    );
    const cj = (await create.response.json()) as { sdGenerationJob?: { generationId?: string } };
    const genId = cj.sdGenerationJob?.generationId;
    if (!genId) return null;

    const deadline = Date.now() + 25_000;
    let backoff = 1500;
    while (Date.now() < deadline) {
      if (signal?.aborted) return null;
      await sleep(backoff, signal);
      backoff = Math.min(3000, Math.round(backoff * 1.25));
      try {
        const poll = await aiFetch(
          `https://cloud.leonardo.ai/api/rest/v1/generations/${genId}`,
          { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } },
          { breakerKey: "leonardo/poll", stage: "image", requestId, signal, maxAttempts: 1, totalTimeoutMs: 8_000 },
        );
        const pj = (await poll.response.json()) as {
          generations_by_pk?: { status?: string; generated_images?: Array<{ url?: string }> };
        };
        const g = pj.generations_by_pk;
        if (g?.status === "COMPLETE") {
          const url = g.generated_images?.[0]?.url;
          if (!url) return null;
          return await downloadAsDataUrl(url, signal);
        }
        if (g?.status === "FAILED") return null;
      } catch { /* keep polling until deadline */ }
    }
    return null;
  } catch {
    return null;
  }
}

async function tryHiggsfield(prompt: string, requestId: string, signal?: AbortSignal): Promise<string | null> {
  const keyId = process.env.HIGGSFIELD_API_KEY_ID;
  const keySecret = process.env.HIGGSFIELD_API_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  const headers = {
    "Content-Type": "application/json", Accept: "application/json",
    "hf-api-key": keyId, "hf-secret": keySecret,
  };
  try {
    const create = await aiFetch(
      "https://platform.higgsfield.ai/v1/text2image/soul",
      {
        method: "POST", headers,
        body: JSON.stringify({
          params: {
            prompt: prompt.slice(0, 1400),
            width_and_height: "1024x1024", quality: "1080p", batch_size: 1,
            seed: Math.floor(Math.random() * 1_000_000), enhance_prompt: false,
          },
        }),
      },
      { breakerKey: "higgsfield/create", stage: "image", requestId, signal, maxAttempts: 2, totalTimeoutMs: 20_000 },
    );
    const cj = (await create.response.json()) as { id?: string; job_set_id?: string };
    const jobId = cj.id ?? cj.job_set_id;
    if (!jobId) return null;

    const deadline = Date.now() + 30_000;
    let backoff = 1500;
    while (Date.now() < deadline) {
      if (signal?.aborted) return null;
      await sleep(backoff, signal);
      backoff = Math.min(3000, Math.round(backoff * 1.25));
      try {
        const poll = await aiFetch(
          `https://platform.higgsfield.ai/v1/job-sets/${jobId}`,
          { headers },
          { breakerKey: "higgsfield/poll", stage: "image", requestId, signal, maxAttempts: 1, totalTimeoutMs: 8_000 },
        );
        const pj = (await poll.response.json()) as {
          status?: string;
          jobs?: Array<{ status?: string; results?: { raw?: { url?: string }; min?: { url?: string } } }>;
        };
        const job = pj.jobs?.[0];
        const status = (job?.status ?? pj.status ?? "").toLowerCase();
        if (status === "completed" || status === "complete" || status === "succeeded") {
          const url = job?.results?.raw?.url ?? job?.results?.min?.url;
          if (!url) return null;
          return await downloadAsDataUrl(url, signal);
        }
        if (status === "failed" || status === "canceled" || status === "cancelled") return null;
      } catch { /* keep polling */ }
    }
    return null;
  } catch {
    return null;
  }
}

async function tryGemini(prompt: string, requestId: string, signal?: AbortSignal): Promise<string | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  try {
    const r = await aiFetch(
      "https://ai.gateway.lovable.dev/v1/images/generations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-3-pro-image",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      },
      { breakerKey: "gemini/image", stage: "image", requestId, signal, maxAttempts: 2, totalTimeoutMs: 45_000 },
    );
    const json = (await r.response.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  } catch (err) {
    if (err instanceof AiError && (err.code === "ai_unauthorized" || err.code === "ai_bad_request")) throw err;
    return null;
  }
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

async function downloadAsDataUrl(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const img = await fetch(url, { signal });
    if (!img.ok) return null;
    const buf = await img.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    return `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
}

async function generateImageWithFallback(prompt: string, requestId: string, signal?: AbortSignal): Promise<{ dataUrl: string | null; providerUsed: ImageProvider | null; providersTried: ImageProvider[] }> {
  const tried: ImageProvider[] = [];
  tried.push("leonardo");
  const leo = await tryLeonardo(prompt, requestId, signal);
  if (leo) return { dataUrl: leo, providerUsed: "leonardo", providersTried: tried };
  tried.push("higgsfield");
  const hf = await tryHiggsfield(prompt, requestId, signal);
  if (hf) return { dataUrl: hf, providerUsed: "higgsfield", providersTried: tried };
  tried.push("gemini");
  const gm = await tryGemini(prompt, requestId, signal);
  if (gm) return { dataUrl: gm, providerUsed: "gemini", providersTried: tried };
  return { dataUrl: null, providerUsed: null, providersTried: tried };
}

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ prompt: z.string().min(1).max(2000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const requestId = newRequestId();
    const entitlement = await requirePaidOperation(request, "generate_image", requestId);
    if (entitlement.kind === "denied" && entitlement.denial) {
      throw new PaywallError(entitlement.denial);
    }
    try {
      const result = await generateImageWithFallback(data.prompt, requestId);
      if (!result.dataUrl || !result.providerUsed) {
        // Whether an upstream provider actually did work here is opaque
        // (each provider swallows its own errors). Treat as "no billable
        // provider usage" — refund. This matches the aggregate contract:
        // if we cannot prove usage we do not charge.
        await settleOperation(entitlement, { kind: "no_provider", errorCode: "image_all_providers_failed" });
        throw new AiError({
          code: "ai_upstream_5xx", stage: "image", requestId,
          message: `Image generation failed across ${result.providersTried.join(" → ")}.`,
        });
      }
      const est = estimateUsdForCall({ imageCount: 1, providerUsed: true });
      await settleOperation(entitlement, {
        kind: "success",
        usage: makeUsage({
          provider: result.providerUsed, model: null, operation: "generate_image",
          imageCount: 1,
          actualCostUsd: null, estimatedCostUsd: est.usd, costBasis: est.basis,
          providerUsed: true, status: "committed",
          meta: { providers_tried: result.providersTried },
        }),
      });
      const out: ImageResult = {
        dataUrl: result.dataUrl, providerUsed: result.providerUsed,
        providersTried: result.providersTried, requestId,
      };
      return out;
    } catch (err) {
      // If the failure predates settlement (e.g. thrown by fallback), refund.
      try { await settleOperation(entitlement, { kind: "no_provider", errorCode: "image_internal" }); } catch { /* already settled */ }
      throw err;
    }
  });

// ---------- HTML generation ----------

async function planImages(apiKey: string, prompt: string, currentHtml: string, requestId: string): Promise<Array<{ slot?: string; prompt: string }>> {
  try {
    const r = await aiFetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-lite",
          messages: [
            {
              role: "system",
              content:
                'You decide whether a web build needs generated images. Return ONLY compact JSON: {"images":[{"slot":"hero|card|logo|bg|icon","prompt":"..."}]}. Include an image ONLY if the user explicitly asks for visuals or the build is clearly visual (portfolio, gallery, landing hero). Otherwise return {"images":[]}. Max 4 items.',
            },
            { role: "user", content: `USER REQUEST: ${prompt}\n\nCURRENT HTML: ${currentHtml.slice(0, 2000)}` },
          ],
          response_format: { type: "json_object" },
        }),
      },
      { breakerKey: "gemini/plan", stage: "plan", requestId, maxAttempts: 2, totalTimeoutMs: 20_000 },
    );
    const json = (await r.response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    const imgs = Array.isArray(parsed.images) ? parsed.images : [];
    return imgs
      .filter((i: unknown): i is { slot?: string; prompt: string } =>
        !!i && typeof (i as { prompt?: unknown }).prompt === "string",
      )
      .slice(0, 4);
  } catch {
    return [];
  }
}

export const generateHtml = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest();
    const requestId = newRequestId();
    const entitlement = await requirePaidOperation(request, "generate_html", requestId);
    if (entitlement.kind === "denied" && entitlement.denial) {
      throw new PaywallError(entitlement.denial);
    }
    // Accumulator for every provider call (plan + N images + main chat).
    const subUsage: UsageRecord[] = [];
    let providerUsed = false;
    let mainUsage: { inputTokens: number; outputTokens: number; totalTokens: number; model?: string } | null = null;
    let mainErrorCode: string | undefined;
    try {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        await settleOperation(entitlement, { kind: "no_provider", errorCode: "ai_unauthorized" });
        throw new AiError({ code: "ai_unauthorized", stage: "generate", requestId, message: "AI is not configured." });
      }

      const plans = await planImages(apiKey, data.prompt, data.currentHtml, requestId);
      const generatedRaw = plans.length
        ? await Promise.all(
            plans.map(async (p, i) => {
              const r = await generateImageWithFallback(p.prompt, requestId);
              if (r.dataUrl && r.providerUsed) {
                const est = estimateUsdForCall({ imageCount: 1, providerUsed: true });
                subUsage.push(makeUsage({
                  provider: r.providerUsed, operation: "generate_image", imageCount: 1,
                  estimatedCostUsd: est.usd, costBasis: est.basis, providerUsed: true, status: "committed",
                }));
                providerUsed = true;
                return { id: `gen-${i}`, slot: p.slot ?? "image", prompt: p.prompt, url: r.dataUrl, providerUsed: r.providerUsed };
              }
              return null;
            }),
          )
        : [];
      const images = generatedRaw.filter(Boolean) as Array<{ id: string; slot: string; prompt: string; url: string; providerUsed: ImageProvider }>;

      const MAX_HTML_CHARS = 120_000;
      const MAX_HISTORY = 6;
      const truncatedHtml = data.currentHtml && data.currentHtml.length > MAX_HTML_CHARS
        ? data.currentHtml.slice(0, MAX_HTML_CHARS) + "\n<!-- …truncated for context budget… -->"
        : data.currentHtml;
      const trimmedHistory = data.history.slice(-MAX_HISTORY).map((m) => ({
        role: m.role,
        content: typeof m.content === "string" && m.content.length > 4000 ? m.content.slice(0, 4000) + "…" : m.content,
      }));

      const messages: Array<{ role: string; content: string }> = [
        { role: "system", content: SYSTEM_PROMPT },
        ...trimmedHistory,
      ];
      if (truncatedHtml) {
        messages.push({ role: "system", content: `The current HTML document is:\n\n${truncatedHtml}\n\nBuild upon it.` });
      }
      if (images.length) {
        const list = images.map((img) => `- ${img.id} · slot=${img.slot} · via=${img.providerUsed} · "${img.prompt}"`).join("\n");
        messages.push({
          role: "system",
          content: `Generated images available. Embed with <img src="{{IMAGE:<id>}}" alt="..."> using placeholder tokens. Do NOT swap in other URLs.\n\n${list}`,
        });
      }
      messages.push({ role: "user", content: data.prompt });

      const r = await aiFetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: data.model, messages,
            ...(data.model.startsWith("openai/gpt-5.6") ? { reasoning_effort: "none" } : {}),
          }),
        },
        { breakerKey: `chat/${data.model}`, stage: "generate", requestId, maxAttempts: 2, totalTimeoutMs: 90_000 },
      );

      const json = (await r.response.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown; model?: string };
      providerUsed = true;
      mainUsage = parseUsageFromChatJson(json);
      let html = json.choices?.[0]?.message?.content?.trim() ?? "";
      html = html.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();

      for (const img of images) {
        html = html.split(`{{IMAGE:${img.id}}}`).join(img.url);
      }

      if (!html.toLowerCase().includes("<!doctype") && !html.toLowerCase().includes("<html")) {
        html = `<!doctype html><html><head><meta charset="utf-8"><style>body{background:#0f0d0a;color:#f6e6c8;font-family:system-ui;padding:24px}</style></head><body>${html}</body></html>`;
      }

      const est = estimateUsdForCall({
        model: mainUsage?.model ?? data.model,
        inputTokens: mainUsage?.inputTokens ?? 0,
        outputTokens: mainUsage?.outputTokens ?? 0,
        providerUsed: true,
      });
      subUsage.push(makeUsage({
        provider: "lovable", model: mainUsage?.model ?? data.model, operation: "generate_html",
        inputTokens: mainUsage?.inputTokens ?? 0, outputTokens: mainUsage?.outputTokens ?? 0,
        totalTokens: mainUsage?.totalTokens ?? 0,
        estimatedCostUsd: est.usd, costBasis: est.basis, providerUsed: true, status: "committed",
      }));
      const merged = mergeUsage("generate_html", subUsage);
      await settleOperation(entitlement, { kind: "success", usage: merged });
      return {
        html,
        generatedImages: images.length,
        imageProviders: images.map((i) => ({ id: i.id, providerUsed: i.providerUsed })),
        requestId,
      };
    } catch (err) {
      mainErrorCode = err instanceof Error ? err.message.slice(0, 60) : "internal";
      if (!providerUsed && subUsage.length === 0) {
        try { await settleOperation(entitlement, { kind: "no_provider", errorCode: mainErrorCode }); } catch { /* already settled */ }
      } else if (subUsage.length > 0) {
        // Provider usage occurred before the throw — record failed status
        // with the cost we already know about.
        const merged = mergeUsage("generate_html", subUsage);
        try {
          await settleOperation(entitlement, {
            kind: "failed_with_usage", errorCode: mainErrorCode,
            usage: { ...merged, status: "failed", errorCode: mainErrorCode },
          });
        } catch { /* already settled */ }
      }
      throw err;
    }
  });
// Silence intentionally-unused re-export.
void IMAGE_COST_USD;
