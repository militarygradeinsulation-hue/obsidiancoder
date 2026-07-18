// Patch generation route. Non-streaming. Returns JSON only.
// The model is instructed to emit a Patch document (see src/lib/patch-protocol.ts).
// If the first response is malformed, we retry ONCE with a repair instruction
// on the cheapest suitable model. Never streams into the preview.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ALLOWED_MODEL_IDS, DEFAULT_MODEL } from "@/lib/models";
import { parsePatchResponse, MAX_OPS } from "@/lib/patch-protocol";
import { anchorsFromPrompt, snippetsAround, budgetSnippets, snippetsToPrompt } from "@/lib/context-manager";

const CHEAP_REPAIR_MODEL = "google/gemini-3.1-flash-lite";

const inputSchema = z.object({
  prompt: z.string().min(1).max(20_000),
  currentHtml: z.string().min(1).max(6_000_000),
  outline: z.string().max(20_000).optional().default(""),
  memory: z.string().max(4_000).optional().default(""),
  model: z
    .string()
    .refine((m) => (ALLOWED_MODEL_IDS as readonly string[]).includes(m), "unsupported model")
    .optional()
    .default(DEFAULT_MODEL),
});

const SYSTEM_PROMPT = `You are Aetheris Coder's PATCH engine. You edit a single existing HTML document by returning a JSON patch — never regenerating the whole document.

OUTPUT: JSON only. No markdown fences, no prose, no comments. Shape:
{
  "summary": "one short human sentence",
  "operations": [ ...ops ]
}

Supported ops (each an object with "op": <name>):
- {"op":"replace_text","find":"exact substring","replace":"new text","allow_multiple":false}
- {"op":"delete_text","find":"exact substring","allow_multiple":false}
- {"op":"insert_before","anchor":"exact unique substring","content":"html to insert"}
- {"op":"insert_after","anchor":"exact unique substring","content":"html to insert"}
- {"op":"replace_element_by_id","id":"myId","content":"new inner HTML"}
- {"op":"set_attribute","id":"myId","attribute":"class","value":"..."}
- {"op":"append_css_rule","rule":".foo{color:red}"}
- {"op":"append_script","code":"document.querySelector('#x').addEventListener(...)"}

Hard rules:
- Return VALID JSON. Escape newlines inside strings as \\n. Escape quotes as \\".
- Every "find" and "anchor" MUST appear EXACTLY ONCE in the document (unless allow_multiple).
- Use the document outline to pick unique, precise anchors. Prefer replace_element_by_id when the target has an id.
- Keep operations MINIMAL — do only what the user asked. Do not restyle unrelated things.
- At most ${MAX_OPS} operations.
- If the request truly cannot be expressed as a small patch (rebuild, redesign from scratch), return {"summary":"needs full generation","operations":[]}.
- Never invent ids the outline does not list.
- Preserve every feature that already worked.`;

async function callGateway(apiKey: string, model: string, messages: Array<{ role: string; content: string }>): Promise<{ ok: true; text: string } | { ok: false; status: number; text: string }> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      response_format: { type: "json_object" },
      ...(model.startsWith("openai/gpt-5.6") ? { reasoning_effort: "none" } : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, text };
  try {
    const j = JSON.parse(text);
    const content = j.choices?.[0]?.message?.content ?? "";
    return { ok: true, text: String(content) };
  } catch {
    return { ok: false, status: 502, text: "Malformed gateway response" };
  }
}

export const Route = createFileRoute("/api/patch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("AI not configured", { status: 500 });

        let data: z.infer<typeof inputSchema>;
        try {
          data = inputSchema.parse(await request.json());
        } catch (err) {
          return new Response(err instanceof Error ? err.message : "Bad input", { status: 400 });
        }

        const context = [
          data.memory ? `PROJECT MEMORY:\n${data.memory}` : "",
          `DOCUMENT OUTLINE:\n${data.outline || "(no outline provided)"}`,
          `DOCUMENT SIZE: ${data.currentHtml.length} chars`,
        ].filter(Boolean).join("\n\n");

        // Staged context: try minimal anchor-scoped snippets first. Only ship
        // the full document when it is small enough for the model to reason
        // over cheaply.
        const includeFull = data.currentHtml.length < 40_000;
        const anchors = anchorsFromPrompt(data.prompt);
        const rawSnips = snippetsAround(data.currentHtml, anchors);
        const snips = budgetSnippets(rawSnips);
        const snippetBlock = snippetsToPrompt(snips);
        const contextTier = includeFull ? "D-full-document" : snips.length ? "A-minimal" : "none";

        const userMsg = [
          `USER REQUEST:\n${data.prompt}`,
          "",
          context,
          snippetBlock ? `\nRELEVANT SNIPPETS (${snips.length}):\n${snippetBlock}` : "",
          includeFull
            ? `\nCURRENT HTML (verbatim — pick exact substrings for anchors):\n\n${data.currentHtml}`
            : "\n(Full HTML omitted — use outline ids/headings and the snippets above.)",
        ].filter(Boolean).join("\n");

        const baseMessages = [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ];

        let usedFallback = false;
        let modelUsed = data.model;
        let attempt = await callGateway(apiKey, data.model, baseMessages);
        let parseErr: string | null = null;

        if (attempt.ok) {
          const parsed = parsePatchResponse(attempt.text);
          if (parsed.ok) {
            return Response.json({
              ok: true,
              patch: parsed.patch,
              model: modelUsed,
              fallbackUsed: false,
              contextTier,
              contextChars: snippetBlock.length,
            });
          }
          parseErr = parsed.error;
        } else {
          if (attempt.status === 429) return new Response("Rate limit reached. Try again in a moment.", { status: 429 });
          if (attempt.status === 402) return new Response("AI credits exhausted for this workspace.", { status: 402 });
          parseErr = `Gateway ${attempt.status}: ${attempt.text.slice(0, 200)}`;
        }

        // ONE repair attempt on the cheap model.
        usedFallback = true;
        modelUsed = CHEAP_REPAIR_MODEL;
        const repairMessages = [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
          { role: "assistant", content: attempt.ok ? attempt.text.slice(0, 4000) : "(previous attempt failed to reach the gateway)" },
          { role: "user", content: `Your previous response was invalid: ${parseErr}. Return ONLY a valid JSON patch document matching the schema. No prose, no fences.` },
        ];
        const repair = await callGateway(apiKey, CHEAP_REPAIR_MODEL, repairMessages);
        if (!repair.ok) {
          return Response.json({ ok: false, error: `Repair failed: ${repair.text.slice(0, 200)}`, fallbackUsed: usedFallback, model: modelUsed }, { status: 200 });
        }
        const parsed2 = parsePatchResponse(repair.text);
        if (!parsed2.ok) {
          return Response.json({ ok: false, error: `Patch invalid after repair: ${parsed2.error}`, fallbackUsed: usedFallback, model: modelUsed }, { status: 200 });
        }
        return Response.json({
          ok: true,
          patch: parsed2.patch,
          model: modelUsed,
          fallbackUsed: true,
        });
      },
    },
  },
});
