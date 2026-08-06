// Patch generation route. Non-streaming. Returns JSON only.
// The model is instructed to emit a Patch document (see src/lib/patch-protocol.ts).
// If the first response is malformed, we retry ONCE with a repair instruction
// on the cheapest suitable model. Never streams into the preview.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveModel, isRouteLLMModel } from "@/lib/models";
import { parsePatchResponse, MAX_OPS } from "@/lib/patch-protocol";
import { buildContext, nextTier, type ContextTier } from "@/lib/staged-context";
import { AiError, newRequestId, sanitizeUpstreamMessage } from "@/lib/ai-errors";
import { aiFetch } from "@/lib/ai-fetch";
import { readGuarded } from "@/lib/upstream-guard";
import {
  requirePaidOperation,
  denialResponse,
  settleOperation,
  type EntitlementResult,
} from "@/lib/credit-gate.server";
import { makeUsage, mergeUsage, estimateUsdForCall, parseUsageFromChatJson, type UsageRecord } from "@/lib/usage-record";
import { routellmKey } from "@/lib/routellm-keys";
import { buildProviderChain, runProviderChain, chainFailureMessage, type ChainAttempt } from "@/lib/provider-chain";

const CHEAP_REPAIR_MODEL = "google/gemini-3.1-flash-lite";

const inputSchema = z.object({
  prompt: z.string().min(1).max(20_000),
  currentHtml: z.string().min(1).max(6_000_000),
  outline: z.string().max(20_000).optional().default(""),
  memory: z.string().max(4_000).optional().default(""),
  selectedAnchor: z.string().max(400).optional(),
  model: z.string().optional().transform((m) => resolveModel(m)),
  contextTier: z.enum(["minimal", "nearby", "sections", "full"]).optional().default("minimal"),
});


const SYSTEM_PROMPT = `You are Obsidian's PATCH engine. You edit a single existing HTML document by returning a JSON patch — never regenerating the whole document.

OUTPUT: JSON only. No markdown fences, no prose, no comments. Shape:
{ "summary": "one short sentence", "operations": [ ...ops ] }

Supported ops (each an object with "op": <name>). Emit ONLY these:
- {"op":"replace_text","find":"exact substring","replace":"new text","allow_multiple":false}
- {"op":"delete_text","find":"exact substring","allow_multiple":false}
- {"op":"insert_before","anchor":"unique substring","content":"html to insert"}
- {"op":"insert_after","anchor":"unique substring","content":"html to insert"}
- {"op":"replace_element_by_id","id":"myId","content":"new inner HTML"}
- {"op":"set_attribute","id":"myId","attribute":"class","value":"..."}
- {"op":"append_css_rule","rule":".foo{color:red}"}
- {"op":"append_script","code":"..."}
- {"op":"remove_element_by_id","id":"myId","expected_prev":"optional first ~200 chars"}
- {"op":"remove_attribute","id":"myId","attribute":"data-x"}
- {"op":"add_class","id":"myId","class_name":"active"}
- {"op":"remove_class","id":"myId","class_name":"active"}
- {"op":"insert_child","id":"parentId","position":"first"|"last","content":"..."}
- {"op":"update_inline_style","id":"myId","property":"color","value":"#fff"}
- {"op":"replace_css_rule","selector":".btn","body":"color:red; padding:8px"}
- {"op":"replace_script_block","marker":"unique marker inside script","code":"..."}
- {"op":"rename_id","from":"old","to":"new","update_references":true}
- {"op":"update_json_block","marker":"unique marker in JSON","json":"{...valid JSON...}"}

Hard rules:
- Return VALID JSON. Escape newlines as \\n and quotes as \\".
- Every "find"/"anchor"/"marker" MUST appear EXACTLY ONCE (unless allow_multiple).
- Prefer id-based ops when the target has an id. Never invent ids the outline does not list.
- Keep operations MINIMAL — do only what the user asked.
- At most ${MAX_OPS} operations.
- If the request truly cannot be a small patch, return {"summary":"needs full generation","operations":[]}.
- Preserve every feature that already worked.`;

async function callOnce(
  attempt: ChainAttempt,
  messages: Array<{ role: string; content: string }>,
  requestId: string,
  signal: AbortSignal,
): Promise<
  | { ok: true; text: string; usage: UsageRecord }
  | { ok: false; error: AiError; usage: UsageRecord | null }
> {
  const wireModel = attempt.wireModel;
  const providerName = attempt.google ? "google" : attempt.routed ? "routellm" : "lovable";
  try {
    const body: Record<string, unknown> = {
      model: wireModel, messages, stream: false,
    };
    if (!attempt.routed) {
      body.response_format = { type: "json_object" };
      if (wireModel.startsWith("openai/gpt-5.6")) body.reasoning_effort = "none";
    }
    const { response } = await aiFetch(
      attempt.url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${attempt.key}` },
        body: JSON.stringify(body),
      },
      { breakerKey: attempt.label, stage: "patch", requestId, signal },
    );
    const guarded = await readGuarded(response, { expected: "application/json" });
    if (!guarded.ok) {
      const code =
        guarded.reason === "html_body" || guarded.reason === "proxy_error"
          ? "ai_upstream_html"
          : guarded.reason === "empty" ? "ai_upstream_empty" : "ai_upstream_malformed";
      return {
        ok: false, usage: null,
        error: new AiError({ code, stage: "patch", requestId, message: sanitizeUpstreamMessage(guarded.sample, "Upstream response was rejected.") }),
      };
    }
    let j: unknown;
    try { j = JSON.parse(guarded.text); }
    catch {
      return {
        ok: false, usage: null,
        error: new AiError({ code: "ai_upstream_malformed", stage: "patch", requestId, message: "Malformed gateway response." }),
      };
    }
    const parsedUsage = parseUsageFromChatJson(j);
    const est = estimateUsdForCall({
      model: parsedUsage?.model ?? wireModel,
      inputTokens: parsedUsage?.inputTokens ?? 0,
      outputTokens: parsedUsage?.outputTokens ?? 0,
      providerUsed: true,
    });
    const usage = makeUsage({
      provider: providerName, model: parsedUsage?.model ?? wireModel, operation: "generate_html_patch",
      inputTokens: parsedUsage?.inputTokens ?? 0, outputTokens: parsedUsage?.outputTokens ?? 0,
      totalTokens: parsedUsage?.totalTokens ?? 0,
      estimatedCostUsd: est.usd, costBasis: est.basis, providerUsed: true, status: "committed",
    });
    const content = (j as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
    return { ok: true, text: String(content), usage };
  } catch (err) {
    const aiErr = err instanceof AiError
      ? err
      : new AiError({ code: "ai_internal", stage: "patch", requestId, message: (err as Error)?.message });
    return { ok: false, error: aiErr, usage: null };
  }
}

/**
 * Try the requested model, walking every configured RouteLLM key, and finally
 * fall back to the Lovable gateway with an equivalent model when RouteLLM
 * credits are exhausted. Non-billing errors surface immediately.
 */
async function callGateway(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  requestId: string,
  signal: AbortSignal,
): Promise<
  | { ok: true; text: string; usage: UsageRecord }
  | { ok: false; error: AiError; usage: UsageRecord | null }
> {
  // Google first (if configured), then every healthy RouteLLM key, then
  // the Lovable gateway with the closest equivalent model — the same
  // chain and the same advance-on-any-failure semantics generate.ts uses,
  // shared via src/lib/provider-chain.ts rather than reimplemented here.
  const attempts = buildProviderChain(model, apiKey);
  if (attempts.length === 0) {
    return {
      ok: false,
      usage: null,
      error: new AiError({ code: "ai_unauthorized", stage: "patch", requestId, message: "No AI provider is configured." }),
    };
  }

  const outcome = await runProviderChain(attempts, async (attempt) => {
    const r = await callOnce(attempt, messages, requestId, signal);
    if (r.ok) return { ok: true, value: r };
    const isClientCancel = r.error instanceof AiError && r.error.code === "ai_cancelled";
    return { ok: false, error: r.error, isClientCancel };
  });

  if (outcome.ok && outcome.value) return outcome.value;

  const lastAiErr = outcome.lastError instanceof AiError ? outcome.lastError : null;
  const detail = sanitizeUpstreamMessage(
    outcome.lastError instanceof Error ? outcome.lastError.message : undefined,
    "unknown error",
  );
  const { billing, message } = chainFailureMessage(outcome, attempts, detail);
  return {
    ok: false,
    usage: null,
    error: new AiError({
      code: billing ? "ai_unauthorized" : (lastAiErr?.code ?? "ai_internal"),
      stage: "patch",
      requestId,
      message,
    }),
  };
}



export const Route = createFileRoute("/api/patch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = newRequestId();
        let entitlement: EntitlementResult | null = null;
        let settled = false;
        const collected: UsageRecord[] = [];
        const settleSuccess = async () => {
          if (settled) return;
          settled = true;
          if (!entitlement) return;
          const merged = mergeUsage("generate_html_patch", collected);
          await settleOperation(entitlement, { kind: "success", usage: merged });
        };
        const settleFailure = async (errorCode?: string) => {
          if (settled) return;
          settled = true;
          if (!entitlement) return;
          if (collected.length === 0) {
            await settleOperation(entitlement, { kind: "no_provider", errorCode });
            return;
          }
          const merged = mergeUsage("generate_html_patch", collected);
          await settleOperation(entitlement, {
            kind: "failed_with_usage", errorCode,
            usage: { ...merged, status: "failed", errorCode },
          });
        };

        try {
          let data: z.infer<typeof inputSchema>;
          try { data = inputSchema.parse(await request.json()); }
          catch (err) {
            throw new AiError({
              code: "ai_bad_request", stage: "validate", requestId,
              message: err instanceof Error ? err.message : "Bad input.",
            });
          }

          const primaryIsRouteLLM = isRouteLLMModel(data.model);
          const lovableKey = process.env.LOVABLE_API_KEY;
          const routellmApiKey = routellmKey();
          const primaryKey = primaryIsRouteLLM ? routellmApiKey : lovableKey;
          if (!primaryKey) {
            throw new AiError({
              code: "ai_unauthorized", stage: "validate", requestId,
              message: primaryIsRouteLLM
                ? "RouteLLM is not configured (ROUTELLM_API_KEY missing)."
                : "AI is not configured (LOVABLE_API_KEY missing).",
            });
          }

          entitlement = await requirePaidOperation(request, "generate_html_patch", requestId);
          if (entitlement.kind === "denied" && entitlement.denial) {
            return denialResponse(entitlement.denial, requestId);
          }

          let tier: ContextTier = data.contextTier;
          let ctx = buildContext(data.currentHtml, data.prompt, tier, data.selectedAnchor);
          if (ctx.chars === 0 && tier !== "full") {
            const nx = nextTier(tier);
            if (nx) { tier = nx; ctx = buildContext(data.currentHtml, data.prompt, tier, data.selectedAnchor); }
          }

          const contextBlock = [
            data.memory ? `PROJECT MEMORY:\n${data.memory}` : "",
            `DOCUMENT OUTLINE:\n${data.outline || "(none)"}`,
            `DOCUMENT SIZE: ${data.currentHtml.length} chars`,
            ctx.text ? `\nSTAGED CONTEXT (tier=${ctx.tier}, ${ctx.chars}c, saved ~${Math.round(ctx.savings * 100)}%):\n${ctx.text}` : "",
            tier === "full" && data.currentHtml.length < 40_000
              ? `\nCURRENT HTML (verbatim — pick exact substrings for anchors):\n\n${data.currentHtml}`
              : "",
          ].filter(Boolean).join("\n\n");

          const userMsg = `USER REQUEST:\n${data.prompt}\n\n${contextBlock}`;
          const baseMessages = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMsg },
          ];

          let modelUsed = data.model;
          const attempt = await callGateway(primaryKey, data.model, baseMessages, requestId, request.signal);
          if (attempt.ok) collected.push(attempt.usage);

          if (attempt.ok) {
            const parsed = parsePatchResponse(attempt.text);
            if (parsed.ok) {
              await settleSuccess();
              return Response.json({
                ok: true, patch: parsed.patch, model: modelUsed, fallbackUsed: false,
                requestId, contextTier: ctx.tier, contextChars: ctx.chars, contextSavings: ctx.savings,
              }, { headers: { "X-Request-Id": requestId } });
            }
          }

          // Transport-level, non-retryable error → surface it (no provider usage).
          if (!attempt.ok && !attempt.error.retryable && attempt.error.code !== "ai_upstream_malformed") {
            throw attempt.error;
          }

          // ONE repair attempt. Prefer the cheap Lovable model; if only
          // RouteLLM is configured, repair on the same primary model instead.
          const repairModel = lovableKey ? CHEAP_REPAIR_MODEL : data.model;
          const repairKey = isRouteLLMModel(repairModel) ? routellmApiKey! : lovableKey!;
          modelUsed = repairModel;
          const parseErr = attempt.ok ? "invalid patch schema" : attempt.error.message;
          const repairMessages = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMsg },
            { role: "assistant", content: attempt.ok ? attempt.text.slice(0, 4000) : "(previous attempt failed to reach the gateway)" },
            { role: "user", content: `Your previous response was invalid: ${parseErr}. Return ONLY a valid JSON patch document matching the schema. No prose, no fences.` },
          ];
          const repair = await callGateway(repairKey, repairModel, repairMessages, requestId, request.signal);
          if (repair.ok) collected.push(repair.usage);

          if (!repair.ok) {
            await settleFailure(repair.error.code);
            return Response.json(
              { ok: false, error: repair.error.message, code: repair.error.code, fallbackUsed: true, model: modelUsed, requestId },
              { status: 200, headers: { "X-Request-Id": requestId } },
            );
          }
          const parsed2 = parsePatchResponse(repair.text);
          if (!parsed2.ok) {
            // Provider DID work on the repair attempt; charge failed status.
            await settleFailure("patch_invalid_after_repair");
            return Response.json(
              { ok: false, error: `Patch invalid after repair: ${parsed2.error}`, fallbackUsed: true, model: modelUsed, requestId },
              { status: 200, headers: { "X-Request-Id": requestId } },
            );
          }
          await settleSuccess();
          return Response.json({
            ok: true, patch: parsed2.patch, model: modelUsed, fallbackUsed: true,
            requestId, contextTier: ctx.tier, contextChars: ctx.chars, contextSavings: ctx.savings,
          }, { headers: { "X-Request-Id": requestId } });
        } catch (err) {
          const errorCode = err instanceof AiError ? err.code : "patch_internal";
          try { await settleFailure(errorCode); } catch { /* already settled */ }
          const aiErr = err instanceof AiError
            ? err
            : new AiError({
                code: "ai_internal", stage: "patch", requestId,
                message: err instanceof Error ? err.message : "Unexpected error.",
              });
          return aiErr.toResponse();
        }
      },
    },
  },
});

