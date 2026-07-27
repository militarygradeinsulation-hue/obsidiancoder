// Shared QA contract used by both the metered /api/qa route and the
// client-side finalizer. Keeping request/response schemas in one place
// prevents drift between the server route parser and the client parser.
//
// This module is client-safe: no server-only imports.
//
// Strict-by-default: every object is `.strict()` unless it is an
// explicitly-documented bounded record. Any unknown top-level or nested
// field is a hard rejection so a stray provider field cannot silently
// widen the contract.

import { z } from "zod";
import { patchSchema, type Patch } from "./patch-protocol";

// ---- Request -------------------------------------------------------------

const strategyEnum = z
  .enum(["deterministic", "ai-patch", "full-generation", "advisory"])
  .optional();

const violationSchema = z
  .object({ code: z.string().max(80), target: z.string().max(200).optional() })
  .strict();

// paritySummary.deltas is an explicitly-documented bounded numeric record.
// Cap keys, key length, and per-value range so it cannot become unbounded.
const paritySummaryDeltasSchema = z
  .record(z.string().max(80), z.number().int().min(-1_000_000).max(1_000_000))
  .refine((r) => Object.keys(r).length <= 32, {
    message: "paritySummary.deltas exceeds 32 keys",
  });

const paritySummarySchema = z
  .object({
    ok: z.boolean().optional(),
    blockers: z.array(z.string().max(200)).max(20).default([]),
    warnings: z.array(z.string().max(200)).max(20).default([]),
    deltas: paritySummaryDeltasSchema.optional(),
  })
  .strict();

const runtimeSummarySchema = z
  .object({
    errorCount: z.number().int().min(0).max(1000).default(0),
    overflowCount: z.number().int().min(0).max(1000).optional(),
    consoleBlockers: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

const pageManifestSchema = z
  .object({
    chars: z.number().int().min(0).max(10_000_000).optional(),
    headings: z.number().int().min(0).max(10_000).optional(),
    sections: z.number().int().min(0).max(10_000).optional(),
    buttons: z.number().int().min(0).max(10_000).optional(),
    links: z.number().int().min(0).max(10_000).optional(),
    forms: z.number().int().min(0).max(10_000).optional(),
    inputs: z.number().int().min(0).max(10_000).optional(),
    tables: z.number().int().min(0).max(10_000).optional(),
    images: z.number().int().min(0).max(10_000).optional(),
    ids: z.number().int().min(0).max(50_000).optional(),
    scripts: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const qaInputSchema = z
  .object({
    userRequest: z.string().max(800).default(""),
    taskType: z.string().max(64).optional(),
    strategy: strategyEnum,
    themeId: z.string().max(80).optional(),
    themeName: z.string().max(80).optional(),
    buildHash: z.string().max(64).optional(),
    pageManifest: pageManifestSchema.optional(),
    paritySummary: paritySummarySchema.optional(),
    runtimeSummary: runtimeSummarySchema.optional(),
    violations: z.array(violationSchema).max(40).default([]),
    excerpt: z.string().max(6000).default(""),
    failureHints: z.string().max(1000).optional(),
  })
  .strict();
export type QaRequestBody = z.infer<typeof qaInputSchema>;

// ---- Response ------------------------------------------------------------

const MAX_PATCH_OPS_QA = 8 as const;
export const QA_MAX_PATCH_OPS = MAX_PATCH_OPS_QA;

const qaPatchSchema = patchSchema.refine(
  (p) => p.operations.length <= MAX_PATCH_OPS_QA,
  { message: `QA patch must contain at most ${MAX_PATCH_OPS_QA} operations` },
);

export const qaSuccessSchema = z
  .object({
    ok: z.literal(true),
    verdict: z.enum(["pass", "repair", "block"]),
    confidence: z.number().min(0).max(1),
    defectCategories: z.array(z.string().max(80)).max(10).default([]),
    explanation: z.string().max(400).default(""),
    patch: qaPatchSchema.nullable(),
    expectedImprovement: z.string().max(400).default(""),
    actualModel: z.string().max(120),
    fallbackUsed: z.literal(false),
    /** True iff the route physically dispatched to the upstream provider. */
    providerInvoked: z.boolean(),
    requestId: z.string().max(80),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.verdict === "pass" || v.verdict === "block") && v.patch !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `verdict ${v.verdict} must have patch:null`,
        path: ["patch"],
      });
    }
    if (v.verdict === "repair" && v.patch === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "verdict repair requires a non-null patch",
        path: ["patch"],
      });
    }
  });
export type QaRouteSuccess = z.infer<typeof qaSuccessSchema>;

/** Normalised, exhaustive set of route/provider error codes. Callers must
 *  not invent new codes; adding one requires a policy version bump. */
export const QA_ERROR_CODES = [
  "qa_model_unavailable",
  "qa_bad_response",
  "qa_provider_error",
  "qa_route_error",
  "paywall",
] as const;
export type QaErrorCode = (typeof QA_ERROR_CODES)[number];

export const qaErrorSchema = z
  .object({
    ok: z.literal(false),
    code: z.enum(QA_ERROR_CODES),
    message: z.string().max(400),
    actualModel: z.string().max(120).nullable(),
    /** True iff the route physically dispatched to the upstream provider. */
    providerInvoked: z.boolean(),
    requestId: z.string().max(80),
  })
  .strict();
export type QaRouteError = z.infer<typeof qaErrorSchema>;

export const qaResponseSchema = z.union([qaSuccessSchema, qaErrorSchema]);
export type QaRouteResponse = QaRouteSuccess | QaRouteError;

// Re-export Patch so consumers only need this module.
export type { Patch };

/** Policy version — bump when validation/parity/nav-repair rules change so
 *  the finalizer cache invalidates automatically without a manual clear. */
export const QA_POLICY_VERSION = "2";
