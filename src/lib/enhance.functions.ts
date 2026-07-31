import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  requirePaidOperation,
  settleOperation,
} from "@/lib/credit-gate.server";
import type { EntitlementResult } from "@/lib/credit-gate.server";
import { creditsRequiredEnvelope } from "@/lib/credit-gate";
import { makeUsage, estimateUsdForCall, parseUsageFromChatJson } from "@/lib/usage-record";
import { newRequestId } from "@/lib/ai-errors";
import {
  containsTradesOnlyLanguage,
  isExplicitTradesContext,
  neutralEnhancementFallbacks,
} from "@/lib/suggestion-safety";

const inputSchema = z.object({
  prompt: z.string().min(1).max(4000),
  hasHtml: z.boolean().optional().default(false),
  // "pocket" = Obsidian Pocket, an intentionally free, unmetered surface.
  surface: z.enum(["default", "pocket"]).optional().default("default"),
});

const SYSTEM = `You rewrite short web-build requests into clear, concrete prompts for a front-end code generator.
Rules:
- Return ONLY the rewritten prompt as plain text. No preamble, no quotes, no markdown.
- Keep the user's intent. Do not invent unrelated features.
- Be concise: 1-3 sentences, under 400 characters.
- Prefer specifics: layout, sections, tone, key components, accessibility.
- If the user is iterating on an existing build, phrase it as a focused change, not a rebuild.`;

const ENHANCE_MODEL = "google/gemini-3.1-flash-lite";

export type EnhanceResult =
  | { prompt: string }
  | { paywall: ReturnType<typeof creditsRequiredEnvelope> };

export const enhancePrompt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<EnhanceResult> => {
    const request = getRequest();
    const requestId = newRequestId();
    const { serverStripeEnv } = await import("@/lib/credit-gate.server");
    const entitlement: EntitlementResult =
      data.surface === "pocket"
        ? { kind: "free_open", env: serverStripeEnv(), requestId }
        : await requirePaidOperation(request, "enhance_prompt", requestId);
    if (entitlement.kind === "denied" && entitlement.denial) {
      return { paywall: entitlement.denial };
    }
    let providerUsed = false;
    let parsedUsage: { inputTokens: number; outputTokens: number; totalTokens: number; model?: string } | null = null;
    let errorCode: string | undefined;
    try {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        // Pre-provider failure — nothing consumed, refund.
        await settleOperation(entitlement, { kind: "no_provider", errorCode: "ai_unauthorized" });
        throw new Error("AI is not configured yet.");
      }
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: ENHANCE_MODEL,
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
        // Provider replied but non-2xx: no billable usage happened. Refund.
        await settleOperation(entitlement, {
          kind: "no_provider",
          errorCode: res.status === 429 ? "ai_rate_limit" : res.status === 402 ? "ai_credits_exhausted" : `ai_http_${res.status}`,
        });
        if (res.status === 429) throw new Error("Rate limit reached.");
        if (res.status === 402) throw new Error("AI credits exhausted.");
        throw new Error(`Enhance failed (${res.status}): ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown; model?: string };
      providerUsed = true;
      parsedUsage = parseUsageFromChatJson(json);
      let out = json.choices?.[0]?.message?.content?.trim() ?? "";
      out = out.replace(/^["'`]+|["'`]+$/g, "").replace(/^```[a-z]*\s*|\s*```$/g, "").trim();
      const allowTrades = isExplicitTradesContext(data.prompt);
      if (out && !allowTrades && containsTradesOnlyLanguage(out)) {
        const fallback = neutralEnhancementFallbacks(data.prompt, data.hasHtml, 2);
        out = [data.prompt.trim(), ...fallback.map((item) => item.snippet)].join(" ").slice(0, 600);
      }
      if (!out) {
        errorCode = "ai_empty_output";
        // Provider DID work; charge actual/estimated with failed status.
        const est = estimateUsdForCall({
          model: parsedUsage?.model ?? ENHANCE_MODEL,
          inputTokens: parsedUsage?.inputTokens ?? 0,
          outputTokens: parsedUsage?.outputTokens ?? 0,
          providerUsed: true,
        });
        await settleOperation(entitlement, {
          kind: "failed_with_usage", errorCode,
          usage: makeUsage({
            provider: "lovable", model: parsedUsage?.model ?? ENHANCE_MODEL, operation: "enhance_prompt",
            inputTokens: parsedUsage?.inputTokens ?? 0, outputTokens: parsedUsage?.outputTokens ?? 0,
            totalTokens: parsedUsage?.totalTokens ?? 0,
            actualCostUsd: null, estimatedCostUsd: est.usd, costBasis: est.basis,
            providerUsed: true, status: "failed", errorCode,
          }),
        });
        throw new Error("Enhance returned nothing.");
      }

      const est = estimateUsdForCall({
        model: parsedUsage?.model ?? ENHANCE_MODEL,
        inputTokens: parsedUsage?.inputTokens ?? 0,
        outputTokens: parsedUsage?.outputTokens ?? 0,
        providerUsed: true,
      });
      await settleOperation(entitlement, {
        kind: "success",
        usage: makeUsage({
          provider: "lovable", model: parsedUsage?.model ?? ENHANCE_MODEL, operation: "enhance_prompt",
          inputTokens: parsedUsage?.inputTokens ?? 0, outputTokens: parsedUsage?.outputTokens ?? 0,
          totalTokens: parsedUsage?.totalTokens ?? 0,
          actualCostUsd: null, estimatedCostUsd: est.usd, costBasis: est.basis,
          providerUsed: true, status: "committed",
        }),
      });
      return { prompt: out };
    } catch (err) {
      // If provider never fired and we haven't settled, refund. Second call is
      // safe: settleOperation on a denied ent is a no-op, and on pro path
      // finalize/refund reject a second time (we swallow that specific case
      // via the settled flag on the caller side — but here paths are linear
      // and every branch already settled before throwing).
      if (!providerUsed) {
        try { await settleOperation(entitlement, { kind: "no_provider", errorCode: errorCode ?? "ai_internal" }); } catch { /* already settled */ }
      }
      throw err;
    }
  });
