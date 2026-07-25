## Goal
Give visitors a choice between the new 3D sphere and the classic thumbnail grid for the Live Demos section on `/unlock`, so they can actually see previews.

## Changes (scoped to `src/routes/unlock.tsx` + `src/styles.css`)

1. **View toggle state**
   - Add `demoView: "sphere" | "grid"` state, default `"sphere"`.
   - Persist choice in `localStorage` (`obsidian.demoView`) so it sticks between visits.

2. **Toggle UI**
   - Inside the Live Demos section header (next to the existing category chips), add a small segmented control: `[ Sphere | Grid ]`, styled with the existing glass pill treatment used by the top nav.

3. **Conditional render**
   - If `demoView === "sphere"` → keep the current `<SphereDemoGrid />`.
   - If `demoView === "grid"` → render a responsive thumbnail grid:
     - Card per demo showing category chip, title, and a live thumbnail.
     - Thumbnail source priority: `featured_demos.thumbnail_url` if present, else a lightweight iframe screenshot fallback (`<img>` pointing at `/api/public/share/:slug/thumb` if it exists; otherwise a CSS gradient placeholder with the title — no network cost).
     - Whole card is an `<a target="_blank">` to the demo URL.
   - Grid uses the same filter state (category chips) already wired up.

4. **Styling**
   - Add `.demo-view-toggle`, `.demo-grid`, `.demo-grid-card`, `.demo-grid-thumb` rules in `src/styles.css` matching the burnt-gold / glass aesthetic. Mobile: single column; ≥640px: 2 cols; ≥1024px: 3 cols.

## Out of scope
- No changes to admin `/demos`, backend, or the demo data source.
- No new thumbnail-generation pipeline; use existing `thumbnail_url` field or a gradient placeholder.

## Technical notes
- `SphereDemoGrid` stays mounted only when selected to avoid its RAF loop running in the background.
- One clarifying assumption: featured demos already expose a URL and title; if a `thumbnail_url` column doesn't exist, the grid falls back to gradient placeholders — no schema change needed.
