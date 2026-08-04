# Verify Cloud Memory end to end

## Current state (checked)

The database still has **0 rows** in both `build_memory` and `project_sync`, and **0** projects with Cloud Memory switched on. So the plumbing is in place, but no build has ever completed a real sync round trip. Until one does, "Cloud Memory works" is unproven.

## What the verification run does

Drive the real app in a headless browser against the running preview, signed in as you, and prove each link in the chain:

1. Open the Coder, generate a small stateful build (a task list) with a prompt that would previously have used localStorage.
2. Inspect the generated HTML for `ObsidianMemory.set/get/list/onChange` and confirm no `localStorage`/Firebase storage slipped in.
3. Save the build to cloud, then confirm a `project_sync` row exists with `cloud_memory = true` and a team code hash.
4. Interact with the live preview (add a task) and confirm a matching row lands in `build_memory` with the right key and value.
5. Turn on the live/share link, open the same build through the public team URL in a second browser context, and confirm the task is visible there.
6. Change the record from the second context and confirm the first preview updates without a reload (the `onChange` path).
7. Check the Cloud Memory popover shows entry count/last update, and that the "this build does not use Cloud Memory" warning does not appear for a build that does.

## Expected side effects

This is a real run, so it creates real data: one generated build (consumes a build credit), one `project_sync` row, and a few `build_memory` records. All of it is throwaway and can be deleted afterward.

## Reporting

I report, per step, pass or fail with the concrete evidence (row counts, screenshots, console output). Any step that fails gets a specific diagnosis rather than a blanket "fixed". If something breaks, I stop and come back with the failure before changing code.
