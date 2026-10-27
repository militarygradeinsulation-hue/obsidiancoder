// Approved optional dependencies and isolated GitHub Actions workflows.
// ObsidianCoder itself never npm-installs or executes generated applications.
import type { FullAppFiles } from "./full-app-scaffold";

export const APPROVED_APP_ADDONS = {
  "lucide-react": { name: "Lucide Icons", version: "0.575.0" },
  "zod": { name: "Zod validation", version: "4.4.3" },
  "date-fns": { name: "Date utilities", version: "4.1.0" },
  "clsx": { name: "Conditional classes", version: "2.1.1" },
} as const;
export type AppAddonId = keyof typeof APPROVED_APP_ADDONS;
export const APP_ADDON_IDS = Object.keys(APPROVED_APP_ADDONS) as AppAddonId[];
export function validateAppAddons(raw: unknown): AppAddonId[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > APP_ADDON_IDS.length) throw new Error("Invalid Full App dependencies.");
  if (raw.some((v) => typeof v !== "string" || !Object.hasOwn(APPROVED_APP_ADDONS, v))) {
    throw new Error("Only approved Full App dependencies can be installed.");
  }
  return [...new Set(raw)] as AppAddonId[];
}

const BUILD = String.raw`name: Obsidian Full App build
on:
  push:
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: obsidian-build-__DOLLAR__{{ github.ref }}
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Install pinned dependencies
        run: npm install --no-audit --no-fund
      - name: Typecheck and production build
        run: npm run build
        env:
          VITE_SUPABASE_URL: __DOLLAR__{{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
      - name: Archive build output
        uses: actions/upload-artifact@v4
        with:
          name: full-app-dist
          path: dist/
          retention-days: 7
`;

const DEPLOY = String.raw`name: Publish Obsidian Full App
on:
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: obsidian-pages
  cancel-in-progress: false
jobs:
  deploy:
    environment:
      name: github-pages
      url: __DOLLAR__{{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Install pinned dependencies
        run: npm install --no-audit --no-fund
      - name: Build published app
        run: npm run build
        env:
          GITHUB_PAGES_BASE: /__DOLLAR__{{ github.event.repository.name }}/
          VITE_SUPABASE_URL: __DOLLAR__{{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist/
      - id: deployment
        uses: actions/deploy-pages@v4
`;

function yaml(raw: string): string { return raw.replaceAll("__DOLLAR__", "$"); }

export function addManagedAppBuild(files: FullAppFiles, rawAddons?: unknown): FullAppFiles {
  const addons = validateAppAddons(rawAddons);
  const pkg = JSON.parse(files["package.json"] || "null") as {
    name: string; scripts: Record<string, string>; dependencies: Record<string, string>;
  } | null;
  if (!pkg?.dependencies || !pkg.scripts?.build) throw new Error("Missing Full App package manifest.");
  for (const id of addons) pkg.dependencies[id] = APPROVED_APP_ADDONS[id].version;
  const vite = files["vite.config.ts"];
  if (!vite || !vite.includes('defineConfig')) throw new Error("Missing Vite config.");
  return {
    ...files,
    "package.json": JSON.stringify(pkg, null, 2) + "
",
    "vite.config.ts": vite.replace(
      'export default defineConfig({ plugins: [react()] });',
      'export default defineConfig({ plugins: [react()], base: process.env.GITHUB_PAGES_BASE || "/" });',
    ),
    ".github/workflows/obsidian-build.yml": yaml(BUILD),
    ".github/workflows/obsidian-publish.yml": yaml(DEPLOY),
    "README.md": (files["README.md"] || "") + "
## Managed build and GitHub Pages publishing
" +
      "The included GitHub Actions build checks source on pushes and on demand. " +
      "Use ObsidianCoder's GitHub integration to inspect runs, trigger a build and explicitly publish after configuring Pages. " +
      "Supply only PUBLIC Supabase URL and publishable key using GitHub repository Actions variables. " +
      "Run the included SQL migration in your own Supabase project; no database is created automatically. " +
      "Check the hosted URL, OAuth redirect URLs and per-user RLS before inviting users. " +
      "Do not put service-role/secret keys in VITE_ variables.
",
  };
}
