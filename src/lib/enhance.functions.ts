import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  requirePaidOperation,
  commitReservation,
  refundReservation,
  logOwnerUsage,
} from "@/lib/credit-gate.server";
import { creditsRequiredEnvelope } from "@/lib/credit-gate";

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

/** A structured error the client can recognize and route to PricingModal. */
class PaywallError extends Error {
  status: number;
  envelope: ReturnType<typeof creditsRequiredEnvelope>;
  constructor(env: ReturnType<typeof creditsRequiredEnvelope>) {
    super(env.message);
    this.name = "PaywallError";
    this.status = env.code === "auth_required" ? 401 : 402;
    this.envelope = env;
  }
}

export const enhancePrompt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest();
    const entitlement = await requirePaidOperation(request, "enhance_prompt");
    if (entitlement.kind === "denied" && entitlement.denial) {
      throw new PaywallError(entitlement.denial);
    }
    let committed = false;
    const refund = async () => {
      if (!committed && entitlement.kind === "pro" && entitlement.reservation) {
        committed = true;
        await refundReservation(entitlement.reservation.reservationId);
      }
    };
    try {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) { await refund(); throw new Error("AI is not configured yet."); }
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
        await refund();
        if (res.status === 429) throw new Error("Rate limit reached.");
        if (res.status === 402) throw new Error("AI credits exhausted.");
        throw new Error(`Enhance failed (${res.status}): ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      let out = json.choices?.[0]?.message?.content?.trim() ?? "";
      out = out.replace(/^["'`]+|["'`]+$/g, "").replace(/^```[a-z]*\s*|\s*```$/g, "").trim();
      if (!out) { await refund(); throw new Error("Enhance returned nothing."); }

      // Commit charge on success.
      if (entitlement.kind === "pro" && entitlement.reservation) {
        committed = true;
        commitReservation(entitlement.reservation.reservationId).catch(() => {});
      } else if (entitlement.kind === "owner") {
        logOwnerUsage("enhance_prompt", 0).catch(() => {});
      }
      return { prompt: out };
    } catch (err) {
      await refund();
      throw err;
    }
  });
