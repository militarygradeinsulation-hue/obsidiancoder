import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveModel } from "./models";

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

Image-generator builds (when the user asks you to build a tool that GENERATES images from a prompt) — strict fidelity rules, no exceptions:
- The user's typed prompt is the single source of truth. Send it to the image model VERBATIM. Do not rewrite, translate, summarize, "enhance", or moralize it before sending.
- Do NOT prepend hidden style directives, quality suffixes, negative prompts, artist names, or invented subjects/objects/colors/settings the user did not type. No silent "cinematic, 8k, trending on artstation" garnish.
- If (and only if) you expose an optional "Enhance prompt" affordance, it must be a separate, clearly-labelled button that shows the rewritten prompt in the input first and lets the user accept, edit, or reject it before generation. The raw prompt path must remain available and default.
- Show the exact string that was sent to the model next to each result (a small "Prompt used" caption). If any transformation happened, show before → after so the user can see it.
- Never fabricate a result. If the model returns an error, rate limit, moderation block, or empty payload, render a clear error state with the real message — do NOT display a stock/placeholder image, an Unsplash photo, an emoji, or a previously generated image and pretend it is the new output.
- Only render images that actually came back from the generation call in this session. Do not seed the gallery with example/demo images unless the user explicitly asked for demo images, and if you do, label them "Example" so they cannot be confused with real generations.
- Wire the generator to a real image model via a POST to a real endpoint (default: POST /v1/images/generations on the configured gateway, or the endpoint the user specified). Do not simulate generation with setTimeout + a hard-coded image URL. If no key/endpoint is available, render a disabled state that says so — do not fake output.
- Seed / size / model / count controls in the UI must map 1:1 to the request body. If a control is not wired to the request, remove it. Never show a control that lies about what it does.
- Preserve every character of the user's prompt in state and in the request — do not trim, lowercase, strip punctuation, collapse whitespace beyond a single trim of leading/trailing spaces, or auto-correct spelling.`;

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ prompt: z.string().min(1).max(2000) }).parse(data),
  )
  .handler(async ({ data }) => {
    // Primary: Leonardo AI (verbatim prompt, no auto-enhance).
    const leo = await generateWithLeonardo(data.prompt);
    if (leo) return { dataUrl: leo };

    // Fallback: Lovable AI Gateway (Gemini 3 Pro Image).
    const apiKey = process.env.LOVABLE_API_KEY;
    if (apiKey) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-3-pro-image",
          messages: [{ role: "user", content: data.prompt }],
          modalities: ["image", "text"],
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
        const b64 = json.data?.[0]?.b64_json;
        if (b64) return { dataUrl: `data:image/png;base64,${b64}` };
      } else if (res.status === 429) {
        throw new Error("Rate limit reached.");
      } else if (res.status === 402) {
        throw new Error("AI credits exhausted.");
      }
    }
    throw new Error("Image generation failed. Check LEONARDO_API_KEY.");
  });



async function planImages(apiKey: string, prompt: string, currentHtml: string) {
  // Cheap planning call: ask for up to 4 image prompts as JSON.
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-lite",
      messages: [
        {
          role: "system",
          content:
            'You decide whether a web build needs generated images. Return ONLY compact JSON: {"images":[{"slot":"hero|card|logo|bg|icon","prompt":"..."}]}. Include an image ONLY if the user explicitly asks for visuals (image, photo, picture, illustration, logo, banner, hero) or the build is clearly visual (portfolio, gallery, landing page hero). Otherwise return {"images":[]}. Max 4 items. Each prompt: concrete, detailed, style-rich, no text-in-image.',
        },
        {
          role: "user",
          content: `USER REQUEST: ${prompt}\n\nCURRENT HTML (may be empty): ${currentHtml.slice(0, 2000)}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  try {
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

// Leonardo AI image generation (create → poll → download → base64).
async function generateWithLeonardo(prompt: string): Promise<string | null> {
  const key = process.env.LEONARDO_API_KEY;
  if (!key) return null;
  try {
    const create = await fetch("https://cloud.leonardo.ai/api/rest/v1/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, Accept: "application/json" },
      body: JSON.stringify({
        prompt: prompt.slice(0, 1400),
        modelId: "6b645e3a-d64f-4341-a6d8-7a3690fbf042", // Leonardo Phoenix 1.0
        width: 1024,
        height: 1024,
        num_images: 1,
        alchemy: false,
        contrast: 3.5,
        enhancePrompt: false,
        presetStyle: "DYNAMIC",
        public: false,
      }),
    });

    if (!create.ok) return null;
    const cj = (await create.json()) as { sdGenerationJob?: { generationId?: string } };
    const genId = cj.sdGenerationJob?.generationId;
    if (!genId) return null;

    // Poll up to ~30s.
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${genId}`, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      });
      if (!poll.ok) continue;
      const pj = (await poll.json()) as {
        generations_by_pk?: { status?: string; generated_images?: Array<{ url?: string }> };
      };
      const g = pj.generations_by_pk;
      if (g?.status === "COMPLETE") {
        const url = g.generated_images?.[0]?.url;
        if (!url) return null;
        const img = await fetch(url);
        if (!img.ok) return null;
        const buf = await img.arrayBuffer();
        const b64 = Buffer.from(buf).toString("base64");
        return `data:image/png;base64,${b64}`;
      }
      if (g?.status === "FAILED") return null;
    }
    return null;
  } catch {
    return null;
  }
}

async function generateOneImage(apiKey: string, prompt: string): Promise<string | null> {
  // Prefer Leonardo AI; fall back to Gemini 3 Pro Image.
  const leo = await generateWithLeonardo(prompt);
  if (leo) return leo;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = json.data?.[0]?.b64_json;
      if (b64) return `data:image/png;base64,${b64}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}



export const generateHtml = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured yet.");

    // Plan + generate any visuals in parallel with the main call setup.
    const plans = await planImages(apiKey, data.prompt, data.currentHtml);
    const generated = plans.length
      ? await Promise.all(
          plans.map(async (p: { slot?: string; prompt: string }, i: number) => {
            const url = await generateOneImage(apiKey, p.prompt);
            return url ? { id: `gen-${i}`, slot: p.slot ?? "image", prompt: p.prompt, url } : null;
          }),
        )
      : [];
    const images = generated.filter(Boolean) as Array<{
      id: string;
      slot: string;
      prompt: string;
      url: string;
    }>;

    // Context budget guardrails — keep well under the gateway's 1M-token cap.
    const MAX_HTML_CHARS = 120_000; // ~30K tokens
    const MAX_HISTORY = 6;
    const truncatedHtml = data.currentHtml && data.currentHtml.length > MAX_HTML_CHARS
      ? data.currentHtml.slice(0, MAX_HTML_CHARS) + "\n<!-- …truncated for context budget… -->"
      : data.currentHtml;
    const trimmedHistory = data.history.slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: typeof m.content === "string" && m.content.length > 4000
        ? m.content.slice(0, 4000) + "…"
        : m.content,
    }));

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...trimmedHistory,
    ];
    if (truncatedHtml) {
      messages.push({
        role: "system",
        content: `The current HTML document is:\n\n${truncatedHtml}\n\nBuild upon it.`,
      });
    }
    // Reference images by short placeholder tokens; substitute the real data URLs
    // into the model output afterwards. This keeps base64 blobs out of the prompt.
    if (images.length) {
      const list = images
        .map((img) => `- ${img.id} · slot=${img.slot} · "${img.prompt}"`)
        .join("\n");
      messages.push({
        role: "system",
        content:
          `Generated images are available. Embed them with <img src="{{IMAGE:<id>}}" alt="..."> using the placeholder tokens below. Do NOT swap in Unsplash or invent URLs — the placeholders will be replaced with the real data URLs after generation. Choose sensible sizes and object-fit.\n\n${list}`,
      });
    }
    messages.push({ role: "user", content: data.prompt });

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: data.model,
        messages,
        ...(data.model.startsWith("openai/gpt-5.6") ? { reasoning_effort: "none" } : {}),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached. Try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted for this workspace.");
      throw new Error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let html = json.choices?.[0]?.message?.content?.trim() ?? "";
    html = html.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();

    // Substitute {{IMAGE:<id>}} placeholders with the real base64 data URLs.
    for (const img of images) {
      html = html.split(`{{IMAGE:${img.id}}}`).join(img.url);
    }

    if (!html.toLowerCase().includes("<!doctype") && !html.toLowerCase().includes("<html")) {
      html = `<!doctype html><html><head><meta charset="utf-8"><style>body{background:#0f0d0a;color:#f6e6c8;font-family:system-ui;padding:24px}</style></head><body>${html}</body></html>`;
    }

    return { html, generatedImages: images.length };
  });

