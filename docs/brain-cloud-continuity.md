# Obsidian Brain cloud continuity

## Scope
Authenticated users now sync scored build outcomes, notes, facts, and decisions between their devices. Local storage remains the offline read/write queue. The existing deterministic queryBrain engine, local project memory, and generated app Cloud Memory are preserved.

## Data model
`supabase/migrations/20261027180000_obsidian_brain_records.sql` creates `public.obsidian_brain_records`, a user-owned table with row-level security. Every record has a stable ID, a project scope (`global` or cloud project ID), an update timestamp, and an optional deletion tombstone. The client merges by record ID and latest timestamp. Rows deleted in the UI are tombstoned so older devices do not silently restore them.

Learning records contain the privacy-minimized `BuildLearningEntry` produced by `build-learning.ts`, not code, prompts, or rendered HTML. Custom notes are free text and therefore can include information the user explicitly enters.

## Sign-in and project scope
Only authenticated users sync; cached cloud records are keyed by the signed-in Supabase user ID. No account code or library code is sent to the database. Unsaved projects cannot have portable project-specific identity, so their knowledge is saved in global scope. After saving a project to cloud, future notes can use its cloud project ID.

## Runbook
1. Apply the SQL migration to the actual Supabase project before deploying code. Confirm RLS policies permit user A to read/write only their own records and deny anonymous access.
2. Run `npm ci && npm run build && npm run lint`. Run `node --experimental-strip-types src/lib/__tests__/brain-cloud.selftest.mts` in a Node version supporting type stripping, or use your configured TS runner. Run existing Obsidian Brain self-tests.
3. Sign in on device A, save a note and finish a scored build, then sign in on device B and confirm both appear in Brain. Check Studio and Pocket reuse cloud learning. Test editing/deleting notes, network disconnect/reconnect, logout/account switching, and two-device timestamp conflicts.
4. Confirm migration and release in the connected production environment; pushing GitHub code does not itself apply database migrations.

## Limits
Sync is periodic and focus-triggered, not true real-time. The currently displayed Brain page only shows up to 250 recent cloud records, with up to 60 scored learnings admitted to the planner. The merge uses device timestamps (clock skew is a known limitation). Local unsaved sessions, archives, component markup, and other private per-device stores are not uploaded by this feature. This release does not implement a full automatic project memory migration from those legacy stores.
