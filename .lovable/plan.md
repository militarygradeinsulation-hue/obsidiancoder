
## Goal
Below 768px, replace the 3-column desktop shell with a single-panel mobile workspace driven by a fixed bottom nav (Chat · Preview · Files · Build · More). Desktop/tablet (≥768px) render exactly as today. All data, handlers, API calls, and components are reused — the mobile layer is a wrapper, not a rewrite.

## Architecture

**Single branch point in `src/routes/index.tsx`:**
```
const isMobile = useIsMobile();          // existing hook, 768px breakpoint
return isMobile
  ? <MobileWorkspace {...sharedProps} />
  : <existing desktop shell, untouched />;
```

`sharedProps` are the exact refs, state setters, and handlers already computed in `index.tsx` (build state, sendMessage, iframe srcDoc, files, versions, deployment, credit bar, admin toggles). No duplication — the mobile shell only reads/dispatches through them, so a single conversation, single build session, and single iframe live at a time.

## New files

1. `src/components/mobile/MobileWorkspace.tsx` — the shell.
   - Local state: `activeTab: "chat" | "preview" | "files" | "build" | "more"`, default `"preview"`.
   - Persisted per-project in `sessionStorage` (`obs.mobileTab.<projectId>`) so switching within a project preserves the tab.
   - Renders `<MobileTopBar>`, the active panel (full-screen), and `<MobileBottomNav>`.
   - Uses CSS `env(safe-area-inset-top/bottom)` and `100dvh` sizing.
2. `src/components/mobile/MobileTopBar.tsx` — logo, project name, overflow menu.
3. `src/components/mobile/MobileBottomNav.tsx` — 5 icon+label tabs, 56px tall + safe-area inset, `aria-current` on active.
4. `src/components/mobile/tabs/ChatTab.tsx` — wraps existing composer + message list; sticky composer sits directly above the bottom nav with 44px targets.
5. `src/components/mobile/tabs/PreviewTab.tsx` — wraps existing preview iframe full-width/full-height; header row has Refresh + Open-in-new-window; floating "Ask Obsidian" FAB switches `activeTab` to `chat`.
6. `src/components/mobile/tabs/FilesTab.tsx` — two internal views: `list` (reuses `FileExplorerPanel`) and `editor` (reuses the existing single-file editor); `list → editor` on select, back arrow returns. Never side-by-side.
7. `src/components/mobile/tabs/BuildTab.tsx` — status cards driven by existing build/deployment state: current stage, completed steps, errors, deploy status. Reuses existing Stop/Retry/Approve/Deploy handlers. "View Logs" is a secondary button opening the existing logs panel in a full-screen sheet.
8. `src/components/mobile/tabs/MoreTab.tsx` — list rows linking to existing project settings, integrations, deployment history, usage/credit bar, account modal, plus an "Open Desktop Workspace" action (sets a `?desktop=1` flag that overrides `isMobile` for this session).

## Styles

Add a scoped section at the end of `src/styles.css`, wrapped in `@media (max-width: 767px)`:
- `.mob-shell`, `.mob-topbar`, `.mob-view`, `.mob-bottom-nav`, `.mob-tab`, `.mob-fab`, `.mob-sheet`.
- Inputs: `font-size: 16px` to prevent iOS zoom.
- Buttons: min 44×44.
- Body: `overflow-x: hidden`.
- Modal override: `.obs-modal { inset: 0; border-radius: 0; }` so dialogs become full-screen sheets on mobile only.
- No changes to any desktop selectors.

## `src/routes/__root.tsx`
Verify viewport meta contains `viewport-fit=cover`; add if missing. This is the only change outside the mobile tree.

## Behavior rules honored
- Default tab = Preview on project open.
- Selected tab persisted per project in the same session.
- Desktop sidebars/rails/handles are simply not rendered on mobile (component isn't mounted), so no duplicate iframes/editors.
- No routes, auth, billing, schemas, API contracts, or Stripe wiring change.

## Verification
- Manually resize to 320 / 375 / 390 / 430 px, confirm no horizontal scroll, bottom nav clears home indicator, composer clears keyboard, FAB visible.
- Confirm ≥768px renders the untouched desktop shell.
- Typecheck + production build.

## Files touched
- New: `src/components/mobile/MobileWorkspace.tsx`, `MobileTopBar.tsx`, `MobileBottomNav.tsx`, `tabs/ChatTab.tsx`, `tabs/PreviewTab.tsx`, `tabs/FilesTab.tsx`, `tabs/BuildTab.tsx`, `tabs/MoreTab.tsx`.
- Edited: `src/routes/index.tsx` (add mobile branch + prop bundle), `src/styles.css` (mobile section appended), `src/routes/__root.tsx` (viewport-fit only if missing).

## Out of scope
- Redesigning desktop or tablet.
- Changing chat model, build pipeline, or deployment logic.
- Any backend/database/Stripe/auth work.
