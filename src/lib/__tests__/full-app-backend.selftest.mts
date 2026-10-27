import assert from "node:assert/strict";
import { buildFullAppFiles } from "../full-app-scaffold.ts";
import { reconcileFullAppFiles, isEditableAppPath } from "../full-app-edits.ts";
import { APP_ITEMS_MIGRATION, APP_STORAGE_MIGRATION, APP_EDGE_FUNCTION,
  APP_BACKEND_WORKFLOW } from "../full-app-backend.ts";

const html = "<!doctype html><html><body>App</body></html>";
const files = buildFullAppFiles(html, "Test", ["lucide-react"]);
assert.ok(files[APP_ITEMS_MIGRATION].includes("enable row level security"));
assert.ok(files[APP_STORAGE_MIGRATION].includes("storage.foldername(name)"));
assert.ok(files[APP_STORAGE_MIGRATION].includes("(select auth.uid())"));
assert.ok(files[APP_STORAGE_MIGRATION].includes("app-private"));
assert.ok(files[APP_STORAGE_MIGRATION].includes("false, 5242880"));
assert.ok(files[APP_STORAGE_MIGRATION].includes("for delete to authenticated"));
assert.ok(files[APP_EDGE_FUNCTION].includes("client.auth.getUser(jwt)"));
assert.ok(files[APP_EDGE_FUNCTION].includes("persistSession: false"));
assert.ok(!files[APP_EDGE_FUNCTION].includes("SERVICE_ROLE_KEY"));
assert.ok(files["supabase/config.toml"].includes("verify_jwt = false"));
assert.ok(files[APP_BACKEND_WORKFLOW].includes("workflow_dispatch:"));
assert.ok(!files[APP_BACKEND_WORKFLOW].includes("\n  push:"));
assert.ok(files[APP_BACKEND_WORKFLOW].includes("APPROVE_BACKEND_CHANGES"));
assert.ok(files[APP_BACKEND_WORKFLOW].includes("environment: production-backend"));
assert.ok(files[APP_BACKEND_WORKFLOW].includes("supabase db push"));
assert.ok(files[APP_BACKEND_WORKFLOW].includes("supabase functions deploy"));
assert.ok(files["src/App.tsx"].includes("PrivateFiles userId={session.user.id}"));
assert.ok(files["src/components/PrivateFiles.tsx"].includes("uploadPrivateFile"));
assert.ok(files["src/lib/uploads.ts"].includes("createSignedUrl"));
assert.ok(files["docs/BACKEND.md"].includes("SUPABASE_ACCESS_TOKEN"));
assert.equal(files["supabase/migrations/001_app_items.sql"], undefined);
assert.equal(isEditableAppPath(APP_ITEMS_MIGRATION), false);
assert.equal(isEditableAppPath(APP_STORAGE_MIGRATION), false);
assert.equal(isEditableAppPath("supabase/migrations/20261027000002_custom.sql"), true);
assert.equal(isEditableAppPath(APP_EDGE_FUNCTION), false); // Until explicit function editor support
const old: Record<string, string> = {
  ...files, "supabase/migrations/001_app_items.sql": files[APP_ITEMS_MIGRATION],
  ".github/workflows/obsidian-build.yml": "legacy-workflow",
};
const repaired = reconcileFullAppFiles(html, "Test", old, ["lucide-react"]);
assert.equal(repaired["supabase/migrations/001_app_items.sql"], undefined);
assert.equal(repaired[".github/workflows/obsidian-build.yml"],
  files[".github/workflows/obsidian-build.yml"]);
assert.equal(repaired[APP_STORAGE_MIGRATION], files[APP_STORAGE_MIGRATION]);
const altered = { ...files, [APP_STORAGE_MIGRATION]: "create policy insecure ..." };
assert.equal(reconcileFullAppFiles(html, "Test", altered)[APP_STORAGE_MIGRATION],
  files[APP_STORAGE_MIGRATION], "mandatory RLS template regenerated");
console.log("Per-app backend setup and RLS scaffolding tests passed");
