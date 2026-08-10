# Make builds come out right every time

Your screenshot shows the real failure mode: the build shipped as a bare, unstyled document — blue underlined links, default serif headings, no layout. That is not a "the model is weak" problem. It is a missing gate: today nothing in the pipeline checks that a finished build is actually *designed* before it gets committed to the preview.

## What I verified

- `src/lib/validation.ts` checks structure, scripts, CSS brace balance, links, a11y hints — but a document with **zero CSS** passes as clean. An unstyled page is never flagged.
- `src/lib/candidate-assess.ts` / `finalize-candidate.ts` only block on validation, navigation violations, and parity. None of those fire on an unstyled or truncated-but-closed page.
- The system prompt in `src/routes/api/generate.ts` already demands 21st.dev-grade output, so when the result is bare, the model either bailed early, got cut off, or ignored the brief — and the pipeline committed it anyway.

## The fix: a design floor that can reject and re-run

**1. Add a design-quality check (new `src/lib/design-floor.ts`)**

Deterministic, no AI, runs on every candidate. Blocking failures:
- no `<style>` block, or total CSS under a meaningful byte threshold
- no color/background declarations (page is browser-default)
- no `<head>` font-family / no viewport meta on a full-page build
- body text present but no layout primitives at all (no flex/grid/container rules)
- truncation smell: document ends mid-tag, or `</html>` present but `<body>` content is a bare list of links with no wrappers
- default-anchor look: many `<a>` with no CSS rule targeting anchors

Warnings (won't block, but feed repair): no responsive media query/clamp, single section only, no hover/transition rules, no semantic landmarks.

**2. Wire it into the commit path**

`candidate-assess.ts` gains the design report; `finalize-candidate.ts` treats a design-floor failure exactly like a validation blocker — the candidate does **not** overwrite the working preview.

**3. Auto-retry instead of shipping junk**

In `src/routes/api/generate.ts`, when a completed generation fails the design floor:
- retry once on the same request with a hardened corrective instruction naming the exact failures ("your output had no CSS…"), and escalate one model tier (mini → balanced → flagship) so the retry is not the same weak call
- if the retry still fails, keep the previous working HTML and stream an explicit error event instead of committing a broken page

**4. Close the truncation hole**

Track stream completion: if the stream ends without `</html>`, or the finish reason is a length cutoff, mark the candidate incomplete and take the retry path rather than repairing a stump.

**5. Raise the floor on the prompt side**

Tighten the system prompt with a short non-negotiable preamble: first tag after `<head>` must be a `<style>` block containing a design-token `:root`, and a minimum section list. Small change, large effect on cheap models.

**6. Tests**

Self-tests in the existing harness: the unstyled document from your screenshot must fail the design floor; a real styled build must pass; truncated output must be caught; the retry path must preserve the prior working build on double failure.

## Technical notes

- New: `src/lib/design-floor.ts`, self-tests alongside the existing `src/lib/__tests__` suite.
- Edited: `src/lib/candidate-assess.ts`, `src/lib/finalize-candidate.ts`, `src/routes/api/generate.ts` (system prompt + retry/escalation + stream-completion check).
- No database or auth changes. No new dependencies. One extra model call only on failure, so cost only rises when a build was going to be bad anyway.
