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

## Limits
This phase provides managed builds, **static frontend** GitHub Pages hosting, and public backend-variable configuration. It does not automatically create a Supabase database, apply SQL migrations, provision serverless functions, support secret server-side integrations, or deploy full-stack SSR to a managed runtime. The user's generated React app must be compatible with static hosting or use an external backend. The first deployment may require GitHub Pages settings/permissions appropriate for the user's plan.

## Acceptance
- Run `bun src/lib/__tests__/full-app-managed-build.selftest.mts`.
- Run existing native workspace and React preview self-tests, TypeScript validation and the application build.
- Generate an app with optional Lucide/Zod. Verify exported `package.json` and both GitHub Actions workflows.
- Test export with a fine-grained token permitted for a new GitHub repository; confirm the build passes and reports its status in ObsidianCoder.
- Confirm server rejects an unknown dependency, a secret key, an invalid Supabase host, an unknown repository, and a publish request before the current commit's successful build.
- Test that only an explicit publish action deploys to GitHub Pages.
