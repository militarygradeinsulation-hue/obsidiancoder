// Pure, transactional edits for native multi-file Full App workspaces.
// Inputs from AI and the browser are untrusted: source files are never executed here.
import { z } from "zod";
import { buildFullAppFiles, type FullAppFiles } from "./full-app-scaffold.ts";

export const MAX_APP_EDITS = 8;
export const MAX_EDIT_BYTES = 50_000;
export const MAX_WORKSPACE_BYTES = 4_500_000;

export function isEditableAppPath(path: string): boolean {
  if (!path || path.length > 180 || path.includes("..") || path.includes("\\") ||
      path.startsWith("/") || path.split("/").some((p) => p.startsWith("."))) return false;
  if (path === "src/App.tsx" || path === "src/styles.css") return true;
  if (path === "src/lib/supabase.ts" || path === "supabase/migrations/001_app_items.sql" || path === "src/generated-design.ts" ||
      path === "src/main.tsx") return false;
  return /^src\/(?:components|lib)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:ts|tsx|css)$/.test(path) ||
    /^supabase\/migrations\/[A-Za-z0-9_-]+\.sql$/.test(path);
}

export const appEditSchema = z.object({
  action: z.enum(["write", "delete"]),
  path: z.string().min(1).max(180),
  content: z.string().max(MAX_EDIT_BYTES).optional(),
}).strict().superRefine((edit, ctx) => {
  if (!isEditableAppPath(edit.path)) ctx.addIssue({ code: "custom", message: "File path is not editable." });
  if (edit.action === "write" && (!edit.content || !edit.content.trim()))
    ctx.addIssue({ code: "custom", message: "File content is required for a write." });
  if (edit.action === "delete" && edit.content !== undefined)
    ctx.addIssue({ code: "custom", message: "Delete cannot carry file content." });
});
export const appEditPlanSchema = z.object({
  summary: z.string().min(1).max(500),
  edits: z.array(appEditSchema).min(1).max(MAX_APP_EDITS),
}).strict();
export type AppEdit = z.infer<typeof appEditSchema>;
export type AppEditPlan = z.infer<typeof appEditPlanSchema>;

export function parseAppEditPlan(raw: unknown): AppEditPlan {
  if (typeof raw === "string") {
    const stripped = raw.trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/, "");
    raw = JSON.parse(stripped);
  }
  const plan = appEditPlanSchema.parse(raw);
  const paths = new Set<string>();
  for (const edit of plan.edits) {
    if (paths.has(edit.path)) throw new Error("Multiple edits target the same file.");
    paths.add(edit.path);
  }
  return plan;
}
export function workspaceFingerprint(files: FullAppFiles): string {
  let value = 2166136261;
  for (const path of Object.keys(files).sort()) {
    const str = path + "\0" + files[path];
    for (let i = 0; i < str.length; i++) {
      value ^= str.charCodeAt(i);
      value = Math.imul(value, 16777619);
    }
  }
  return (value >>> 0).toString(16).padStart(8, "0");
}

export function applyAppEditPlan(files: FullAppFiles, plan: AppEditPlan): FullAppFiles {
  const parsed = parseAppEditPlan(plan);
  const next = { ...files };
  for (const edit of parsed.edits) {
    if (edit.action === "delete") {
      if (edit.path === "src/App.tsx" || edit.path === "src/styles.css" ||
          edit.path === "supabase/migrations/001_app_items.sql") {
        throw new Error("Cannot delete required application scaffolding.");
      }
      if (!(edit.path in next)) throw new Error("Cannot delete an unknown file: " + edit.path);
      delete next[edit.path];
    } else {
      next[edit.path] = edit.content!;
    }
  }
  if (Object.keys(next).length > 100) throw new Error("Full App exceeds the 100-file limit.");
  const total = Object.entries(next).reduce((size, [path, data]) => size + path.length + data.length, 0);
  if (total > MAX_WORKSPACE_BYTES) throw new Error("Full App exceeds the source-size limit.");
  return next;
}

/** Rebuild trusted scaffolding from sanitized HTML, then apply only permitted
 * workspace modifications. Never accept browser-submitted .env, scripts,
 * package dependencies, auth client credentials, or generated HTML.
 */
export function reconcileFullAppFiles(
  trustedHtml: string, title: string, submitted?: FullAppFiles,
): FullAppFiles {
  const base = buildFullAppFiles(trustedHtml, title);
  if (!submitted) return base;
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) throw new Error("Invalid workspace.");
  if (Object.keys(submitted).length > 100) throw new Error("Too many workspace files.");
  const updates: AppEdit[] = [];
  for (const [path, content] of Object.entries(submitted)) {
    // Publish HTML may be repaired/sanitized after it was saved in the browser.
    // Always regenerate this protected file from trusted server HTML instead.
    if (path === "src/generated-design.ts") continue;
    if (base[path] === content) continue;
    if (!isEditableAppPath(path)) throw new Error("Cannot override protected file: " + path);
    if (typeof content !== "string" || content.length > MAX_EDIT_BYTES)
      throw new Error("Workspace file content is invalid: " + path);
    updates.push({ action: "write", path, content });
  }
  const next = { ...base };
  // Importing an entire workspace is not an AI edit batch.
  for (const change of updates) next[change.path] = change.content!;
  const total = Object.values(next).reduce((size, content) => size + content.length, 0);
  if (total > MAX_WORKSPACE_BYTES) throw new Error("Workspace exceeds size limit.");
  return next;
}
