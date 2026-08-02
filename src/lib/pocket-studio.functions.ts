// Obsidian Pocket — Studio/Cinematic provider calls.
//
// Two metered server functions:
//   • planPocketConcepts  — at most ONE physical provider dispatch
//   • critiquePocketBuild — at most ONE physical provider dispatch
//
// Both go through the SAME entitlement/usage accounting as every other paid
// operation. There is no unmetered backdoor. Cache keys are derived
// server-side with SHA-256 from the exact bounded inputs, so a client can
// never force a hit or collide into another tenant's entry. Cache hits cost
// zero provider calls.

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requirePaidOperation } from "@/lib/credit-gate.server";
import { creditsRequiredEnvelope } from "@/lib/credit-gate";
import { newRequestId } from "@/lib/ai-errors";
import { sha256Hex, conceptCacheMaterial, critiqueCacheMaterial } from "@/lib/pocket-hardening";
import { runSinglePocketChat, parseJsonLoose } from "@/lib/pocket-studio-call";
import { POCKET_CRITIQUE_RUBRIC, parseCritique } from "@/lib/pocket-prompt";
import {
  planCache,
  critiqueCache,
  CONCEPT_POLICY_VERSION,
  CRITIQUE_POLICY_VERSION,
  PLAN_SYSTEM,
  PLAN_TIMEOUT_MS,
  PLAN_MAX_OUTPUT_TOKENS,
  CRITIQUE_TIMEOUT_MS,
  CRITIQUE_MAX_OUTPUT_TOKENS,
  CRITIQUE_HTML_LIMIT,
  settlePocketSuccess,
  settlePocketFailure,
  settleQuietly,
} from "@/lib/pocket-studio.server";

export type PlanConceptsResult =
  | { ok: true; rawJson: string; model: string; cached: boolean }
  | { ok: false; reason: "provider_failed" }
  | { paywall: ReturnType<typeof creditsRequiredEnvelope> };

export type CritiqueResult =
  | { ok: true; critiqueJson: string; model: string; cached: boolean }
  | { ok: false; reason: "provider_failed" }
  | { paywall: ReturnType<typeof creditsRequiredEnvelope> };

export const planPocketConcepts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        // Non-authoritative client hint; the real key is derived server-side.
        cacheKey: z.string().min(1).max(200).optional(),
        model: z.string().min(1).max(120),
        plannerPrompt: z.string().min(1).max(6000),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<PlanConceptsResult> => {
    const key = await sha256Hex(
      conceptCacheMaterial({
        plannerPrompt: data.plannerPrompt,
        model: data.model,
        policyVersion: CONCEPT_POLICY_VERSION,
      }),
    );
    const cached = planCache.get(key);
    if (cached) return { ok: true, rawJson: cached.rawJson, model: cached.model, cached: true };

    const requestId = newRequestId();
    const ent = await requirePaidOperation(getRequest(), "enhance_prompt", requestId);
    if (ent.kind === "denied" && ent.denial) return { paywall: ent.denial };

    const outcome = await runSinglePocketChat({
      model: data.model,
      system: PLAN_SYSTEM,
      user: data.plannerPrompt,
      maxOutputTokens: PLAN_MAX_OUTPUT_TOKENS,
      timeoutMs: PLAN_TIMEOUT_MS,
      requestId,
      tag: "pocket_plan",
    });

    if (!outcome.ok) {
      await settleQuietly(() => settlePocketFailure(ent, "enhance_prompt", outcome));
      return { ok: false, reason: "provider_failed" };
    }
    await settleQuietly(() =>
      settlePocketSuccess(ent, "enhance_prompt", outcome.provider, outcome.wireModel, outcome.usage),
    );

    const raw = parseJsonLoose(outcome.text);
    if (!raw) return { ok: false, reason: "provider_failed" };
    const rawJson = JSON.stringify(raw).slice(0, 40_000);
    planCache.set(key, { rawJson, model: outcome.wireModel });
    return { ok: true, rawJson, model: outcome.wireModel, cached: false };
  });

export const critiquePocketBuild = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        cacheKey: z.string().min(1).max(200).optional(),
        model: z.string().min(1).max(120),
        html: z.string().min(1).max(400_000),
        dnaSummary: z.string().max(3000),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CritiqueResult> => {
    const boundedHtml = data.html.slice(0, CRITIQUE_HTML_LIMIT);
    const key = await sha256Hex(
      critiqueCacheMaterial({
        html: boundedHtml,
        dnaSummary: data.dnaSummary,
        model: data.model,
        policyVersion: CRITIQUE_POLICY_VERSION,
      }),
    );
    const cached = critiqueCache.get(key);
    if (cached) {
      return { ok: true, critiqueJson: cached.critiqueJson, model: cached.model, cached: true };
    }

    const requestId = newRequestId();
    const ent = await requirePaidOperation(getRequest(), "enhance_prompt", requestId);
    if (ent.kind === "denied" && ent.denial) return { paywall: ent.denial };

    const outcome = await runSinglePocketChat({
      model: data.model,
      system: POCKET_CRITIQUE_RUBRIC,
      user: `DESIGN DNA:\n${data.dnaSummary}\n\nDOCUMENT:\n${boundedHtml}`,
      maxOutputTokens: CRITIQUE_MAX_OUTPUT_TOKENS,
      timeoutMs: CRITIQUE_TIMEOUT_MS,
      requestId,
      tag: "pocket_critique",
    });

    if (!outcome.ok) {
      await settleQuietly(() => settlePocketFailure(ent, "enhance_prompt", outcome));
      return { ok: false, reason: "provider_failed" };
    }
    await settleQuietly(() =>
      settlePocketSuccess(ent, "enhance_prompt", outcome.provider, outcome.wireModel, outcome.usage),
    );

    const raw = parseJsonLoose(outcome.text);
    if (!raw) return { ok: false, reason: "provider_failed" };
    const critique = parseCritique(raw);
    critique.policyVersion = CRITIQUE_POLICY_VERSION;
    const critiqueJson = JSON.stringify(critique).slice(0, 120_000);
    critiqueCache.set(key, { critiqueJson, model: outcome.wireModel });
    return { ok: true, critiqueJson, model: outcome.wireModel, cached: false };
  });
