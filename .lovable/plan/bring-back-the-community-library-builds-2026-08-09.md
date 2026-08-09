# Bring back the community library builds

## What's happening

The builds are not gone. The database still holds 921 builds, 687 of them marked public with share links. The community feed simply returns an empty list: `/api/public/community?limit=24` currently responds `{"builds":[]}`.

Cause: the `builds` table has a blanket "deny all direct client access" security rule that overrides the "public builds are viewable by everyone" rule. Blanket deny rules always win, so the public read path sees zero rows even though the data is there. The feed was switched to the public read path recently (to fix a 500 error), which is when the library went blank.

## The fix

1. Replace the blanket deny rule on `builds` with a narrow one that still blocks inserts, updates, and deletes from browsers, but allows reading rows where `is_public = true`. All private builds stay unreadable.
2. Re-check the feed after the change and confirm the library page fills up again.
3. Raise the over-fetch used by the de-duplication step so a full page of distinct builds is returned instead of a short page after duplicates collapse.

## Technical notes

- Migration on `public.builds`: drop the restrictive `ALL ... USING (false)` policy, add restrictive policies for INSERT/UPDATE/DELETE only (`WITH CHECK (false)` / `USING (false)`), keeping the permissive `SELECT ... USING (is_public = true)` for `anon` and `authenticated`. Confirm `GRANT SELECT ON public.builds TO anon, authenticated` is present.
- No column exposure change: `src/routes/api/public/community.ts` already selects only listing metadata (no `html`, no `library_code`, no `user_id`).
- Verification: `curl /api/public/community?limit=24` should return a non-empty `builds` array, then load `/library` in the preview.
