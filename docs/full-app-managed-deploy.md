# Full App: managed build, dependency selection, and publishing

## New workflow
In Full App choose from the approved, pinned dependency list. Your workspace keeps the selection alongside its files in the existing cloud-project JSON. Protected `package.json`, `vite.config.ts`, Playwright QA files, and workflow files are always regenerated from trusted templates.

### Obsidian Build Engine — phase 1
Every newly exported Full App now contains a real isolated build-and-test path on GitHub Actions:

1. Install the pinned project dependencies on an Ubuntu runner.
2. Run the real TypeScript + Vite production build.
3. Install a pinned Playwright/Chromium test runtime.
4. Launch the production build locally on the runner.
5. Open it in Chromium at desktop and mobile viewport profiles.
6. Fail QA for an empty render, failed HTTP response, meaningful horizontal overflow, or uncaught browser runtime error.
7. Save full-page screenshots, traces/report data, and a bounded Obsidian build report as workflow artifacts.
8. `Obsidian Ship` repeats production build + browser QA and deploys to GitHub Pages only after both pass.

The generated app therefore has two distinct release paths:
- **Build + QA** — verify a revision without publishing it.
- **Ship verified app** — verify and publish in one gated workflow.

This is the first Build Engine implementation. Execution stays isolated from ObsidianCoder itself; generated application code runs on GitHub-hosted runners, not inside the Obsidian account/server process.

Use the GitHub modal to export to a **new repository**. The export now includes `.github/workflows/obsidian-build.yml` (push, PR, manual), `.github/workflows/obsidian-publish.yml` (manual legacy publish path), and `.github/workflows/obsidian-ship.yml` (QA-gated build + publish).

After export, in the same GitHub modal enter/select the app repository and:
1. Check the latest build status, or trigger a new production build. GitHub Actions installs and builds on its own isolated runner; ObsidianCoder does not run the code.
2. Optionally save the app's own **public** Supabase project URL and `sb_publishable_` key as Actions repository variables. Do **not** use ObsidianCoder's own project credentials.
3. After a build for the **current** default-branch commit succeeds, explicitly request GitHub Pages publication. The server refuses to publish a revision without a matching successful CI run.
4. Check the publishing workflow's result and then test the hosted app's sign-in, per-user data isolation, SQL migrations, redirect URLs, and mobile behavior.

## Security and ownership
- Actions build job has `contents: read` only. Publishing job has `pages: write` and `id-token: write` with the `github-pages` environment.
- Only four audited, version-pinned optional packages are accepted by the export API: Lucide, Zod, date-fns, and clsx. Arbitrary npm dependencies/scripts are not accepted through ObsidianCoder.
- Supabase config fields are **publishable public values** that are compiled into the frontend (never secret/service-role keys). They are submitted to GitHub's Variables API, not stored in the Obsidian project JSON.
- GitHub API scopes are required: Actions read/write to dispatch and see results, Variables write to configure settings, plus Pages/Administration write to host.
- No GitHub Pages site is enabled during Full App export. Publishing is a distinct action, after a successful current-revision build.
- Creating a full application still uses a new GitHub repository rather than overwriting any existing user's code.
- CI installs generated project dependencies with `npm install` on a GitHub runner. The starter pins versions but initially has no lockfile; commit a generated lockfile for fully reproducible installs.

## Production application workflow

Full App now has a broader production path:

1. **Architect** — App Architect turns the product request into a structured blueprint covering routes, users, entities, auth, storage, server functions, integrations and acceptance checks.
2. **Implement** — the coding agent converts that blueprint into a bounded, reviewable multi-file React/Supabase edit plan.
3. **Connect or provision backend** — use an existing Supabase project through a scoped management token, or explicitly run the guarded `Obsidian Provision Backend` workflow to create a separate project in the user's own organization.
4. **Integration Vault** — secret-required integrations such as Stripe, Resend, Twilio, OpenAI, Google and HubSpot are stored in the app's Supabase Edge Function Secrets. Public browser-safe values are stored as GitHub Actions variables. Secret values are not written into project source or browser bundles.
5. **Database safety** — schema deployment runs `scripts/obsidian-migration-audit.mjs` before `supabase db push`. Destructive operations and missing RLS on newly-created public tables block the workflow; higher-risk constructs produce review warnings.
6. **Server deployment** — every reviewed function under `supabase/functions/` is deployed together rather than only the starter function.
7. **Build + QA** — the production Vite build is launched in Chromium and tested at desktop/mobile sizes.
8. **Repair** — failed runs can produce bounded diagnostics and a one-cycle targeted repair proposal or auto-repair.
9. **Ship** — a passing revision is deployed to GitHub Pages, then the actual production URL is opened and verified again.
10. **Monitor** — `Obsidian Production Health` rechecks the live site on demand and every six hours.
11. **Rollback** — successful Ship runs can be restored through a new forward-moving rollback commit followed by Build + QA + Ship.
12. **Domain** — a user-owned custom domain can be bound to GitHub Pages, with DNS health and HTTPS eligibility/status surfaced inside Obsidian.

### Credential boundaries
- The GitHub token remains browser-local and is used to manage the selected repository.
- A Supabase management token entered in the Integration Vault is used only for the requested Management API operations; it is not persisted in the Full App project.
- Runtime integration secrets are authoritative in **Supabase Edge Function Secrets**.
- GitHub Actions secrets are reserved for deployment/infrastructure credentials such as the Supabase management token/database password used by guarded workflows.
- GitHub Actions variables hold public build configuration such as the Supabase URL, publishable key and Stripe publishable key.
- Backend deployment is refused when required blueprint integrations are missing their runtime secrets or public variables.

## Current limits
The generated frontend currently ships through GitHub Pages, so the browser application must remain compatible with static React hosting. Server-side work runs through the app's Supabase Edge Functions rather than a general-purpose SSR/runtime host. Infrastructure creation remains explicit because a new Supabase project may incur usage/costs in the user's own account. Obsidian does not purchase infrastructure silently, bypass database review, or roll back production database state when frontend code is rolled back.

## Acceptance
- Run `bun src/lib/__tests__/full-app-managed-build.selftest.mts`.
- Run existing native workspace and React preview self-tests, TypeScript validation and the application build.
- Generate an app with optional Lucide/Zod. Verify exported `package.json`, Build, Ship, Health, Backend and Provision workflows.
- Run `bun src/lib/__tests__/full-app-blueprint.selftest.mts`, `full-app-integrations.selftest.mts` and `full-app-backend.selftest.mts`.
- Confirm the generated migration audit passes the trusted starter migrations and rejects an injected destructive migration.
- Test export with a fine-grained token permitted for a new GitHub repository; confirm Build + QA, Ship and Live Health report independently in Obsidian.
- Connect an app-owned Supabase project and confirm only secret **names** return to the browser after a vault write; the value must not be persisted in Full App project JSON.
- Confirm backend deployment is blocked when a blueprint-required runtime secret or public variable is missing.
- Confirm Ship verifies the actual deployed URL and stores live QA evidence.
- Confirm a previous successful Ship can create a non-force rollback commit.
- Confirm a custom domain can be set and that DNS/HTTPS status is surfaced separately from deployment status.
