# Obsidian Vibe + Lovable: Full App foundation

## Discovery (October 27, 2026)
- Lovable project: `Obsidian Coder` (`bbfc65dd-76bc-44ba-98f1-fd9ab610072c`)
- Lovable editor: https://lovable.dev/projects/bbfc65dd-76bc-44ba-98f1-fd9ab610072c
- Connected GitHub repository: `militarygradeinsulation-hue/obsidiancoder`
- Lovable reports cloud database enabled (Supabase).
- Workspace has a connected custom MCP connector titled `Obsidian Coder` pointing at `https://obsidianvibe.live/mcp`; this is *not* an automatic backend integration for generated apps.
- Main `/api/github` deploy previously published one `index.html` file. The Obsidian preview may use Cloud Memory for data, but static GitHub Pages cannot provide a dedicated authenticated application backend.

## Implementation
GitHub modal now offers **Static HTML site** and **Full App (React + Supabase)**. Full App creates a fresh GitHub repository containing:
- React + TypeScript + Vite project with functional starter UI
- Supabase email sign up/in/out and per-user CRUD example
- RLS-secured SQL migration scoped by `auth.uid()`
- Original Obsidian-generated HTML preview in a restricted iframe (no same-origin)
- Safe `.env.example`, `.gitignore`, and setup documentation

The API validates the build and atomically creates a commit with the generated files. It will not overwrite an existing repository and does not use GitHub Pages for a full-app build.

## Lovable-like features vs actual readiness
| Capability | Current path | Future expansion |
| --- | --- | --- |
| Generate design | Existing Obsidian Coder AI pipeline | Native React component generation |
| Multi-file source export | **Included in Full App** | AI multi-file patching inside editor |
| User authentication | **Included in generated starter** | OAuth providers, roles, teams |
| Database | **RLS template included; provision manually** | Automated schema planning, migrations, database health |
| Storage | Not provisioned in generated starter | Uploads, signed URLs, storage policies |
| Server-side logic | Not provisioned in generated starter | Edge functions and authenticated API tooling |
| AI-powered app functionality | Existing Obsidian build-time AI only | Per-app server-side AI with quotas |
| Payments | Obsidian billing exists; unrelated to generated apps | App-specific checkout + webhooks |
| Hosting | Source repo created, not deployed | Vercel/Netlify/Cloudflare deploy status and env validation |
| Connector access | Lovable workspace catalog exists; not inherited | Explicit per-app OAuth and permissions |

## Safety and limitations
- Do not copy Obsidian parent database credentials, tokens or Lovable workspace integrations to a generated app.
- New apps need their own Supabase project and migration applied. The UI provides instructions; export alone is not deployment.
- The sandbox preview is not an automatic HTML-to-React conversion. Application data is in the React workspace, not the original HTML iframe.
- Supabase Row Level Security is required; anonymous users have no access to `app_items`.
- Never expose service-role or secret keys in Vite environment variables.
- Full App export only available to users who can access the existing GitHub integration.
- Real deployment and user-isolation acceptance testing are required before claiming production readiness.

## QA
- `node --experimental-strip-types src/lib/__tests__/full-app-scaffold.selftest.mts` tests generated file structure and safety.
- On CI with `VERIFY_FULL_APP_BUILD=1`, installs dependencies and runs the generated starter's production build.
- Functional acceptance: create an app in ObsidianCoder, choose Full App, link GitHub, use a fresh repository, confirm source files; configure Supabase; sign up and create items in two accounts, confirm neither can read the other's records; build and deploy on a supported host.
