# Weekly demand-test audit — read-only, as of 2026-08-22 12:57 UTC

No files or data were changed. All evidence below comes from live backend tables, project code, and project history.

## Headline verdict

Under your stated exclusions (no founder builds, no consulting interest, no discounts, no off-platform rescue), **zero demand-test criteria are VERIFIED**. Every commercial signal is ZERO, and every behavioral criterion (three-hour blocks, cold-build tests, design-partner sessions, non-founder useful builds, day-2 returns) is NOT PROVABLE because no table or log records it.

## Current counts (exact table evidence)

| Metric | Value | Source |
|---|---|---|
| Builds (all time) | 1,036 | `public.builds` count |
| Distinct non-null `user_id` in builds | 1 (`232c65fa-…c77` = aisystemsarchitect@gmail.com, founder) | `builds.user_id` group-by |
| Builds with `user_id` NULL (anonymous/unattributed) | 1,001 | same |
| First / last build | 2026-07-19 16:08:06Z / 2026-08-21 18:07:59Z | `builds.created_at` |
| Auth users | 7 | `auth.users` |
| Profiles | 7 | `public.profiles` |
| Free build uses | 8 (fingerprint-keyed, last 2026-08-11 10:11:53Z) | `public.free_build_ledger` |
| Subscriptions | 0 rows | `public.subscriptions` |
| One-time purchases | 0 rows | `public.one_time_purchases` |
| Trial claims | 0 rows | `public.trial_claims` |
| Credit usage rows | 0 | `public.credit_usage` |
| AI usage rows | 1,815, all with `user_id` NULL, 26 distinct days, last 2026-08-18 01:34:14Z | `public.ai_usage` |
| Waitlist entries | 1 — Joe Toney / supermanprime27@gmail.com, `paid=false`, created 2026-07-21 14:16:53Z | `public.waitlist_entries` |
| Feedback | 1 row, message body is literally "Text", 2026-07-25 14:51:07Z | `public.feedback` |
| Saved ideas | 11 | `public.saved_ideas` |

Account list (`auth.users`, all 7): aisystemsarchitect@ (2026-07-20, last sign-in 2026-08-11), militarygradeinsulation@ (2026-07-25, last sign-in 2026-07-26), dean.aetheristechnology@ (2026-07-28, last 2026-07-29), bradenroberts36@ (2026-07-30), brob@aetheristechnology.com (2026-07-31), salernoluka03@ (2026-08-01), algorithmictradingsolutions@ (2026-08-07). Four of seven are Aetheris-affiliated or founder-adjacent addresses; three (bradenroberts36, salernoluka03, algorithmictradingsolutions) have `last_sign_in_at` equal to `created_at` — signed up once, never returned.

## Criterion-by-criterion

**Protected three-hour blocks completed — NOT PROVABLE.** No table, log, or code path records work blocks. `rg` across `src/` and `.lovable/` finds no such tracking.

**Cold-build-test recordings/results — NOT PROVABLE.** No recordings table, no session capture, no test-result store. `ScreenCapture.tsx` exists as a build feature, not as an instrumented cold-test log.

**Public funnel milestones — ZERO beyond signups.** Funnel end-states are all empty: 0 subscriptions, 0 purchases, 1 unpaid waitlist row (the founder's own name). No checkout-event table exists, so presented-checkout counts cannot be read from the backend at all.

**Design-partner sessions — NOT PROVABLE.** No CRM, session, or partner table.

**Useful builds by non-founder users with zero off-platform rescue — ZERO provable.** Only one `user_id` ever appears on a build row, and it is the founder's. The other 1,001 builds carry `user_id = NULL`, so authorship, usefulness, and rescue-free completion cannot be attributed to any non-founder. This is an attribution gap, not proof of absence — but under your rules it counts as zero.

**Users who returned a later day and independently edited/built again — ZERO provable.** Every multi-day builder in the data is the founder account. Of the three non-Aetheris signups, none has a `last_sign_in_at` later than their signup timestamp.

**Full-price $79 Creator checkouts presented — ZERO, and structurally impossible.** No $79 price exists in the product. `src/lib/plans.ts:62` records that Creator/Vibe was corrected from $79 to $39 on 2026-08-09; the live lookup keys are `obsidian_pocket_monthly` ($10) and `obsidian_creator_monthly` ($39). Nothing in the current build can present a $79 checkout.

**Full-price $79 payments completed / retained ≥7 days — ZERO.** `subscriptions` and `one_time_purchases` are both empty tables. There is no payment of any amount, at any price, ever recorded.

## Biggest product failure discovered since August 15

**Build authorship is not being written for essentially all builds.** 1,001 of 1,036 build rows — including 5 on Aug 15, 6 on Aug 16, 1 on Aug 17, 7 on Aug 18 — have `user_id = NULL`, and all 1,815 `ai_usage` rows have `user_id = NULL`. This is the failure that makes the entire demand test unmeasurable: even if a real non-founder had built something useful and returned the next day, the backend would have no record tying them to it. Every other metric downstream (retention, activation, per-user credit economics, conversion) is unreadable for the same reason.

Secondary, verified from history: build quality regressions and generation timeouts dominated the Aug 8–11 work, and the archived plans confirm repeated quality/latency firefighting rather than funnel work.

## Fixes completed since August 15 (project history evidence; no dated commits available in this workspace)

`git log --since=2026-08-15` returns nothing in this checkout, so the following is from project message history, not commit timestamps — treat the dates as approximate:

- Build Archive shipped (`src/lib/build-archive.ts`, `src/routes/archive.tsx`) with IndexedDB durability fallback.
- Latency work: non-blocking cinematic review, proven-template reuse path, stage-timing trailer.
- Quality contract (`src/lib/quality-contract.ts`) — deterministic font and focus-style injection, timing persisted to version metadata.
- Build signature footer (`src/lib/build-signature.ts`) — Aetheris/Obsidian footer on every build.
- Share-URL lookup in Library (`community.ts`, `community.$id.ts`).
- Style lock (`src/lib/style-lock.ts`) and sidebar close fix.
- Two applied bug-fix diffs: gateway key fallback in `api/patch.ts`, real-tier credit metering in `api/public/entitlement.ts`, pricing rendered from `PLAN_TIERS`, sign-in project restore, preview first-paint fix; then Pocket memory sync, review-policy loosening, scanner regex reset, component-registry dedupe.

## The one thing worth fixing first

Nothing about pricing, quality, or features can be evaluated until builds and AI usage carry a real `user_id` (or a stable anonymous visitor id). That instrumentation gap is the reason this audit returns NOT PROVABLE instead of a number on almost every line.
