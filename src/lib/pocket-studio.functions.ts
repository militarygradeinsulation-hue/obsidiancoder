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
import { requirePaidOperation, settleOperation } from "@/lib/credit-gate.server";
import type { EntitlementResult } from "@/lib/credit-gate.server";
import { creditsRequiredEnvelope } from "@/lib/credit-gate";
import { makeUsage, estimateUsdForCall, MIN_CALL_COST_USD } from "@/lib/usage-record";
import { newRequestId } from "@/lib/ai-errors";
import {
  LruCache,
  sha256Hex,
  conceptCacheMaterial,
  critiqueCacheMaterial,
} from "@/lib/pocket-hardening";
import {
  runSinglePocketChat,
  parseJsonLoose,
  type PocketChatOutcome,
  type PocketProviderName,
} from "@/lib/pocket-studio-call";
import {
  POCKET_CRITIQUE_RUBRIC,
  POCKET_CRITIQUE_POLICY_VERSION,
  parseCritique,
} from "@/lib/pocket-prompt";
import { POCKET_CONCEPT_VERSION } from "@/lib/pocket-concept";

/* --------------------- server-side LRU caches --------------------- */

const CACHE_MAX = 64;
const planCache = new LruCache<{ rawJson: string; model: string }>(CACHE_MAX);
const critiqueCache = new LruCache<{ critiqueJson: string; model: string }>(CACHE_MAX);

const CONCEPT_POLICY_VERSION = `pocket-concept-v${POCKET_CONCEPT_VERSION}`;

const PLAN_TIMEOUT_MS = 30_000;
const CRITIQUE_TIMEOUT_MS = 45_000;
const PLAN_MAX_OUTPUT_TOKENS = 2_000;
const CRITIQUE_MAX_OUTPUT_TOKENS = 4_000;

/* ------------------------- accounting ----------------------------- */

async function settleSuccess(
  ent: EntitlementResult,
  operation: "enhance_prompt" | "generate_html",
  provider: PocketProviderName,
  model: string,
  usage: Extract<PocketChatOutcome, { ok: true }>["usage"],
) {
  const est = estimateUsdForCall({
    model: usage?.model ?? model,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    providerUsed: true,
  });
  await settleOperation(ent, {
    kind: "success",
    usage: makeUsage({
      provider,
      model: usage?.model ?? model,
      operation,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      actualCostUsd: null,
      estimatedCostUsd: est.usd,
      costBasis: est.basis,
      providerUsed: true,
      status: "committed",
    }),
  });
}

/**
 * Settle a failed logical call. `no_provider` is valid ONLY when nothing was
 * dispatched; anything that reached the wire settles as failed-with-usage at
 * the per-call minimum.
 */
async function settleFailure(
  ent: EntitlementResult,
  operation: "enhance_prompt" | "generate_html",
  outcome: Extract<PocketChatOutcome, { ok: false }>,
) {
  if (!outcome.providerStarted) {
    await settleOperation(ent, { kind: "no_provider", errorCode: outcome.errorCode });
    return;
  }
  await settleOperation(ent, {
    kind: "failed_with_usage",
    errorCode: outcome.errorCode,
    usage: makeUsage({
      provider: outcome.provider ?? "lovable",
      model: outcome.wireModel,
      operation,
      providerUsed: true,
      status: "failed",
      estimatedCostUsd: MIN_CALL_COST_USD,
      costBasis: "minimum",
      errorCode: outcome.errorCode,
      meta: { phase: "pocket_attempt" },
    }),
  });
}

/** Settlement must never mask the caller's real result. */
async function settleQuietly(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {
    /* the pending row stays recoverable; never throw over the result */
  }
}

/* ------------------------- concept planning ------------------------- */

const planInput = z.object({
  // Non-authoritative client hint. Retained for compatibility/telemetry only:
  // the real cache key is derived server-side.
  cacheKey: z.string().min(1).max(200).optional(),
  model: z.string().min(1).max(120),
  plannerPrompt: z.string().min(1).max(6000),
});

export type PlanConceptsResult =
  | { ok: true; rawJson: string; model: string; cached: boolean }
  | { ok: false; reason: "provider_failed" }
  | { paywall: ReturnType<typeof creditsRequiredEnvelope> };

const PLAN_SYSTEM = "You return STRICT JSON only. No prose. No markdown fences.";

export const planPocketConcepts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => planInput.parse(d))
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
      await settleQuietly(() => settleFailure(ent, "enhance_prompt", outcome));
      return { ok: false, reason: "provider_failed" };
    }

    await settleQuietly(() =>
      settleSuccess(ent, "enhance_prompt", outcome.provider, outcome.wireModel, outcome.usage),
    );

    const raw = parseJsonLoose(outcome.text);
    if (!raw) return { ok: false, reason: "provider_failed" };
    // Cache only the bounded parsed decision — never the raw prompt or HTML.
    const rawJson = JSON.stringify(raw).slice(0, 40_000);
    planCache.set(key, { rawJson, model: outcome.wireModel });
    return { ok: true, rawJson, model: outcome.wireModel, cached: false };
  });

/* ---------------------------- critique ---------------------------- */

const critiqueInput = z.object({
  cacheKey: z.string().min(1).max(200).optional(),
  model: z.string().min(1).max(120),
  html: z.string().min(1).max(400_000),
  dnaSummary: z.string().max(3000),
});

export type CritiqueResult =
  | { ok: true; critiqueJson: string; model: string; cached: boolean }
  | { ok: false; reason: "provider_failed" }
  | { paywall: ReturnType<typeof creditsRequiredEnvelope> };

const CRITIQUE_HTML_LIMIT = 240_000;

export const critiquePocketBuild = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => critiqueInput.parse(d))
  .handler(async ({ data }): Promise<CritiqueResult> => {
    const boundedHtml = data.html.slice(0, CRITIQUE_HTML_LIMIT);
    const key = await sha256Hex(
      critiqueCacheMaterial({
        html: boundedHtml,
        dnaSummary: data.dnaSummary,
        model: data.model,
        policyVersion: POCKET_CRITIQUE_POLICY_VERSION,
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
      await settleQuietly(() => settleFailure(ent, "enhance_prompt", outcome));
      return { ok: false, reason: "provider_failed" };
    }

    await settleQuietly(() =>
      settleSuccess(ent, "enhance_prompt", outcome.provider, outcome.wireModel, outcome.usage),
    );

    const raw = parseJsonLoose(outcome.text);
    if (!raw) return { ok: false, reason: "provider_failed" };
    const critique = parseCritique(raw);
    critique.policyVersion = POCKET_CRITIQUE_POLICY_VERSION;
    const critiqueJson = JSON.stringify(critique).slice(0, 120_000);
    critiqueCache.set(key, { critiqueJson, model: outcome.wireModel });
    return { ok: true, critiqueJson, model: outcome.wireModel, cached: false };
  });
