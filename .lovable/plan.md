
## Root causes observed in AI gateway logs (last 7d, 244 calls)

From `list_ai_gateway_requests`:
- Most `google/gemini-3.5-flash` chat calls end **cancelled (http 499)** after **30–60s**. Users are giving up because first bytes take too long.
- Every `google/gemini-3.1-flash-lite` call completes in **1–2s** with normal token counts. The default model is fine — the slow model is the problem.
- Image calls (`google/gemini-3-pro-image`, `leonardo`, `higgsfield`) frequently cancel at 12–17s and *serialize before* the chat stream begins.
- Nothing in the current pipeline caps first-byte latency or falls back a slow model to the fast one.

Combined with the (already tightened) `VISUAL_KEYWORDS` regex, the remaining latency comes from:
1. Slow model being selected (either from UI or historic adaptive routing) with no bounded fallback.
2. Image pipeline still runnable when triggered — no strict end-to-end budget, no placeholder fallback.
3. `currentHtml` resent verbatim on every turn — can carry `data:image/*;base64,...` blobs, inflating tokens to 1M+ (already seen once in this project).
4. Chief Engineer / QA / adaptive-learning writes running on the request thread.
5. No user-visible timing so slowness is invisible until it fails.

## Files to change (targeted, no UI redesign, no feature loss)

**`src/routes/api/generate.ts`** — main pipeline
- Add `checkpoints: Record<stage, ms>` recorded via `performance.now()`: `validate`, `auth`, `imagePlan`, `imageGen`, `contextCompact`, `upstreamOpen`, `firstByte`, `streamEnd`, `total`.
- Emit checkpoints as a final SSE `event: obs-timing` frame so the client can render them without a second round-trip.
- Wrap the main `streamText`/chat call in `Promise.race([call, sleep(FIRST_BYTE_BUDGET_MS)])`. If no first content byte inside **6s** on a non-flash-lite model AND the user did NOT explicitly pick it, cancel the upstream and retry once with `google/gemini-3.1-flash-lite`. Log the fallback.
- Enforce a hard `IMAGE_TOTAL_BUDGET_MS = 8000`. If exceeded, cancel providers and inject a neutral SVG placeholder `{{IMAGE:slot}}` → data-URL for a 512×512 grey card with the prompt as `<title>`.
- Only trigger images when the tightened `VISUAL_KEYWORDS` matches AND `data.advisory` is false AND `data.explicitImage === true` (new optional flag from client, defaults false unless the regex matches an unambiguous phrase).

**`src/lib/context-compactor.ts`** (new, ~80 lines)
- `compactHtml(html): { compacted, tokens: Map<token, original>, originalBytes, compactedBytes, ratio }`
- Replace `src="data:image/*;base64,..."`, inline `<script>` >4KB, inline `<style>` >8KB, and sourceMappingURL comments with stable tokens like `__OBS_ASSET_7f3a__`.
- `restoreHtml(html, tokens)` — exact string substitution (no HTML parsing, no reflow) so the returned build is byte-identical outside compacted regions.
- Guardrails: never touch structural tags, never drop attributes, never truncate text.

**`src/lib/models.ts`**
- Add `MODEL_TIER: Record<ModelId, "fast" | "balanced" | "slow">` and a helper `isFastTier(id)`. Consumed by the fallback logic and the terminal report.

**`src/lib/adaptive-router.ts`**
- Remove any silent upgrade to `gemini-3.5-flash` for ordinary requests. Route stays on `DEFAULT_MODEL` unless the user explicitly selected another model in the UI (`data.model` differs from `"auto"`) or the request matches an explicit complexity keyword (`refactor`, `full-stack`, `multi-page`, `dashboard with data`).

**`src/routes/index.tsx`** — surface + defer background work
- Add a compact stage-timer strip in the existing Engineering Console / terminal panel that reads the `obs-timing` SSE frame: `first byte · model · fallback · total · images: yes/no`. No layout change beyond one row of monospace.
- Wrap `saveBuildToGallery`, `recordOperation`, `logAdaptive`, and any analytics calls in `queueMicrotask(() => Promise.resolve().then(...))` after the accepted version commits. Errors go to `console.warn`, not the UI blocker.
- Guard Chief Engineer to run once per accepted version (dedupe by `version.id`).

**`src/lib/self-test.ts`**
- Add 6 tests: compactor round-trip preserves bytes; compactor strips base64 image; compactor leaves small HTML untouched; fallback triggers when first byte >budget; image budget produces SVG placeholder; `isFastTier` mapping.

## Instrumentation format

Final SSE frame emitted before `[DONE]`:

```text
event: obs-timing
data: {"model":"google/gemini-3.1-flash-lite","fallback":false,"images":{"requested":false,"generated":0,"placeholders":0},"ms":{"validate":2,"auth":1,"imagePlan":0,"imageGen":0,"contextCompact":4,"upstreamOpen":180,"firstByte":410,"streamEnd":1240,"total":1247},"bytes":{"htmlOriginal":842145,"htmlCompacted":41220,"ratio":0.049}}
```

## Validation

1. `bun run typecheck`
2. `bun run build`
3. Existing self-tests via `/api/public/self-test`.
4. Timed smoke builds via `curl` against local `/api/generate` streaming endpoint, measuring TTFB and total via `curl -w`:
   - **A** New simple page: `"Landing page for a coffee shop"`
   - **B** Small edit: send prior HTML + `"Change the hero heading to 'Fresh Daily'"`
   - **C** Complex: `"Multi-section pricing page with FAQ and testimonials"`
   - **D** Explicit image: `"Generate a logo for a bakery and use it in the header"`
5. Report actual TTFB and total ms per case, plus compactor ratio for B, plus placeholder-vs-real for D.

## Explicit non-goals

- No UI redesign, no color/layout changes beyond a one-row timing strip.
- No removed features. Chief Engineer, adaptive learning, gallery save, share links, and rollback all preserved.
- No change to the unlock/gate flow, auth, or Supabase schema.
- No new dependencies.
