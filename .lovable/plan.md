## Inject Aetheris Visual & Functional Quality Standard as a system prompt rider

Add the uploaded standard to the builder's system prompt so every build the coder produces follows it silently. No changes to the Obsidian app's own UI.

### Changes

1. **New file: `src/lib/aetheris-visual-standard.ts`**
   - Export a `AETHERIS_VISUAL_STANDARD` constant containing the full text of the uploaded doc (verbatim), plus a short lead-in framing it as a standing rider that overrides defaults.

2. **`src/lib/aetheris.functions.ts`**
   - Import `AETHERIS_VISUAL_STANDARD`.
   - Append it as a second system message right after the existing `SYSTEM_PROMPT` in both the `generateHtml` message array and (for consistency) any other place that builds the chat `messages`.
   - Keep existing rules (navigation isolation, image-generator fidelity, etc.) intact — the rider augments, does not replace.
   - Reconcile the one direct conflict: the existing prompt mandates a dark amber aesthetic; the standard mandates light-mode-first with a chosen accent. Resolution: the rider wins for user builds (as the doc itself says), so drop the "dark background, warm amber/gold accents" line from `SYSTEM_PROMPT` and let the rider govern palette. All other existing rules stay.

3. **Pre-gate check**
   - Add a brief note in the system message telling the model to run the Part 6 gate silently before returning HTML.

### Out of scope
- No changes to Obsidian's own unlock/builder chrome, palette, or components.
- No new UI, no new settings, no model changes.

### Verification
- Typecheck.
- Manually confirm the composed `messages` array in `generateHtml` includes the rider as a system message after `SYSTEM_PROMPT`.