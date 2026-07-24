## Goal
Make 21st.dev components land in more builds, land as *better* matches, and be visible when they don't — so builds stop looking generic.

## What changes

### 1. Sharper query planning (`src/routes/api/generate.ts`)
- Rewrite the Flash Lite planner prompt to emit **concrete, shadcn-shaped** queries:
  - Bad (today): `"modern hero"`, `"testimonials"`
  - Good: `"saas landing hero with product screenshot and cta"`, `"pricing table 3 tiers monthly yearly toggle"`, `"testimonial grid with avatars"`
- Ask for 3–5 queries (up from 3), require each to name a *section type + concrete detail*.
- Add a hard-coded per-archetype query seed: when the style-library picks A3 (Clean SaaS), inject baseline queries like `"feature bento grid"`, `"footer with newsletter"` even if the model returns thin output. Same seeding for A1/A2/A5/A7 where component-heavy archetypes benefit most.
- Skip planner only for true micro-edits — keep it on for "add a section", "add pricing", etc. (tighten the edit regex).

### 2. Keep more hits per query (`src/lib/twentyfirst.server.ts`)
- `searchComponents` currently fetches code for **top 1 hit only**. Change to fetch top **2** (configurable, default 2) in parallel via `Promise.all`.
- De-dupe by identifier across queries so the same component isn't injected twice.
- Return richer metadata (author, install snippet) so the model can cite it in the archetype header comment.

### 3. Raise + smarten the injection cap (`src/routes/api/generate.ts`)
- Bump total component payload cap from **~40 KB → ~90 KB** on fresh builds (Gemini 3.5 Flash and 3.1 Pro both have room).
- Truncation strategy: instead of "truncate longest first", **rank by query order** (query 1 = hero > query 2 = pricing > …) and drop from the tail; keeps the hero always intact.
- Per-component soft cap of 15 KB so one giant component can't crowd out the others.

### 4. Health + telemetry
- New response headers already exist (`X-Obs-Components`, `X-Obs-Component-Count`). Add:
  - `X-Obs-Component-Queries` (comma-separated planner output)
  - `X-Obs-Component-HitRate` (`hits/queries`)
  - `X-Obs-21st-Auth` (`ok` | `bad` | `missing`)
- Add a small **"21st.dev Health"** card in `/demos` (admin only) that reads those headers from the last N builds via a new lightweight in-memory ring buffer on the server (`src/lib/twentyfirst-metrics.server.ts`) exposed by a `getTwentyfirstHealth` server fn. Shows: total builds today, avg queries, avg hits, auth status, last 10 query→hit rows.
- Log every planner call + hit count via `console.info("[21st]", …)` so `stack_modern--server-function-logs search=21st` shows real usage.

### 5. Verify the key actually works
- One-time server-side probe on cold start (cached in memory): call `tools/list` against `https://21st.dev/api/mcp`; if it returns 401/403, set `X-Obs-21st-Auth=bad` and surface it in the health card so we know the key rotated or hit a quota — instead of silently returning `[]` for 5 min.
- If the probe fails, offer `update_secret` for `TWENTYFIRST_API_KEY` in the follow-up (not part of this plan).

### 6. Model-side prompt nudge (`src/lib/aetheris.functions.ts`)
- One-line addition to `SYSTEM_PROMPT`: "When REFERENCE COMPONENTS are provided, you MUST use at least one of them as the *structural basis* for the matching section (hero, pricing, testimonials). Do not throw them away and write generic markup."
- Keeps the "adapt, don't paste" rule; adds a floor so components can't be ignored.

## Files touched
- `src/routes/api/generate.ts` — planner prompt, query seeding, injection cap/order, new headers
- `src/lib/twentyfirst.server.ts` — top-2 hits, de-dupe, richer metadata, cold-start auth probe
- `src/lib/twentyfirst-metrics.server.ts` — new; ring buffer of last 100 builds
- `src/lib/twentyfirst-metrics.functions.ts` — new; `getTwentyfirstHealth` server fn (admin-only via existing gate)
- `src/routes/demos.tsx` — new "21st.dev Health" card
- `src/lib/aetheris.functions.ts` — one-line prompt nudge

## Explicitly NOT in this plan
- Swapping providers (Magic UI, shadcn registry) — separate call.
- Persistent DB table of components used per build — ring buffer is enough for now.
- Rewriting image/Leonardo pipeline.
- User-facing component picker in the composer.

## Verification
1. `curl /api/generate` with `"a landing page for a coffee shop"` and confirm `X-Obs-Component-Count ≥ 3` and `X-Obs-Component-HitRate ≥ 0.6`.
2. `stack_modern--server-function-logs search=21st` shows the planner queries and per-query hit counts.
3. `/demos` health card shows `auth=ok` and non-zero hit rate.
4. Playwright a before/after build side-by-side; new one should show real hero + pricing + testimonial structure rather than a single-hero-plus-gradient page.
