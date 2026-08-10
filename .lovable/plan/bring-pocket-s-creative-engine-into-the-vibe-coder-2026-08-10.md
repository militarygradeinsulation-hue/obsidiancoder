# Bring Pocket's creative engine into the Vibe Coder

Vibe Coder currently sends a plain build request: prompt, current HTML, model, theme blueprint, memory. Pocket sends the same request plus a full creative package — a build profile (Fast / Studio / Cinematic), a style family (luxury, cinematic, editorial, brutalist, organic, etc.), a deterministic Design DNA, a planned creative direction, and recent-build signatures so it never repeats itself. The server only injects the premium direction block when the request is marked as coming from Pocket, and Pocket resolves its own best-available model per profile.

This plan gives Vibe the exact same engine, plus keeps every Vibe-only feature on top.

## What changes for you

- A new **Art Direction** control in the Vibe Coder top bar / composer with:
  - Profile: Fast, Studio, Cinematic (same three Pocket has, same access rules)
  - Style family: the full Pocket list — luxury, cinematic, editorial, brutalist, organic, futuristic, plus Auto
  - A line showing the chosen direction and its Design DNA summary for the current build
- Vibe uses the **same model resolution as Pocket** (best available Claude per profile, planner model for direction planning), while your manual model picker still wins when you pin a model.
- Vibe builds go through the **same premium prompt path** as Pocket: Design DNA block, chosen concept, anti-repetition signatures, and the cinematic critique/repair pass for Studio and Cinematic.
- Refining an existing build keeps that build's DNA — no re-planning, no style drift.
- Direction and DNA are stored **per tab**, so switching tabs restores that build's art direction.
- Everything Vibe already has stays: multi-tab, attachments/PDF style guides, theme blueprints, design contract, component registry injection, memory panel, cloud memory, QA, version history, publish/export.

## Technical changes

1. `src/routes/api/generate.ts`
   - Widen the `surface` enum to include `"vibe"`.
   - Change the premium-injection condition from `data.surface === "pocket"` to "surface is pocket or vibe, and a concrete `pocketDesignDNA` was supplied", so the same `pocketPremiumBlock` is injected. No schema fields added — Vibe reuses the existing `pocket*` payload fields.

2. `src/routes/index.tsx` (Vibe Coder)
   - Add creative state to the per-tab project record: `profile`, `styleFamily`, `dna`, `conceptPlan`, `planKey` (persisted with the tab, backward compatible — older tabs default to Fast/Auto).
   - Before generation, run Pocket's pipeline: `deterministicConceptPlan` → optional `planPocketConcepts` call for Studio/Cinematic with paid/admin access → `selectedConcept().dna`; reuse the plan when inputs are unchanged; reuse existing DNA on refine.
   - Resolve the model through `resolvePocketModel` / `resolvePocketPlannerModel`, honoring a manually pinned picker model.
   - Extend the `/api/generate` body with `surface: "vibe"`, `pocketProfile`, `pocketStyleFamily`, `pocketDesignDNA`, `pocketConcept`, `pocketRecentSignatures` — keeping every existing Vibe-only field.
   - After commit, run `critiquePocketBuild` for Studio/Cinematic and apply repair operations, mirroring Pocket, then `rememberSignature` for anti-repetition.
   - New `ArtDirectionControl` UI component for profile + family selection, reading/writing creative prefs.

3. Shared modules used as-is, no changes: `pocket-creative.ts`, `pocket-concept.ts`, `pocket-prompt.ts`, `pocket-model-resolver.ts`, `pocket-studio.functions.ts`, `pocket-hardening.ts`.

4. Self-tests: extend the existing suite with assertions that a Vibe-surface request carrying a DNA gets the premium block, that refine preserves DNA, and that per-tab art direction round-trips through persistence.

## Out of scope

- No changes to Pocket's behavior or UI.
- No pricing/entitlement changes; Studio and Cinematic keep the same paid/admin gating they have in Pocket.
