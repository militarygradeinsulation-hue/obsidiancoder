// Metered Obsidian QA route.
//
// One request = at most ONE provider call on the cheapest available
// Claude-family model (or, for the owner session only, a fallback chain —
// see buildProviderChain). Rejects free/unresolved callers through the
// standard paid-operation gate (auth + Pro + credit reservation).
//
// Design invariants:
//   - POST only; strict JSON in/out (contract lives in qa-contract.ts).
//   - Bounded payload (see qaInputSchema); rejects oversized inputs.
//   - No provider call, no charge when no Claude model is available.
//   - At most one PROVIDER in the chain per request (no auto-escalation
//     across providers) — EXCEPT: if the chosen provider's response fails
//     to parse as the required JSON schema, exactly one corrective re-ask
//     is made to that SAME provider before giving up. This is a same-
//     provider retry to recover from a formatting slip, not escalation —
//     it never tries a second provider, and it happens once, server-side,
//     inside this one request. The caller cannot trigger it repeatedly;
//     it still charges honestly for whatever calls actually ran.
//   - Malformed provider response, even after the corrective re-ask,
//     ⇒ structured envelope, still charges the attempt(s) so the caller
//     can't spin the router.
//   - Every response carries providerInvoked honestly.

import { createFileRoute } from "@tanstack/react-router";
import { parseQaJson, type ParsedQa } from "@/lib/qa-json-parser";
import { aiFetch } from "@/lib/ai-fetch";
import { readGuarded } from "@/lib/upstream-guard";
import { AiError, newRequestId, sanitizeUpstreamMessage } from "@/lib/ai-errors";
import {
  requirePaidOperation,
  denialResponse,
  settleOperation,
  type EntitlementResult,
} from "@/lib/credit-gate.server";
import {
  makeUsage,
  mergeUsage,
  estimateUsdForCall,
  parseUsageFromChatJson,
  type UsageRecord,
} from "@/lib/usage-record";
import { stripRouteLLMPrefix, isRouteLLMModel } from "@/lib/models";
import {
  currentQaRegistrySnapshot,
  resolveCheapestClaudeModel,
} from "@/lib/qa-model-resolver";
import {
  qaInputSchema,
  QA_MAX_PATCH_OPS,
  type QaRequestBody,
  type QaRouteSuccess,
  type QaRouteError,
} from "@/lib/qa-contract";
import { routellmKeys, healthyRouteLLMKeys, markRouteLLMKeyDead, isRouteLLMKeyExhausted } from "@/lib/routellm-keys";
import {
  buildProviderChain,
  runProviderChain,
  chainFailureMessage,
  type ChainAttempt,
  type ChainAttemptResult,
} from "@/lib/provider-chain";

export { qaInputSchema, type QaRequestBody, type QaRouteSuccess, type QaRouteError };

const SYSTEM_PROMPT = `You are Obsidian QA. Review a generated HTML build for user-visible defects. Produce a MINIMAL repair using the Obsidian patch protocol (schema below). Never introduce off-page navigation. Same-document interactions only. Return STRICT JSON — no markdown, no prose.

Response schema:
{
  "verdict": "pass" | "repair" | "block",
  "confidence": 0..1,
  "defect_categories": ["nav-external", "parity-loss", ...],
  "explanation": "one short sentence",
  "expected_improvement": "one short sentence",
  "patch": null | { "summary": "...", "operations": [ ...patch ops... ] }
}

Rules:
- verdict "pass" or "block" ⇒ patch MUST be null.
- verdict "repair" ⇒ patch MUST be a valid Obsidian patch with 1..${QA_MAX_PATCH_OPS} operations.

Patch ops (subset): replace_text, delete_text, insert_before, insert_after, replace_element_by_id, set_attribute, append_css_rule, append_script, remove_element_by_id, remove_attribute, add_class, remove_class, insert_child, update_inline_style, replace_css_rule, replace_script_block, rename_id, update_json_block. Prefer replace_text/set_attribute/append_css_rule for minimal repairs. At most ${QA_MAX_PATCH_OPS} operations.

Your entire response must be exactly one JSON object and nothing else. Do not wrap it in a code fence. Do not add commentary before or after it. Do not explain your reasoning outside the "explanation" field. The first character of your response must be { and the last character must be }.`;


function errBody(
  code: QaRouteError["code"],
  message: string,
  actualModel: string | null,
  providerInvoked: boolean,
  requestId: string,
): QaRouteError {
  return {
    ok: false,
    code,
    message: message.slice(0, 400),
    actualModel,
    providerInvoked,
    requestId,
  };
}

export const Route = createFileRoute("/api/qa")({
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
          let data: QaRequestBody;
          try {
            data = qaInputSchema.parse(await request.json());
          } catch (err) {
            throw new AiError({
              code: "ai_bad_request", stage: "validate", requestId,
              message: err instanceof Error ? err.message : "Bad input.",
            });
          }

          // Resolve model FIRST — an unavailable Claude means we never
          // enter the paid gate and never charge.
          const snap = currentQaRegistrySnapshot();
          const resolution = resolveCheapestClaudeModel(snap);
          if (!resolution.model) {
            const body = errBody(
              "qa_model_unavailable",
              resolution.reason === "no_routellm"
                ? "QA provider (RouteLLM) is not configured."
                : "No Claude-family model available in the current registry.",
              null, false, requestId,
            );
            return Response.json(body, {
              status: 200,
              headers: { "X-Request-Id": requestId },
            });
          }
          const model = resolution.model;

          entitlement = await requirePaidOperation(request, "generate_html_patch", requestId);
          if (entitlement.kind === "denied" && entitlement.denial) {
            return denialResponse(entitlement.denial, requestId);
          }
          if (entitlement.kind === "free_demo") {
            const body = errBody(
              "qa_model_unavailable",
              "QA is not available on the free demo.",
              null, false, requestId,
            );
            return Response.json(body, { status: 200, headers: { "X-Request-Id": requestId } });
          }

          // QA is metered at exactly one physical provider attempt per
          // request (see the maxAttempts: 1 note below) and is scoped to
          // Claude-family models by design — this is not the same
          // Google/RouteLLM/Lovable chain generate.ts and Patch use, and it
          // should not become one: substituting a different model family
          // for "Claude reviews this output" would be a real behavior
          // change, not a resilience fix, and tripling the physical calls
          // per QA request would break the explicit cost invariant below.
          // What WAS a real bug: routellmKey() returns one cached key that
          // may itself be currently dead while other configured keys are
          // still healthy, failing QA outright even though working access
          // exists. Picking from the healthy pool instead fixes exactly
          // that case without touching either invariant.
          const routellmApiKey = healthyRouteLLMKeys()[0];
          if (!routellmApiKey || !isRouteLLMModel(model)) {
            await settleFailure("qa_model_unavailable");
            const allDead = routellmKeys().length > 0 && !routellmApiKey;
            const body = errBody(
              "qa_model_unavailable",
              allDead
                ? "QA provider credits exhausted on every configured ChatLLM key."
                : "QA provider is not configured.",
              model, false, requestId,
            );
            return Response.json(body, { status: 200, headers: { "X-Request-Id": requestId } });
          }

          const userPayload = {
            user_request: data.userRequest.slice(0, 800),
            task_type: data.taskType ?? "unknown",
            strategy: data.strategy ?? "unknown",
            theme: { id: data.themeId ?? null, name: data.themeName ?? null },
            build_hash: data.buildHash ?? null,
            page_manifest: data.pageManifest ?? {},
            parity_summary: data.paritySummary ?? {},
            runtime_summary: data.runtimeSummary ?? {},
            violations: data.violations.slice(0, 40),
            failure_hints: data.failureHints ?? "",
            excerpt: data.excerpt.slice(0, 6000),
          };
          const qaMessages = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(userPayload) },
          ];

          let providerText = "";
          let actualModel: string = model;

          // One physical attempt against one provider (attempt), building
          // the request, calling it, and parsing the response. Shared by
          // both paths below so the request/response handling is identical
          // regardless of how many attempts the caller is allowed to make.
          const callQaOnce = async (
            attempt: ChainAttempt,
            overrideMessages?: typeof qaMessages,
          ): Promise<ChainAttemptResult<{ text: string; model: string }>> => {
            try {
              const body: Record<string, unknown> = {
                model: attempt.wireModel,
                stream: false,
                // OpenAI-compatible; request strict JSON so the model won't
                // wrap in prose. Our parser is strict regardless.
                response_format: { type: "json_object" },
                messages: overrideMessages ?? qaMessages,
              };
              const { response } = await aiFetch(
                attempt.url,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${attempt.key}`,
                  },
                  body: JSON.stringify(body),
                },
                {
                  breakerKey: attempt.label,
                  stage: "patch",
                  requestId,
                  signal: request.signal,
                  maxAttempts: 1,
                },
              );
              const guarded = await readGuarded(response, { expected: "application/json" });
              if (!guarded.ok) {
                throw new AiError({
                  code: guarded.reason === "empty" ? "ai_upstream_empty" : "ai_upstream_malformed",
                  stage: "patch", requestId,
                  message: sanitizeUpstreamMessage(guarded.sample, "QA upstream rejected."),
                });
              }
              let j: unknown;
              try { j = JSON.parse(guarded.text); }
              catch {
                throw new AiError({
                  code: "ai_upstream_malformed", stage: "patch", requestId,
                  message: "Malformed QA gateway response.",
                });
              }
              const parsedUsage = parseUsageFromChatJson(j);
              const modelFromProvider = parsedUsage?.model;
              const resolvedModel = typeof modelFromProvider === "string" && modelFromProvider.length > 0
                ? modelFromProvider.slice(0, 120)
                : attempt.wireModel;
              const est = estimateUsdForCall({
                model: parsedUsage?.model ?? attempt.wireModel,
                inputTokens: parsedUsage?.inputTokens ?? 0,
                outputTokens: parsedUsage?.outputTokens ?? 0,
                providerUsed: true,
              });
              collected.push(makeUsage({
                provider: attempt.google ? "google" : attempt.routed ? "routellm" : "lovable",
                model: parsedUsage?.model ?? attempt.wireModel,
                operation: "generate_html_patch",
                inputTokens: parsedUsage?.inputTokens ?? 0,
                outputTokens: parsedUsage?.outputTokens ?? 0,
                totalTokens: parsedUsage?.totalTokens ?? 0,
                estimatedCostUsd: est.usd,
                costBasis: est.basis,
                providerUsed: true,
                status: "committed",
                meta: { qa: true },
              }));
              const content = (j as { choices?: Array<{ message?: { content?: string } }> })
                .choices?.[0]?.message?.content ?? "";
              return { ok: true, value: { text: String(content), model: resolvedModel } };
            } catch (err) {
              // Same rule as everywhere else in the chain: only mark a key
              // dead for genuine billing exhaustion.
              if (attempt.routed && isRouteLLMKeyExhausted(err)) markRouteLLMKeyDead(attempt.key);
              const isClientCancel = err instanceof AiError && err.code === "ai_cancelled";
              return { ok: false, error: err, isClientCancel };
            }
          };

          const wireModel = stripRouteLLMPrefix(model);
          const primaryAttempt: ChainAttempt = {
            key: routellmApiKey, url: "https://routellm.abacus.ai/v1/chat/completions",
            wireModel, label: `routellm/qa:${wireModel}`, routed: true,
          };

          // Regular Pro accounts: exactly the same one-physical-attempt,
          // Claude-only behavior as before this change — unmodified cost
          // profile, unmodified model guarantee.
          //
          // The owner/admin session specifically: it already bypasses every
          // internal credit cap (isOwnerSession() short-circuits
          // requirePaidOperation to kind:"owner" with no reservation at
          // all), so the one wall actually left standing between it and
          // truly unrestricted builds is QA hard-failing when the real
          // Abacus account itself is out of credits. Give the owner path
          // the same Google -> healthy RouteLLM -> Lovable-equivalent chain
          // Patch and generate.ts already use, so a QA repair on an owner
          // build survives RouteLLM being empty instead of hard-blocking
          // with "no remaining credits". Paying customers are unaffected —
          // this branch never runs for them.
          const isOwner = entitlement.kind === "owner";
          const lovableKey = process.env.LOVABLE_API_KEY;
          const chain = isOwner ? buildProviderChain(model, lovableKey) : [primaryAttempt];

          const outcome = await runProviderChain(chain, callQaOnce);
          if (outcome.ok && outcome.value) {
            providerText = outcome.value.text;
            actualModel = outcome.value.model;
          } else {
            const detail = sanitizeUpstreamMessage(
              outcome.lastError instanceof Error ? outcome.lastError.message : undefined,
              "QA upstream rejected.",
            );
            const { message } = chainFailureMessage(outcome, chain, detail);
            const aiErr = outcome.lastError instanceof AiError
              ? outcome.lastError
              : new AiError({ code: "ai_internal", stage: "patch", requestId, message });
            await settleFailure(aiErr.code);
            const body = errBody(
              "qa_provider_error",
              isOwner ? message : aiErr.message,
              model, true, requestId,
            );
            return Response.json(body, { status: 200, headers: { "X-Request-Id": requestId } });
          }

          let parsed = parseQaJson(providerText);
          let usedCorrectiveRetry = false;

          // The provider call itself succeeded (outcome.ok is true here),
          // but the model's TEXT didn't parse as the required JSON schema.
          // This is a formatting slip, not a provider failure, so it gets
          // a different remedy than the chain above: one corrective re-ask
          // to the SAME provider that just responded, showing it exactly
          // what it sent and asking for strict JSON only. Bounded to
          // exactly one attempt — if that also fails to parse, give up
          // honestly rather than looping.
          if (!parsed) {
            const correctiveMessages: typeof qaMessages = [
              ...qaMessages,
              { role: "assistant", content: providerText.slice(0, 4000) },
              {
                role: "user",
                content:
                  "That response could not be parsed as valid JSON matching the required schema. " +
                  "Return ONLY the corrected JSON object — no markdown code fence, no prose, " +
                  "nothing before the opening { or after the closing }.",
              },
            ];
            const retryResult = await callQaOnce(outcome.usedAttempt!, correctiveMessages);
            if (retryResult.ok) {
              const retryParsed = parseQaJson(retryResult.value.text);
              if (retryParsed) {
                parsed = retryParsed;
                providerText = retryResult.value.text;
                actualModel = retryResult.value.model;
                usedCorrectiveRetry = true;
                console.warn(`[qa] corrective retry recovered a malformed response (requestId=${requestId}, model=${actualModel})`);
              }
            } else if (outcome.usedAttempt?.routed && isRouteLLMKeyExhausted(retryResult.error)) {
              // Same billing-exhaustion rule as everywhere else — the retry
              // is still a real provider call and can still hit this.
              markRouteLLMKeyDead(outcome.usedAttempt.key);
            }
          }

          if (!parsed) {
            await settleFailure("qa_bad_response");
            const body = errBody(
              "qa_bad_response",
              "QA model returned a malformed response, and the corrective retry also failed to parse.",
              actualModel, true, requestId,
            );
            return Response.json(body, { status: 200, headers: { "X-Request-Id": requestId } });
          }

          await settleSuccess();
          const success: QaRouteSuccess = {
            ok: true,
            verdict: parsed.verdict,
            confidence: parsed.confidence,
            defectCategories: parsed.defectCategories,
            explanation: parsed.explanation,
            patch: parsed.patch,
            expectedImprovement: parsed.expectedImprovement,
            actualModel,
            fallbackUsed: false,
            providerInvoked: true,
            requestId,
          };
          return Response.json(success, {
            status: 200,
            headers: { "X-Request-Id": requestId },
          });
        } catch (err) {
          const errorCode = err instanceof AiError ? err.code : "qa_internal";
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
