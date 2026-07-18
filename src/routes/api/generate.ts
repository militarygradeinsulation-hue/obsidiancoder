import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ALLOWED_MODEL_IDS, DEFAULT_MODEL } from "@/lib/models";

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
- Images ARE allowed and encouraged when they improve the design. If GENERATED IMAGES are provided in system context, use those data URLs verbatim. Otherwise use inline SVG or an https placeholder (unsplash/picsum/dicebear). Set width, height, alt.
- If the user attaches an image (data: URL or https URL) in the prompt, embed it exactly.
- Accessibility: semantic HTML, WCAG AA contrast, keyboard focus, labels.
- Responsive mobile-first, no horizontal scroll at 320px.
- Aesthetic: dark background, warm amber/gold accents, refined typography.
- Never remove previously-built features unless asked.
- No third-party scripts, no tracking, no external network calls beyond image URLs.
- Speed matters: begin streaming the <!doctype html> immediately. No preamble.`;

type PlannedImage = { slot: string; prompt: string; url: string };

const VISUAL_KEYWORDS = /\b(image|images|photo|photos|picture|pictures|illustration|logo|banner|hero|portfolio|gallery|avatar|thumbnail|artwork|painting|poster|screenshot)\b/i;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function planAndGenerateImages(
  apiKey: string,
  prompt: string,
  currentHtml: string,
): Promise<PlannedImage[]> {
  // Fast gate: skip the planner unless the prompt clearly wants visuals.
  // This alone eliminates ~15s of upstream calls on most requests and
  // prevents the edge from 502'ing on time-to-first-byte.
  if (!VISUAL_KEYWORDS.test(prompt)) return [];
  try {
    const planRes = await withTimeout(fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite",
        messages: [
          {
            role: "system",
            content:
              'Decide if this web build needs real generated images. Return ONLY JSON: {"images":[{"slot":"hero|card|logo|bg|icon","prompt":"detailed visual prompt, no text-in-image"}]}. Include images ONLY if the user explicitly asks for a visual OR the build is inherently visual (portfolio, gallery, product landing). Otherwise {"images":[]}. Max 2.',
          },
          {
            role: "user",
            content: `USER REQUEST: ${prompt}\n\nCURRENT HTML: ${currentHtml.slice(0, 1500)}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    }), 4000);
    if (!planRes.ok) return [];
    const planJson = (await planRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(planJson.choices?.[0]?.message?.content ?? "{}");
    const plans: Array<{ slot?: string; prompt: string }> = Array.isArray(parsed.images)
      ? parsed.images.filter((x: unknown) => !!x && typeof (x as { prompt?: unknown }).prompt === "string").slice(0, 2)
      : [];
    if (!plans.length) return [];

    const results = await Promise.all(
      plans.map(async (p): Promise<PlannedImage | null> => {
        try {
          const r = await withTimeout(fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "google/gemini-3.1-flash-image",
              messages: [{ role: "user", content: p.prompt }],
              modalities: ["image", "text"],
            }),
          }), 8000);
          if (!r.ok) return null;
          const j = (await r.json()) as { data?: Array<{ b64_json?: string }> };
          const b64 = j.data?.[0]?.b64_json;
          return b64 ? { slot: p.slot ?? "image", prompt: p.prompt, url: `data:image/png;base64,${b64}` } : null;
        } catch {
          return null;
        }
      }),
    );
    return results.filter((x): x is PlannedImage => !!x);
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isUnlockedServer } = await import("@/lib/gate.functions");
        if (!(await isUnlockedServer())) {
          return new Response("Locked", { status: 401 });
        }
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("AI not configured", { status: 500 });

        let data: z.infer<typeof inputSchema>;
        try {
          data = inputSchema.parse(await request.json());
        } catch (err) {
          return new Response(
            err instanceof Error ? err.message : "Bad input",
            { status: 400 },
          );
        }

        // Plan + generate images before we start streaming HTML.
        const images = await planAndGenerateImages(apiKey, data.prompt, data.currentHtml);

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
        if (images.length) {
          messages.push({
            role: "system",
            content:
              `GENERATED IMAGES AVAILABLE — embed each as <img src="..."> using the EXACT data URLs below. Do NOT swap for Unsplash/placeholders.\n\n` +
              images
                .map((img: PlannedImage, i: number) => `[image ${i + 1} — slot=${img.slot}] prompt: ${img.prompt}\nURL: ${img.url}`)

                .join("\n\n"),
          });
        }
        messages.push({ role: "user", content: data.prompt });


        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          if (upstream.status === 429) return new Response("Rate limit reached. Try again in a moment.", { status: 429 });
          if (upstream.status === 402) return new Response("AI credits exhausted for this workspace.", { status: 402 });
          return new Response(`AI request failed (${upstream.status}): ${text.slice(0, 300)}`, { status: 502 });
        }

        // Parse SSE from upstream and re-emit plain text deltas
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const reader = upstream.body!.getReader();
            let buffer = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buffer.indexOf("\n")) !== -1) {
                  const line = buffer.slice(0, idx).trim();
                  buffer = buffer.slice(idx + 1);
                  if (!line.startsWith("data:")) continue;
                  const payload = line.slice(5).trim();
                  if (payload === "[DONE]") { controller.close(); return; }
                  try {
                    const j = JSON.parse(payload);
                    const delta = j.choices?.[0]?.delta?.content;
                    if (typeof delta === "string" && delta.length) {
                      controller.enqueue(encoder.encode(delta));
                    }
                  } catch { /* skip malformed */ }
                }
              }
              controller.close();
            } catch (err) {
              controller.error(err);
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
