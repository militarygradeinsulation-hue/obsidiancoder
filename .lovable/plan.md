## 1. Fix intro video (missing everywhere)

Current bug: `IntroSplash` is imported only in `src/routes/index.tsx`, but the user's entry point is `/unlock`, so it never plays. A stale comment in `index.tsx` even claims it's already in `__root`, but it isn't.

- Mount `<IntroSplash />` in `src/routes/__root.tsx` (inside the root shell, after `<Outlet />`).
- Remove the duplicate import from `src/routes/index.tsx` so it doesn't double-mount.
- Keep the existing `sessionStorage` "once per session" gate — this matches the chosen answer (every route, first visit per session).
- Verify by loading `/unlock` in a fresh session with Playwright and confirming the overlay appears and auto-dismisses.

## 2. Real image generation: Leonardo + Higgsfield + variety

Goal: when the AI produces a build, image placeholders resolve to real, varied, provider-generated art instead of the same Unsplash / SVG fallbacks.

**Secrets (request via `add_secret`):**
- `LEONARDO_API_KEY` (leonardo.ai account → API access)
- `HIGGSFIELD_API_KEY` + `HIGGSFIELD_API_SECRET` (Higgsfield partner API; if the user only has MCP access, the Higgsfield path will be marked unavailable at runtime and skipped — no crash)

**New server route:** `src/routes/api/public/media/image.ts`
- POST `{ prompt, style?, aspect?, provider? }` → `{ url, provider, requestId }`.
- Provider chain (uses existing `orderImageProviders` in `src/lib/operation-tracker.ts` — already has `leonardo`, `higgsfield`, `gemini`):
  1. **Leonardo** — POST `/v1/generations` (Phoenix or Lightning XL model id), poll `/v1/generations/{id}` until `COMPLETE`, return first `generated_images[].url`.
  2. **Higgsfield** — POST their image endpoint; if 401/404 or missing key, fall through.
  3. **Gemini image (Lovable Gateway)** — existing fallback via `/v1/images/generations` non-streaming, upload the returned base64 to Supabase Storage bucket `build-media` (new public bucket) and return the public URL.
- Gate via `requirePaidOperation("image_gen", …)` like other paid ops, settle with real usage.
- Rotate style seeds (`cinematic`, `editorial`, `isometric`, `photo-real`, `hand-drawn`) per call so builds visually diverge — this is the "stop looking the same" fix.

**Client hook:** `src/lib/media-provider.ts`
- `generateImage(prompt, opts)` calls the route, caches by `(prompt+style)` in memory to avoid duplicate spend within a single build.
- Exposes provider chain + last used provider so `CostPanel` / ledger can show it.

**Wire into generation:** in `src/lib/aetheris.functions.ts`
- Update `SYSTEM_PROMPT` so the model emits `<img data-obs-gen="1" data-prompt="…" data-style="…" />` placeholders instead of hardcoded Unsplash URLs.
- Post-process the streamed HTML in `src/routes/api/generate.ts` (or a small helper): before returning to the client, scan for `data-obs-gen` imgs and resolve each via `/api/public/media/image` in parallel with `Promise.allSettled`, swapping `src` with the returned URL. On failure, fall back to a curated Unsplash query tied to the prompt (existing behavior) so builds never ship broken images.
- Randomize the visual-style seed per build (store on the version) so re-runs of the same idea produce visibly different aesthetics.

## 3. Video generation in builds

**Secret:** reuse `HIGGSFIELD_API_KEY`; if absent, fall back to Lovable's `videogen` provider.

**Extend the media route:** `src/routes/api/public/media/video.ts`
- POST `{ prompt, durationSec?, aspect? }` → `{ url, poster, provider }`.
- Chain: Higgsfield video (if key present) → Lovable videogen fallback.
- Store MP4s in the `build-media` Supabase bucket, return the public URL and a first-frame poster (extract via `<video>` seek on the client, or a simple thumbnail URL from the provider).

**System prompt & post-process:**
- Allow `<video data-obs-gen="1" data-prompt="…" poster="" />` in generated HTML.
- Post-process resolves to the real MP4 URL; adds `autoplay muted playsinline loop` for hero-style clips.

**Cost gate:** video costs ~10× images; require Creator plan or higher via `credit-gate.server.ts`, denial → friendly modal.

## 4. Storage + schema

- New Supabase Storage bucket `build-media` (public read, authed write).
- New migration: nothing schema-side beyond the bucket + a small `media_generations` audit table (`id, created_at, provider, prompt, kind, url, request_id, client_id`) with RLS `TO service_role` only + GRANTs. Used by the admin `/demos` portal to see per-build spend.

## 5. Admin visibility

- `/demos` portal: add a "Media" tab showing recent `media_generations` rows with provider chip, prompt, thumbnail, and cost — so you can see whether Leonardo/Higgsfield is actually being used.

## 6. Verification

- Playwright: open `/unlock`, confirm intro plays, dismiss, log into builder with `9822`, generate a small build ("landing page for a coffee shop"), confirm generated HTML contains real Leonardo URLs (log the `X-Media-Provider` response header) and one video element.
- Curl the new route directly with a fake prompt to confirm provider fallback order works when a key is missing.
- Check `server-function-logs` for any Higgsfield 4xx (expected until key confirmed) — falls through cleanly.

## Files touched

- `src/routes/__root.tsx` — mount `IntroSplash`
- `src/routes/index.tsx` — remove duplicate import + stale comment
- `src/routes/api/public/media/image.ts` (new)
- `src/routes/api/public/media/video.ts` (new)
- `src/lib/media-provider.ts` (new client helper)
- `src/lib/leonardo.server.ts`, `src/lib/higgsfield.server.ts` (new, server-only)
- `src/lib/aetheris.functions.ts` — prompt + post-process hook
- `src/routes/api/generate.ts` — post-process generated HTML
- `src/lib/credit-gate.server.ts` — add `image_gen` and `video_gen` ops
- `src/routes/demos.tsx` — Media tab
- New Supabase migration: `build-media` bucket + `media_generations` table
- Secrets requested: `LEONARDO_API_KEY`, `HIGGSFIELD_API_KEY`, `HIGGSFIELD_API_SECRET`
