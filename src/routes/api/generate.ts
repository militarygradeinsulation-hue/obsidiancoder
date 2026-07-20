import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveModel, isFastTier, DEFAULT_MODEL } from "@/lib/models";
import { AiError, newRequestId, sanitizeUpstreamMessage } from "@/lib/ai-errors";
import { aiFetch } from "@/lib/ai-fetch";
import { readGuarded, firstChunkLooksBad } from "@/lib/upstream-guard";
import { recordFailure, recordSuccess } from "@/lib/circuit-breaker";
import { compactHtmlForContext } from "@/lib/context-compactor";
import {
  requirePaidOperation,
  denialResponse,
  settleOperation,
} from "@/lib/credit-gate.server";
import type { EntitlementResult } from "@/lib/credit-gate.server";
import { StreamingUsageAccumulator, makeUsage, estimateUsdForCall, parseUsageFromChatJson, IMAGE_COST_USD, type UsageRecord } from "@/lib/usage-record";
import { combineSuccessUsage, combineFailureSettlement, modelAttemptUsage } from "@/lib/generate-settlement";
import type { Operation } from "@/lib/credit-gate";

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
  // Raw picker value from the client ("auto" or a specific model id). Used to
  // decide whether we're allowed to silently fall back on time-to-first-byte.
  pickerModel: z.string().optional(),
  // Explicit opt-in for generated imagery. Bypasses the tight keyword filter.
  wantImages: z.boolean().optional().default(false),
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
      { breakerKey: "lovable/image", stage: "image", requestId, signal, maxAttempts: 1, totalTimeoutMs: 8_000 },
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

/** Result of planAndGenerateImages — images + a usage record per successful call. */
interface ImagePhaseResult {
  images: PlannedImage[];
  usages: UsageRecord[];
  planUsage: UsageRecord | null;
}

async function planAndGenerateImages(
  apiKey: string,
  prompt: string,
  currentHtml: string,
  requestId: string,
  signal: AbortSignal,
): Promise<ImagePhaseResult> {
  if (!VISUAL_KEYWORDS.test(prompt)) return { images: [], usages: [], planUsage: null };
  let planUsage: UsageRecord | null = null;
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
    if (!guarded.ok) return { images: [], usages: [], planUsage: null };
    const planJson = JSON.parse(guarded.text) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown; model?: string };
    // Capture planning usage — provider work happened regardless of decision.
    const parsedPlanUsage = parseUsageFromChatJson(planJson);
    const planEst = estimateUsdForCall({
      model: parsedPlanUsage?.model ?? "google/gemini-3.1-flash-lite",
      inputTokens: parsedPlanUsage?.inputTokens ?? 0,
      outputTokens: parsedPlanUsage?.outputTokens ?? 0,
      providerUsed: true,
    });
    planUsage = makeUsage({
      provider: "lovable", model: parsedPlanUsage?.model ?? "google/gemini-3.1-flash-lite",
      operation: "generate_html",
      inputTokens: parsedPlanUsage?.inputTokens ?? 0,
      outputTokens: parsedPlanUsage?.outputTokens ?? 0,
      totalTokens: parsedPlanUsage?.totalTokens ?? 0,
      estimatedCostUsd: planEst.usd, costBasis: planEst.basis,
      providerUsed: true, status: "committed",
      meta: { phase: "image_plan" },
    });
    const parsed = JSON.parse(planJson.choices?.[0]?.message?.content ?? "{}");
    const plans: Array<{ slot?: string; prompt: string }> = Array.isArray(parsed.images)
      ? parsed.images.filter((x: unknown) => !!x && typeof (x as { prompt?: unknown }).prompt === "string").slice(0, 2)
      : [];
    if (!plans.length) return { images: [], usages: [], planUsage };
    const results = await Promise.all(plans.map((p) => generateOneImage(apiKey, p.prompt, p.slot ?? "image", requestId, signal)));
    const images = results.filter((x): x is PlannedImage => !!x);
    // One UsageRecord per successful image (conservative per-image cost).
    const usages: UsageRecord[] = images.map((img) => makeUsage({
      provider: img.providerUsed, model: img.providerUsed,
      operation: "generate_image",
      imageCount: 1, estimatedCostUsd: IMAGE_COST_USD, costBasis: "estimated",
      providerUsed: true, status: "committed",
      meta: { slot: img.slot },
    }));
    return { images, usages, planUsage };
  } catch {
    return { images: [], usages: [], planUsage };
  }
}


export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = newRequestId();
        // Dual gate: site-owner cookie OR signed-in Pro user with credits.
        // Advisory (chat/plan) is a lighter op; full HTML generation is priced higher.
        // We defer the entitlement decision to after we parse `data` so we can
        // pick the right operation cost — but auth/owner check comes first.
        let entitlement: EntitlementResult | null = null;
        let settled = false;
        const streamUsage = new StreamingUsageAccumulator();
        let opForSettle: Operation = "generate_html";
        let modelForSettle: string = "unknown";
        const imageUsages: UsageRecord[] = [];
        // Every model request that begins pushes a UsageRecord here on
        // failure — used by both success (fallback aggregate) and failure
        // (bill the failed attempt at the per-call minimum).
        const modelAttempts: UsageRecord[] = [];
        const settleSuccess = async () => {
          if (settled) return;
          settled = true;
          if (!entitlement) return;
          const snapshot = streamUsage.hasUsage() ? streamUsage.snapshot() : null;
          const merged = combineSuccessUsage({
            operation: opForSettle,
            model: modelForSettle,
            streamSnapshot: snapshot,
            modelAttempts,
            imageUsages,
          });
          await settleOperation(entitlement, { kind: "success", usage: merged });
        };
        const settleFailure = async (errorCode?: string) => {
          if (settled) return;
          settled = true;
          if (!entitlement) return;
          const snapshot = streamUsage.hasUsage() ? streamUsage.snapshot() : null;
          const outcome = combineFailureSettlement({
            operation: opForSettle,
            model: modelForSettle,
            streamSnapshot: snapshot,
            modelAttempts,
            imageUsages,
            errorCode,
          });
          await settleOperation(entitlement, outcome);
        };
        try {
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

          // Entitlement check — after validation so we know if this is a
          // cheaper advisory op or full HTML generation.
          const op = data.advisory ? "enhance_prompt" : "generate_html";
          opForSettle = op;
          entitlement = await requirePaidOperation(request, op, requestId);
          if (entitlement.kind === "denied" && entitlement.denial) {
            return denialResponse(entitlement.denial, requestId);
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
          const t0 = performance.now();
          const timing: Record<string, number | string | boolean> = {};

          // 1) Context compaction — LOSSLESS. Only large embedded base64
          //    image bodies are replaced with stable placeholder tokens. CSS,
          //    JS, HTML structure, prose, and the document tail are preserved
          //    verbatim. The placeholder map is streamed back to the client at
          //    the end so it can restore originals and verify integrity before
          //    saving.
          const compacted = data.currentHtml
            ? compactHtmlForContext(data.currentHtml)
            : { html: "", originalBytes: 0, bytes: 0, imagesReplaced: 0, placeholders: {} as Record<string, string> };
          const contextHtml = compacted.html;
          timing.ctx_in = compacted.originalBytes;
          timing.ctx_out = compacted.bytes;
          timing.ctx_images = compacted.imagesReplaced;
          const t_ctx = performance.now();
          timing.compact_ms = Math.round(t_ctx - t0);

          // 2) Image planning — skipped entirely unless the user explicitly
          //    asked for imagery or opted in via wantImages. This is what was
          //    silently adding 12-17s to every non-visual build.
          const wantImages = !data.advisory && (data.wantImages || VISUAL_KEYWORDS.test(data.prompt));
          const imagePhase = wantImages
            ? await planAndGenerateImages(apiKey, data.prompt, contextHtml, requestId, clientAbort)
            : { images: [], usages: [], planUsage: null };
          const images = imagePhase.images;
          imageUsages.push(...imagePhase.usages);
          if (imagePhase.planUsage) imageUsages.push(imagePhase.planUsage);
          const t_images = performance.now();
          timing.image_ms = Math.round(t_images - t_ctx);
          timing.image_count = images.length;

          const messages: Array<{ role: string; content: string }> = [
            { role: "system", content: data.advisory ? ADVISORY_PROMPT : SYSTEM_PROMPT },
            ...data.history,
          ];
          if (!data.advisory && contextHtml) {
            messages.push({
              role: "system",
              content: `The current HTML document is:\n\n${contextHtml}\n\nBuild upon it.`,
            });
          }
          if (data.advisory && contextHtml) {
            messages.push({
              role: "system",
              content: `For reference only — the user's current build (do NOT rewrite it, just advise):\n\n${contextHtml.slice(0, 8000)}`,
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

          const decoder = new TextDecoder();
          const encoder = new TextEncoder();
          const explicit = !!(data.pickerModel && data.pickerModel !== "auto");

          // openStream: open an upstream chat/completions stream against `model`,
          // read enough bytes to guard against proxy HTML, and hand back the
          // reader + buffered prefix. Bounded by `budgetMs` end-to-end so we
          // can decide whether to fall back to the fast tier.
          async function openStream(model: string, budgetMs: number) {
            const t_open = performance.now();
            const res = await aiFetch(
              "https://ai.gateway.lovable.dev/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                  model,
                  messages,
                  stream: true,
                  // Ask the gateway for a final usage frame at the end of the SSE.
                  stream_options: { include_usage: true },
                  ...(model.startsWith("openai/gpt-5.6") ? { reasoning_effort: "none" } : {}),
                }),
              },
              {
                breakerKey: `lovable/generate:${model}`,
                stage: "generate",
                requestId,
                signal: clientAbort,
                stream: true,
                totalTimeoutMs: budgetMs,
              },
            );
            const body = res.response.body;
            if (!body) {
              recordFailure(`lovable/generate:${model}`);
              throw new AiError({ code: "ai_upstream_empty", stage: "generate", requestId });
            }
            const rdr = body.getReader();
            const ct = res.response.headers.get("content-type");
            let sniff = "";
            let first: { done: boolean; value: Uint8Array | undefined } | null = null;
            const remaining = () => Math.max(500, budgetMs - (performance.now() - t_open));
            while (sniff.length < 4096) {
              const r = await Promise.race<{ done: boolean; value: Uint8Array | undefined }>([
                rdr.read(),
                new Promise((_, rej) => setTimeout(() => rej(new Error("first_byte_timeout")), remaining())),
              ]);
              first = r;
              if (r.done) break;
              sniff += decoder.decode(r.value, { stream: true });
              if (sniff.trim().length > 0) break;
            }
            const guard = firstChunkLooksBad(sniff, ct);
            if (guard.bad) {
              try { await rdr.cancel(); } catch { /* ignore */ }
              recordFailure(`lovable/generate:${model}`);
              const code =
                guard.reason === "html_body" || guard.reason === "proxy_error"
                  ? "ai_upstream_html"
                  : "ai_upstream_malformed";
              throw new AiError({
                code,
                stage: "generate",
                requestId,
                message: sanitizeUpstreamMessage(sniff, "Upstream returned a non-stream response."),
              });
            }
            return { reader: rdr, sniffBuffer: sniff, firstChunk: first, model, openedAt: t_open, headersAt: performance.now() };
          }

          // 3) Open upstream. On any first-byte failure — timeout, malformed
          //    HTML, empty body — silently retry once against the fastest
          //    reliable model, but only when the user didn't pin a model.
          // tryOpen: wraps openStream so any failure after aiFetch begins is
          // captured as a minimum-cost UsageRecord for the attempted model.
          // On fallback we keep the first record and add the second — settlement
          // aggregates both into the final total.
          const tryOpen = async (model: string, budgetMs: number) => {
            try {
              return await openStream(model, budgetMs);
            } catch (err) {
              modelAttempts.push(modelAttemptUsage({
                model,
                operation: opForSettle,
                errorCode: err instanceof AiError
                  ? err.code
                  : err instanceof Error ? err.message.slice(0, 40) : "attempt_failed",
              }));
              throw err;
            }
          };
          let opened;
          let fallbackReason = "";
          try {
            opened = await tryOpen(data.model, 8_000);
          } catch (err) {
            const canFallback = !explicit && data.model !== DEFAULT_MODEL && !isFastTier(data.model);
            if (!canFallback) throw err;
            fallbackReason = err instanceof Error ? err.message.slice(0, 60) : "unknown";
            opened = await tryOpen(DEFAULT_MODEL, 15_000);
          }
          const { reader, sniffBuffer, firstChunk, model: modelUsed, openedAt, headersAt } = opened;
          const breakerKeyGen = `lovable/generate:${modelUsed}`;
          timing.model = modelUsed;
          timing.fallback = !!fallbackReason;
          if (fallbackReason) timing.fallback_reason = fallbackReason;
          timing.headers_ms = Math.round(headersAt - openedAt);
          timing.first_byte_ms = Math.round(performance.now() - t0);

          modelForSettle = modelUsed;

          // Compose an SSE parser over the buffered sniff bytes + rest of the stream.
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              let buffer = sniffBuffer;
              let emittedBytes = 0;
              const streamStartedAt = performance.now();
              const finalize = async (ok: boolean, err?: unknown) => {
                const totalMs = Math.round(performance.now() - t0);
                timing.stream_ms = Math.round(performance.now() - streamStartedAt);
                timing.total_ms = totalMs;
                timing.emitted_bytes = emittedBytes;
                if (ok) {
                  // Await settlement before closing so a settlement failure
                  // surfaces as a stream error instead of silently succeeding.
                  // The pending ai_usage row remains recoverable on failure.
                  try {
                    await settleSuccess();
                  } catch (settleErr) {
                    recordFailure(breakerKeyGen);
                    controller.error(
                      new AiError({
                        code: "billing_settlement_error",
                        stage: "generate",
                        requestId,
                        message: settleErr instanceof Error ? settleErr.message.slice(0, 120) : "settlement failed",
                      }),
                    );
                    return;
                  }
                  try {
                    if (!data.advisory && compacted.imagesReplaced > 0) {
                      const phJson = JSON.stringify(compacted.placeholders);
                      controller.enqueue(encoder.encode(`\n<!--OBS_PLACEHOLDERS:${phJson}-->`));
                    }
                    controller.enqueue(encoder.encode(`\n<!--OBS_TIMING:${JSON.stringify(timing)}-->`));
                  } catch { /* stream already closing */ }
                  recordSuccess(breakerKeyGen);
                  controller.close();
                } else {
                  // No usable output. If the provider still did work (streaming
                  // usage present OR image usages recorded), we record a failed
                  // charge; otherwise we fully refund. Await either path so a
                  // settlement failure surfaces instead of being swallowed.
                  try {
                    await settleFailure(err instanceof Error ? err.message.slice(0, 60) : "stream_failed");
                  } catch {
                    // Leave the pending row for a retry — but still error the
                    // stream so the client sees a definitive failure.
                  }
                  recordFailure(breakerKeyGen);
                  controller.error(err ?? new Error("ai_upstream_empty"));
                }
              };
              try {
                const drain = async (): Promise<boolean> => {
                  let idx;
                  while ((idx = buffer.indexOf("\n")) !== -1) {
                    const line = buffer.slice(0, idx).trim();
                    buffer = buffer.slice(idx + 1);
                    if (!line.startsWith("data:")) continue;
                    // Feed the accumulator so we capture final usage stats
                    // (OpenAI + Gemini variants) — parsed internally, NEVER
                    // written into the HTML the user receives.
                    streamUsage.push(line);
                    const payload = line.slice(5).trim();
                    if (payload === "[DONE]") {
                      await finalize(emittedBytes > 0);
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
                if (await drain()) return;
                if (firstChunk?.done) { await finalize(emittedBytes > 0); return; }
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  if (await drain()) return;
                }
                await finalize(emittedBytes > 0);
              } catch (err) {
                await finalize(false, err);
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
              "X-Obs-Model-Used": modelUsed,
              "X-Obs-Model-Requested": data.model,
              "X-Obs-Fallback": fallbackReason ? "1" : "0",
              "X-Obs-First-Byte-Ms": String(timing.first_byte_ms),
              "X-Obs-Compact-In": String(compacted.originalBytes),
              "X-Obs-Compact-Out": String(compacted.bytes),
              "Access-Control-Expose-Headers":
                "X-Request-Id, X-Obs-Image-Providers, X-Obs-Image-Count, X-Obs-Model-Used, X-Obs-Model-Requested, X-Obs-Fallback, X-Obs-First-Byte-Ms, X-Obs-Compact-In, X-Obs-Compact-Out",
            },
          });
        } catch (err) {
          // Refund any pending reservation on synchronous failure.
          await settleFailure(err instanceof AiError ? err.code : "generate_internal");
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
