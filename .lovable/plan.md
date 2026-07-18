# Obsidian Core 4.0 — Adaptive Intelligence & Intuitive Builder

This is a very large, multi-system merge (16 sections, ~15+ new modules, UI additions, reliability fixes, and a full test/verification pass). To land it responsibly on top of `f1f08b6` without regressing the reliability layer we just shipped, I propose executing it in four sequenced phases inside this single turn's follow-ups. I want your sign-off on the plan and phase order before I start writing code.

## Guiding invariants (applied to every phase)
- Explicit user choices always win over learned behavior.
- Learning is local, sanitized, bounded, reversible, exportable.
- Never learn from secrets, attachments, provider error bodies, the unlock code `9822`, or rejected HTML.
- Commit gate, reliability boundary, auth, clean export, runtime bridge — untouched except to strengthen.
- No duplicate intelligence systems: extend `project-memory.ts`, `failure-learning.ts`, `orchestrator.ts`, `model-router.ts`, `staged-context.ts`, `commit-gate.ts`, `safe-storage.ts`.

## Phase 1 — Reliability corrections (section 14)
Land these first so adaptive layers build on a correct foundation.
- `src/routes/api/patch.ts`: transport errors (including retryable) return an error envelope; caller (index.tsx) must NOT fall through to full generation on transport failure. Full-gen only on deliberate empty-ops deferral or explicit user request.
- `src/lib/ai-fetch.ts` / `/api/generate`: treat streamed responses with zero valid HTML as `ai_upstream_empty`; do not mark circuit success until first valid payload received.
- Circuit breaker: `ai_unauthorized` and config errors do NOT increment failure counters.
- `src/routes/index.tsx` retry handler: replay original attachments + prompt, not prompt alone.
- `src/components/BuilderErrorBoundary.tsx`: production shows stable message + requestId only; sanitized internals dev-only.
- Remove/gate `x-obs-mock-upstream` to `NODE_ENV !== 'production'`.
- `/api/health`: audit output — only booleans + breaker names/states.

## Phase 2 — Core intelligence primitives (sections 1–7)
New pure modules, no UI yet:
- `src/lib/adaptive-ledger.ts` — bounded typed sanitized event log (safe-storage backed, ~500 events / 512KB cap, corruption recovery).
- `src/lib/preference-learning.ts` + `src/lib/adaptive-profile.ts` — evidence → confidence promotion (threshold ≥3 with agreement, or 1 explicit confirm). Locked memory always wins.
- Extend `failure-learning.ts` with correction-pair detection and restore-reason capture (structured feedback enums, no free text sent to models).
- `src/lib/performance-model.ts` — success/restore/validation/runtime/cost/latency stats per (taskType × strategy × model × contextTier × sizeBucket).
- `src/lib/adaptive-router.ts` — wraps `orchestrator.planFor`, produces `RoutingDecision { chosen, why, alternatives, signalsUsed, signalsIgnored }`. Deterministic > structured patch > AI patch > full-gen (explicit only) > advisory.
- `src/lib/intent-resolver.ts` — compact `ResolvedIntent { outcome, scope, mustPreserve, likelyTargets, risk, ambiguity, needsClarification }` grounded in selected element / recent op / active file / version diff.
- `src/lib/project-patterns.ts` — extract components/tokens/nav/form/naming patterns; status observed|confirmed|locked.
- Smart Context v2: extend `staged-context.ts` to consume intent + patterns + protected set; hard-exclude rejected/secret material.

## Phase 3 — Coach, self-check, explainability (sections 8, 10–12)
- `src/lib/next-best-action.ts` — deterministic ranked actions from real evidence (validation blockers, runtime errors, repeated restores, token candidates, unused component reuse). Max 3 suggestions post-build.
- Pre-commit adaptive checklist inside `commit-gate.ts` (additive `AdaptiveChecks` — warnings by default; blocks only on locked/rule/regression, never on low-confidence prefs).
- Extend `generation-report.ts` / `version-metadata.ts` with `interpretation`, `strategyRationale`, `signalsApplied`, `newLearning`, `rollbackPointId`.

## Phase 4 — Adaptive UI + privacy controls + tests (sections 9, 13, 15, 16)
- `src/components/panels/IntelligencePanel.tsx` (right-rail tab): current interpretation, confidence bars, strategy recommendation, context summary, recent learning.
- `src/components/panels/LearningPanel.tsx`: list learned items with Confirm / Correct / Lock / Forget; Reset & Export/Import (sanitized JSON, schema-validated).
- `src/components/panels/StrategyExplanation.tsx`: "Why this strategy?" + "What Obsidian learned" drawers.
- Wire into `src/routes/index.tsx` right rail with collapse persistence in localStorage.
- Restore feedback micro-prompt (structured reasons, dismissible).
- Privacy toggles: learning on/off per project, retention slider, wipe button, export/import.
- Tests: extend `src/lib/self-test.ts` + add `/api/public/self-test` cases covering every bullet in section 15. Add a Playwright script under `/tmp/browser/core4/` for the learning panel flow.
- Final verification: tsgo noEmit, self-test totals, `/api/health` + `/api/public/self-test` status, browser walkthrough, confirm export contains no secrets/`9822`/provider bodies.

## Files created (est.)
adaptive-ledger.ts, preference-learning.ts, adaptive-profile.ts, performance-model.ts, adaptive-router.ts, intent-resolver.ts, project-patterns.ts, next-best-action.ts, IntelligencePanel.tsx, LearningPanel.tsx, StrategyExplanation.tsx (+ ~6 modified: patch.ts, generate.ts, ai-fetch.ts, circuit-breaker.ts, commit-gate.ts, staged-context.ts, orchestrator.ts, generation-report.ts, index.tsx, BuilderErrorBoundary.tsx, self-test.ts, health.ts).

## Assumptions I'll make unless you correct me
1. All learning stays in `localStorage` under a versioned key (`obs.core4.v1.*`) — no new Supabase tables.
2. Preference promotion threshold = 3 consistent observations OR 1 explicit "Confirm".
3. Restore feedback is optional; skipping it still records the raw restore signal.
4. Intelligence panel becomes the default right-rail tab only on first run after this ship; existing users keep their current tab.
5. Export/import JSON schema is versioned; unknown versions refuse to import.
6. No new external dependencies.

## What I need from you
- Approve the phase order (1→4 in one continuous execution), OR tell me to reorder / drop a phase.
- Confirm the six assumptions above (or override).
- Confirm you want this shipped as one merge (I will not stop between phases unless a phase fails verification).

Once you approve, I'll execute all four phases and report the full verification block at the end.