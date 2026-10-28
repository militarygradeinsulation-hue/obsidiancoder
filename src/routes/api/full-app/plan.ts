import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveModel } from "@/lib/models";
import { buildProviderChain, runProviderChain } from "@/lib/provider-chain";
import { aiFetch } from "@/lib/ai-fetch";
import { readGuarded } from "@/lib/upstream-guard";
import { parseFullAppBlueprint } from "@/lib/full-app-blueprint";
import { requirePaidOperation, denialResponse, settleOperation } from "@/lib/credit-gate.server";
import { newRequestId } from "@/lib/ai-errors";
import {
  makeUsage,
  estimateUsdForCall,
  mergeUsage,
  parseUsageFromChatJson,
  type UsageRecord,
} from "@/lib/usage-record";

const inputSchema = z.object({
  idea: z.string().trim().min(8).max(8_000),
  projectName: z.string().trim().max(120).optional().default(""),
  currentDesignSummary: z.string().trim().max(4_000).optional().default(""),
  model: z.string().optional().transform(resolveModel),
});

const SYSTEM = `You are the Obsidian Full App Architect.
Turn a product idea into a concrete production-oriented application blueprint.

Return STRICT JSON only with exactly this shape:
{
  "version": 1,
  "name": "App name",
  "summary": "What this application does",
  "primaryUsers": ["user type"],
  "routes": [
    {
      "path": "/dashboard",
      "name": "Dashboard",
      "purpose": "Why this view exists",
      "authRequired": true,
      "primaryActions": ["action"]
    }
  ],
  "entities": [
    {
      "name": "projects",
      "purpose": "What the records represent",
      "ownership": "user",
      "fields": [
        {"name":"name","type":"text","required":true,"notes":""}
      ]
    }
  ],
  "sharedComponents": [
    {"name":"AppShell","purpose":"Shared layout","sharedAcross":["/dashboard"]}
  ],
  "auth": {
    "required": true,
    "methods": ["email_password"],
    "roles": [],
    "notes": ""
  },
  "storage": {
    "required": false,
    "privateByDefault": true,
    "uses": []
  },
  "serverFunctions": [
    {
      "name": "example-function",
      "purpose": "Server-only operation",
      "authRequired": true,
      "inputs": [],
      "outputs": []
    }
  ],
  "integrations": [
    {"name":"Resend","purpose":"Transactional email","secretRequired":true}
  ],
  "implementationOrder": ["First coherent milestone"],
  "acceptanceChecks": ["Concrete testable behavior"]
}

RULES:
- Design a real application, not a marketing-page outline.
- Keep scope proportional to the user's request. Do not invent enterprise complexity for a simple tool.
- Prefer user-owned data and explicit auth ownership boundaries.
- Any user-owned data entity must be compatible with Supabase RLS ownership by auth.uid().
- Only choose public ownership when the user actually needs public read access.
- Never put secret/service-role credentials in frontend code.
- External integrations that require secrets must be marked secretRequired=true and treated as disconnected until configured.
- Server functions should exist only for server-only behavior, secrets, webhooks, privileged validation, scheduled work, or third-party APIs that should not run in the browser.
- Routes should be implementable with the current React project. Avoid fake routes that have no meaningful user flow.
- Acceptance checks must be testable by browser/build/backend QA.
- Do not include markdown, commentary, or code fences.`;

export const Route = createFileRoute("/api/full-app/plan")({
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
          } catch {
            // Metering errors must not corrupt a valid planner result.
          }
        }

        try {
          const data = inputSchema.parse(await request.json());
          entitlement = await requirePaidOperation(request, "generate_html_patch", requestId);
          if (entitlement.kind === "denied" && entitlement.denial) {
            return denialResponse(entitlement.denial, requestId);
          }

          const attempts = buildProviderChain(data.model, process.env.LOVABLE_API_KEY);
          if (!attempts.length) {
            await finish(false, "architect_provider_unavailable");
            return Response.json({ error: "No AI architecture provider is configured." }, { status: 503 });
          }

          const messages = [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: [
                "PROJECT NAME: " + (data.projectName || "Untitled Full App"),
                "PRODUCT IDEA:",
                data.idea,
                data.currentDesignSummary ? "\nCURRENT VISUAL/PRODUCT CONTEXT:\n" + data.currentDesignSummary : "",
              ].filter(Boolean).join("\n"),
            },
          ];

          const outcome = await runProviderChain(attempts, async (attempt) => {
            try {
              const body = {
                model: attempt.wireModel,
                messages,
                stream: false,
                temperature: 0.15,
                ...(!attempt.routed ? { response_format: { type: "json_object" } } : {}),
              };
              const { response } = await aiFetch(attempt.url, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${attempt.key}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                signal: request.signal,
              }, {
                breakerKey: attempt.label,
                stage: "full-app-architect",
                requestId,
                signal: request.signal,
                maxAttempts: 1,
              });

              const guarded = await readGuarded(response, { expected: "application/json" });
              if (!guarded.ok) throw new Error("Architecture model response rejected.");
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
                operation: "generate_html_patch",
                model: usage?.model ?? attempt.wireModel,
                inputTokens: usage?.inputTokens ?? 0,
                outputTokens: usage?.outputTokens ?? 0,
                totalTokens: usage?.totalTokens ?? 0,
                estimatedCostUsd: estimate.usd,
                costBasis: estimate.basis,
                providerUsed: true,
                status: "committed",
              }));

              const blueprint = parseFullAppBlueprint(result.choices?.[0]?.message?.content ?? "");
              return { ok: true as const, value: { blueprint, model: attempt.wireModel } };
            } catch (error) {
              return { ok: false as const, error, isClientCancel: request.signal.aborted };
            }
          });

          if (!outcome.ok || !outcome.value) {
            await finish(false, "architect_generation_failed");
            return Response.json({ error: request.signal.aborted ? "Request cancelled." : "Could not generate a valid application blueprint." }, { status: 502 });
          }

          await finish(true);
          return Response.json({ ok: true, ...outcome.value, requestId }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          await finish(false, "architect_generation_error");
          return Response.json({
            error: error instanceof Error ? error.message.slice(0, 220) : "Application architecture planning failed.",
          }, { status: 400 });
        }
      },
    },
  },
});
