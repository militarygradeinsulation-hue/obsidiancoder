import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  prompt: z.string().min(1).max(4000),
  hasHtml: z.boolean().optional().default(false),
});

const SYSTEM = `You rewrite short web-build requests into clear, concrete prompts for a front-end code generator.
Rules:
- Return ONLY the rewritten prompt as plain text. No preamble, no quotes, no markdown.
- Keep the user's intent. Do not invent unrelated features.
- Be concise: 1-3 sentences, under 400 characters.
- Prefer specifics: layout, sections, tone, key components, accessibility.
- If the user is iterating on an existing build, phrase it as a focused change, not a rebuild.`;

export const enhancePrompt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured yet.");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `${data.hasHtml ? "Context: iterating on an existing build.\n" : ""}Original request:\n${data.prompt}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`Enhance failed (${res.status}): ${t.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    let out = json.choices?.[0]?.message?.content?.trim() ?? "";
    out = out.replace(/^["'`]+|["'`]+$/g, "").replace(/^```[a-z]*\s*|\s*```$/g, "").trim();
    if (!out) throw new Error("Enhance returned nothing.");
    return { prompt: out };
  });
