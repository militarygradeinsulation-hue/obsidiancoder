# Native Full App workspace (phase 2)

## What changed
The `/full-app` route now lets authenticated or unlocked users:
1. Import the current Studio HTML as the original design (isolated sandbox preview).
2. Edit a persistent multi-file React + TypeScript source tree directly in ObsidianCoder, including additional components and SQL migration proposals.
3. Ask an AI coding provider for **reviewable** changes to multiple source files in one response.
4. Review whole-file changes, discard or apply them atomically. Edits are never applied during generation.
5. Save/open a full app as `projectJson: {type:"obsidian-full-app.v1", files}` using the existing authenticated cloud project API, or continue with account-scoped browser persistence.
6. Export the **edited** source tree through the existing GitHub modal in Full App mode.

Both Studio and Pocket still use their prior HTML generation routes and editor behaviors. Full App is a separate workspace.

## Architecture
- `src/routes/full-app.tsx` — file browser/editor, AI review, import, cloud save and GitHub export.
- `src/lib/full-app-edits.ts` — path allowlist, JSON edit validation, deduplication, atomic changes, fingerprints, server-side source reconciliation.
- `src/routes/api/full-app/edits.ts` — metered model call using Obsidian's existing provider chain. Returns a proposal; cannot write files or run migrations.
- `src/routes/api/github.ts` — can now receive an approved Full App file tree; reconstitutes protected template files from sanitized HTML and includes only allowed edits.
- `src/components/GithubModal.tsx` — receives an optional current Full App file map; existing static site publishing unchanged.

## Security boundaries
- Browser/AI cannot edit `.env`, package scripts, the auth client, runtime bootstrap, generated HTML source, or the initial RLS migration using the workspace edit protocol.
- New SQL migrations are proposals and require manual review/application. No database is silently provisioned for end-user projects.
- AI receives only bounded editable text files; it does not receive the user's GitHub credentials or protected configuration.
- No AI response changes the local project until the user explicitly accepts the edit plan.
- The generated HTML is restricted by a sandboxed iframe without `allow-same-origin`.
- Server GitHub export re-creates protected files from trusted source instead of accepting browser substitutions.
- Cloud saves use the existing project ownership checks and remain subject to that API's subscription/credit policy. Existing cloud Studio projects are not overwritten when imported as Full App starters.

## Operational limits and future scope
This is **native source editing**, not in-browser TypeScript bundling. The visual preview shows the original design, not a live compile of edited React files. Full App code runs after export, npm installation, Supabase configuration, and deployment to a build-capable host. It does not yet provision per-app databases, APIs, Stripe, file storage, deployments, or project-level AI runtime credentials. AI can generate code for those systems, but users must review and configure them. Collaboration conflicts are last-write-wins in the current cloud project API; prefer saving one device at a time.

## Acceptance checks
- Run `bun install --frozen-lockfile`, `bun src/lib/__tests__/native-full-app.selftest.mts`, `bunx tsc --noEmit`, and `bun run build`.
- Generate a design in Studio, open Full App, import the design and verify that it is sandboxed.
- Add a component, edit `src/App.tsx`, reload, verify source persists locally; save and open on a second authenticated device.
- Request an AI edit, inspect the proposed files, discard once, generate again, apply and confirm the original source is unchanged until approval.
- Confirm protected file paths and duplicate operations are rejected.
- Export source to a **new** GitHub repository, inspect files, run the app's README setup, and verify Supabase RLS with two independent test users.
- Publish the Obsidian site only after the GitHub branch is reflected in Lovable and all checks pass.
