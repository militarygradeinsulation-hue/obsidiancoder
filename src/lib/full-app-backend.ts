// Trusted full-stack starter pieces. Never inject Obsidian credentials.
import type { FullAppFiles } from "./full-app-scaffold";

export const APP_ITEMS_MIGRATION = "supabase/migrations/20261027000000_app_items.sql";
export const APP_STORAGE_MIGRATION = "supabase/migrations/20261027000001_private_storage.sql";
export const APP_EDGE_FUNCTION = "supabase/functions/account-status/index.ts";
export const APP_BACKEND_WORKFLOW = ".github/workflows/obsidian-backend.yml";
export const APP_BACKEND_PROVISION_WORKFLOW = ".github/workflows/obsidian-provision-backend.yml";
export const APP_BACKEND_HEALTH_WORKFLOW = ".github/workflows/obsidian-backend-health.yml";

const STORAGE_MIGRATION = "-- Private uploads. This migration is applied ONLY to the app owner's Supabase project.\n-- Files are stored under <auth.uid()>/<uuid>.<extension>.\ninsert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\nvalues ('app-private', 'app-private', false, 5242880, array['image/png','image/jpeg','application/pdf'])\non conflict (id) do nothing;\n\ncreate policy \"App private uploads read own\" on storage.objects\nfor select to authenticated\nusing (\n  bucket_id = 'app-private' and\n  (storage.foldername(name))[1] = (select auth.uid())::text\n);\n\ncreate policy \"App private uploads insert own\" on storage.objects\nfor insert to authenticated\nwith check (\n  bucket_id = 'app-private' and\n  (storage.foldername(name))[1] = (select auth.uid())::text\n);\n\ncreate policy \"App private uploads update own\" on storage.objects\nfor update to authenticated\nusing (\n  bucket_id = 'app-private' and\n  (storage.foldername(name))[1] = (select auth.uid())::text\n)\nwith check (\n  bucket_id = 'app-private' and\n  (storage.foldername(name))[1] = (select auth.uid())::text\n);\n\ncreate policy \"App private uploads delete own\" on storage.objects\nfor delete to authenticated\nusing (\n  bucket_id = 'app-private' and\n  (storage.foldername(name))[1] = (select auth.uid())::text\n);\n";
const UPLOAD_HELPERS = "import { supabase } from \"./supabase\";\n\nconst BUCKET = \"app-private\";\nconst LIMIT = 5 * 1024 * 1024;\nconst ALLOWED: Record<string, string> = {\n  \"image/png\": \"png\",\n  \"image/jpeg\": \"jpg\",\n  \"application/pdf\": \"pdf\",\n};\nfunction requireBackend() {\n  if (!supabase) throw new Error(\"Configure this app's own Supabase project before uploading.\");\n  return supabase;\n}\nasync function currentUser() {\n  const client = requireBackend();\n  const { data, error } = await client.auth.getUser();\n  if (error || !data.user) throw new Error(\"Sign in to manage private files.\");\n  return data.user.id;\n}\nexport async function uploadPrivateFile(file: File): Promise<string> {\n  const userId = await currentUser();\n  if (file.size > LIMIT || file.size < 1 || !ALLOWED[file.type])\n    throw new Error(\"Choose a PNG, JPG or PDF smaller than 5 MB.\");\n  const path = userId + \"/\" + crypto.randomUUID() + \".\" + ALLOWED[file.type];\n  const { error } = await requireBackend().storage.from(BUCKET).upload(path, file, {\n    upsert: false, contentType: file.type, cacheControl: \"3600\",\n  });\n  if (error) throw error;\n  return path;\n}\nexport async function listPrivateFiles(): Promise<Array<{ name: string }>> {\n  const userId = await currentUser();\n  const { data, error } = await requireBackend().storage.from(BUCKET)\n    .list(userId, { limit: 100, sortBy: { column: \"created_at\", order: \"desc\" } });\n  if (error) throw error;\n  return (data ?? []).filter(f => !!f.name).map(f => ({ name: f.name }));\n}\nexport async function privateSignedFileUrl(filename: string): Promise<string> {\n  const userId = await currentUser();\n  if (!/^[0-9a-f-]{36}\\.(png|jpg|pdf)$/i.test(filename)) throw new Error(\"Invalid file name.\");\n  const { data, error } = await requireBackend().storage.from(BUCKET)\n    .createSignedUrl(userId + \"/\" + filename, 60);\n  if (error || !data?.signedUrl) throw error ?? new Error(\"Could not open file.\");\n  return data.signedUrl;\n}\nexport async function removePrivateFile(filename: string): Promise<void> {\n  const userId = await currentUser();\n  if (!/^[0-9a-f-]{36}\\.(png|jpg|pdf)$/i.test(filename)) throw new Error(\"Invalid file name.\");\n  const { error } = await requireBackend().storage.from(BUCKET).remove([userId + \"/\" + filename]);\n  if (error) throw error;\n}\n";
const PRIVATE_FILES_COMPONENT = "import * as React from \"react\";\nimport { supabase } from \"../lib/supabase\";\nimport { uploadPrivateFile, listPrivateFiles, privateSignedFileUrl, removePrivateFile } from \"../lib/uploads\";\n\nexport function PrivateFiles({ userId }: { userId: string }) {\n  const [files, setFiles] = React.useState<Array<{ name: string }>>([]);\n  const [busy, setBusy] = React.useState(false);\n  const [notice, setNotice] = React.useState(\"\");\n  const [serverStatus, setServerStatus] = React.useState(\"\");\n  const reload = React.useCallback(async () => {\n    try { setFiles(await listPrivateFiles()); } catch (e) {\n      setNotice(e instanceof Error ? e.message : \"Cannot list private files.\");\n    }\n  }, []);\n  React.useEffect(() => { setFiles([]); void reload(); }, [userId, reload]);\n\n  async function upload(event: React.ChangeEvent<HTMLInputElement>) {\n    const file = event.target.files?.[0];\n    if (!file) return;\n    setBusy(true); setNotice(\"\");\n    try { await uploadPrivateFile(file); await reload(); setNotice(\"File saved privately.\"); }\n    catch (e) { setNotice(e instanceof Error ? e.message : \"Upload failed.\"); }\n    finally { setBusy(false); event.target.value = \"\"; }\n  }\n  async function open(name: string) {\n    try {\n      const url = await privateSignedFileUrl(name);\n      window.open(url, \"_blank\", \"noopener,noreferrer\");\n    } catch (e) { setNotice(e instanceof Error ? e.message : \"Could not open file.\"); }\n  }\n  async function remove(name: string) {\n    if (!confirm(\"Delete this private file?\")) return;\n    setBusy(true);\n    try { await removePrivateFile(name); await reload(); }\n    catch (e) { setNotice(e instanceof Error ? e.message : \"Delete failed.\"); }\n    finally { setBusy(false); }\n  }\n  async function checkServer() {\n    if (!supabase) { setServerStatus(\"Configure Supabase before calling server functions.\"); return; }\n    setServerStatus(\"Checking...\");\n    const { data, error } = await supabase.functions.invoke(\"account-status\", { body: {} });\n    setServerStatus(error ? error.message : \"Authenticated backend responding. Records: \" + String(data?.itemCount ?? 0));\n  }\n  return (\n    <section className=\"files\">\n      <h3>Private files and server functions</h3>\n      <p>Upload a PNG, JPG or PDF up to 5 MB. Other users cannot read your files.</p>\n      <label>Private file <input type=\"file\" disabled={busy} accept=\"image/png,image/jpeg,application/pdf\" onChange={e => void upload(e)} /></label>\n      <ul>{files.map(f => <li key={f.name}>\n        <span>{f.name}</span>\n        <button type=\"button\" onClick={() => void open(f.name)}>Open</button>\n        <button type=\"button\" disabled={busy} onClick={() => void remove(f.name)}>Delete</button>\n      </li>)}</ul>\n      <button type=\"button\" onClick={() => void checkServer()}>Check authenticated server</button>\n      {serverStatus && <p role=\"status\">{serverStatus}</p>}\n      {notice && <p role=\"status\">{notice}</p>}\n    </section>\n  );\n}\n";
const AUTHENTICATED_FUNCTION = "// Authenticated example API running on the APP OWNER'S Supabase project.\n// No service-role key is required or exposed. RLS applies to user queries.\n// The function accepts public publishable API keys, then validates a USER JWT itself.\nimport { createClient } from \"npm:@supabase/supabase-js@2.110.5\";\n\nconst cors = {\n  \"Access-Control-Allow-Origin\": \"*\",\n  \"Access-Control-Allow-Headers\": \"authorization, apikey, x-client-info, content-type\",\n  \"Access-Control-Allow-Methods\": \"POST, OPTIONS\",\n  \"Content-Type\": \"application/json\",\n};\nfunction respond(status: number, data: unknown) {\n  return new Response(JSON.stringify(data), { status, headers: { ...cors, \"Cache-Control\": \"no-store\" } });\n}\nDeno.serve(async (request: Request) => {\n  if (request.method === \"OPTIONS\") return new Response(null, { status: 204, headers: cors });\n  if (request.method !== \"POST\") return respond(405, { error: \"Method not allowed.\" });\n  const auth = request.headers.get(\"authorization\") ?? \"\";\n  const jwt = auth.startsWith(\"Bearer \") ? auth.slice(7) : \"\";\n  if (!jwt || jwt.length > 8192) return respond(401, { error: \"Sign in required.\" });\n  const url = Deno.env.get(\"SUPABASE_URL\") || \"\";\n  const key = Deno.env.get(\"SUPABASE_PUBLISHABLE_KEY\") || Deno.env.get(\"SUPABASE_ANON_KEY\") || \"\";\n  if (!url || !key) return respond(503, { error: \"Backend environment is incomplete.\" });\n  try {\n    const client = createClient(url, key, { global: { headers: { Authorization: \"Bearer \" + jwt } },\n      auth: { autoRefreshToken: false, persistSession: false } });\n    // getUser() contacts Auth to validate the signature and session; never trust\n    // an unverified JWT payload or user-editable metadata.\n    const { data: userResult, error: authError } = await client.auth.getUser(jwt);\n    if (authError || !userResult.user) return respond(401, { error: \"Invalid or expired session.\" });\n    const { count, error } = await client.from(\"app_items\")\n      .select(\"id\", { head: true, count: \"exact\" });\n    if (error) return respond(503, { error: \"Database unavailable; apply migrations first.\" });\n    return respond(200, { ok: true, itemCount: count ?? 0, serverTime: new Date().toISOString() });\n  } catch {\n    return respond(500, { error: \"Server function failed.\" });\n  }\n});\n";
const MIGRATION_AUDIT_SCRIPT = String.raw`import fs from "node:fs";
import path from "node:path";

const root = path.resolve("supabase/migrations");
if (!fs.existsSync(root)) {
  console.error("OBSIDIAN_DB_AUDIT: no migration directory found");
  process.exit(1);
}

const files = fs.readdirSync(root)
  .filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))
  .sort();

if (!files.length) {
  console.error("OBSIDIAN_DB_AUDIT: no timestamped migrations found");
  process.exit(1);
}

const source = files
  .map(name => "-- FILE: " + name + "\n" + fs.readFileSync(path.join(root, name), "utf8"))
  .join("\n\n");

const stripped = source
  .replace(/--[^\n]*/g, " ")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\s+/g, " ")
  .toLowerCase();

const errors = [];
const warnings = [];

const destructive = [
  [/\bdrop\s+schema\b/, "DROP SCHEMA is blocked by Obsidian migration QA."],
  [/\bdrop\s+table\b/, "DROP TABLE is blocked by Obsidian migration QA."],
  [/\btruncate\s+(?:table\s+)?/, "TRUNCATE is blocked by Obsidian migration QA."],
  [/\balter\s+table[\s\S]{0,180}\bdisable\s+row\s+level\s+security\b/, "Disabling RLS is blocked."],
  [/\bgrant\s+all(?:\s+privileges)?[\s\S]{0,180}\bto\s+(?:anon|authenticated)\b/, "GRANT ALL to browser roles is blocked."],
];
for (const [pattern, message] of destructive) {
  if (pattern.test(stripped)) errors.push(message);
}

const created = [...stripped.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/g)]
  .map(match => match[1]);
const policyTables = new Set(
  [...stripped.matchAll(/\bcreate\s+policy[\s\S]{0,300}\bon\s+public\.([a-z_][a-z0-9_]*)\b/g)]
    .map(match => match[1]),
);

for (const table of [...new Set(created)]) {
  const rlsDirect = "alter table public." + table + " enable row level security";
  const rlsIfExists = "alter table if exists public." + table + " enable row level security";
  if (!stripped.includes(rlsDirect) && !stripped.includes(rlsIfExists)) {
    errors.push("Table public." + table + " is created without ENABLE ROW LEVEL SECURITY.");
  }
  if (!policyTables.has(table)) {
    warnings.push("Table public." + table + " has no CREATE POLICY in the reviewed migration set.");
  }
}

if (/\bsecurity\s+definer\b/.test(stripped)) {
  warnings.push("SECURITY DEFINER function detected. Review search_path, authorization checks, and grants manually.");
}
if (/\bdelete\s+from\s+public\.[a-z_][a-z0-9_]*\s*;/.test(stripped)) {
  errors.push("Unbounded DELETE FROM public.<table>; is blocked.");
}
if (/\bupdate\s+public\.[a-z_][a-z0-9_]*\s+set\b[^;]*;/.test(stripped) &&
    !/\bwhere\b/.test(stripped)) {
  warnings.push("Potential unbounded UPDATE detected. Review data migration statements manually.");
}

console.log("OBSIDIAN_DB_AUDIT: checked " + files.length + " migration file(s)");
for (const warning of warnings) console.warn("OBSIDIAN_DB_WARNING: " + warning);
if (errors.length) {
  for (const error of errors) console.error("OBSIDIAN_DB_ERROR: " + error);
  process.exit(1);
}
console.log("OBSIDIAN_DB_AUDIT: PASS");
`;

const BACKEND_DEPLOY_WORKFLOW = "name: Deploy Full App backend\non:\n  workflow_dispatch:\n    inputs:\n      mode:\n        description: \"Apply migrations AND functions, or functions only\"\n        required: true\n        type: choice\n        options:\n          - functions-only\n          - schema-and-functions\n      approval:\n        description: \"Type APPROVE_BACKEND_CHANGES after reviewing SQL and targets\"\n        required: true\n        type: string\npermissions:\n  contents: read\nconcurrency:\n  group: full-app-production-backend\n  cancel-in-progress: false\njobs:\n  backend:\n    if: ${{ inputs.approval == 'APPROVE_BACKEND_CHANGES' }}\n    runs-on: ubuntu-latest\n    timeout-minutes: 20\n    environment: production-backend\n    env:\n      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}\n      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}\n      SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          persist-credentials: false\n      - uses: supabase/setup-cli@v1\n        with:\n          version: latest\n      - name: Verify separate application backend configuration\n        shell: bash\n        run: |\n          test -n \"$SUPABASE_ACCESS_TOKEN\"\n          test -n \"$SUPABASE_PROJECT_REF\"\n          test -n \"$SUPABASE_DB_PASSWORD\"\n          [[ \"$SUPABASE_PROJECT_REF\" =~ ^[a-z0-9]{20}$ ]]\n      - name: Obsidian migration safety audit\n        if: ${{ inputs.mode == 'schema-and-functions' }}\n        run: node scripts/obsidian-migration-audit.mjs\n      - name: Link the app's own database\n        if: ${{ inputs.mode == 'schema-and-functions' }}\n        run: supabase link --project-ref \"$SUPABASE_PROJECT_REF\" --password \"$SUPABASE_DB_PASSWORD\"\n      - name: Apply reviewed migration files\n        if: ${{ inputs.mode == 'schema-and-functions' }}\n        run: supabase db push --linked --yes\n      - name: Deploy all reviewed Edge Functions\n        run: supabase functions deploy --project-ref \"$SUPABASE_PROJECT_REF\" --use-api\n      - name: Verify deployed database and function boundary\n        env:\n          SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}\n          SUPABASE_PUBLISHABLE_KEY: ${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}\n        shell: bash\n        run: |\n          set -euo pipefail\n          test -n \"$SUPABASE_URL\"\n          test -n \"$SUPABASE_PUBLISHABLE_KEY\"\n          DB_CODE=\"$(curl -sS -o /tmp/obsidian-db.json -w \"%{http_code}\" \"$SUPABASE_URL/rest/v1/app_items?select=id&limit=1\" -H \"apikey: $SUPABASE_PUBLISHABLE_KEY\")\"\n          test \"$DB_CODE\" = \"200\"\n          FUNCTION_CODE=\"$(curl -sS -o /tmp/obsidian-function.json -w \"%{http_code}\" -X POST \"$SUPABASE_URL/functions/v1/account-status\" -H \"apikey: $SUPABASE_PUBLISHABLE_KEY\" -H \"content-type: application/json\" --data \"{}\")\"\n          test \"$FUNCTION_CODE\" = \"401\"\n          echo \"OBSIDIAN_BACKEND_QA: PASS\"\n";
const BACKEND_PROVISION_WORKFLOW = String.raw`name: Obsidian Backend Provisioning Guard
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      - name: Project creation requires live cost confirmation
        shell: bash
        run: |
          echo "Automatic Supabase project creation is intentionally disabled."
          echo "Open Obsidian Full App -> GitHub -> Connect an existing Supabase backend."
          echo "A future managed-create flow must show the current organization-specific cost and receive explicit confirmation before creating billable infrastructure."
          exit 1
`;


const BACKEND_HEALTH_WORKFLOW = String.raw`name: Obsidian Backend Health
on:
  workflow_dispatch:
  schedule:
    - cron: "43 */6 * * *"
permissions:
  contents: read
concurrency:
  group: obsidian-backend-health
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
      SUPABASE_PUBLISHABLE_KEY: ${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
    steps:
      - name: Validate public backend configuration
        shell: bash
        run: |
          test -n "$SUPABASE_URL"
          test -n "$SUPABASE_PUBLISHABLE_KEY"
          [[ "$SUPABASE_URL" =~ ^https://[a-z0-9]{20}\.supabase\.co$ ]]
      - name: Verify owner table exists and anonymous RLS is closed
        shell: bash
        run: |
          set -euo pipefail
          CODE="$(curl -sS -o /tmp/obsidian-db.json -w "%{http_code}" \
            "$SUPABASE_URL/rest/v1/app_items?select=id&limit=1" \
            -H "apikey: $SUPABASE_PUBLISHABLE_KEY")"
          test "$CODE" = "200"
          node - <<'NODE'
          const fs = require("fs");
          const body = JSON.parse(fs.readFileSync("/tmp/obsidian-db.json", "utf8"));
          if (!Array.isArray(body) || body.length !== 0) {
            console.error("OBSIDIAN_BACKEND_QA: anonymous app_items query was not empty");
            process.exit(1);
          }
          console.log("OBSIDIAN_BACKEND_QA: database exists and anonymous RLS returned zero rows");
          NODE
      - name: Verify authenticated function is deployed and denies anonymous callers
        shell: bash
        run: |
          set -euo pipefail
          CODE="$(curl -sS -o /tmp/obsidian-function.json -w "%{http_code}" \
            -X POST "$SUPABASE_URL/functions/v1/account-status" \
            -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
            -H "content-type: application/json" \
            --data '{}')"
          test "$CODE" = "401"
          echo "OBSIDIAN_BACKEND_QA: authenticated function is deployed and denies anonymous access"
`;


const BACKEND_README = "# Application backend deployment\n\nThis project has its own Supabase schema, private uploads, authenticated Edge Functions, and a production health gate.\n\n## First setup\n1. Create or choose a separate Supabase project owned by this application. You are responsible for its cost, permissions, backups, and usage.\n2. In Obsidian Full App → GitHub, connect an existing Supabase project using its 20-character project ref and a scoped Supabase management token.\n   - Obsidian reads the project URL and publishable key and writes only SUPABASE_PROJECT_REF, VITE_SUPABASE_URL, and VITE_SUPABASE_PUBLISHABLE_KEY as GitHub variables.\n   - The management token is used only for the live Management API request and is not written into the project or frontend.\n   - Prefer a scoped token with only Project Settings/API Keys/Edge Function Secrets permissions needed by the connection.\n   - Automatic project creation is intentionally disabled until Obsidian can show the live organization-specific cost and receive explicit confirmation.\n   Never put secret/service-role keys in VITE_ variables or frontend files.\n3. For GitHub CLI deployment, configure SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD as GitHub Actions secrets. The access token should be scoped to this app project/organization as narrowly as practical.\n4. Review all SQL migrations, storage RLS policies, and server functions. The deployment workflow runs scripts/obsidian-migration-audit.mjs before any schema push.\n5. Set up the GitHub environment production-backend with required reviewers if you want an additional human approval before database changes.\n6. If App Architect requires Stripe, Resend, Twilio, OpenAI, Google, or HubSpot, enter those credentials in Obsidian's Integration Vault. Secret values are written directly to Supabase Function Secrets. Browser-safe public values are stored as GitHub variables.\n7. In Full App → GitHub, run Backend readiness and then Deploy backend. Runtime integration secrets are verified against Supabase before deployment.\n8. Verify login/logout, per-user app_items RLS, private upload/read/delete, signed URLs, and account-status with a signed-in user.\n9. Confirm Auth redirect URLs, backup/recovery policy, cost limits, and production ownership before inviting users.\n\n## Production health\nThe guarded backend deployment verifies that app_items exists, anonymous access returns no owner rows, and the authenticated account-status function is deployed but rejects anonymous callers. A separate obsidian-backend-health.yml workflow repeats this boundary check every six hours and can also be run manually.\n\n## Security\nStorage objects are private and scoped under the authenticated user's path. The sample Edge Function validates a user JWT and queries app_items under that user's RLS policies. It never uses service-role keys. Integration secret values are never written to frontend code or returned after being saved.\n\n## Deployment boundaries\nDatabase and Edge Functions deploy only through explicit GitHub Actions, separate from frontend publication. The bundled provisioning workflow is a guard that refuses automatic project creation. Obsidian connects to infrastructure the app owner controls rather than silently creating billable Supabase projects.\n";

export function addAppBackend(files: FullAppFiles): FullAppFiles {
  const baseMigration = files["supabase/migrations/001_app_items.sql"] || files[APP_ITEMS_MIGRATION];
  if (!baseMigration || !baseMigration.includes("enable row level security")) {
    throw new Error("Full App schema is missing RLS.");
  }
  const app = files["src/App.tsx"];
  if (!app || !app.includes("export default function App")) throw new Error("Missing application component.");
  const updatedApp = app
    .replace('import * as React from "react";', 'import * as React from "react";\nimport { PrivateFiles } from "./components/PrivateFiles";')
    .replace('<form className="entry" onSubmit={createItem}>', '<PrivateFiles userId={session.user.id} />\n          <form className="entry" onSubmit={createItem}>');
  const result: FullAppFiles = {
    ...files,
    [APP_ITEMS_MIGRATION]: baseMigration,
    [APP_STORAGE_MIGRATION]: STORAGE_MIGRATION,
    [APP_EDGE_FUNCTION]: AUTHENTICATED_FUNCTION,
    [APP_BACKEND_WORKFLOW]: BACKEND_DEPLOY_WORKFLOW,
    [APP_BACKEND_PROVISION_WORKFLOW]: BACKEND_PROVISION_WORKFLOW,
    [APP_BACKEND_HEALTH_WORKFLOW]: BACKEND_HEALTH_WORKFLOW,
    "scripts/obsidian-migration-audit.mjs": MIGRATION_AUDIT_SCRIPT,
    "supabase/config.toml": "project_id = \"obsidian-full-app\"\n[functions.account-status]\nverify_jwt = false\n",
    "src/lib/uploads.ts": UPLOAD_HELPERS,
    "src/components/PrivateFiles.tsx": PRIVATE_FILES_COMPONENT,
    "src/App.tsx": updatedApp,
    "docs/BACKEND.md": BACKEND_README,
    "README.md": (files["README.md"] || "").replaceAll("supabase/migrations/001_app_items.sql", APP_ITEMS_MIGRATION) +
      "\n## Full-stack deployment\nSee `docs/BACKEND.md` for the app's private file storage, secured Edge Function, and explicit database deployment workflow.\n",
  };
  delete result["supabase/migrations/001_app_items.sql"];
  return result;
}
