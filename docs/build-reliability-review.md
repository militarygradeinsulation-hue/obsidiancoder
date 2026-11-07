# Build reliability review

Changes are implemented against main. Earlier Full App QA/Ship claims in the referenced conversation describe a different branch; this change does not claim those features are deployed here.

## Why generation takes time

- Studio can run a concept planner, generation, then local quality/repair checks. Provider first-byte retries can add another model attempt. Exact production timings require the existing OBS_TIMING trailer and workflow run logs; no before/after latency benchmark has been measured.
- Balanced/deep builds previously considered optional image/component planning even with existing HTML. Refine now skips those phases.
- Image attachments previously sent base64 bytes in the 20,000-character prompt, causing excessive input or request rejection. Project images now use short model tokens and are restored to exact image data after generation.
- Full App workflows install dependencies for each run. The generated workflows now cache the npm download directory and prefer cached packages.

## Background jobs

Studio and Pocket submit a persisted job and poll it. The database dispatches an independent HTTP runner. The runner holds its request until generation completes, rather than leaving an untracked Promise after responding. Only the runner that wins the existing atomic claim invokes generation; browsers cannot attach arbitrary job IDs. Explicit Stop requests cancellation; detaching a viewer leaves the job running. Authenticated ownership or a per-job guest capability protects status and cancellation.

Studio recovery adds a saved version for review, preserving any newer edits. Pocket recovers the result on return. Pending references are retained through transient errors and long jobs.

Deployment prerequisites:
1. Set OBSIDIAN_APP_URL to the canonical HTTPS application origin.
2. Deploy the application source with a request duration of at least 240 seconds for /api/public/jobs/run and /sweep.
3. Apply docs/build-jobs-operations.sql to the EXISTING Obsidian database. Confirm build_jobs, build_job_claim and build_jobs_stale already exist.
4. Retain/configure the existing minute cron sweep with a 240000ms HTTP timeout and the configured runner apikey.
5. Check job creation, independent runner delivery, explicit cancellation and navigation recovery in staging before production.

The connected Supabase account does not expose the project configured in this repository. These database and hosting prerequisites have not been applied or live-tested by this change. Stored bearer tokens still expire; delayed retries can fail authentication. Crash recovery remains at-least-once and may repeat provider work after a lease expires. No exactly-once billing guarantee is claimed.

## Images

Project image libraries are scoped to the existing Studio session or Pocket library and stored in IndexedDB on this device. Content images can be selected before or after a build and are embedded in the resulting HTML; cloud saves and exports of that HTML carry used images. Unused images are device-local. Images are resized and capped. Reference images are labeled context; this version supplies their names and purpose, not pixel-level vision analysis. Describe required visual details in the prompt.

## Refine

The server injects a preservation directive. Before durable results are marked complete, it restores image references, validates HTML, and checks existing stylesheets, style blocks and layout landmarks. Studio/Pocket also check results before committing. Explicit redesign requests permit redesign; focused styling requests permit styling changes. This is a deterministic guard, not screenshot comparison.

## Owned domains

The GitHub panel prepares a repository-bound TXT challenge, shows subdomain CNAME and root A-record alternatives, checks ownership/hosting DNS, attaches the domain to GitHub Pages, writes CNAME and configures root asset paths. Workflow projects republish after connection. Status reports DNS and GitHub's HTTPS certificate; the custom URL is presented as ready only after ownership, DNS, certificate approval and HTTPS enforcement.

The user must control DNS and publish the project first. GitHub Pages write permissions are required; workflow upgrades also need workflow write permission. No registrar changes or actual domain connection were performed in this review.

Sources: [GitHub Pages REST](https://docs.github.com/en/rest/pages/pages), [Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).
