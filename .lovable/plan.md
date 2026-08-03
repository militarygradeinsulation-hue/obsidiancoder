# Shared Live Builds — cloud memory + collaborative live URL

Add a top-bar button in both Obsidian Vibe (the normal coder) and Obsidian Pocket that turns the
open build into a **shared live build**: it gets a public URL, its memory and content live in the
cloud, and anyone who has the URL *plus* the build's login code can view and change it. Every change
syncs to everyone viewing, anywhere, in real time. Last save wins.

## What Joseph sees

1. In the top bar of both surfaces, next to the existing "Go live" control, a new
   **"Share build"** button (shows **"Shared"** with a dot once active).
2. Clicking it opens a small panel with:
   - the public URL (copy button),
   - the **edit code** for that build (auto-generated 6 digits, editable, defaults to `9822`),
   - a toggle for **"Visitors can edit"** (on by default),
   - "Stop sharing", which kills the URL immediately.
3. While shared, the button shows a live count-free indicator plus "last edited on <device>", and
   any change made by a visitor lands in Joseph's canvas automatically (existing realtime path).

## What a visitor sees

Opening the URL loads a full page (not the raw sandbox file) with the build rendered plus a slim
bottom bar:

- **View mode** by default — the build just works.
- **"Unlock editing"** asks for the build's code. Correct code stores an editor token for that
  browser and reveals a prompt box.
- With editing unlocked, a visitor can type a change request ("make the header green", "add a
  contact form") and the build regenerates, saves to the cloud, and pushes to every other open
  viewer within a second or two.
- Concurrent edits: last save wins; other viewers get a quiet "updated by someone else" toast and
  the new version.

## Technical section

**Database (one migration)**
- Add to `public.project_sync`: `share_editable boolean not null default false`,
  `edit_code_hash text`, `edit_code_set_at timestamptz`, `shared_at timestamptz`.
- New RPCs (security definer, service_role only, matching the existing `project_sync_*` style):
  - `project_sync_set_share(_user_id, _project_id, _live, _editable, _code_hash, _slug)` — owner-side.
  - `project_share_lookup(_slug)` — returns `project_id`, `user_id`, `editable`, `edit_code_hash`,
    `revision` for a slug, with no owner check (used by the public route only).
  - `project_share_apply(_project_id, _html, _device)` — writes new HTML to `builds`, bumps
    `project_sync.revision`, records `last_device`. No RLS exposure; called only after code check.
- No new client-readable grants: all public access goes through server routes with `supabaseAdmin`.

**Server**
- `src/lib/project-sync.server.ts`: add `setProjectShare`, `lookupShare`, `applyShareEdit`.
  Code hashing with SHA-256 + per-project salt (Web Crypto, already used elsewhere).
- `src/routes/api/sync.ts`: extend `PUT` to accept `{ editable, editCode }` alongside `live`.
- New `src/routes/api/public/share-edit.$slug.ts`:
  - `POST { code }` → verifies code, returns a short-lived signed editor token (HMAC with
    `SESSION_SECRET`, 12h) — never returns the code or hash.
  - `PUT { token, prompt }` → verifies token, rate-limits (per token, e.g. 10 edits / 10 min),
    runs the existing generate/patch pipeline against the current HTML, saves via
    `project_share_apply`. Cost is metered against the **owner's** ledger with the existing
    `requirePaidOperation` path so anonymous edits can't run unbounded; when the owner is a
    full-access code (9822) it's unmetered like today.
- Existing `src/routes/api/public/share.$slug.ts` stays as the raw-HTML endpoint the iframe loads.

**Client**
- New public route `src/routes/live.$slug.tsx` — renders the build in a sandboxed iframe pointed at
  `/api/public/share/<slug>` plus the unlock/prompt bar. Subscribes to Supabase Realtime for the
  slug's `project_sync` row and reloads the frame on a revision bump. Public route, SSR on, with
  `head()` metadata.
- `src/lib/project-sync.ts` + `src/hooks/useLiveSync.ts`: add `setShare(...)` and expose
  `editable`, `sharedAt`.
- New `src/components/ShareBuildButton.tsx` (the top-bar button + panel), mounted in
  `src/routes/index.tsx` and `src/routes/pocket.tsx` next to the current live toggle. Visible when
  signed in with a saved cloud project; full controls gated behind `isFullAccessCode`.

**Verification**
- Extend `src/lib/__tests__/selftest.mts` with cases for code hashing/verification, token
  expiry, rate-limit counting, and share-state transitions.
- Browser check: share a build, open the live URL in a second session, unlock with the code, submit
  an edit, confirm both the visitor page and the owner canvas update.

## Notes

- The public URL is unguessable (14-char slug) and read-only until the code is entered, so a leaked
  link alone can't change a build.
- AI cost for visitor edits is charged to the build owner — worth knowing before handing the code out
  widely. The rate limit caps the damage.
