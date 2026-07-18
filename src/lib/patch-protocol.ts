// Structured AI patch protocol — the JSON contract the model MUST return
// for edit tasks against an existing HTML document. Validated with Zod.
// The engine that applies these ops lives in ./patch-engine.ts.

import { z } from "zod";

export const MAX_OPS = 20;
export const MAX_OP_SIZE = 20_000; // chars per find/replace/content/code payload

// Individual operation schemas ------------------------------------------------

const bounded = (min = 0, max = MAX_OP_SIZE) => z.string().min(min).max(max);
const idString = z.string().min(1).max(120).regex(/^[A-Za-z_][A-Za-z0-9_\-:.]*$/,
  "id must be a valid HTML id token");
const attrName = z.string().min(1).max(64).regex(/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/,
  "attribute name must be a valid HTML attribute");

export const replaceTextOp = z.object({
  op: z.literal("replace_text"),
  find: bounded(1),
  replace: bounded(0),
  allow_multiple: z.boolean().optional().default(false),
  note: z.string().max(200).optional(),
});

export const insertBeforeOp = z.object({
  op: z.literal("insert_before"),
  anchor: bounded(1),
  content: bounded(1),
  note: z.string().max(200).optional(),
});

export const insertAfterOp = z.object({
  op: z.literal("insert_after"),
  anchor: bounded(1),
  content: bounded(1),
  note: z.string().max(200).optional(),
});

export const deleteTextOp = z.object({
  op: z.literal("delete_text"),
  find: bounded(1),
  allow_multiple: z.boolean().optional().default(false),
  note: z.string().max(200).optional(),
});

export const replaceElementByIdOp = z.object({
  op: z.literal("replace_element_by_id"),
  id: idString,
  content: bounded(0),
  note: z.string().max(200).optional(),
});

export const setAttributeOp = z.object({
  op: z.literal("set_attribute"),
  id: idString,
  attribute: attrName,
  value: bounded(0, 2000),
  note: z.string().max(200).optional(),
});

export const appendCssRuleOp = z.object({
  op: z.literal("append_css_rule"),
  rule: bounded(1, 4000),
  note: z.string().max(200).optional(),
});

export const appendScriptOp = z.object({
  op: z.literal("append_script"),
  code: bounded(1, 8000),
  note: z.string().max(200).optional(),
});

export const patchOpSchema = z.discriminatedUnion("op", [
  replaceTextOp,
  insertBeforeOp,
  insertAfterOp,
  deleteTextOp,
  replaceElementByIdOp,
  setAttributeOp,
  appendCssRuleOp,
  appendScriptOp,
]);
export type PatchOp = z.infer<typeof patchOpSchema>;

export const patchSchema = z.object({
  summary: z.string().min(1).max(400),
  operations: z.array(patchOpSchema).min(1).max(MAX_OPS),
});
export type Patch = z.infer<typeof patchSchema>;

// Parse helpers ---------------------------------------------------------------

/** Strip common wrappers a chat model likes to add around JSON. */
export function extractJsonBlock(text: string): string {
  const t = text.trim();
  // ```json ... ``` or ``` ... ```
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) return fence[1].trim();
  // First { ... last }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) return t.slice(first, last + 1);
  return t;
}

export type PatchParseResult =
  | { ok: true; patch: Patch }
  | { ok: false; error: string };

export function parsePatchResponse(raw: string): PatchParseResult {
  const block = extractJsonBlock(raw);
  let json: unknown;
  try {
    json = JSON.parse(block);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, patch: parsed.data };
}
