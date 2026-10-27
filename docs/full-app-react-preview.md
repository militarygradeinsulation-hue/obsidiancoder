# Live React preview in Full App (Phase 3)

## How it works
The Full App workspace compiles its editable `src/**/*.tsx`, `.ts`, `.jsx` and `.js` modules directly inside the user's browser with TypeScript `transpileModule` (syntax transformation only). No code is sent to Obsidian's server to compile.

Each module is encoded as a `data:text/javascript;base64` URL and referenced through an import map. Only explicit, pinned external dependencies are mapped to `esm.sh`: React, React DOM, Supabase JS, and Lucide. Relative imports resolve within the current `src/` file tree, with missing/out-of-root paths rejected. CSS is collected into the preview stylesheet.

The React app runs in an `iframe sandbox="allow-scripts"`, without `allow-same-origin`. It cannot read the parent ObsidianCoder account/session, localStorage, cookies, or GitHub token. The preview never injects any secret, service-role key, or parent environment variables. It intentionally supplies **empty** public Supabase settings, meaning any generated auth/backend example is not automatically connected to a live database.

The iframe uses its own CSP and sends only bounded status or error messages to the host. The host checks message source, namespace and a random per-compile nonce.

## User workflow
1. Open `/full-app` from Studio/Pocket and import a generated design.
2. Edit React/TSX files, or ask the AI assistant to propose changes and approve them.
3. Open **Live React app** to view those source files running with the dependency allowlist. Updates compile after a short debounce, and a manual Reload React button is available.
4. Switch between desktop/mobile widths and **Original design** to compare.
5. Inspect diagnostics if compilation/import/runtime fails.
6. Save to cloud; publish edited project source to a new GitHub repository; configure the app's own Supabase project and run a production build for actual deployment.

## Intentional limits
- This is a fast, isolated browser transpiler, **not a Vite production bundler**. It does not run npm scripts, plugins, CSS modules, asset imports, or Node-specific libraries.
- Unsupported npm dependencies must be added via an audited allowlist or evaluated after GitHub export. A package in the generated package.json is not automatically previewable.
- Each preview supports at most 70 source files and 350 KB of combined source. Large projects continue to use a real development/build host.
- Runtime dependencies are fetched from `esm.sh`; preview requires network access and appropriate host CSP. The application's code stays in browser-generated data URLs, but the browser makes dependency requests to the public CDN.
- Supabase authentication/session storage is not usable by default in opaque-origin sandbox. Test real auth and database access after deployment, with RLS enabled and a separate app backend.
- No production deployment happens solely from the live preview. GitHub source export remains a separate action.

## Validation
CI: `bun src/lib/__tests__/react-preview.selftest.mts`, `bun run build`, and `bunx tsc --noEmit`.
Manual browser test: load /full-app; open Live React app; edit `src/App.tsx`; confirm updated result; import a component; confirm module resolution; introduce a missing package and verify diagnostic; check mobile width and original-design mode; inspect the iframe's sandbox attributes; confirm that parent Supabase session and GitHub token cannot be read by preview code.

## Future roadmap
- Project-specific backend configuration through a trusted server-side broker, without ever injecting Obsidian credentials
- Real app builder service with a controlled dependency installer, isolated build environment and build logs
- Production previews, automated deployment, schema migration and verified RLS
