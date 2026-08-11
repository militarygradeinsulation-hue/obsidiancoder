# Latency audit — Obsidian Vibe generation architecture

## Finding 0: HEAD is not a regression against that ref

`git diff --stat 900996ac HEAD` returns **one changed file** (`.lovable/plan.md`, +71 lines). `900996ac` is "Added archive & rename logic" — the current HEAD. So nothing regressed since that commit; the slowdown is accumulated architecture from the premium-quality work that landed before it. The rest of this audit is against the pipeline as it stands.

## Where the time actually goes

### 1. A premium build is 3-5 serial LLM round-trips, not one

`src/routes/index.tsx` → `runGeneration` (approx. lines 1936-3100), in strict sequence:

```text
classifyTask + decide()            local, ~0ms
concept planner call               planConceptsFn  (line ~2410)   1 provider call
streaming /api/generate            (line ~2511)                   1 provider call
finalizeCandidate → Claude QA      src/lib/finalize-candidate.ts  0-1 provider call
cinematic critique                 runCritiqueFn   (line ~2900)   0-1 provider call
critique repair patch + reassess   applyPatch + assessCandidateForCommit
quality retry (full regeneration)  src/lib/quality-retry.ts       0-1 provider call
```

Nothing here overlaps. Every stage blocks the committed preview.

### 2. There is no cache-hit path anywhere

`src/routes/api/generate.ts` sets `Cache-Control: no-store` and has no response cache, no prompt-hash lookup, no template short-circuit. Every request — including an identical re-run — goes to a provider. The concept planner has a cache key (`conceptCacheKey`, `src/lib/pocket-concept.ts`) but it only covers the planning call, not generation.

### 3. Full-document regeneration happens more often than it should

- `src/routes/index.tsx` line ~2470 sends `currentHtml: previewMode ? stableHtml : stableHtml.slice(0, 8000)` — the **entire** document on any preview-mode full generation.
- `strategyFor()` in `src/lib/task-classifier.ts` routes to `ai-patch` only for edits with an existing document that don't match `FULLGEN_WORDS`. But `classifyTask` sends `bug-fix`, `new-feature`, and any long unspecified prompt down `advanced-ai`, and the art-direction block at line ~2377 runs for **every** preview build that reaches it, including refinements — so a refinement pays the planner tax plus a whole-document regeneration.
- `compactHtmlForContext` (`src/lib/context-compactor.ts`) is lossless base64 image extraction only. It is not a token-budget compactor; the real markup goes to the model in full.
- Staged/tiered context (`src/lib/staged-context.ts`, `nextTier`) exists but is used **only** by `/api/patch`, never by `/api/generate`.

### 4. Local memory is localStorage, not IndexedDB, and is never reused as a scaffold

`src/lib/safe-storage.ts` is a `localStorage` wrapper with a 4.5 MB hard cap; `safeSet` silently returns `false` past it. `indexedDB` appears nowhere in the app (the only hit is a mention inside `memory-director.ts`). The archive (`src/lib/build-archive.ts`, 150 entries) and creative memory store finished builds, but no code path ever reads a past build as a starting structure. Local storage is a record, not an accelerator.

### 5. The adaptive "reuse a proven direction" path is dead code in practice

`provenDirection()` in `src/lib/build-learning.ts` requires all three: a concrete family, `outcome === "kept"`, and `scoreOf() >= 80`.
- Vibe defaults are `artProfile: "fast"`, `artFamily: "auto"` (`src/routes/index.tsx` lines 353-354) — `provenDirection` returns `null` for `"auto"` on its first line.
- `scoreOf()` awards critique-free builds a baseline of 72 (`validationStatus: "passed"`) plus 4 for kept = **76**, which can never reach 80. Critique scores only exist on the `cinematic` profile (`artProfile === "cinematic"` gate at line ~2896).

So the quality memory records grades that nothing can ever act on. This is the single biggest reason "it doesn't get faster each time."

### 6. Model tier is the slowest available

`routellmEquivalentFor()` (`src/lib/provider-chain.ts`) maps ordinary requests to `claude-sonnet-4-5` and anything reading as pro/deep to `claude-opus-4-1`. `applyStudioPolicy()` in `src/lib/pocket-model-resolver.ts` takes raw top capability for cinematic — i.e. Opus, generating a complete document, on the critical path.

### 7. Fallback budgets are large, so a degraded provider costs 30+ seconds before anything else is tried

In `src/routes/api/generate.ts`: `FIRST_RESPONSE_BUDGET_MS = 55_000`, `PRIMARY_OPEN_BUDGET_MS = 32_000`, `FALLBACK_OPEN_BUDGET_MS = 16_000`, `ENRICHMENT_BUDGET_MS = 4_000`. A stalled ChatLLM key burns the full 32 s before OpenAI is attempted, on every build, because a slow key is only marked dead on genuine billing exhaustion (`isRouteLLMKeyExhausted`).

### 8. Synchronous pre-stream work

Image enrichment and component extraction run before the stream opens (capped at ~4 s combined, `timing.image_enrichment_timeout` / `component_enrichment_timeout`), and the Leonardo/Higgsfield providers themselves poll on 18-20 s internal deadlines. Component matching (`matchComponents`) runs inline in the request body build.

## Prioritized implementation plan

### P0 — Recover the fast path (biggest win, smallest change)

1. **Fix the proven-direction gate.** Resolve `auto` to the concrete family the DNA selected before the lookup, and let a clean, kept, warning-free build reach a real score instead of a 76 ceiling. Keep the 3-observation floor so one build never becomes a rule. Files: `src/lib/build-learning.ts`, `src/routes/index.tsx`.
2. **Template/DNA cache hit returns immediately.** When a proven direction exists for the classified kind, skip the planner call entirely (the branch is already written at line ~2402 — it just never fires).
3. **Move the cinematic critique off the critical path.** Commit the validated build, then run the review in the background and apply the polish as a follow-up revision. The score still gets recorded.

### P1 — Patch instead of regenerate

4. **Route refinements through `/api/patch`.** Any prompt against an existing document that isn't an explicit rebuild goes to the patch path, and the art-direction/planner block is skipped for refinements (it partially is — make it unconditional).
5. **Send tiered context to `/api/generate`**, reusing `staged-context.ts` / `nextTier` instead of the whole document, with escalation to full context only when a patch attempt fails.

### P2 — Durable, quality-gated memory

6. **New `src/lib/proven-templates.ts`:** extract a structural skeleton (section order, layout archetype, type scale, palette strategy, signature interaction — never raw markup) from the highest-scoring past build in the matching family, injected as a ~1.5 KB brief alongside the existing learning brief.
7. **IndexedDB layer behind the existing `safeGet`/`safeSet` interface** (new `src/lib/idb-storage.ts`, async, localStorage fallback) so the archive and component memory stop hitting the 4.5 MB ceiling — plus mirroring the quality-gated template memory to the existing `build_memory` server table for durability across devices.

### P3 — Budgets, escalation, instrumentation

8. **Fast-model-first escalation:** stream generation on Sonnet by default, reserve Opus for the critique (small input, cheap) and for an explicit deep pick; keep the existing `escalateModel` ladder for corrective passes only.
9. **Degraded-key handling:** shrink `PRIMARY_OPEN_BUDGET_MS`, and mark a key degraded (not dead) on repeated timeouts so the next build starts on the healthy provider. Files: `src/routes/api/generate.ts`, `src/lib/routellm-keys.ts`.
10. **Skip image enrichment on the fast profile**, and move component extraction after first byte.
11. **Per-stage timings** (plan / first byte / stream / QA / critique) surfaced in the Intelligence panel and in the `OBS_TIMING` trailer, with a badge when a cache/template hit was served.

## Expected effect

Repeat-kind build in a family with a proven winner: planner skipped, skeleton reused, critique async, patch instead of regeneration — **one provider round-trip** where there are currently three or four. First-time builds in a new family keep today's full-quality flow.

## Scope notes

No database migration required for P0-P1; P2's server mirroring uses the existing `build_memory` table. No new dependencies except an IndexedDB helper (can be hand-rolled, ~80 lines, no package). No behaviour change to explicit model pins.
