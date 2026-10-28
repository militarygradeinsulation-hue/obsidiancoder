// Trusted full-stack starter pieces. Never inject Obsidian credentials.
import type { FullAppFiles } from "./full-app-scaffold";

export const APP_ITEMS_MIGRATION = "supabase/migrations/20261027000000_app_items.sql";
export const APP_STORAGE_MIGRATION = "supabase/migrations/20261027000001_private_storage.sql";
export const APP_EDGE_FUNCTION = "supabase/functions/account-status/index.ts";
export const APP_BACKEND_WORKFLOW = ".github/workflows/obsidian-backend.yml";
export const APP_BACKEND_PROVISION_WORKFLOW = ".github/workflows/obsidian-provision-backend.yml";

const STORAGE_MIGRATION = "-- Private uploads. This migration is applied ONLY to the app owner's Supabase project.\n-- Files are stored under <auth.uid()>/<uuid>.<extension>.\ninsert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\nvalues ('app-private', 'app-private', false, 5242880, array['image/png','image/jpeg','application/pdf'])\non conflict (id) do nothing;\n\ncreate policy \"App private uploads read own\" on storage.objects\nfor select to authenticated\nusing (\n  bucket_id = 'app-private' and\n  (storage.foldername(name))[1] = (select auth.uid())::text\n);\n\ncreate policy \"App private uploads insert own\" on storage.objects\nfor insert to authenticated\nwith check (\n  bucket_id = 'app-private' and\n  (storage.foldername(name))[1] = (select auth.uid())::text\n);\n\ncreate policy \"App private uploads update own\" on storage.objects\nfor update to authenticated\nusing (\n  bucket_id = 'app-private' and\n  (storage.foldername(name))[1] = (select auth.uid())::text\n)\nwith check (\n  bucket_id = 'app-private' and\n  (storage.foldername(name))[1] = (select auth.uid())::text\n);\n\ncreate policy \"App private uploads delete own\" on storage.objects\nfor delete to authenticated\nusing (\n  bucket_id = 'app-private' and\n  (storage.foldername(name))[1] = (select auth.uid())::text\n);\n";
const UPLOAD_HELPERS = "import { supabase } from \"./supabase\";\n\nconst BUCKET = \"app-private\";\nconst LIMIT = 5 * 1024 * 1024;\nconst ALLOWED: Record<string, string> = {\n  \"image/png\": \"png\",\n  \"image/jpeg\": \"jpg\",\n  \"application/pdf\": \"pdf\",\n};\nfunction requireBackend() {\n  if (!supabase) throw new Error(\"Configure this app's own Supabase project before uploading.\");\n  return supabase;\n}\nasync function currentUser() {\n  const client = requireBackend();\n  const { data, error } = await client.auth.getUser();\n  if (error || !data.user) throw new Error(\"Sign in to manage private files.\");\n  return data.user.id;\n}\nexport async function uploadPrivateFile(file: File): Promise<string> {\n  const userId = await currentUser();\n  if (file.size > LIMIT || file.size < 1 || !ALLOWED[file.type])\n    throw new Error(\"Choose a PNG, JPG or PDF smaller than 5 MB.\");\n  const path = userId + \"/\" + crypto.randomUUID() + \".\" + ALLOWED[file.type];\n  const { error } = await requireBackend().storage.from(BUCKET).upload(path, file, {\n    upsert: false, contentType: file.type, cacheControl: \"3600\",\n  });\n  if (error) throw error;\n  return path;\n}\nexport async function listPrivateFiles(): Promise<Array<{ name: string }>> {\n  const userId = await currentUser();\n  const { data, error } = await requireBackend().storage.from(BUCKET)\n    .list(userId, { limit: 100, sortBy: { column: \"created_at\", order: \"desc\" } });\n  if (error) throw error;\n  return (data ?? []).filter(f => !!f.name).map(f => ({ name: f.name }));\n}\nexport async function privateSignedFileUrl(filename: string): Promise<string> {\n  const userId = await currentUser();\n  if (!/^[0-9a-f-]{36}\\.(png|jpg|pdf)$/i.test(filename)) throw new Error(\"Invalid file name.\");\n  const { data, error } = await requireBackend().storage.from(BUCKET)\n    .createSignedUrl(userId + \"/\" + filename, 60);\n  if (error || !data?.signedUrl) throw error ?? new Error(\"Could not open file.\");\n  return data.signedUrl;\n}\nexport async function removePrivateFile(filename: string): Promise<void> {\n  const userId = await currentUser();\n  if (!/^[0-9a-f-]{36}\\.(png|jpg|pdf)$/i.test(filename)) throw new Error(\"Invalid file name.\");\n  const { error } = await requireBackend().storage.from(BUCKET).remove([userId + \"/\" + filename]);\n  if (error) throw error;\n}\n";
const PRIVATE_FILES_COMPONENT = "import * as React from \"react\";\nimport { supabase } from \"../lib/supabase\";\nimport { uploadPrivateFile, listPrivateFiles, privateSignedFileUrl, removePrivateFile } from \"../lib/uploads\";\n\nexport function PrivateFiles({ userId }: { userId: string }) {\n  const [files, setFiles] = React.useState<Array<{ name: string }>>([]);\n  const [busy, setBusy] = React.useState(false);\n  const [notice, setNotice] = React.useState(\"\");\n  const [serverStatus, setServerStatus] = React.useState(\"\");\n  const reload = React.useCallback(async () => {\n    try { setFiles(await listPrivateFiles()); } catch (e) {\n      setNotice(e instanceof Error ? e.message : \"Cannot list private files.\");\n    }\n  }, []);\n  React.useEffect(() => { setFiles([]); void reload(); }, [userId, reload]);\n\n  async function upload(event: React.ChangeEvent<HTMLInputElement>) {\n    const file = event.target.files?.[0];\n    if (!file) return;\n    setBusy(true); setNotice(\"\");\n    try { await uploadPrivateFile(file); await reload(); setNotice(\"File saved privately.\"); }\n    catch (e) { setNotice(e instanceof Error ? e.message : \"Upload failed.\"); }\n    finally { setBusy(false); event.target.value = \"\"; }\n  }\n  async function open(name: string) {\n    try {\n      const url = await privateSignedFileUrl(name);\n      window.open(url, \"_blank\", \"noopener,noreferrer\");\n    } catch (e) { setNotice(e instanceof Error ? e.message : \"Could not open file.\"); }\n  }\n  async function remove(name: string) {\n    if (!confirm(\"Delete this private file?\")) return;\n    setBusy(true);\n    try { await removePrivateFile(name); await reload(); }\n    catch (e) { setNotice(e instanceof Error ? e.message : \"Delete failed.\"); }\n    finally { setBusy(false); }\n  }\n  async function checkServer() {\n    if (!supabase) { setServerStatus(\"Configure Supabase before calling server functions.\"); return; }\n    setServerStatus(\"Checking...\");\n    const { data, error } = await supabase.functions.invoke(\"account-status\", { body: {} });\n    setServerStatus(error ? error.message : \"Authenticated backend responding. Records: \" + String(data?.itemCount ?? 0));\n  }\n  return (\n    <section className=\"files\">\n      <h3>Private files and server functions</h3>\n      <p>Upload a PNG, JPG or PDF up to 5 MB. Other users cannot read your files.</p>\n      <label>Private file <input type=\"file\" disabled={busy} accept=\"image/png,image/jpeg,application/pdf\" onChange={e => void upload(e)} /></label>\n      <ul>{files.map(f => <li key={f.name}>\n        <span>{f.name}</span>\n        <button type=\"button\" onClick={() => void open(f.name)}>Open</button>\n        <button type=\"button\" disabled={busy} onClick={() => void remove(f.name)}>Delete</button>\n      </li>)}</ul>\n      <button type=\"button\" onClick={() => void checkServer()}>Check authenticated server</button>\n      {serverStatus && <p role=\"status\">{serverStatus}</p>}\n      {notice && <p role=\"status\">{notice}</p>}\n    </section>\n  );\n}\n";
const AUTHENTICATED_FUNCTION = "// Authenticated example API running on the APP OWNER'S Supabase project.\n// No service-role key is required or exposed. RLS applies to user queries.\n// The function accepts public publishable API keys, then validates a USER JWT itself.\nimport { createClient } from \"npm:@supabase/supabase-js@2.110.5\";\n\nconst cors = {\n  \"Access-Control-Allow-Origin\": \"*\",\n  \"Access-Control-Allow-Headers\": \"authorization, apikey, x-client-info, content-type\",\n  \"Access-Control-Allow-Methods\": \"POST, OPTIONS\",\n  \"Content-Type\": \"application/json\",\n};\nfunction respond(status: number, data: unknown) {\n  return new Response(JSON.stringify(data), { status, headers: { ...cors, \"Cache-Control\": \"no-store\" } });\n}\nDeno.serve(async (request: Request) => {\n  if (request.method === \"OPTIONS\") return new Response(null, { status: 204, headers: cors });\n  if (request.method !== \"POST\") return respond(405, { error: \"Method not allowed.\" });\n  const auth = request.headers.get(\"authorization\") ?? \"\";\n  const jwt = auth.startsWith(\"Bearer \") ? auth.slice(7) : \"\";\n  if (!jwt || jwt.length > 8192) return respond(401, { error: \"Sign in required.\" });\n  const url = Deno.env.get(\"SUPABASE_URL\") || \"\";\n  const key = Deno.env.get(\"SUPABASE_PUBLISHABLE_KEY\") || Deno.env.get(\"SUPABASE_ANON_KEY\") || \"\";\n  if (!url || !key) return respond(503, { error: \"Backend environment is incomplete.\" });\n  try {\n    const client = createClient(url, key, { global: { headers: { Authorization: \"Bearer \" + jwt } },\n      auth: { autoRefreshToken: false, persistSession: false } });\n    // getUser() contacts Auth to validate the signature and session; never trust\n    // an unverified JWT payload or user-editable metadata.\n    const { data: userResult, error: authError } = await client.auth.getUser(jwt);\n    if (authError || !userResult.user) return respond(401, { error: \"Invalid or expired session.\" });\n    const { count, error } = await client.from(\"app_items\")\n      .select(\"id\", { head: true, count: \"exact\" });\n    if (error) return respond(503, { error: \"Database unavailable; apply migrations first.\" });\n    return respond(200, { ok: true, itemCount: count ?? 0, serverTime: new Date().toISOString() });\n  } catch {\n    return respond(500, { error: \"Server function failed.\" });\n  }\n});\n";
const BACKEND_DEPLOY_WORKFLOW = "name: Deploy Full App backend\non:\n  workflow_dispatch:\n    inputs:\n      mode:\n        description: \"Apply migrations AND functions, or functions only\"\n        required: true\n        type: choice\n        options:\n          - functions-only\n          - schema-and-functions\n      approval:\n        description: \"Type APPROVE_BACKEND_CHANGES after reviewing SQL and targets\"\n        required: true\n        type: string\npermissions:\n  contents: read\nconcurrency:\n  group: full-app-production-backend\n  cancel-in-progress: false\njobs:\n  backend:\n    if: ${{ inputs.approval == 'APPROVE_BACKEND_CHANGES' }}\n    runs-on: ubuntu-latest\n    timeout-minutes: 20\n    environment: production-backend\n    env:\n      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}\n      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}\n      SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          persist-credentials: false\n      - uses: supabase/setup-cli@v1\n        with:\n          version: latest\n      - name: Verify separate application backend configuration\n        shell: bash\n        run: |\n          test -n \"$SUPABASE_ACCESS_TOKEN\"\n          test -n \"$SUPABASE_PROJECT_REF\"\n          test -n \"$SUPABASE_DB_PASSWORD\"\n          [[ \"$SUPABASE_PROJECT_REF\" =~ ^[a-z0-9]{20}$ ]]\n      - name: Link the app's own database\n        if: ${{ inputs.mode == 'schema-and-functions' }}\n        run: supabase link --project-ref \"$SUPABASE_PROJECT_REF\" --password \"$SUPABASE_DB_PASSWORD\"\n      - name: Apply reviewed migration files\n        if: ${{ inputs.mode == 'schema-and-functions' }}\n        run: supabase db push --linked --yes\n      - name: Deploy all reviewed Edge Functions\n        run: supabase functions deploy --project-ref \"$SUPABASE_PROJECT_REF\" --use-api\n";
const BACKEND_PROVISION_WORKFLOW = String.raw`name: Obsidian Provision Backend
on:
  workflow_dispatch:
    inputs:
      project_name:
        description: "New Supabase project name"
        required: true
        type: string
      region:
        description: "Supabase region code"
        required: true
        default: "us-east-1"
        type: string
      approval:
        description: "Type CREATE_SUPABASE_PROJECT to authorize infrastructure creation"
        required: true
        type: string
permissions:
  contents: read
  actions: write
concurrency:
  group: obsidian-provision-backend
  cancel-in-progress: false
jobs:
  provision:
    if: ${{ inputs.approval == 'CREATE_SUPABASE_PROJECT' }}
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: production-backend
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
      SUPABASE_ORG_ID: ${{ vars.SUPABASE_ORG_ID }}
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Validate explicit owner configuration
        shell: bash
        run: |
          test -n "$SUPABASE_ACCESS_TOKEN"
          test -n "$SUPABASE_DB_PASSWORD"
          test -n "$SUPABASE_ORG_ID"
          test "${{ inputs.approval }}" = "CREATE_SUPABASE_PROJECT"
          [[ "${{ inputs.region }}" =~ ^[a-z0-9-]{4,24}$ ]]
      - id: create
        name: Create isolated Supabase project
        shell: bash
        run: |
          set -euo pipefail
          PROJECT_NAME="${{ inputs.project_name }}"
          OUTPUT="$(supabase projects create "$PROJECT_NAME"             --org-id "$SUPABASE_ORG_ID"             --region "${{ inputs.region }}"             --db-password "$SUPABASE_DB_PASSWORD"             --output json             --yes)"
          printf '%s' "$OUTPUT" > /tmp/obsidian-project.json
          REF="$(node - <<'NODE'
          const fs = require("fs");
          const value = JSON.parse(fs.readFileSync("/tmp/obsidian-project.json", "utf8"));
          const ref = value.ref || value.project_ref || value.id || "";
          if (typeof ref === "string" && /^[a-z0-9]{20}$/.test(ref)) process.stdout.write(ref);
          NODE
          )"
          if [ -z "$REF" ]; then
            supabase projects list --output json > /tmp/obsidian-projects.json
            REF="$(PROJECT_NAME="$PROJECT_NAME" node - <<'NODE'
            const fs = require("fs");
            const name = process.env.PROJECT_NAME;
            const rows = JSON.parse(fs.readFileSync("/tmp/obsidian-projects.json", "utf8"));
            const matches = (Array.isArray(rows) ? rows : []).filter(p => p && p.name === name);
            matches.sort((a,b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
            const ref = matches[0]?.ref || matches[0]?.id || "";
            if (typeof ref === "string" && /^[a-z0-9]{20}$/.test(ref)) process.stdout.write(ref);
            NODE
            )"
          fi
          test -n "$REF"
          echo "project_ref=$REF" >> "$GITHUB_OUTPUT"
      - id: key
        name: Discover publishable application key
        shell: bash
        run: |
          set -euo pipefail
          REF="${{ steps.create.outputs.project_ref }}"
          supabase projects api-keys --project-ref "$REF" --output json > /tmp/obsidian-keys.json
          KEY="$(node - <<'NODE'
          const fs = require("fs");
          const value = JSON.parse(fs.readFileSync("/tmp/obsidian-keys.json", "utf8"));
          const rows = Array.isArray(value) ? value : (Array.isArray(value?.keys) ? value.keys : Object.values(value || {}));
          const candidates = rows.filter(Boolean);
          const keyOf = x => typeof x === "string" ? x : (x.api_key || x.key || x.value || "");
          const row =
            candidates.find(x => /^sb_publishable_/.test(keyOf(x))) ||
            candidates.find(x => String(x?.type || x?.name || "").toLowerCase().includes("publishable")) ||
            candidates.find(x => String(x?.name || "").toLowerCase() === "anon");
          const key = keyOf(row);
          if (typeof key === "string" && key.length >= 20) process.stdout.write(key);
          NODE
          )"
          test -n "$KEY"
          echo "::add-mask::$KEY"
          echo "publishable_key=$KEY" >> "$GITHUB_OUTPUT"
      - name: Bind backend to this application repository
        shell: bash
        run: |
          REF="${{ steps.create.outputs.project_ref }}"
          KEY="${{ steps.key.outputs.publishable_key }}"
          gh variable set SUPABASE_PROJECT_REF --body "$REF"
          gh variable set VITE_SUPABASE_URL --body "https://$REF.supabase.co"
          gh variable set VITE_SUPABASE_PUBLISHABLE_KEY --body "$KEY"
      - name: Provisioning summary
        shell: bash
        run: |
          {
            echo "### Obsidian backend provisioned"
            echo ""
            echo "Project ref: \`${{ steps.create.outputs.project_ref }}\`"
            echo "Public app URL and publishable key were saved as GitHub Actions variables."
            echo "Database password and management access token remain GitHub secrets."
            echo "Run the guarded backend deployment next to apply reviewed migrations and Edge Functions."
          } >> "$GITHUB_STEP_SUMMARY"
`;

const BACKEND_README = "# Application backend deployment\n\nThis project has its own Supabase schema, private uploads and an authenticated Edge Function.\n\n## First setup\n1. Create or choose a **separate** Supabase project owned by this application. You are responsible for its cost, permissions, backups and usage.\n2. In GitHub repository Settings → Secrets and variables → Actions, choose either an existing project or guarded provisioning:\n   - Existing project: set SUPABASE_PROJECT_REF, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY as variables.\n   - New project through Obsidian: set SUPABASE_ORG_ID as a variable plus SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD as secrets, then run the Obsidian Provision Backend workflow and type CREATE_SUPABASE_PROJECT. It creates the project and writes the three public variables automatically.\n   - SUPABASE_ACCESS_TOKEN should be scoped to the user's own Supabase account/organization.\n   Never put secret/service-role keys in VITE_ variables or frontend files.\n3. Review both SQL migrations, the storage RLS policies, and account-status/index.ts. Test policies for two users on a nonproduction project first.\n4. Set up GitHub environment production-backend with required reviewers to add human approval before database changes.\n5. Run the \"Deploy Full App backend\" workflow in GitHub Actions. Choose functions-only if schema is already in place. The workflow deploys every reviewed function under `supabase/functions/`. Choose schema-and-functions ONLY after reviewing migration diff and confirming the target project. Type APPROVE_BACKEND_CHANGES exactly.\n6. In Full App → GitHub, use Backend readiness and Deploy backend after completing setup. The UI requests the same gated GitHub workflow; it does not create a Supabase organization/project or store management tokens in Obsidian.\n7. Verify login and logout, per-user app_items RLS, private upload/read/delete (max 5 MB), signed URLs, and account-status function with a signed-in account.\n8. Confirm production authorization, site origin/redirect URLs, backup policy, recovery and cost limits before inviting users.\n\n## Security\nStorage objects must be under <user-uuid>/<uuid>.<png|jpg|pdf>; buckets are private. Only authenticated owners may select/insert/update/delete their path. Signed object URLs expire after 60 seconds. The sample Edge Function rejects requests without a validated user JWT and reads app_items as the user, under its RLS policy. It never uses service-role keys.\n\n## Deployment boundaries\nDatabase and Edge Functions deploy **only** through an explicit GitHub Actions invocation, separate from frontend publication. This does not auto-provision paid Supabase projects. It supports owner-managed backend deployment, not dynamic creation of a separate hosted database for every ObsidianCoder end user without their authorization.\n\nThe generated app uses static React hosting; server-side processing runs on the app's own Supabase Edge Functions. Add more functions or reviewed migrations and redeploy deliberately.\n";

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
