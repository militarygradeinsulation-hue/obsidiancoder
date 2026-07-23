
## Goal

When Obsidian generates a build, no button, link, form, or script inside that build should ever navigate the viewer back into the Vibe Coder creator area (the app shell at `/`, `/dashboard`, `/gallery`, `/demos`, `/checkout*`, admin routes, or the obsidianvibe.live root). Admin/owner navigation inside the app stays as-is.

## What to change

### 1. `src/lib/clean-export.ts` — add link/button sanitizer

Extend the existing `stripPreviewOnly` pipeline with a new `stripCreatorLinks(html)` step that rewrites the generated HTML before it leaves the sandbox:

- Rewrite `<a href="…">` where the target resolves to:
  - `/`, `/index`, `/dashboard`, `/gallery`, `/demos`, `/unlock`, `/auth`, `/checkout*`, `/admin*`
  - absolute URLs on `obsidianvibe.live`, `www.obsidianvibe.live`, `*.lovable.app`, or the current origin pointing at any of the above paths
  - protocol-relative (`//…`) versions of the same
  → replace `href` with `href="#"`, add `data-obsidian-blocked="1"`, strip `target`, and neutralize inner `onclick`.
- Same rule for `<form action="…">` and `<button formaction="…">`.
- Strip inline handlers whose value contains `location.assign|href|replace`, `window.open`, `top.location`, or `parent.location` when the target string matches the blocklist.
- Remove `<meta http-equiv="refresh" content="…url=…">` when the url matches the blocklist.
- Remove `<script>` blocks that contain `window.location`/`top.location`/`parent.location` assignments to a blocklisted target (regex-scoped, conservative — leave unrelated scripts alone).
- Export `containsCreatorLinks(html)` for tests.

Add a single public entry point `sanitizeForExport(html)` = `stripPreviewOnly` + `stripCreatorLinks`, and update the existing call sites (see step 3) to use it.

### 2. `src/lib/aetheris.functions.ts` — teach the model not to emit them

Append a short rule to `SYSTEM_PROMPT`:

> Never add navigation that points back to the Obsidian creator app. Do not link to `/`, `/dashboard`, `/gallery`, `/demos`, `/unlock`, `/auth`, `/checkout`, `/admin`, `obsidianvibe.live`, or any `*.lovable.app` host. Every `<a>` in the build must be either an in-page anchor (`#id`), an external third-party URL the user asked for, or a `mailto:` / `tel:` link. Do not use `window.location`, `top.location`, or `<meta refresh>` to reach those paths.

This reduces how much the sanitizer has to catch after the fact.

### 3. Apply `sanitizeForExport` at every exit boundary

Sanitize the HTML the moment it leaves the creator surface — not just in the preview iframe:

- `src/routes/index.tsx` — Go Live POST to `/api/public/builds` (line ~2259), the admin "Push to Demos" POST (~2300), Save Project payloads, local download/export, template payloads, and any version-history snapshot that can later be exported. Wrap `current.html` with `sanitizeForExport(...)` in each body.
- `src/routes/api/public/builds.ts` (POST) and `src/routes/api/public/builds.$id.ts` (PUT) — sanitize server-side as a defense in depth so any client that bypasses the UI still can't inject creator links.
- `src/routes/api/public/share.$slug.ts` — sanitize the stored HTML on read as well, so already-saved rows are cleaned without a migration.
- `src/lib/featured-demos.functions.ts` — sanitize `html` on insert/update paths that write to `featured_demos`.

No changes to in-app navigation (Back to Coder, Back to builder, dashboard nav, unlock → `/`). Those are creator-side UI for signed-in users and are out of scope per your answer.

## Verification

- Unit-style check: feed a canned HTML with `<a href="/">`, `<a href="https://obsidianvibe.live/dashboard">`, `<meta http-equiv="refresh" content="0;url=/">`, and an inline `onclick="location.href='/gallery'"` into `sanitizeForExport` and confirm all four are neutralized while a legitimate `<a href="https://stripe.com">` and `<a href="#pricing">` survive.
- Manual: build a page that includes a "Home" link, hit Go Live, open the share URL, confirm the link is inert (`href="#"`, `data-obsidian-blocked="1"`).
- Manual: Push to Demos, open the demo from `/unlock`, confirm no button escapes back into `/`.

## Out of scope (by your answer)

- Removing "Back to Coder" / "Back to builder" links inside the creator app.
- Blocking the `/` route itself.
- Rewriting historical `featured_demos` rows via migration (read-time sanitizer covers them).
