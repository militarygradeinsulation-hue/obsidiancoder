# Fix: Cloud Memory never activates for your builds

## What I found

Your database still has **0 rows** in `project_sync` and **0 rows** in `build_memory`, even after signing in and publishing — while `builds` has 881 rows. So saves are working, but the sync/memory records that Cloud Memory depends on are never created.

The cause is in the save endpoint (`src/routes/api/projects.ts`). It checks the site-unlock session *first*:

```text
ownerSession = unlocked with site password (9822)
user         = only resolved when NOT an owner session
save         → runs
touchProjectSync(user, ...)  → SKIPPED because user is null
```

Since you always browse unlocked with 9822, the server treats you as an anonymous "owner session" and throws away your signed-in identity. `project_sync` needs a real user id (it is the row owner), so it is never written. No `project_sync` row means:

- no `cloud_memory = true` default on first save,
- no share slug / team URL,
- the Cloud Memory popover has nothing to switch on,
- `build_memory` can never receive records.

That matches exactly what you're seeing: signing in and publishing changes nothing.

## The fix

1. In the save handler, resolve the signed-in user **first** and use the unlock session only as a fallback for users who aren't signed in. When both are present, the real user wins, so `touchProjectSync` runs and creates the `project_sync` row (with `cloud_memory = true` and the default team code 9822 already implemented).
2. Do the same identity ordering anywhere else the unlock session shadows a real login on paths that write owner-scoped rows (checked in the same pass: the sync route already requires a bearer token and is fine).
3. Surface the real reason in the Cloud Memory popover instead of silence: if the build has no `project_sync` row yet, say "Save this build to the cloud first" rather than showing an inert switch.
4. Verify end to end after the change:
   - save a build while signed in → confirm one `project_sync` row exists with `cloud_memory = true`,
   - turn on the live URL → confirm a share slug,
   - have the running preview write a record → confirm a `build_memory` row,
   - open the team URL with code 9822 → confirm the same record reads back.

## Technical notes

- File: `src/routes/api/projects.ts` — swap the `ownerSession ? null : resolveUserFromRequest(...)` ordering to `resolveUserFromRequest(...) ?? ownerSession fallback`; keep the existing rule that owner sessions bypass credit metering, so nothing about billing changes.
- No database migration is needed; the schema, RPCs and RLS for `project_sync` / `build_memory` are already correct and were proven working in the earlier server-side round trip.
- Self-tests in `src/lib/__tests__/selftest.mts` get an assertion that a signed-in request with an unlock cookie still yields a user id on the save path.
