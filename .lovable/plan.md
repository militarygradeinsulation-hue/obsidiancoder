# Make builds fast again — and make the learning loop actually pay off

I traced a full build end to end. The slowness is not one bug; it's four serial provider round-trips per build plus a "speed path" that is written but effectively never fires. Here's what's actually happening today, confirmed in the code.

## Why it got slow

**1. Every premium build now makes 3-5 sequential AI calls, not one.**
In `src/routes/index.tsx` a single build runs, in order:

```text
concept planner call  →  streaming generation  →  cinematic critique call
                      →  (optional) patch apply  →  (optional) Claude QA repair
                      →  (optional) quality-retry FULL regeneration
```

Each waits for the previous one. Earlier versions did essentially one call. The planner and the critique were added later — they improved quality and roughly doubled wall-clock time.

**2. The "reuse a proven direction" speed path almost never triggers.**
`provenDirection()` in `src/lib/build-learning.ts` requires all of: a concrete family (returns `null` immediately when family is `auto`), outcome `kept`, and a score of 80+. But:
- The Vibe default is `artFamily: "auto"` and `artProfile: "fast"` (`src/routes/index.tsx` lines 353-354), so the family gate rejects it outright.
- `scoreOf()` only reaches 80 when critique axis scores exist. Critique only runs on the `cinematic` profile. Without it, a clean passing build scores 72 + 4 = **76** — permanently below the 80 threshold.

So the adaptive brain records data but can never act on it. That's the gap you're feeling.

**3. The model tier is the slowest one available.**
`routellmEquivalentFor()` maps most requests to Claude Sonnet 4.5, and anything reading as "pro/deep" to **Claude Opus** — the slowest model in the chain. Cinematic explicitly takes raw top capability, i.e. Opus. Opus on a full single-file document is minutes, not seconds.

**4. Timeouts are generous, so failures cost a lot of time.**
`FIRST_RESPONSE_BUDGET_MS = 55s`, primary open 32s, fallback 16s, plus up to 4s of image enrichment. When ChatLLM is degraded, you pay the full 32s before the chain even tries OpenAI.

**5. Local storage holds the assets but nothing reuses them.**
The archive (`src/lib/build-archive.ts`) stores every build's HTML, and creative memory stores structural signatures — but neither is ever fed back in as a starting scaffold. Nothing is reused; every build regenerates from a blank document.

## The fix

### A. Make the proven-direction speed path real
- Resolve `auto` to the concrete family the DNA actually picked *before* the proven lookup, so `auto` builds can match past winners.
- Score without critique: give a clean, kept, warning-free build a real quality baseline instead of a hard 76 ceiling, and add a validation+design-floor path to 80+. Keep the 3-observation floor so one good build never becomes a rule.
- When a proven direction is found, skip the planner call entirely (already wired — it just never fires).

### B. Skip the planner far more often
- Reuse the cached plan for the same prompt-kind, not only the exact prompt key.
- Never run the planner when the classified intent matches a family that already has a proven winner.
- Fall back to the deterministic planner (zero provider calls) whenever the AI planner would exceed the remaining time budget.

### C. Move the critique off the critical path
Today the cinematic critique blocks the commit. Instead: commit the validated build immediately, then run the design review in the background and apply the polish patch as a follow-up revision. You see a finished page seconds sooner; the polish still lands, and the score still gets recorded.

### D. Template reuse from the archive (the real "faster each time" win)
New `src/lib/proven-templates.ts`:
- From the archive plus build-learning, pick the highest-scoring past build in the matching family that passed the quality checks.
- Extract a **structural skeleton** from it — section order, layout archetype, type scale, palette strategy, signature interaction — never the raw markup and never copy-paste output.
- Inject that skeleton as a compact brief (~1.5 KB, sits with the existing learning brief) so the model starts from a proven structure instead of inventing one. Fewer tokens to reason about = faster and more consistent.

### E. Tighten the time budgets
- Reduce the primary open budget so a stalled ChatLLM key falls through to OpenAI faster, and mark a slow key as degraded (not dead) so the next build starts on the healthy provider.
- Skip image enrichment on fast-profile builds.
- Prefer Sonnet over Opus for the streaming generation unless you explicitly pick a deep model; keep Opus for the critique, where it's cheap because the input is small.

### F. Visibility
The Intelligence panel gains a per-build timing breakdown: planner / generation / critique / QA, and a badge when a proven direction or template was reused, so you can see exactly where the seconds go.

## Technical notes

Files touched: `src/lib/build-learning.ts` (scoring + family resolution), new `src/lib/proven-templates.ts`, `src/routes/index.tsx` and `src/routes/pocket.tsx` (planner skip, background critique, template brief), `src/routes/api/generate.ts` (budget constants, enrichment skip, brief injection order), `src/lib/provider-chain.ts` / `src/lib/routellm-keys.ts` (degraded-key handling), `src/components/panels/IntelligencePanel.tsx` (timings).

No migration, no new dependencies, no extra provider calls — this plan removes calls. Self-tests added for scoring thresholds, family resolution, skeleton extraction, brief size cap, and the guarantee that a single build never changes routing.

## Expected effect

A repeat-kind build in a family you've already succeeded in: planner call skipped, template reused, critique off the critical path — one provider round-trip instead of three or four. First-time builds in a new family stay at full quality with the current flow.
