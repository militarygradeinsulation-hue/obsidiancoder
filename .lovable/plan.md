# Forensic review — latest Obsidian Vibe build, and the fast-path architecture

## What is observable, and what is not

The newest in-app generation is observable only through its persisted artifacts in the backend `builds` table. The per-stage numbers you asked for (`OBS_TIMING`, the `→ Stages:` terminal line) are **not recoverable**: the timing trailer is appended to the stream (`src/routes/api/generate.ts:1446`) and then stripped from the document before commit and save (`src/routes/index.tsx:2594`), and the `→ Stages:` line only ever exists in the in-browser terminal buffer (`src/routes/index.tsx:2808`). The dev-server log has no generation traffic — that build ran against the deployed app, not this sandbox. No `OBS_TIMING` string exists in any saved row.

So: timings below are **row-timestamp derived, not instrumented**.

## The build under review

Latest generation, session `1b2427e8`, client `bd856e62`:

| time (UTC, 2026-08-11) | row | model recorded | bytes |
|---|---|---|---|
| 11:53:08 | `a8102c81` (`surface: live`, `is_cloud: true`) | auto | 87,634 |
| 11:54:39 | `22f7120e` | `google/gemini-3.5-flash` | 87,529 |
| 11:54:51 | `de6fe93b` | auto | 87,529 |

Prompt: *"Build a waitlist page for a boutique creator education platform showcasing expert curriculum modules, a peer-to-peer mentorship matching interface, and a resource library preview…"*
Result: `Creator Academy — Join the Waitlist`, archetype comment in the head reads `A6 Playful Bold / EdTech`.

The previous build in the same session (AI governance dashboard) recorded `routellm/claude-opus-4-1-20250805` at 11:47:22 with three re-saves through 11:48:02.

### 1-2. Build time and stages

- **First observable artifact to last save: ~103 s** (11:53:08 → 11:54:51). The 11:53:08 row is the live-sync row and is updated at 11:54:43, so the commit-to-settled window is ~95 s.
- **Time-to-first-useful-preview: unmeasurable from persisted state.** Streaming paint happens client-side at a 650 ms cadence; nothing records first byte.
- Three writes for one generation (11:54:39, 11:54:43, 11:54:51) is the archive + cloud-sync + rename path each persisting the full 87 KB document.

### 3. Speed path / proven direction

**Not reused.** Head comment names a fresh archetype (`A6 Playful Bold`), and the prior build in the same session used a different one (`A5 Luxury Minimal Serif`). `provenDirection` requires three graded, kept, 80+ builds in a *concrete* family; the session shows repeated one-off directions, so the branch at `src/routes/index.tsx:2410` did not fire.

### 4. Path taken

Evidence-supported: full generation, not patch (fresh build, no prior document in that tab). Model recorded as `google/gemini-3.5-flash` — i.e. the ChatLLM/OpenAI legs were skipped or fell through to Gemini, which is the tail of the chain, so **a provider fallback almost certainly occurred**. Enrichment produced **zero real images** (0 `<img>`, 0 `data:image`) despite 13 stock-image URL references in CSS. Planner, QA, critique and retry cannot be confirmed or excluded from persisted state.

### 5-6. Quality against a strong 21st.dev standard — **62/100**

Measured on the saved document (87,508 chars, 11 sections, 19 buttons, 2 scripts):

Strengths
- Token discipline is real: 232 `var(--…)` uses, a single `:root` scale (`--step`, `--gap`, `--section-y`, `--radius`), and 11 `clamp()` type steps.
- Motion is present and restrained: 7 `@keyframes`, 24 transitions, 15 hover states, 1 `IntersectionObserver` reveal, 1 `prefers-reduced-motion` guard.
- Content is specific, not filler: zero "lorem", real module/mentor/FAQ copy, and 6 `window.ObsidianMemory` calls — the memory bridge was actually adopted.
- Structure is complete: countdown, curriculum, mentor grid, testimonials, FAQ, 68 `aria-` attributes.

Deficits versus a top 21st.dev page
- **Zero vector craft.** 0 `<svg>` in the whole document. Top-tier pages carry custom icons, dividers, and marks; this leans on emoji/CSS shapes.
- **Fonts never load.** 0 `<link>`, 0 `@font-face`, 0 Google Fonts. `--font-display: 'Cabinet Grotesk'` and `'DM Sans'` silently resolve to `system-ui`, so the typographic identity the DNA specified is simply absent in the browser. This alone accounts for most of the "looks generic" gap.
- **No real imagery.** 0 `<img>`; 13 unsplash/picsum/placeholder URLs only in CSS backgrounds — unreliable and unart-directed.
- **Thin responsive work.** 4 desktop and 8 mobile breakpoints across 11 sections; only 5 grid containers and 1 sticky element, so density and composition barely change between viewports.
- **Archetype-shaped, not authored.** 4 identical `box-shadow: 4px 4px 0` hard shadows plus black borders is the stock neobrutalist recipe — recognisably a preset rather than an original direction.
- **Interaction polish under-finished.** 4 `focus-visible` rules for 19 buttons.

### 7. Why it was slower than it should be

1. No speed-path hit — a full concept decision plus full-document generation for a pattern (waitlist page) the system has seen repeatedly.
2. Model recorded is the last leg of the provider chain: the request paid the earlier legs' open budget before landing on Gemini.
3. Quality stages sit on the commit path, so the 95 s window is generation *plus* floor/validation/repair before anything is settled.
4. Three separate 87 KB persistence writes per build.
5. The previous build in the same session ran on Opus 4.1 — the slowest tier — for a dashboard.

### 8. Why it does not look 21st.dev-grade

Ranked by visual impact: (a) declared display/body fonts never load; (b) no SVG craft anywhere; (c) no real, art-directed imagery; (d) preset archetype styling instead of an authored direction; (e) too few breakpoints for genuine composition change; (f) incomplete focus/interaction states.

## Target architecture for 3-8 s first preview with 21st.dev quality

**Critical path (target ≤ 8 s to useful preview)**
1. Classify → look up an adaptive-memory direction. Familiar pattern (`waitlist`, `pricing`, `dashboard`) with a graded winner ⇒ zero planner call.
2. Stream generation on a fast strong model (Sonnet-class / Gemini Flash) with a hard first-byte budget of ~6 s and immediate demotion of any provider that misses it.
3. Paint at the existing 650 ms cadence; commit as soon as the document validates structurally.

**Off the critical path (async, applied as a follow-up revision)**
Cinematic critique and polish, image enrichment, QA/Claude repair, quality retry, learning writes, archive/cloud persistence (single debounced write, not three).

**Quality invariants enforced deterministically, before any model call**
A required-preamble contract the generator cannot omit: web-font `<link>` for every font the DNA names (or DNA restricted to fonts already loaded), a minimum inline SVG icon set, `focus-visible` on every interactive element, and at least three real breakpoints. These are cheap, deterministic, and remove the most visible quality gap without adding latency.

**Memory**
Promote a direction to "proven" per concrete family after 3 clean kept builds; store the structural skeleton (section order, layout archetype, type scale, palette strategy) — never markup — and mutate it per build so reuse never means repetition.

**Instrumentation to keep**
Persist the `OBS_TIMING` trailer as build metadata instead of stripping it, so plan / first-byte / stream / QA / critique are auditable after the fact. Right now no build in the system can be timed retrospectively — that is the single biggest blind spot in this review.

## Note

No files were changed. Approve if you want the above implemented — the first two items I would ship are persisting `OBS_TIMING` into build metadata and the deterministic preamble contract (fonts, SVG, focus states), since together they fix both the measurement blind spot and the largest visible quality gap.
