// Shared QA contract used by both the metered /api/qa route and the
// client-side finalizer. Keeping request/response schemas in one place
// prevents drift between the server route parser and the client parser.
//
// This module is client-safe: no server-only imports. Both the route and
// the client adapter import from here.

import { z } from "zod";
import { patchSchema, type Patch } from "./patch-protocol";

// ---- Request -------------------------------------------------------------

const strategyEnum = z
  .enum(["deterministic", "ai-patch", "full-generation", "advisory"])
  .optional();

const violationSchema = z
  .object({ code: z.string().max(80), target: z.string().max(200).optional() })
  .passthrough();

const paritySummarySchema = z
  .object({
    ok: z.boolean(),
    blockers: z.array(z.string().max(200)).max(20).default([]),
    warnings: z.array(z.string().max(200)).max(20).default([]),
    deltas: z.record(z.string(), z.number()).optional(),
  })
  .partial();

const runtimeSummarySchema = z
  .object({
    errorCount: z.number().int().min(0).max(1000).default(0),
    overflowCount: z.number().int().min(0).max(1000).optional(),
    consoleBlockers: z.number().int().min(0).max(1000).optional(),
  })
  .partial();

const pageManifestSchema = z
  .object({
    chars: z.number().int().min(0).optional(),
    headings: z.number().int().min(0).optional(),
    sections: z.number().int().min(0).optional(),
    buttons: z.number().int().min(0).optional(),
    links: z.number().int().min(0).optional(),
    forms: z.number().int().min(0).optional(),
    inputs: z.number().int().min(0).optional(),
    tables: z.number().int().min(0).optional(),
    images: z.number().int().min(0).optional(),
    ids: z.number().int().min(0).optional(),
    scripts: z.number().int().min(0).optional(),
  })
  .partial();

export const qaInputSchema = z.object({
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
});
export type QaRequestBody = z.infer<typeof qaInputSchema>;

// ---- Response ------------------------------------------------------------

export const qaSuccessSchema = z.object({
  ok: z.literal(true),
  verdict: z.enum(["pass", "repair", "block"]),
  confidence: z.number().min(0).max(1),
  defectCategories: z.array(z.string().max(80)).max(10).default([]),
  explanation: z.string().max(400).default(""),
  patch: patchSchema.nullable(),
  expectedImprovement: z.string().max(400).default(""),
  actualModel: z.string().max(120),
  fallbackUsed: z.literal(false),
  requestId: z.string().max(80),
});
export type QaRouteSuccess = z.infer<typeof qaSuccessSchema>;

export const qaErrorSchema = z.object({
  ok: z.literal(false),
  code: z.enum([
    "qa_model_unavailable",
    "qa_bad_response",
    "qa_provider_error",
    "paywall",
  ]),
  message: z.string().max(400),
  actualModel: z.string().max(120).nullable(),
  requestId: z.string().max(80),
});
export type QaRouteError = z.infer<typeof qaErrorSchema>;

export const qaResponseSchema = z.union([qaSuccessSchema, qaErrorSchema]);
export type QaRouteResponse = QaRouteSuccess | QaRouteError;

// Re-export Patch so consumers only need this module.
export type { Patch };

/** Policy version — bump when validation/parity/nav-repair rules change so
 *  the finalizer cache invalidates automatically without a manual clear. */
export const QA_POLICY_VERSION = "1";
