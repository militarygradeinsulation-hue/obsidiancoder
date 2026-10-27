// AI-suggested multi-file edits. Never runs generated code or applies an edit.
// Same paid patch entitlement and provider fallback as the Studio patch route.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveModel } from "@/lib/models";
import { isEditableAppPath, parseAppEditPlan } from "@/lib/full-app-edits";
import { buildProviderChain, runProviderChain } from "@/lib/provider-chain";
import { aiFetch } from "@/lib/ai-fetch";
import { readGuarded } from "@/lib/upstream-guard";
import { newRequestId } from "@/lib/ai-errors";
import { requirePaidOperation, denialResponse, settleOperation } from "@/lib/credit-gate.server";
import { makeUsage, estimateUsdForCall, mergeUsage, parseUsageFromChatJson, type UsageRecord } from "@/lib/usage-record";

const inputSchema = z.object({
  prompt: z.string().trim().min(3).max(10_000),
  files: z.record(z.string(), z.string().max(50_000)),
  selectedPath: z.string().max(180).optional(),
  memory: z.string().max(2000).optional().default(""),
  model: z.string().optional().transform(resolveModel),
});
const SYSTEM = `You edit a real multi-file React + TypeScript project. Return ONLY JSON:
{"summary":"plain English summary","edits":[{"action":"write","path":"src/App.tsx","content":"COMPLETE REPLACEMENT FILE"}]}
or {"action":"delete","path":"src/components/Unused.tsx"}.
Never return markdown fences or partial snippets. All writes replace ONE whole file.
Keep auth, database ownership, existing features and component imports working.
Only paths under src/App.tsx, src/styles.css, src/components/..., src/pages/...,\nsrc/hooks/..., src/features/..., src/services/..., src/context/..., src/lib/..., and
supabase/migrations/YYYYMMDDHHMMSS_name.sql and supabase/functions/<name>/index.ts are allowed. NEVER edit src/lib/supabase.ts, src/main.tsx,
src/generated-design.ts, any .env file or package config. Never insert secrets.
Do not fabricate API keys, claim a database is already provisioned, or pretend
SQL migrations have been executed. SQL and Edge Function changes must be reviewed and deployed explicitly; they are never executed by this AI endpoint.
Maximum eight distinct files. Preserve functional behavior and accessibility.`;

export const Route = createFileRoute("/api/full-app/edits")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = newRequestId();
        let entitlement: Awaited<ReturnType<typeof requirePaidOperation>> | null = null;
        const charges: UsageRecord[] = [];
        let settled = false;
        async function finish(ok: boolean, code?: string) {
          if (settled || !entitlement) return;
          settled = true;
          try {
            if (!charges.length) {
              await settleOperation(entitlement, { kind: "no_provider", errorCode: code });
            } else {
              const usage = mergeUsage("generate_html_patch", charges);
              await settleOperation(entitlement, ok
                ? { kind: "success", usage }
                : { kind: "failed_with_usage", errorCode: code, usage: { ...usage, status: "failed", errorCode: code } });
            }
          } catch { /* a settlement error should not alter a model result */ }
        }
        try {
          const data = inputSchema.parse(await request.json());
          const entries = Object.entries(data.files);
          if (entries.length > 35) return Response.json({ error: "Too many context files." }, { status: 413 });
          if (data.selectedPath && !isEditableAppPath(data.selectedPath))
            return Response.json({ error: "Selected file is protected or invalid." }, { status: 400 });
          for (const [path, source] of entries) {
            if (!isEditableAppPath(path) || typeof source !== "string")
              return Response.json({ error: "Unsafe context file path." }, { status: 400 });
          }
          const context = entries.map(([path, source]) => `FILE: ${path}\n${source}\nEND FILE`).join("\n\n");
          if (context.length > 55_000) return Response.json({ error: "Too much source context. Select fewer files." }, { status: 413 });

          entitlement = await requirePaidOperation(request, "generate_html_patch", requestId);
          if (entitlement.kind === "denied" && entitlement.denial)
            return denialResponse(entitlement.denial, requestId);
          const attempts = buildProviderChain(data.model, process.env.LOVABLE_API_KEY);
          if (!attempts.length) {
            await finish(false, "ai_provider_unavailable");
            return Response.json({ error: "No AI coding provider configured." }, { status: 503 });
          }
          const messages = [
            { role: "system", content: SYSTEM },
            { role: "user", content: `REQUEST:\n${data.prompt}\n\nSELECTED FILE: ${data.selectedPath ?? "none"}\nPROJECT MEMORY: ${data.memory}\n\nCURRENT SOURCE:\n${context}` },
          ];
          const outcome = await runProviderChain(attempts, async (attempt) => {
            try {
              const body = { model: attempt.wireModel, messages, stream: false,
                ...(!attempt.routed ? { response_format: { type: "json_object" } } : {}) };
              const { response } = await aiFetch(attempt.url, {
                method: "POST", headers: { Authorization: `Bearer ${attempt.key}`, "Content-Type": "application/json" },
                body: JSON.stringify(body), signal: request.signal,
              }, { breakerKey: attempt.label, stage: "patch", requestId, signal: request.signal, maxAttempts: 1 });
              const guarded = await readGuarded(response, { expected: "application/json" });
              if (!guarded.ok) throw new Error("Model response rejected.");
              const result = JSON.parse(guarded.text) as {
                choices?: Array<{ message?: { content?: string } }>;
              };
              const usage = parseUsageFromChatJson(result);
              const estimate = estimateUsdForCall({
                model: usage?.model ?? attempt.wireModel,
                inputTokens: usage?.inputTokens ?? 0,
                outputTokens: usage?.outputTokens ?? 0,
                providerUsed: true,
              });
              charges.push(makeUsage({
                provider: attempt.routed ? "routellm" : attempt.google ? "google" : "lovable",
                operation: "generate_html_patch", model: usage?.model ?? attempt.wireModel,
                inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0,
                totalTokens: usage?.totalTokens ?? 0, estimatedCostUsd: estimate.usd,
                costBasis: estimate.basis, providerUsed: true, status: "committed",
              }));
              const plan = parseAppEditPlan(result.choices?.[0]?.message?.content ?? "");
              return { ok: true as const, value: { plan, model: attempt.wireModel } };
            } catch (err) {
              return { ok: false as const, error: err, isClientCancel: request.signal.aborted };
            }
          });
          if (!outcome.ok || !outcome.value) {
            await finish(false, "full_app_generation_failed");
            return Response.json({ error: request.signal.aborted ? "Request cancelled." : "No provider returned a valid multi-file edit plan." }, { status: 502 });
          }
          await finish(true);
          return Response.json({ ok: true, ...outcome.value, requestId }, { headers: { "Cache-Control": "no-store" } });
        } catch (err) {
          await finish(false, "full_app_generation_error");
          return Response.json({ error: err instanceof Error ? err.message.slice(0, 180) : "Multi-file edit failed." }, { status: 400 });
        }
      },
    },
  },
});
