import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const inputSchema = z.object({
  prompt: z.string().min(1).max(2000),
  currentHtml: z.string().max(100_000).optional().default(""),
  history: z.array(messageSchema).max(40).optional().default([]),
});

const SYSTEM_PROMPT = `You are Aetheris Coder, a minimal front-end code generator.
You output ONE complete standalone HTML document that satisfies the user's latest request while KEEPING everything that already worked in the previous document.
Rules:
- Return ONLY the raw HTML document, starting with <!doctype html>. No markdown fences, no commentary, no explanation.
- Inline all CSS in a <style> tag and all JS in a <script> tag. No external URLs, no CDNs.
- Use a dark background with warm amber accents to match the host site aesthetic.
- Never remove features the user built earlier unless they explicitly ask you to.
- Keep the document self-contained and safe: no network calls, no forms that post anywhere.`;

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
        model: "google/gemini-2.5-flash",
        messages,
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
