# Loosen the design floor so the Coder stops stalling and re-generating

The design floor I added is currently too aggressive: taste-level findings (thin CSS, no layout rule, default anchors) block a commit and trigger a second, slower model call — even on a small edit to an already-good page. That is why the Vibe Coder took five minutes and still shipped a weaker result. The uploaded patch fixes exactly that, and it applies cleanly against the current code.

## What changes

**Only truncation blocks a build**
- `src/lib/candidate-assess.ts` — a design finding no longer creates a blocker; only `design:incomplete` (document stopped mid-stream) does.
- `src/lib/finalize-candidate.ts` — same rule at the commit gate, so a lightly-styled page or a patch to one can no longer become permanently uncommittable.

**Recognize styling that isn't a `<style>` block**
- `src/lib/design-floor.ts` — counts `style=""` attribute bytes toward the CSS total, and detects linked stylesheets / utility CSS CDNs (Tailwind, Bootstrap, Bulma, Pico, water.css). Documents styled that way are flagged as warnings, never blockers. Minimum inline-CSS threshold drops from 320 to 160 bytes.

**Stop the preview from freezing**
- `src/routes/index.tsx` — the preview currently refuses to paint while a `<style>` block is open. On a big stylesheet that means a dark screen for most of the stream. Now it paints anyway after 2.5s of no update.

**Only pay for a second generation when it's worth it**
- `src/routes/index.tsx` and `src/routes/pocket.tsx` — the quality regeneration now fires only for a truncated document, or a *fresh* build that came back essentially unstyled. Refinements to an existing page never trigger a second full model call.

## Technical notes

Five files, no schema or auth changes, no new dependencies. After applying I'll run the self-test suite and confirm the design-floor assertions still pass (updating the ones that asserted blocking behavior on taste findings, since that behavior is intentionally removed).
