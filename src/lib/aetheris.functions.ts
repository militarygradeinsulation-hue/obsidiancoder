import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const ALLOWED_MODELS = [
  "google/gemini-3.5-flash",
  "google/gemini-3.1-flash-lite",
  "google/gemini-3.1-pro-preview",
  "google/gemini-2.5-pro",
  "openai/gpt-5.4-mini",
] as const;

const inputSchema = z.object({
  prompt: z.string().min(1).max(2000),
  currentHtml: z.string().max(200_000).optional().default(""),
  history: z.array(messageSchema).max(40).optional().default([]),
  model: z.enum(ALLOWED_MODELS).optional().default("google/gemini-3.5-flash"),
});

const SYSTEM_PROMPT = `You are Aetheris Coder — an elite AI front-end engineer.
Understand the user's intent immediately. Do not ask clarifying questions. Do not narrate.
OUTPUT: exactly one complete, production-grade standalone HTML document that satisfies the latest request while preserving every feature that already worked.

NEVER SIMULATE. Always build the real thing.
- No fake data, no "// TODO", no "in a real app this would…", no placeholder Lorem ipsum, no mocked responses, no hard-coded sample arrays pretending to be live results, no setTimeout fake "loading" that resolves to invented data.
- If the feature needs data, fetch it live from a real, public, no-auth, CORS-enabled endpoint (public JSON APIs, RSS/Atom feeds, open data sources) and render the actual response.
- If the feature is a scan/analysis/audit, actually perform it in the browser: fetch the target URL, parse the returned HTML/JSON, run the real checks (regex, DOM inspection, header analysis, scoring) and show real findings from that response.
- If a real source truly cannot be reached from a sandboxed browser (CORS-blocked, auth-required), say so inline in the UI in one short sentence and expose input controls so the user can paste real data — never invent results to fill the gap.
- All interactivity must work end-to-end on first load. No "coming soon", no disabled buttons, no stub handlers, no alert('not implemented').

Hard rules:
- Return ONLY the raw HTML document, starting with <!doctype html>. No markdown fences, no prose.
- Inline all CSS in a <style> tag and all JS in a <script> tag. No external CDNs, fonts, or images — but browser fetch() to public JSON/HTML APIs is allowed and expected for real data.
- Accessibility: semantic HTML, proper heading order, labels for inputs, aria-* where needed, visible keyboard focus, WCAG AA contrast.
- Responsive: mobile-first, fluid layouts, no horizontal scroll at 320px.
- Aesthetic: deep black background, warm amber/gold accents, hard glass / shine, refined typography.
- Never remove previously-built features unless explicitly asked.
- No tracking, no third-party analytics scripts.`;

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
