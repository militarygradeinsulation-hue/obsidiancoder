// Conversational co-designer that discusses the CURRENT build with the user
// — before, during, or after generation. Powered by Claude Sonnet 4.5 via
// RouteLLM (Abacus) by default, with Grok 4.3 and Lovable Gemini Pro as
// fallbacks. Purely advisory — never writes back to the preview.
//
// Gated by the same Pro entitlement + credit reservation as every other AI
// operation in the app. Anonymous callers get a paywall envelope back and
// the server never touches a paid provider.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  containsTradesOnlyLanguage,
  isExplicitTradesContext,
  neutralEnhancementFallbacks,
} from "./suggestion-safety";
import { requirePaidOperation, settleOperation } from "@/lib/credit-gate.server";
import { creditsRequiredEnvelope, type CreditsRequiredEnvelope } from "@/lib/credit-gate";
import { makeUsage } from "@/lib/usage-record";
import { newRequestId } from "@/lib/ai-errors";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(6000),
});

const inputSchema = z.object({
  question: z.string().min(1).max(4000),
  currentHtml: z.string().max(200_000).optional().default(""),
  draftPrompt: z.string().max(6000).optional().default(""),
  history: z.array(messageSchema).max(20).optional().default([]),
  preferredModel: z.enum(["claude", "grok", "auto"]).optional().default("claude"),
});

type Provider = { label: string; url: string; keyEnv: string; model: string };

const ROUTELLM_URL = "https://routellm.abacus.ai/v1/chat/completions";
const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const PROVIDERS: Record<"claude" | "grok" | "gemini", Provider> = {
  claude: { label: "Claude Sonnet 4.5", url: ROUTELLM_URL, keyEnv: "ROUTELLM_API_KEY", model: "claude-sonnet-4-5-20250929" },
  grok:   { label: "Grok 4.3",           url: ROUTELLM_URL, keyEnv: "ROUTELLM_API_KEY", model: "grok-4.3" },
  gemini: { label: "Gemini 3.1 Pro",     url: LOVABLE_URL,  keyEnv: "LOVABLE_API_KEY",  model: "google/gemini-3.1-pro-preview" },
};

const SYSTEM_PROMPT = `You are Obsidian's build co-designer — a sharp, opinionated product+design partner who helps the user brainstorm improvements to the web app they are actively building.

Your job:
- Discuss ideas about how to make the CURRENT build better. Not to write code.
- Answer the user's question directly first, then offer 3 concrete, high-signal suggestions the builder could implement next.
- When you propose a change, phrase each as a one-line prompt the user could paste into the builder (prefix each with "→ ").
- Be specific about sections, components, states, copy, colors, accessibility, and monetization moves — all specific to the build's actual domain (recipe app → recipe features, game → game features, wedding site → wedding features, etc.).
- Read the CURRENT HTML if provided. Reference concrete elements you see (nav, hero, cards). If empty, help the user shape the initial spec.
- Keep responses tight: 4–10 short lines total. No preamble like "Great question". No markdown fences. Use plain text.
- Do NOT mention trades, contractors, field service, HVAC, NFPA, QuickBooks, "leaks", L1–L10, or two-tap rules unless the CURRENT build or the user's question is unambiguously about commercial specialty trades / field-service / compliance. When it is, trade-specific advice (including leak IDs) is welcome.
- Never claim to have edited the build. You only advise; the user's builder does the changes.`;

function trimHtml(html: string): string {
  if (!html) return "";
  const MAX = 24_000;
  if (html.length <= MAX) return html;
  return html.slice(0, MAX) + "\n<!-- …truncated for chat context… -->";
}

async function callProvider(p: Provider, messages: Array<{ role: string; content: string }>): Promise<string | null> {
  const key = process.env[p.keyEnv];
  if (!key) return null;
  try {
    const res = await fetch(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: p.model, messages, temperature: 0.7 }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export type DiscussBuildResult =
  | { reply: string; providerUsed: string }
  | { paywall: CreditsRequiredEnvelope };

export const discussBuild = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<DiscussBuildResult> => {
    const request = getRequest();
    const requestId = newRequestId();
    // Reuse the enhance_prompt reservation envelope — build chat is an
    // advisory LLM call in the same weight class. Anonymous / non-Pro
    // callers are denied here BEFORE any provider is contacted.
    const entitlement = await requirePaidOperation(request, "enhance_prompt", requestId);
    if (entitlement.kind === "denied" && entitlement.denial) {
      return { paywall: entitlement.denial };
    }

    const html = trimHtml(data.currentHtml);
    const allowTrades = isExplicitTradesContext(`${data.question}\n${data.draftPrompt}\n${html}`);
    const context: Array<{ role: string; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];
    if (html) context.push({ role: "system", content: `CURRENT BUILD HTML (may be truncated):\n\n${html}` });
    if (data.draftPrompt.trim()) context.push({ role: "system", content: `The user's in-progress builder prompt draft:\n${data.draftPrompt.trim()}` });
    for (const m of data.history) context.push({ role: m.role, content: m.content });
    context.push({ role: "user", content: data.question });

    const order: Array<"claude" | "grok" | "gemini"> =
      data.preferredModel === "grok"   ? ["grok",   "claude", "gemini"] :
      data.preferredModel === "auto"   ? ["claude", "grok",   "gemini"] :
                                         ["claude", "grok",   "gemini"];

    let providerUsed = false;
    try {
      for (const key of order) {
        const p = PROVIDERS[key];
        const out = await callProvider(p, context);
        if (out && (allowTrades || !containsTradesOnlyLanguage(out))) {
          providerUsed = true;
          await settleOperation(entitlement, {
            kind: "success",
            usage: makeUsage({
              provider: p.url === LOVABLE_URL ? "lovable" : "routellm",
              model: p.model,
              operation: "enhance_prompt",
              providerUsed: true,
              status: "committed",
              actualCostUsd: null,
              estimatedCostUsd: 0,
              costBasis: "estimated",
            }),
          });
          return { reply: out, providerUsed: p.label };
        }
      }
      if (!allowTrades) {
        // No paid provider was called — refund the hold.
        await settleOperation(entitlement, { kind: "no_provider", errorCode: "build_chat_fallback" });
        const fallback = neutralEnhancementFallbacks(`${data.draftPrompt}\n${html}`, Boolean(html), 3);
        return {
          reply: fallback.map((idea) => `→ ${idea.snippet}`).join("\n"),
          providerUsed: "Domain-aware fallback",
        };
      }
      await settleOperation(entitlement, { kind: "no_provider", errorCode: "build_chat_unavailable" });
      throw new Error("build_chat_unavailable");
    } catch (err) {
      if (!providerUsed) {
        try { await settleOperation(entitlement, { kind: "no_provider", errorCode: "build_chat_internal" }); } catch { /* already settled */ }
      }
      throw err;
    }
  });
