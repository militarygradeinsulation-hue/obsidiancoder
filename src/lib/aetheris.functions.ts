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

export const generateHtml = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured yet.");

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...data.history,
    ];
    if (data.currentHtml) {
      messages.push({
        role: "system",
        content: `The current HTML document is:\n\n${data.currentHtml}\n\nBuild upon it.`,
      });
    }
    messages.push({ role: "user", content: data.prompt });

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
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

    // strip accidental markdown fences
    html = html.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();

    if (!html.toLowerCase().includes("<!doctype") && !html.toLowerCase().includes("<html")) {
      html = `<!doctype html><html><head><meta charset="utf-8"><style>body{background:#0f0d0a;color:#f6e6c8;font-family:system-ui;padding:24px}</style></head><body>${html}</body></html>`;
    }

    return { html };
  });
