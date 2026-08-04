# Fix Cloud Memory: identity bug first, then the smarter directive

## Answer to your question

The module you pasted is a real improvement over the current `src/lib/memory-directive.ts` — it adds prompt-aware gating, a correction branch when the prompt names Firebase/Supabase, and two post-generation checks (`detectForbiddenStorage`, `usesMemorySubscription`) that the current version has no equivalent for.

But on its own it would not make Cloud Memory work, because the blocker is not the prompt. It's on the save path.

## The actual blocker (verified)

`project_sync` has **0 rows** and `build_memory` has **0 rows**, while `builds` has 881 rows. In `src/routes/api/projects.ts` the save handler resolves identity like this:

```text
ownerSession = site unlocked with 9822
user         = resolved ONLY when NOT an owner session
save         → runs
touchProjectSync(user, ...) → skipped, because user is null
```

You always browse unlocked with 9822, so the server discards your signed-in identity and never writes a `project_sync` row. No sync row means no `cloud_memory = true` default, no team code, no share slug, and nothing for `build_memory` to attach to. Signing in and publishing cannot change that — which is exactly what you saw.

## The fix

1. **Identity ordering** in `src/routes/api/projects.ts`: resolve the signed-in user first, fall back to the unlock session only when there is no bearer token. Owner sessions keep bypassing credit metering, so billing behavior is unchanged. With a real user id present, `touchProjectSync` runs and creates the sync row with Cloud Memory on by default.
2. **Adopt your directive module**, replacing the current `memory-directive.ts`: keep `memoryDirectiveFor(prompt)` gating, the correction branch, `detectForbiddenStorage`, and `usesMemorySubscription`.
   - One change to the gating: apply the directive when the prompt matches OR when the build is a full app build, and keep it off only for advisory/analysis responses. Pattern matching alone would silently skip builds that are stateful but worded oddly.
3. **Use the post-generation checks** in `src/routes/api/generate.ts`: after a build comes back, if `detectForbiddenStorage` finds anything or `usesMemorySubscription` is false for a stateful build, run one targeted repair pass instructing the model to move that state to `ObsidianMemory` and register `onChange`.
4. **Popover honesty** in `CloudMemoryButton`: when there is no sync row yet, say "Save this build to the cloud first" rather than showing an inert switch.
5. **Verify end to end**: save a build signed in → confirm one `project_sync` row with `cloud_memory = true` → turn on the live URL → write a record from the preview → confirm a `build_memory` row → open the team URL with code 9822 and read it back.

## Technical notes

- No database migration. The schema, RPCs and RLS for `project_sync` / `build_memory` were already proven working in the earlier server-side round trip; only the app never reached them.
- `src/routes/api/projects.ts`: swap `ownerSession ? null : resolveUserFromRequest(request)` for resolve-user-first with owner fallback; the `if (user)` guard around `touchProjectSync` then passes.
- `src/lib/memory-directive.ts`: replaced with your version plus the build-type gate; call sites in `generate.ts` updated from `memoryDirective()` to `memoryDirectiveFor(prompt)`.
- Self-tests in `src/lib/__tests__/selftest.mts`: cover the new gating (stateful vs. static prompt), the correction branch, both detectors, and that a signed-in request carrying an unlock cookie still yields a user id on the save path.
