## Obsidian Core 2.1 — Final Forward Merge

This is a large, multi-day scope (11 workstreams, ~15+ files, new UI panels, iframe protocol, expanded patch engine, extended tests). To ship it safely as one merge without regressing the working submit flow, I need to confirm scope and sequencing before touching code.

### What I'll build (in one merge)

**A. Pipeline & orchestration (items 1, 2, 4)**
- `src/lib/pipeline.ts` — typed stages: `classify → plan → context → execute → validate → repair → finalize`, with per-stage status emitted to UI.
- Rewrite the submit handler in `src/routes/index.tsx` to call `orchestrator.planFor()` and dispatch: deterministic-edit / patch / full-gen / advisory.
- Bounded repair: 1 deterministic pass, then ≤1 narrow AI repair, else rollback to last stable doc. Record attempts in metrics + version metadata.
- Staged context escalation (minimal → nearby → sections → full), 1 focused retry, report tier + char savings.

**B. Patch engine V2 (item 3)**
- Extend `src/lib/patch-engine.ts` with: `remove-element`, `remove-attribute`, `add-class`, `remove-class`, `insert-child` (first/last), `update-inline-style`, `replace-css-rule`, `replace-script-block`, `wrap`, `unwrap`, `move-element`, `rename-id` (with ref updates), `update-json-block`.
- Preflight/dry-run, `expectedPrev`, size caps, full rollback, per-op summaries.
- Update `patch-protocol.ts` prompt to list only implemented ops.

**C. Visual Inspector (item 5)**
- Iframe postMessage protocol (origin-checked, sanitized payload).
- `src/components/VisualInspectorPanel.tsx` + injected inspector script.
- Feed selection into next patch context.

**D. UI panels (items 6, 7, 8, 9)**
- `src/components/MemoryPanel.tsx` (edit/lock/clear/extract).
- `src/components/DesignSystemPanel.tsx` (view + deterministic global edits).
- `src/components/VersionHistoryPanel.tsx` (rename/protect/compare/restore/fork).
- `src/components/CommandPalette.tsx` (extract from index.tsx).
- Extract session persistence + generation orchestration hooks from `index.tsx`.

**E. Hardening (item 10)**
- Timeouts (AI call, patch, repair), request/context caps, bounded retries, sanitized error messages, safe localStorage wrapper.

**F. Verification (item 11)**
- Expand `self-test.ts` with fixtures for: orchestrator routing, context tiers, transactional rollback, repair path, memory locks, design edits, version protection guard, inspector sanitization.
- Run `bunx tsgo --noEmit`, self-test endpoint, build.

### Questions before I start

1. **Scope confirmation.** This is realistically 8–12 hours of focused edits touching ~20 files. Do you want me to ship it all in one merge (higher risk of a broken intermediate state during the turn), or split into 2–3 sequential merges (A+B, then C+D, then E+F) that each leave the app green? I recommend the split.

2. **Visual inspector injection.** The generated builds are single HTML docs rendered in a sandboxed iframe (`srcdoc`). To enable selection mode I need to inject a small inspector script into the preview HTML at render time (not into the saved artifact). Confirm that's acceptable — it means the live preview differs slightly from "Go Live" output.

3. **Design System edits scope.** "Deterministic global color/font/radius edits" — should these mutate the current preview doc directly (creating a new version), or open a diff preview the user confirms first?

4. **Memory panel — "Extract from project".** Should extraction overwrite unlocked fields silently, or always present a diff for confirmation?

5. **`index.tsx` extraction.** Aggressive extraction risks breaking the working submit flow. Confirm you want me to prioritize *shipping working features* over hitting a specific LOC target — i.e., extract panels but leave orchestration inline if extraction would destabilize the flow this turn.

Once you answer (or say "your call on all of them, proceed"), I'll execute.
