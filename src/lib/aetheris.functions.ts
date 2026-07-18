import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ALLOWED_MODEL_IDS, DEFAULT_MODEL } from "./models";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const inputSchema = z.object({
  prompt: z.string().min(1).max(6_000_000),
  currentHtml: z.string().max(6_000_000).optional().default(""),
  history: z.array(messageSchema).max(8).optional().default([]),
  model: z
    .string()
    .refine((m) => (ALLOWED_MODEL_IDS as readonly string[]).includes(m), "unsupported model")
    .optional()
    .default(DEFAULT_MODEL),
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
- Safe: no third-party scripts, no tracking, no network calls beyond loading the images described above.`;

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ prompt: z.string().min(1).max(2000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured yet.");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        messages: [{ role: "user", content: data.prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`Image generation failed (${res.status}): ${t.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned.");
    return { dataUrl: `data:image/png;base64,${b64}` };
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

async function generateOneImage(apiKey: string, prompt: string): Promise<string | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  } catch {
    return null;
  }
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

