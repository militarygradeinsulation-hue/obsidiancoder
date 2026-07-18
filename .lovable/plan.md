
## Obsidian UI Overhaul — Plan

A full visual redesign of the current builder into a premium dark IDE shell, while preserving every working capability and auditing all controls.

### Phase 1 — Audit (read-only)
- Read `src/routes/index.tsx` end-to-end to inventory every state slice, action, panel mount, and control.
- Read `src/styles.css` to catalog current tokens and utility classes (`obs-card`, `obs-chip`, etc.).
- Read all `src/components/panels/*.tsx` to confirm props and behavior.
- Read `src/lib/{commit-gate,clean-export,runtime-bridge,orchestrator,pipeline,staged-context}.ts` to confirm the safe-commit path stays intact.
- Read `src/routes/gallery.tsx` and `src/routes/api/*` to confirm nothing routes through UI-only state.
- Deliverable: internal control inventory + gap list (dead buttons, missing wiring, duplicates).

### Phase 2 — Design system
Update `src/styles.css` with the token palette:
- Surfaces `#050607 / #0A0C0F / #111318`, text `#E7E3DB / #8E9095`, gold `#D9A84E` (bright variant for focus), success green sparingly.
- Borders `rgba(255,255,255,0.06–0.10)`, gold active border `rgba(217,168,78,0.35)`, radii 6–10px, subtle shadows + gold glow on active only, 120–180ms transitions.
- New utilities: `.obs-shell`, `.obs-rail-l`, `.obs-rail-r`, `.obs-topbar`, `.obs-tab`, `.obs-tab.is-active`, `.obs-navrow`, `.obs-navrow.is-active`, `.obs-section-label`, `.obs-statusbar`, `.obs-glow-gold`.
- Keep every legacy class (`obs-card`, `obs-chip`, `obs-list`, `obs-empty`) working — restyle in place, do not rename.

### Phase 3 — Shell modularization
Extract layout out of `src/routes/index.tsx` into thin presentational components (state stays in the route):
- `src/components/shell/ObsidianShell.tsx` — 3-column grid + status bar slot.
- `src/components/shell/LeftRail.tsx` — logo, wordmark, palette search, Workspace nav, Tools nav, workspace chip.
- `src/components/shell/TopBar.tsx` — sidebar toggle, back/forward (no-op safely disabled with tooltip), tab strip, `+ New`, right actions (Run/Preview/Code, device selector, search, overflow).
- `src/components/shell/StatusBar.tsx` — sandbox ready, route/preview state, device, validation, "Local only" for git.
- `src/components/shell/CenterWorkspace.tsx` — preview/code tab switch + composer host (still uses existing handlers/refs passed as props).

### Phase 4 — Left rail wiring (no dead nav)
Map target labels to real behavior:
- **Home** → focus/create empty session. **Projects** → sessions list drawer. **Files** → scroll-to `FileExplorerPanel`. **Code** → toggle center to code view. **Snippets** → scroll-to `ComponentLibraryPanel`. **Agents** → open mode selector. **Tasks** → scroll-to `FlowPanel`. **Databases** → disabled with tooltip "Not connected in this workspace".
- **AI Chat** → focus composer. **Code Assist** → set mode `code`. **Terminal** → scroll-to Runtime panel. **Playground** → focus preview. **Git** → scroll-to `GitReadyPanel`. **Deploy** → scroll-to `DeploymentReadinessPanel`. **Settings** → open command palette settings view.
- Active state = translucent gold row + thin gold border + edge glow.

### Phase 5 — Top bar wiring
- Sidebar toggle drives mobile drawer + desktop rail collapse.
- Tabs = existing sessions (active dot in gold, file-type badge from primary language detected in HTML).
- `+` = existing new-session handler.
- Right: Run (regenerate), Preview/Code split toggle, device selector (desktop/tablet/mobile — sets preview width), search (opens command palette), overflow (export/clear/version restore).

### Phase 6 — Right rail reorg
Collapsible sections in order: **AI Agent** (status dot from real streaming state, current instruction, mode, model) → Context → File Explorer → Execution Graph → Trust Dashboard → Runtime → Rules → Cost → Memory → Design System → Version History → Integrations → Validation/Repair. All existing panel components reused as-is; only wrapper/header restyled.

### Phase 7 — Control audit + fixes
Walk the inventory from Phase 1; for each control: verify it fires a real action, disable with tooltip, or remove. Log fixes.

### Phase 8 — QA
- `tsgo --noEmit`
- Self-test suite via `/api/public/self-test` (expect ≥73 pre-existing; add wiring tests where cheap).
- Playwright: home route 200, click each left nav row, tab switch, device selector, send/cancel, version restore, export → verify `containsPreviewOnly(html) === false`.
- Confirm mobile drawer, focus rings, keyboard nav on nav rows and tabs.

### Guardrails (unchanged)
- Do not modify `commit-gate.ts`, `clean-export.ts`, `runtime-bridge.ts`, `patch-engine.ts`, `orchestrator.ts`, `pipeline.ts`, `validation.ts`, `repair.ts`, `models.ts`, generated Supabase files, or `.env`.
- No new full-regeneration fallback paths.
- No preview-only scripts in exports/versions/gallery/templates.

### Deferred (called out explicitly if hit)
- True git connection (kept as "Local only" chip).
- Databases panel (disabled entry with tooltip).
- Any target label that has no plausible real mapping — will be removed rather than faked.

Estimated file touches: `src/styles.css`, `src/routes/index.tsx` (layout swap only), 5 new files under `src/components/shell/`. No panel rewrites.
