// Strict parser for the QA model's response text.
//
// Extracted from src/routes/api/qa.ts so it can be unit-tested directly —
// this is exactly the kind of string-handling logic (code-fence stripping,
// brace-matching, schema validation) where edge cases hide, and it had no
// test coverage at all before this.
//
// Returns null on ANY nonconformance. Callers must treat null as
// "malformed response" and never coerce or guess at a partial result.

import { patchSchema, MAX_OPS } from "./patch-protocol";
import { QA_MAX_PATCH_OPS } from "./qa-contract";
import type { z } from "zod";

export type ParsedQa = {
  verdict: "pass" | "repair" | "block";
  confidence: number;
  defectCategories: string[];
  explanation: string;
  expectedImprovement: string;
  patch: z.infer<typeof patchSchema> | null;
};

export function parseQaJson(text: string): ParsedQa | null {
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
