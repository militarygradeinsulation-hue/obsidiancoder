# Cloud Memory for Builds — shared team data, admin-only editing

A build with **Cloud Memory** turned on keeps its data in the cloud instead of in one browser. When
Joseph shares the live URL with his team, everyone opening it sees the same dashboard, calendar, task
list, or log — and every entry a teammate makes shows up on everyone else's screen live.

Nobody but Joseph can change the build itself. Teammates only use it.

## What Joseph sees

1. A **"Cloud Memory"** button in the top bar of both Obsidian Vibe and Obsidian Pocket, next to the
   existing live toggle. Off by default; shows a lit dot when on.
2. Clicking it opens a small panel with:
   - **Cloud Memory on/off** — when on, the build's data lives in the cloud.
   - The **team URL** with a copy button (only when the build is live).
   - The **team code** teammates enter once to get in (defaults to `9822`, editable per build).
   - A short activity line: "12 entries · last update 2 min ago by Windows · Chrome".
   - **Reset data** — wipes the shared data without touching the build.
3. Editing the build (prompts, patches, publishing) stays exactly as it is today and stays
   admin-only. Nothing about a teammate's session can alter the build's code.

## What a teammate sees

- Opens the shared URL → a code prompt → enters the team code once (remembered on that device).
- The build runs normally. Anything it saves — calendar events, dashboard rows, form submissions,
  notes — goes to the shared cloud store instead of local storage.
- When another teammate adds or changes something, it appears within a second or two. Last write
  wins on the same record.
- There is no prompt box, no edit bar, no way to change the build. View and use only.

## Technical section

**Database (one migration)**
- New `public.build_memory` — the shared per-build data store:
  `project_id uuid`, `owner_id uuid`, `key text`, `value jsonb`, `updated_by text`,
  `created_at`, `updated_at`; primary key `(project_id, key)`.
  GRANTs to `service_role` only; RLS on with a select policy for the owner
  (`auth.uid() = owner_id`) and no anon/authenticated write access — all team writes go through the
  server route below. Added to `supabase_realtime` publication with full replica identity.
- Extend `public.project_sync` with `cloud_memory boolean not null default false`,
  `team_code_hash text`, `team_code_set_at timestamptz`.
- RPCs in the existing `project_sync_*` style: `project_sync_set_cloud_memory(...)`,
  `build_memory_lookup(_slug)` (slug → project_id/owner/enabled/code hash), plus
  `build_memory_upsert`, `build_memory_list`, `build_memory_reset`.

**Server**
- `src/lib/project-sync.server.ts`: `setCloudMemory`, `lookupTeamAccess`, `readBuildMemory`,
  `writeBuildMemory`, `resetBuildMemory`. Team code hashed with SHA-256 + per-project salt; the
  code and hash are never returned to a client.
- `src/routes/api/sync.ts`: `PUT` also accepts `{ cloudMemory, teamCode }` (owner-authenticated,
  as today).
- New `src/routes/api/public/team.$slug.ts`:
  - `POST { code }` → verifies the team code, returns a short-lived signed team token
    (HMAC with `SESSION_SECRET`, 12h, scoped to that project, read+write **data only**).
  - `GET` (token) → the build's shared records.
  - `PUT { token, key, value }` → upsert one record, size-capped, rate-limited per token.
    No AI, no HTML writes — this route cannot touch build content, so no credits are ever spent by
    a teammate.

**Client**
- New public route `src/routes/team.$slug.tsx`: code gate, then the build in a sandboxed iframe.
  Subscribes to Realtime on `build_memory` for that project and forwards changes into the frame.
- `src/lib/runtime-bridge.ts`: extend the existing frame bridge with `memory.get` / `memory.set` /
  `memory.list` messages, so a generated build calls a tiny `ObsidianMemory` API instead of
  `localStorage`. Falls back to local storage when Cloud Memory is off, so builds work either way.
- Generation prompts (`src/lib/pocket-prompt.ts` and the coder's system prompt) gain a short section
  telling the model to persist app data through `ObsidianMemory` when it is present.
- `src/lib/project-sync.ts` + `src/hooks/useLiveSync.ts`: expose `cloudMemory`, `setCloudMemory`,
  and a live entry count.
- New `src/components/CloudMemoryButton.tsx`, mounted in `src/routes/index.tsx` and
  `src/routes/pocket.tsx`. Full controls gated behind `isFullAccessCode` (9822).

**Verification**
- New self-test cases in `src/lib/__tests__/selftest.mts`: code hash/verify, token scope and expiry,
  memory record size/rate caps, cloud-memory state transitions, bridge message validation.
- Browser check: enable Cloud Memory on a calendar build, open the team URL in a second session,
  add an event, confirm it appears in the owner's canvas without a reload — and confirm the team
  page exposes no way to edit the build.

## Notes

- Two separate secrets: the site password (`9822`) is unchanged; each shared build gets its own team
  code, so revoking a build's access doesn't affect anything else.
- Existing builds keep working untouched — Cloud Memory is opt-in per build.
- Pre-existing TypeScript errors in `src/lib/mcp/tools/*` and one line of `src/routes/index.tsx` are
  unrelated to this work; I'll fix them during implementation since they block the build.
