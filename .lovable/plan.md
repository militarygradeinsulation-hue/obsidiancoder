# Fix: "Build Free" promise blocked by paywall

## Confirmed issue
The homepage (`src/routes/index.tsx`) and `/build` (`src/routes/build.tsx`) advertise "one high-quality project free, no credit card required" and route every CTA to `/build`. But the moment a visitor submits a prompt, `src/routes/api/generate.ts` calls `requirePaidOperation(...)` in `src/lib/credit-gate.server.ts`, which returns `401 auth_required` for anonymous callers and `402 not_pro` for signed-in free users. The client's `authFetch` turns that into an `obs:paywall` event and `build.tsx` opens the pricing modal. There is no free-tier bypass or anonymous quota anywhere in `credit-gate.server.ts` or `gate.functions.ts`.

This needs a product decision before code — two viable directions.

## Option A — Deliver one real free build (recommended, matches current copy)

Grant every visitor (anonymous or signed-in free) exactly one successful `generate_html` per browser + IP, then paywall everything after that (including further edits, enhance, chat).

Server changes:
- New table `public.free_build_ledger` (fingerprint text PK: sha256 of IP + a signed browser cookie id, `used_at timestamptz`, `environment text`). GRANT on the table + RLS restricting all access to `service_role`; the endpoint is the only reader/writer.
- New helper in `src/lib/credit-gate.server.ts`: `tryConsumeFreeBuild(request)` that (a) reads/sets an httpOnly `obs_fb` cookie, (b) hashes cookie + `x-forwarded-for` first hop, (c) atomically inserts into the ledger, (d) returns `{ granted: true }` on first use and `{ granted: false, reason: "free_build_used" }` after.
- `requirePaidOperation` in the same file gains an early branch: for `operation === "generate_html"` only, when the caller has no active Pro, call `tryConsumeFreeBuild`; if granted, return a synthetic `allowed` entitlement with `mode: "free_trial"` and skip the credit reservation. `enhance_prompt`, `patch_html`, and every other op stay paywalled.
- `src/routes/api/generate.ts` needs no change beyond returning the new mode in the response so the client can display "You've used your free build — upgrade to keep going" after the first success.

Client changes:
- `src/routes/build.tsx`: on a `free_build_used` denial, open the pricing modal with a friendly headline ("Your free build is saved — upgrade to keep editing") instead of the generic paywall copy.
- `src/routes/index.tsx`: no copy changes needed; the promise now matches behaviour.

Risk: single-IP abuse is possible but bounded (one free `generate_html` per fingerprint). No credit-card cost since generate is served through the existing AI gateway budget.

## Option B — Keep the paywall, correct the copy

If the business does not want to give anonymous visitors a free `generate_html`, update `src/routes/index.tsx` so the hero, nav, examples, and pricing tier stop promising a free build. Concretely:
- Nav CTA "Build Free" → "See pricing" (links to `/unlock`).
- Hero CTA "Build Free – No Credit Card Required" → "Start your 7-day Pro trial for $5" (links to `/unlock?intent=buy&priceId=obsidian_try_pro_7day`).
- Pricing tile "Free · $0 · Start free" → remove entirely (or convert to "$5 trial").
- FAQ answer "Do I need an account? Not to try." → rewrite to reflect that a paid trial is required.
- Example-prompt tiles still link to `/build`, but `/build` gets a `beforeLoad` gate that redirects unauthenticated + non-Pro users to `/unlock` with `?intent=buy`.

Risk: none — this is a copy/routing change.

## Recommendation
Option A. It's the smaller lie to fix (the copy is already live and users have seen it), the entitlement plumbing already understands multiple modes, and one free `generate_html` per fingerprint is a common conversion funnel. Option B is only better if you specifically don't want any anonymous AI spend.

## Technical detail (for engineer implementing A)
- Migration must GRANT `ALL` on `public.free_build_ledger` to `service_role` only, no anon/authenticated grants; `ENABLE ROW LEVEL SECURITY`; no policies (locked).
- Fingerprint hash uses `SESSION_SECRET` as HMAC key so the same IP + different browsers don't collide, and so a leaked cookie can't be replayed across projects.
- Cookie: `obs_fb=<uuid>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=63072000`.
- On a successful free build, immediately update `subscriptions`-analogue state exposed by `/api/public/entitlement.ts` so the CreditBar shows "Free build used — upgrade" instead of "0 credits".
- Do NOT extend the free path to `enhance_prompt` or `patch_html` — one full generation only.
