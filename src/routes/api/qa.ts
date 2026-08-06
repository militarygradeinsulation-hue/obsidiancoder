// Metered Obsidian QA route.
//
// One request = at most ONE provider call on the cheapest available
// Claude-family model. Rejects free/unresolved callers through the
// standard paid-operation gate (auth + Pro + credit reservation).
//
// Design invariants:
//   - POST only; strict JSON in/out (contract lives in qa-contract.ts).
//   - Bounded payload (see qaInputSchema); rejects oversized inputs.
//   - No provider call, no charge when no Claude model is available.
//   - Exactly one provider attempt per request. No auto-escalation.
//   - Malformed provider response ⇒ structured envelope, still charges
//     the attempt so the caller can't spin the router.
//   - Every response carries providerInvoked honestly.

import { createFileRoute } from "@tanstack/react-router";
import { patchSchema, MAX_OPS } from "@/lib/patch-protocol";
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
import type { z } from "zod";
import { routellmKeys, healthyRouteLLMKeys, markRouteLLMKeyDead, isRouteLLMKeyExhausted } from "@/lib/routellm-keys";

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

Patch ops (subset): replace_text, delete_text, insert_before, insert_after, replace_element_by_id, set_attribute, append_css_rule, append_script, remove_element_by_id, remove_attribute, add_class, remove_class, insert_child, update_inline_style, replace_css_rule, replace_script_block, rename_id, update_json_block. Prefer replace_text/set_attribute/append_css_rule for minimal repairs. At most ${QA_MAX_PATCH_OPS} operations.`;

type ParsedQa = {
  verdict: "pass" | "repair" | "block";
  confidence: number;
  defectCategories: string[];
  explanation: string;
  expectedImprovement: string;
  patch: z.infer<typeof patchSchema> | null;
};

/** Strict parser: returns null on ANY nonconformance. Callers must treat
 *  null as qa_bad_response and never coerce. */
function parseQaJson(text: string): ParsedQa | null {
  let block: string;
  try {
    const t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    block = fence ? fence[1] : t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
    if (!block) return null;
  } catch { return null; }

  let j: {
    verdict?: unknown; confidence?: unknown; defect_categories?: unknown;
    explanation?: unknown; expected_improvement?: unknown; patch?: unknown;
  };
  try { j = JSON.parse(block); } catch { return null; }

  // Strict verdict — reject unknown, do not coerce.
  if (j.verdict !== "pass" && j.verdict !== "repair" && j.verdict !== "block") return null;
  const verdict = j.verdict;

  const confidence =
    typeof j.confidence === "number" && Number.isFinite(j.confidence)
      ? Math.max(0, Math.min(1, j.confidence))
      : 0.4;

  const defectCategories = Array.isArray(j.defect_categories)
    ? j.defect_categories.slice(0, 10).map((x) => String(x).slice(0, 80))
    : [];
  const explanation =
    typeof j.explanation === "string" ? j.explanation.slice(0, 400) : "";
  const expectedImprovement =
    typeof j.expected_improvement === "string" ? j.expected_improvement.slice(0, 400) : "";

  let patch: z.infer<typeof patchSchema> | null = null;
  if (j.patch !== null && j.patch !== undefined) {
    if (typeof j.patch !== "object") return null;
    const parsed = patchSchema.safeParse(j.patch);
    if (!parsed.success) return null;
    if (parsed.data.operations.length > QA_MAX_PATCH_OPS) return null;
    if (parsed.data.operations.length > MAX_OPS) return null;
    patch = parsed.data;
  }

  // Enforce verdict / patch consistency here so downstream code
  // does not need to double-check.
  if ((verdict === "pass" || verdict === "block") && patch !== null) {
    // Ignore any patch on pass/block per contract.
    patch = null;
  }
  if (verdict === "repair" && patch === null) return null;

  return { verdict, confidence, defectCategories, explanation, expectedImprovement, patch };
}

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

          const wireModel = stripRouteLLMPrefix(model);
          const body: Record<string, unknown> = {
            model: wireModel,
            stream: false,
            // RouteLLM is OpenAI-compatible; request strict JSON so the
            // model won't wrap in prose. Our parser is strict regardless.
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: JSON.stringify(userPayload) },
            ],
          };

          let providerText = "";
          let actualModel: string = model;
          try {
            const { response } = await aiFetch(
              "https://routellm.abacus.ai/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${routellmApiKey}`,
                },
                body: JSON.stringify(body),
              },
              {
                breakerKey: `routellm/qa:${wireModel}`,
                stage: "patch",
                requestId,
                signal: request.signal,
                // Cost invariant: at most ONE physical provider attempt per QA
                // request. No auto-retry, no auto-escalation.
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
            if (typeof modelFromProvider === "string" && modelFromProvider.length > 0) {
              actualModel = modelFromProvider.slice(0, 120);
            }
            const est = estimateUsdForCall({
              model: parsedUsage?.model ?? wireModel,
              inputTokens: parsedUsage?.inputTokens ?? 0,
              outputTokens: parsedUsage?.outputTokens ?? 0,
              providerUsed: true,
            });
            collected.push(makeUsage({
              provider: "routellm",
              model: parsedUsage?.model ?? wireModel,
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
            providerText = String(content);
          } catch (err) {
            // Same rule as everywhere else in the chain: only mark a key
            // dead for genuine billing exhaustion. QA never did this at
            // all before — a key that ran out of credits stayed in the
            // healthy pool for other QA/generate/patch calls until its
            // 30-minute window happened to expire on its own.
            if (isRouteLLMKeyExhausted(err)) markRouteLLMKeyDead(routellmApiKey);
            const aiErr = err instanceof AiError
              ? err
              : new AiError({
                  code: "ai_internal", stage: "patch", requestId,
                  message: (err as Error)?.message,
                });
            await settleFailure(aiErr.code);
            const body = errBody(
              "qa_provider_error",
              aiErr.message,
              model, true, requestId,
            );
            return Response.json(body, { status: 200, headers: { "X-Request-Id": requestId } });
          }

          const parsed = parseQaJson(providerText);
          if (!parsed) {
            await settleFailure("qa_bad_response");
            const body = errBody(
              "qa_bad_response",
              "QA model returned a malformed response.",
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
