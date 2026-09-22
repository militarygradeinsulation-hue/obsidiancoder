# Speed up the building process

I traced where the time actually goes. The earlier round of speed work did land — the design planner is skipped when a proven direction exists, and the design review now runs after the build appears instead of blocking it. What's left are four places where a build still waits on something it doesn't need to wait on.

## What's still slow

1. **Refinements resend the whole page.** When you tweak an existing build and the request doesn't classify as a small edit, the entire current document is sent to the model and a whole new page is written from scratch. There is already a "send only the relevant parts" mechanism in the project, but it is wired only into the small-edit path.
2. **The quality retry is a second full build, in series.** If the first result trips a quality check, the build silently regenerates the whole page before anything is shown. That doubles the wait on exactly the builds that already felt slow.
3. **Cinematic quality uses the slowest model to write the page.** The top-capability model is reserved for cinematic builds and put on the critical path for generating the entire document, where it is slowest. It is far better used for the short review pass.
4. **The QA/finalize pass still blocks the preview** even when the result has no problems worth fixing.

## Changes

### 1. Tiered context for refinements
Use the existing staged-context tiers on the main generation path, not just the patch path. A refinement against an existing document sends the outline plus the sections the prompt actually touches (roughly 4–8 KB) instead of the whole file, and escalates to the full document only if the first attempt comes back incomplete or fails validation.

- `src/routes/index.tsx` — replace the whole-document `currentHtml` for refinement builds with a tiered bundle from `buildContext`.
- `src/routes/api/generate.ts` — accept the tier marker and signal back when the context was insufficient.
- Fresh builds and explicit rebuild wording are unaffected.

### 2. Widen the small-edit path
Tighten the classifier so that ordinary refinement wording ("make the hero bigger", "add a pricing row", "change the copy in section two") reliably routes to the patch path rather than full regeneration. Only explicit rebuild wording, or a failed patch attempt, escalates to a full generation.

- `src/lib/task-classifier.ts`, with the escalation handled where the patch call already lives.

### 3. Show first, retry in the background
Commit the build as soon as it passes the hard safety and validity gates. If the softer quality contract is unhappy, run the improvement pass in the background and swap in the better version as a follow-up revision — the same pattern already used for the design review.

- `src/routes/index.tsx` (the quality-retry call site), `src/lib/quality-retry.ts`.

### 4. Right-size the model on the critical path
Generate the document with the fast high-quality model on every profile, and reserve the top-capability model for the short review and repair passes, where its input is small and it costs a second or two rather than a minute.

- `src/lib/pocket-model-resolver.ts` — cinematic takes the studio policy instead of raw top capability.
- `src/lib/provider-chain.ts` — keep the existing escalation ladder for corrective passes only.

### 5. Make the QA pass conditional
Skip the finalize/QA provider call when the result already passes local validation with no findings; keep it for anything that trips a check.

- `src/lib/finalize-candidate.ts`.

### 6. Timing you can see
Record per-stage timings (plan / first byte / stream / QA / review) and show them in the Intelligence panel, with a marker when the proven-direction or template shortcut was used. Without this there's no way to tell whether the next change helped.

- `src/lib/generation-metrics.ts`, `src/components/panels/IntelligencePanel.tsx`.

## Expected effect

- Refinement of an existing build: from a full rewrite to a targeted edit — the largest single win, and the most common action.
- First-time build on a new direction: one model call to first paint, with review and any quality improvement arriving afterwards as a revision.
- Cinematic builds: noticeably faster to first paint, with the review quality unchanged.

## Notes

No database changes, no new dependencies. Nothing about output quality is relaxed — the review and quality passes still run, they just stop making you wait for them. I'll run the existing self-test suite after each group of changes.
