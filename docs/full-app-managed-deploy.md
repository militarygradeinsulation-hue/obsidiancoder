# Full App: managed build, dependency selection, and publishing

## New workflow
In Full App choose from the approved, pinned dependency list. Your workspace keeps the selection alongside its files in the existing cloud-project JSON. Protected `package.json`, `vite.config.ts`, and workflow files are always regenerated from trusted templates.

Use the GitHub modal to export to a **new repository**. The export now includes `.github/workflows/obsidian-build.yml` (push, PR, manual) and `.github/workflows/obsidian-publish.yml` (manual only).

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
