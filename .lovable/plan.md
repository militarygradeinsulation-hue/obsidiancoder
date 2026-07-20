
# Obsidian Stabilization + Upgrade Pass

The request spans ~15 concerns across a 2,738-line route file plus routing, learning, image, and intro subsystems. Rather than a single blind rewrite (high regression risk), I'll ship one coordinated edit that fixes the verified issues below, plus a verification pass (typecheck + self-tests). Anything not on this list is out of scope for this turn — I'll call it out at the end.

## What I'll change

### 1. Respect learning preference (bug fix)
- `src/routes/index.tsx` currently force-sets `settings.enabled = true` on mount (line ~245), overriding user choice.
- Remove the force-enable; `DEFAULT_SETTINGS.enabled` already ships `true`, so new users still get learning by default, and disable-then-reload now persists.

### 2. Wire Intelligence panel to live state
- `IntelligencePanel` accepts `intent` + `decision` props but only `refreshKey` is passed.
- Lift the latest `RoutingDecision` and `ResolvedIntent` into route state, update them on every submission, and pass to the panel. Bump `intelligenceTick` after ledger writes so "recent events" refreshes too.

### 3. Close the learning feedback loop
- On successful generation completion, on "Restore version", and on user-initiated "Retry after failure", call `appendLedgerEvent({ kind: "outcome", ... })` with success/failure + latency so `performance-model` and `preference-learning` actually improve routing over time. Today only classify/strategy/model-selected events are recorded — no outcomes, so scores never converge.

### 4. Surface model fallbacks explicitly
- Image pipeline (`aetheris.functions.ts`) silently walks Leonardo → Higgsfield → Gemini. Add a returned `providerUsed` field and thread it through to:
  - the terminal log line ("image via higgsfield after leonardo fail"),
  - `generation-report`/metadata so the report card shows the actual provider.
- Same treatment for chat model fallbacks driven by the patch/repair pipeline: surface `fallbackFrom → fallbackTo` in the terminal + report.

### 5. Route image providers through the reliability layer
- Leonardo + Higgsfield calls in `aetheris.functions.ts` currently use raw `fetch` with hand-rolled polling.
- Wrap them in `aiFetch` with per-provider `breakerKey` (`leonardo/generate`, `higgsfield/jobset`), request IDs from `newRequestId()`, `AiError` conversion, and honor the caller's `AbortSignal`.
- Tighten polling: cap total wall-clock at 25s (was unbounded ~60s), 1.5x backoff, and abort on client cancel.

### 6. Fix right-rail resize math
- `onRailResizeMove` uses `e.clientX - startX` directly — correct math is `startWidth - delta` because the handle is on the LEFT edge of the rail (dragging right shrinks the rail). This is the "clipping when resizing" symptom.
- Also clamp against `document.documentElement.clientWidth` and add a `ResizeObserver` to reclamp on window resize so a saved 900px rail on a now-800px viewport doesn't clip.

### 7. Intro autoplay resilience
- `IntroSplash` starts the visual timeline immediately but the legacy audio effect in `index.tsx` (line ~281) still exists and races the splash on first visit.
- Delete the legacy first-visit audio effect entirely — the splash owns audio.
- In `IntroSplash`, keep the muted-autoplay+unmute strategy but add a `visibilitychange` guard: if the tab is hidden on mount, wait for `visible` before starting so the animation doesn't drift past its audio.

### 8. Self-test / typecheck / lint / build fixes
- Run `bunx tsgo --noEmit`, `bun run lint`, and hit `/api/public/self-test` after changes; fix any failures introduced or already present in the touched modules.

### 9. Dead code / duplication cleanup (bounded)
- Remove the duplicated first-visit audio effect (see #7).
- Remove the force-enable useEffect (see #1).
- Consolidate two near-identical `resolveModel` fallbacks in `generate.ts` and `patch.ts` into a single `parseModelInput` helper in `src/lib/models.ts` (only touch these two call sites).

## Out of scope (explicitly deferred)
- Full refactor of the 2,738-line `src/routes/index.tsx` — high regression risk; would need its own turn.
- New Intelligence features beyond wiring (no new charts, no cross-session sync).
- Rewriting the patch/repair pipeline; only adding fallback surfacing.
- Any migration or schema change.
- Any UI redesign beyond the resize-handle fix.

## Verification
After the edit batch:
1. `bunx tsgo --noEmit` — must pass clean.
2. `bun run lint` on touched files — must pass.
3. `curl localhost:8080/api/public/self-test` — all fixtures green.
4. Visual sanity via Playwright on `/`: splash plays, rail resizes without clipping, Intelligence panel populates after a submit.

## Confirm before I execute
This is ~9 targeted edits in ~6 files, not a wholesale rewrite. If you'd rather I *also* tackle a specific item I've deferred (e.g. splitting `routes/index.tsx`), say which and I'll fold it in. Otherwise reply "go" and I'll ship it.
