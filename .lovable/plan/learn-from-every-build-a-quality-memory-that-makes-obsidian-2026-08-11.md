# Learn from every build — a quality memory that makes Obsidian better and faster each time

Right now each build starts almost from scratch. What exists today, confirmed in the code:

- `src/lib/pocket-creative.ts` stores a creative memory (`readCreativeMemory`), but it only holds *structural signatures* and is used for one purpose: avoid repeating yourself. It records nothing about whether a build was any good.
- `src/lib/failure-learning.ts` tracks kept/rejected/restored per model and can name a preferred model — but nothing in the Vibe generate path consults it when choosing the model.
- `src/lib/preference-learning.ts` / `adaptive-ledger.ts` learn user preferences, not build quality.
- The cinematic critique already produces per-axis scores (`src/lib/pocket-prompt.ts`), and the design floor produces findings (`src/lib/design-floor.ts`) — both are thrown away after the build commits.

So the data exists; it is just never written down, never scored, and never fed back in. This plan closes that loop.

## What changes for you

1. **Every finished build gets graded and remembered** — critique scores, design-floor findings, validation result, whether you kept or discarded it, which model/profile/style family produced it, and how long it took.
2. **Winning recipes get reused.** When you start a new build, Obsidian looks at your highest-scoring past builds in the same style family and injects a short "what worked before" brief (the exact axes, not the markup) — so quality compounds instead of resetting.
3. **Losing recipes get avoided.** Profiles, families, and models that repeatedly scored low or got discarded are down-weighted automatically.
4. **It gets faster.** When a family already has a proven high-scoring DNA and the new prompt is close in kind, the planning call is skipped and the proven DNA is reused (mutated, not copied), removing one provider round-trip from the build.

## How it works

**New: `src/lib/build-learning.ts`**
A scored record per build: `{ id, at, surface, profile, family, dnaId, dnaAxes, model, critiqueScores, designFindings, validationStatus, latencyMs, outcome: kept|discarded|restored }`. Pure functions:
- `recordBuildOutcome()` — append + trim (cap ~120 entries, same storage discipline as creative memory, scoped by hashed library code).
- `scoreOf(entry)` — single 0–100 quality number from critique axes minus design-floor penalties.
- `topExemplars(family, n)` — best recent entries for a family.
- `learnedBias()` — per-family/model keep-rate and average score, with a 3-observation floor (mirrors `preference-learning.ts` rules: one build never becomes a rule).

**New: `src/lib/build-learning-prompt.ts`**
Turns exemplars into a compact system block: proven layout archetype, typography contrast, palette strategy, signature interaction, and the specific issues critics flagged last time in this family ("avoid: flat hero, no depth"). Capped at ~1.5 KB so it never crowds out the art-direction brief. Injected in `src/routes/api/generate.ts` immediately *before* the premium block, so art direction still has the last word.

**Wiring**
- `src/routes/index.tsx` and `src/routes/pocket.tsx`: after critique/finalize, call `recordBuildOutcome(...)`; on version restore or discard, record the `restored`/`discarded` outcome.
- `src/routes/index.tsx`: send the exemplar brief with the generate payload (client-owned, like `pocketRecentSignatures`), and let `learnedBias()` nudge the default art profile/style family when a clear winner exists.
- `src/lib/pocket-model-resolver.ts` consumer side: when `learnedBias()` shows a model consistently underperforming for a profile, prefer the next-best sibling instead.
- Speed path: reuse a proven DNA when `topExemplars(family)` has a score ≥ 80 and the prompt's classified kind matches — skip the concept-planning provider call.

**Visibility**
The Intelligence panel gains a "Build quality" section: last 10 builds with score, model, and family, plus the currently applied learned biases — with a one-click "forget" so nothing is a black box.

**Tests**
Self-tests in the existing harness: score computation, 3-observation promotion floor, exemplar selection, brief size cap, prompt ordering (learning block before art direction), and that a single bad build never changes routing.

## Scope notes

- Learning is stored per library code (yours, 9822, stays yours) using the same hashed-key pattern as creative memory — no cross-user data sharing in this pass.
- No database migration, no new dependencies, no extra provider calls; the speed path removes one.
