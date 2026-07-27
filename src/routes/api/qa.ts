// Metered Obsidian QA route.
//
// One request = at most ONE provider call on the cheapest available
// Claude-family model. Rejects free/unresolved callers through the
// standard paid-operation gate (auth + Pro + credit reservation).
//
// Design invariants:
//   - POST only; strict JSON in/out.
//   - Bounded payload (see qaInputSchema below); rejects oversized inputs.
//   - No provider call, no charge when no Claude model is available.
//   - Exactly one provider attempt per request. No auto-escalation.
//   - Malformed provider response ⇒ structured envelope, still charges the
//     attempt so the caller can't spin the router.
//   - No raw secrets, no full provider bodies logged.

import { createFileRoute } from "@tanstack/react-router";
import { patchSchema } from "@/lib/patch-protocol";
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
  type QaRequestBody,
  type QaRouteSuccess,
  type QaRouteError,
} from "@/lib/qa-contract";
import type { z } from "zod";

export { qaInputSchema, type QaRequestBody, type QaRouteSuccess, type QaRouteError };

const SYSTEM_PROMPT = `You are Obsidian QA. Review a generated HTML build for user-visible defects. Produce a MINIMAL repair as a JSON Patch document (schema below). Never introduce off-page navigation. Same-document interactions only. Return STRICT JSON — no markdown, no prose.

Response schema:
{
  "verdict": "pass" | "repair" | "block",
  "confidence": 0..1,
  "defect_categories": ["nav-external", "parity-loss", ...],
  "explanation": "one short sentence",
  "expected_improvement": "one short sentence",
  "patch": null | { "summary": "...", "operations": [ ...patch ops... ] }
}

Patch ops (subset): replace_text, delete_text, insert_before, insert_after, replace_element_by_id, set_attribute, append_css_rule, append_script, remove_element_by_id, remove_attribute, add_class, remove_class, insert_child, update_inline_style, replace_css_rule, replace_script_block, rename_id, update_json_block. Prefer replace_text/set_attribute/append_css_rule for minimal repairs. At most 8 operations.`;

function parseQaJson(text: string): {
  verdict: "pass" | "repair" | "block";
  confidence: number;
  defectCategories: string[];
  explanation: string;
  expectedImprovement: string;
  patch: z.infer<typeof patchSchema> | null;
} | null {
  try {
    const t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const block = fence ? fence[1] : t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
    const j = JSON.parse(block) as {
      verdict?: string;
      confidence?: number;
      defect_categories?: unknown;
      explanation?: string;
      expected_improvement?: string;
      patch?: unknown;
    };
    const verdict =
      j.verdict === "pass" || j.verdict === "repair" || j.verdict === "block"
        ? j.verdict
        : "block";
    const confidence =
      typeof j.confidence === "number"
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
    if (j.patch && typeof j.patch === "object") {
      const parsed = patchSchema.safeParse(j.patch);
      if (parsed.success) patch = parsed.data;
      // If patch schema failed, we keep patch=null; verdict stays as reported
      // but the client will not receive a patch to apply.
    }
    return { verdict, confidence, defectCategories, explanation, expectedImprovement, patch };
  } catch {
    return null;
  }
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
            const body: QaRouteError = {
              ok: false,
              code: "qa_model_unavailable",
              message: resolution.reason === "no_routellm"
                ? "QA provider (RouteLLM) is not configured."
                : "No Claude-family model available in the current registry.",
              actualModel: null,
              requestId,
            };
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

          // Free-demo callers can never reach QA. requirePaidOperation
          // returns kind "free_demo" only when reservation happened via
          // demo cookie; QA doesn't accept demo cookies (no demo header).
          if (entitlement.kind === "free_demo") {
            const body: QaRouteError = {
              ok: false,
              code: "qa_model_unavailable",
              message: "QA is not available on the free demo.",
              actualModel: null,
              requestId,
            };
            return Response.json(body, { status: 200, headers: { "X-Request-Id": requestId } });
          }

          const routellmKey = process.env.ROUTELLM_API_KEY;
          if (!routellmKey || !isRouteLLMModel(model)) {
            // Redundant with resolver but preserves invariant.
            await settleFailure("qa_model_unavailable");
            const body: QaRouteError = {
              ok: false, code: "qa_model_unavailable",
              message: "QA provider is not configured.",
              actualModel: model, requestId,
            };
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
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: JSON.stringify(userPayload) },
            ],
          };

          let providerText = "";
          try {
            const { response } = await aiFetch(
              "https://routellm.abacus.ai/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${routellmKey}`,
                },
                body: JSON.stringify(body),
              },
              {
                breakerKey: `routellm/qa:${wireModel}`,
                stage: "patch",
                requestId,
                signal: request.signal,
                // Cost invariant: at most ONE physical provider attempt per QA
                // request. No auto-retry, no auto-escalation. Callers must not
                // spin on transient failures — the finalizer caches the block.
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
            const aiErr = err instanceof AiError
              ? err
              : new AiError({
                  code: "ai_internal", stage: "patch", requestId,
                  message: (err as Error)?.message,
                });
            await settleFailure(aiErr.code);
            return aiErr.toResponse();
          }

          const parsed = parseQaJson(providerText);
          if (!parsed) {
            await settleFailure("qa_bad_response");
            const body: QaRouteError = {
              ok: false, code: "qa_bad_response",
              message: "QA model returned a malformed response.",
              actualModel: model, requestId,
            };
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
            actualModel: model,
            fallbackUsed: false,
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
