# Staged Architecture Rollout

This is a large, multi-phase change. To keep it safe (Stripe/pricing/plans/free-demo/webhooks untouched) and reviewable, I'll ship it in **five sequential turns**, each independently verifiable, rather than one giant commit. Each phase ends with `tsgo`, focused self-tests, `bun run build`, and a diff report vs `d14d9c7`.

You approve this plan → I execute Phase 0 in the next turn and stop for your review before Phase 1. Same rhythm through Phase 4.

## Payment/pricing lockdown (all phases)
Do not touch: `src/lib/stripe*`, `src/lib/plans.ts`, `src/routes/checkout*`, `src/routes/api/public/payments/*`, `src/hooks/useSubscription.ts`, `src/hooks/useEntitlement.ts`, `src/lib/credit-gate*`, `src/lib/free-demo*`, `src/routes/api/public/free-demo*`, `src/routes/api/public/entitlement.ts`, `src/utils/payments.functions.ts`, `.env*`. Read-only type imports only if unavoidable.

---

## Phase 0 — Cold-build baseline (measurement only, no behavior change)
Deliverables:
- `src/lib/baseline/harness.ts` — invokes existing `/api/generate` path in-process against the three prompts (B2B analytics, editorial hospitality, playful edu) using dev harness; no ledger writes (bypass via test flag on server route guarded by `NODE_ENV !== "production"`).
- `src/lib/baseline/fixtures/*.json` + `baseline-report.md` — records: model, strategy, section pattern, tokens present, every button/link/form + working?, external/dead-target violations, latency, cost meta. Uses existing `knowledge-graph`, `validation`, and a new lightweight interaction extractor.
- If provider can't be safely called in sandbox: use the three most recent representative fixtures already committed (or stubbed provider replaying last generation) and state the limitation in the report.
- Screenshots via existing Playwright script under `/tmp/browser/` only.

No src route/UI changes. Purely additive files.

---

## Phase 1 — Real ThemeBlueprint bundles
Deliverables:
- `src/lib/themes/blueprint.ts` — `ThemeBlueprint` type covering all nine axes (fonts, ratio, spacing, radius, edges, elevation, layout archetype, color strategy, motion) plus button/card/input/nav/table/badge/background/imagery treatments.
- `src/lib/themes/builtins.ts` — 10 built-ins: Swiss Editorial, Neo-Brutalist, Terminal, Soft Consumer, Dense Ops, Luxe Dark, Clean SaaS, Playful Clay, Neon Circuit, Brutalist Signal.
- `src/lib/themes/signature.ts` + tests — deterministic signature vector; test fails if any two built-ins differ only by color or match on ≥8 axes.
- `src/lib/themes/apply.ts` — deterministic HTML rewriter: single `<style data-obs-theme>` layer, replaces on re-apply, resets cleanly. Rewrites body/headings/nav/section/button/card/input/form/dialog/table/badge + remaps dominant colors + injects density/radius/edge/elevation/motion + layout hints. Not just CSS vars.
- `src/lib/themes/normalize-21st.ts` — normalizes 21st.dev hits to `ThemeBlueprint`; when only colors are provided, assigns a deterministic structural bundle by hashing identifier/name so remote themes don't collapse.
- `ThemesPanel.tsx` updates: Built-ins tab first, then 21st.dev search; each preview renders a mini sample UI (type + nav + button + card + input); "Surprise me" picks a blueprint with maximum signature distance from current; 9-axis compact summary chips.
- Persist selected blueprint id in existing per-session/project store; inject into generation/edit context so subsequent generation respects it.
- Playwright thumbnail test: renders one fixture at 200px under all built-ins, saves PNGs, asserts signature-vector uniqueness. Honest note if pixel-diff not feasible in sandbox.

Only `ThemesPanel.tsx` and generation context wiring change in existing files.

---

## Phase 2 — InteractionManifest + deterministic linter
Deliverables:
- `src/lib/interaction/manifest.ts` — `InteractionManifest` type: sections, views/tabs, modals/drawers/menus, accordions/carousels/details, form/state/calculator actions, CTA→target map.
- `src/lib/interaction/graph.ts` — parses generated single-file HTML: ids, hrefs, buttons + accessible names, forms/actions/methods, aria-controls/expanded, inline handlers, addEventListener targets (best-effort static), `window.open`, `location.*`, modal/tab/accordion relationships.
- `src/lib/interaction/linter.ts` — blocking violation types listed in your spec; allowed-behavior whitelist enforced.
- `src/lib/interaction/repair.ts` — deterministic patch pass using manifest + violations only. Max 3 loops. After loop 3, disable remaining offenders (`disabled` / `aria-disabled="true"`, remove href/onclick, keep visible label). If any external-nav or structural blocker remains → reject candidate, keep previous stable HTML.
- Wire into `src/lib/commit-gate.ts` behind `source === "full-generation" | "ai-patch"`.
- Generation prompt language updated to reference the manifest; linter is authoritative.
- Tests in `src/lib/self-test.ts` for all cases you listed (valid, external, `_blank`, `window.open`, `location.href`, mailto/tel, `href="#"`, missing id, dup ids, dead button, broken aria-controls, external/unhandled form, undeclared manifest target, disable fallback, previous-HTML retention).
- Runtime smoke: Playwright loads a fixture, clicks every interactive control, asserts no navigation/network egress and a visible internal state change or valid same-doc target.

---

## Phase 3 — CreativeBrief layer
Deliverables:
- `src/lib/creative/brief.ts` — `CreativeBrief` type per your spec (blueprint, thesis, signature element, layout strategy, typography, interaction concept, imagery, 3 differentiators, anti-patterns).
- Levels: `controlled | creative | bold` (creative = default fresh full builds). Persist per project via existing store.
- Small selector added inside existing `DesignLibraryPanel` or `RulesPanel` — no shell redesign.
- Fresh-generation prompt injects the brief; explicitly bans "centered hero + 2 buttons + logo strip + 3 equal cards + CTA" unless brief asks for it. Small edits force `controlled`.
- Bold never bypasses linter, a11y, security, or manifest.

---

## Phase 4 — Feature-flagged L0–L6 pipeline (scaffold + canary)
Deliverables:
- `src/lib/pipeline/layers/{classify,architect,design,implement,validate,repair,critique}.ts` — typed schemas (zod), each with its own retry-on-malformed-JSON and role-based model selection via existing `model-router` + fallback chain. No unknown model ids.
- `src/lib/pipeline/contract.ts` — deterministic L1+L2 → `GenerationContract` reconciler.
- `src/lib/pipeline/orchestrator.ts` — runs L0–L6; skips heavy layers on deterministic edits / small patches; per-layer latency/model/token/cost telemetry; hard cap on repair loops (3).
- Feature flag `OBS_LAYERED_PIPELINE` (env + per-request header for canary). Default **OFF**. Legacy path unchanged when off.
- `src/lib/pipeline/cost-estimate.ts` — reports estimated calls/credits per build type for legacy vs layered.
- Surface per-layer progress in existing `ExecutionGraphPanel` / `IntelligencePanel` only (no shell changes).

---

## Verification (every phase)
- `bunx tsgo --noEmit`
- Prettier/ESLint on changed files only
- Focused new self-tests + full `bun run self-tests`
- `bun run build`
- Diff report vs `d14d9c7` proving no payment/pricing/plan/subscription/webhook/free-demo files changed
- After Phase 4: re-run Phase 0 baseline; publish before/after diversity + interaction-defect comparison and latency/cost delta

## What I need from you
Reply "go" to start **Phase 0**. I'll stop after each phase for review before continuing. If you want a different order or want to skip Phase 0 (baseline) and jump to Phase 1 (real theme bundles — the most user-visible fix), say so.
