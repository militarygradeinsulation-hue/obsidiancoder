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
const PLAYWRIGHT_VERSION = "1.56.1";

export function validateAppAddons(raw: unknown): AppAddonId[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > APP_ADDON_IDS.length) throw new Error("Invalid Full App dependencies.");
  if (raw.some((v) => typeof v !== "string" || !Object.hasOwn(APPROVED_APP_ADDONS, v))) {
    throw new Error("Only approved Full App dependencies can be installed.");
  }
  return [...new Set(raw)] as AppAddonId[];
}



const PLAYWRIGHT_CONFIG = String.raw`import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ["line"],
    ["json", { outputFile: "test-results/obsidian-qa.json" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.OBSIDIAN_BASE_URL || "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.OBSIDIAN_BASE_URL ? undefined : {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["iPhone 13"] } },
  ],
});
`;

const QA_SPEC = String.raw`import { test, expect } from "@playwright/test";

test("production app renders and remains usable", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  const response = await page.goto("/", { waitUntil: "networkidle" });
  expect(response, "The production server should answer.").not.toBeNull();
  expect(response?.ok(), "The production route should return a successful status.").toBeTruthy();

  const root = page.locator("#root");
  await expect(root).toBeVisible();
  await expect(root).not.toBeEmpty();

  const bodyText = (await page.locator("body").innerText()).replace(/\\s+/g, " ").trim();
  expect(bodyText.length, "The rendered application should contain visible content.").toBeGreaterThan(20);

  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(
    geometry.scrollWidth - geometry.clientWidth,
    "The app should not create meaningful horizontal overflow.",
  ).toBeLessThanOrEqual(8);
  expect(geometry.scrollHeight, "The app should render a real page height.").toBeGreaterThan(120);

  expect(pageErrors, "The browser should not throw uncaught runtime errors.").toEqual([]);

  await page.screenshot({
    path: "test-results/" + testInfo.project.name + "-full-page.png",
    fullPage: true,
  });
});
`;


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
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Install pinned dependencies
        run: npm install --no-audit --no-fund
      - id: production_build
        name: Typecheck and production build
        run: npm run build
        env:
          VITE_SUPABASE_URL: __DOLLAR__{{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
          VITE_STRIPE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_STRIPE_PUBLISHABLE_KEY }}
      - name: Install Chromium runtime
        if: steps.production_build.outcome == 'success'
        run: npx playwright install --with-deps chromium
      - id: browser_qa
        name: Obsidian autonomous browser QA
        if: steps.production_build.outcome == 'success'
        run: npm run qa:e2e
        env:
          VITE_SUPABASE_URL: __DOLLAR__{{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
          VITE_STRIPE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_STRIPE_PUBLISHABLE_KEY }}
          OBSIDIAN_E2E_EMAIL: __DOLLAR__{{ secrets.OBSIDIAN_E2E_EMAIL }}
          OBSIDIAN_E2E_PASSWORD: __DOLLAR__{{ secrets.OBSIDIAN_E2E_PASSWORD }}
      - name: Write Obsidian build report
        if: always()
        shell: bash
        env:
          BUILD_OUTCOME: __DOLLAR__{{ steps.production_build.outcome }}
          QA_OUTCOME: __DOLLAR__{{ steps.browser_qa.outcome }}
        run: |
          node -e 'const fs=require("fs"); const report={sha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,build:process.env.BUILD_OUTCOME||"not-run",qa:process.env.QA_OUTCOME||"not-run",createdAt:new Date().toISOString()}; fs.writeFileSync("obsidian-build-report.json",JSON.stringify(report,null,2));'
      - name: Archive production output
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: full-app-dist
          path: dist/
          if-no-files-found: ignore
          retention-days: 7
      - name: Archive Obsidian QA evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: obsidian-qa
          path: |
            obsidian-build-report.json
            test-results/
            playwright-report/
          if-no-files-found: ignore
          retention-days: 14
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
          VITE_STRIPE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_STRIPE_PUBLISHABLE_KEY }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist/
      - id: deployment
        uses: actions/deploy-pages@v4
      - name: Verify deployed production URL
        run: node scripts/obsidian-live-check.mjs "__DOLLAR__{{ steps.deployment.outputs.page_url }}"
      - name: Archive live production QA
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: obsidian-live-qa
          path: live-test-results/
          if-no-files-found: ignore
          retention-days: 14
`;



const LIVE_VERIFY = String.raw`import { chromium } from "@playwright/test";
import fs from "node:fs";

const url = process.argv[2] || "";
if (!/^https:\/\//.test(url)) {
  console.error("OBSIDIAN_LIVE_QA: invalid production URL");
  process.exit(1);
}

fs.mkdirSync("live-test-results", { recursive: true });

async function waitForLive(target) {
  let last = "";
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const response = await fetch(target, { redirect: "follow", cache: "no-store" });
      last = String(response.status);
      if (response.ok) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolve => setTimeout(resolve, 5_000));
  }
  throw new Error("Production URL did not become healthy: " + last);
}

await waitForLive(url);

const browser = await chromium.launch({ headless: true });
const cases = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

try {
  for (const item of cases) {
    const page = await browser.newPage({ viewport: { width: item.width, height: item.height } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    if (!response?.ok()) throw new Error(item.name + " production response failed: " + String(response?.status()));
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
    if (text.length < 20) throw new Error(item.name + " production page rendered insufficient content.");
    const geometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      height: document.documentElement.scrollHeight,
    }));
    if (geometry.scrollWidth - geometry.clientWidth > 8) {
      throw new Error(item.name + " production page has horizontal overflow.");
    }
    if (geometry.height < 120) throw new Error(item.name + " production page height is invalid.");
    if (errors.length) throw new Error(item.name + " production runtime errors: " + errors.slice(0, 3).join(" | "));
    await page.screenshot({ path: "live-test-results/" + item.name + ".png", fullPage: true });
    await page.close();
  }
  console.log("OBSIDIAN_LIVE_QA: PASS " + url);
} finally {
  await browser.close();
}
`;

const FUNCTIONAL_QA = String.raw`name: Obsidian Functional QA
on:
  workflow_dispatch:
  workflow_run:
    workflows: ["Obsidian Ship"]
    types: [completed]
permissions:
  contents: read
concurrency:
  group: obsidian-functional-qa
  cancel-in-progress: true
jobs:
  journeys:
    if: __DOLLAR__{{ github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Install pinned dependencies
        run: npm install --no-audit --no-fund
      - name: Install Chromium runtime
        run: npx playwright install --with-deps chromium
      - name: Run production business journeys
        env:
          CUSTOM_DOMAIN: "__DOLLAR__{{ vars.OBSIDIAN_CUSTOM_DOMAIN }}"
          PAGES_URL: "https://__DOLLAR__{{ github.repository_owner }}.github.io/__DOLLAR__{{ github.event.repository.name }}/"
          OBSIDIAN_E2E_EMAIL: __DOLLAR__{{ secrets.OBSIDIAN_E2E_EMAIL }}
          OBSIDIAN_E2E_PASSWORD: __DOLLAR__{{ secrets.OBSIDIAN_E2E_PASSWORD }}
          OBSIDIAN_REQUIRE_AUTH_E2E: "true"
        shell: bash
        run: |
          if [ -n "$CUSTOM_DOMAIN" ]; then
            export OBSIDIAN_BASE_URL="https://$CUSTOM_DOMAIN/"
          else
            export OBSIDIAN_BASE_URL="$PAGES_URL"
          fi
          echo "OBSIDIAN_FUNCTIONAL_QA: testing $OBSIDIAN_BASE_URL"
          npx playwright test tests/obsidian.acceptance.spec.ts --project=desktop-chromium
      - name: Archive production functional evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: obsidian-functional-qa
          path: |
            test-results/
            playwright-report/
            obsidian/acceptance.json
          if-no-files-found: ignore
          retention-days: 14
`;

const HEALTH = String.raw`name: Obsidian Production Health
on:
  workflow_dispatch:
  schedule:
    - cron: "17 */6 * * *"
  workflow_run:
    workflows: ["Obsidian Ship"]
    types: [completed]
permissions:
  contents: read
concurrency:
  group: obsidian-production-health
  cancel-in-progress: true
jobs:
  health:
    if: __DOLLAR__{{ github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Install pinned dependencies
        run: npm install --no-audit --no-fund
      - name: Install Chromium runtime
        run: npx playwright install --with-deps chromium
      - name: Verify production site
        env:
          CUSTOM_DOMAIN: "__DOLLAR__{{ vars.OBSIDIAN_CUSTOM_DOMAIN }}"
          PAGES_URL: "https://__DOLLAR__{{ github.repository_owner }}.github.io/__DOLLAR__{{ github.event.repository.name }}/"
        shell: bash
        run: |
          if [ -n "$CUSTOM_DOMAIN" ]; then
            LIVE_URL="https://$CUSTOM_DOMAIN/"
          else
            LIVE_URL="$PAGES_URL"
          fi
          echo "OBSIDIAN_LIVE_QA: testing $LIVE_URL"
          node scripts/obsidian-live-check.mjs "$LIVE_URL"
      - name: Archive health evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: obsidian-production-health
          path: live-test-results/
          if-no-files-found: ignore
          retention-days: 14
`;

const SHIP = String.raw`name: Obsidian Ship
on:
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: obsidian-ship
  cancel-in-progress: false
jobs:
  verify-and-ship:
    environment:
      name: github-pages
      url: __DOLLAR__{{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - name: Install pinned dependencies
        run: npm install --no-audit --no-fund
      - id: production_build
        name: Production build for QA
        run: npm run build
        env:
          VITE_SUPABASE_URL: __DOLLAR__{{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
          VITE_STRIPE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_STRIPE_PUBLISHABLE_KEY }}
      - name: Install Chromium runtime
        run: npx playwright install --with-deps chromium
      - id: browser_qa
        name: Obsidian autonomous browser QA
        run: npm run qa:e2e
        env:
          VITE_SUPABASE_URL: __DOLLAR__{{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
          VITE_STRIPE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_STRIPE_PUBLISHABLE_KEY }}
          OBSIDIAN_E2E_EMAIL: __DOLLAR__{{ secrets.OBSIDIAN_E2E_EMAIL }}
          OBSIDIAN_E2E_PASSWORD: __DOLLAR__{{ secrets.OBSIDIAN_E2E_PASSWORD }}
          OBSIDIAN_REQUIRE_AUTH_E2E: "true"
      - name: Archive QA evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: obsidian-ship-qa
          path: |
            test-results/
            playwright-report/
          if-no-files-found: ignore
          retention-days: 14
      - name: Build Pages artifact after QA passes
        run: npm run build
        env:
          GITHUB_PAGES_BASE: /__DOLLAR__{{ github.event.repository.name }}/
          VITE_SUPABASE_URL: __DOLLAR__{{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
          VITE_STRIPE_PUBLISHABLE_KEY: __DOLLAR__{{ vars.VITE_STRIPE_PUBLISHABLE_KEY }}
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
    name: string;
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies?: Record<string, string>;
  } | null;
  if (!pkg?.dependencies || !pkg.scripts?.build) throw new Error("Missing Full App package manifest.");
  for (const id of addons) pkg.dependencies[id] = APPROVED_APP_ADDONS[id].version;
  pkg.devDependencies = { ...(pkg.devDependencies ?? {}), "@playwright/test": PLAYWRIGHT_VERSION };
  pkg.scripts["qa:e2e"] = "playwright test";
  const vite = files["vite.config.ts"];
  if (!vite || !vite.includes('defineConfig')) throw new Error("Missing Vite config.");
  return {
    ...files,
    "package.json": JSON.stringify(pkg, null, 2) + "\n",
    "vite.config.ts": vite.replace(
      'export default defineConfig({ plugins: [react()] });',
      'export default defineConfig({ plugins: [react()], base: process.env.GITHUB_PAGES_BASE || "/" });',
    ),
    ".github/workflows/obsidian-build.yml": yaml(BUILD),
    ".github/workflows/obsidian-publish.yml": yaml(DEPLOY),
    ".github/workflows/obsidian-ship.yml": yaml(SHIP),
    ".github/workflows/obsidian-health.yml": yaml(HEALTH),
    ".github/workflows/obsidian-functional-qa.yml": yaml(FUNCTIONAL_QA),
    "playwright.config.ts": PLAYWRIGHT_CONFIG,
    "tests/obsidian.smoke.spec.ts": QA_SPEC,
    "scripts/obsidian-live-check.mjs": LIVE_VERIFY,
    "README.md": (files["README.md"] || "") + "\n## Managed build and GitHub Pages publishing\n" +
      "The included GitHub Actions build checks source on pushes and on demand. " +
      "Use ObsidianCoder's GitHub integration to inspect runs, trigger a build, run automated Chromium QA at desktop/mobile widths, and ship only after those checks pass. " +
      "Supply only PUBLIC Supabase URL and publishable key using GitHub repository Actions variables. " +
      "Run the included SQL migration in your own Supabase project; no database is created automatically. " +
      "Check the hosted URL, OAuth redirect URLs and per-user RLS before inviting users. " +
      "Do not put service-role/secret keys in VITE_ variables.\n",
  };
}
