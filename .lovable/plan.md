# Fix Live Demos section on the homepage

## What's wrong now
- The database has **31** demos in `featured_demos`, but the grid renders them all inline, always open — so the section is huge and hard to scan.
- Some rows have raw prompts as titles (e.g. `## Role & Persona…`), making the grid look messy and inconsistent.
- User wants the section **collapsed by default**, expanded on click, and to actually surface every pushed demo.

## Changes

1. **Collapse by default**
   - Replace the always-visible grid in `LiveDemosSection` (`src/routes/index.tsx`) with a collapsed summary card:
     - Shows demo count (e.g. "31 live demos") and the category chips.
     - A prominent "Show demos" / "Hide demos" toggle button.
   - Grid only mounts when expanded, keeping the homepage short and fast.

2. **Show every demo**
   - Keep the current fetch (`featured_demos`, limit 60) but stop letting `HOME_DEMOS` overwrite DB entries; use DB rows as the source of truth and only fall back to `HOME_DEMOS` if the DB returns nothing.
   - Clean up titles: strip leading `#`, `##`, "Role & Persona", and trim to ~60 chars so prompt-shaped titles read as short labels.

3. **Category chips stay visible when collapsed**
   - Selecting a category auto-expands the grid and filters it.
   - "All" resets to collapsed summary.

## Technical notes
- File touched: `src/routes/index.tsx` (only `LiveDemosSection`).
- No schema or backend changes.
- Uses existing `Reveal`, glass utility, and `image.thum.io` thumbnail pipeline — no new deps.
