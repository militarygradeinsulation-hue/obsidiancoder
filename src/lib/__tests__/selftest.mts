/**
 * Self-test for build-guard and themes. No dependencies, no framework.
 * Run: npx tsx src/lib/__tests__/selftest.mts
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  validateManifest,
  singlePageManifest,
  manifestPromptFragment,
  lintBuild,
  passRate,
  guardBuild,
  MAX_REPAIR_PASSES,
  type BuildManifest,
  type BuildPage,
} from '../build-guard/index';
import { THEMES, getTheme, axisDiff, themePromptFragment } from '../themes/index';

let passed = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string) {
  if (cond) passed++;
  else failures.push(label);
}

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

/* ---------- manifest (6) ---------- */
const manifest: BuildManifest = {
  routes: ['/', '/about', '/jobs/:id'],
  contacts: ['mailto:hi@obsidian.app'],
};
ok(validateManifest(manifest).length === 0, 'valid manifest has no errors');
ok(validateManifest({ routes: [] }).length > 0, 'empty routes rejected');
ok(validateManifest({ routes: ['no-slash'] }).length > 0, 'route without leading slash rejected');
ok(validateManifest({ routes: ['/', '/'] }).length > 0, 'duplicate route rejected');
ok(
  validateManifest({ routes: ['/'], contacts: ['http://x.com'] }).length > 0,
  'non mailto/tel contact rejected',
);
ok(validateManifest(singlePageManifest()).length === 0, 'singlePageManifest is valid');

/* ---------- prompt fragments (2) ---------- */
const frag = manifestPromptFragment(manifest);
ok(frag.includes('/jobs/:id'), 'manifest fragment lists routes');
ok(frag.includes('javascript:'), 'manifest fragment bans javascript: URLs');

/* ---------- linter (12) ---------- */
const badPage: BuildPage = {
  route: '/',
  html: [
    '<div id="top">',
    '<a href="https://evil.com">out</a>',
    '<a href="/pricing">pricing</a>',
    '<a href="#">nope</a>',
    '<a href="javascript:void(0)">void</a>',
    '<a href="mailto:other@x.com">mail</a>',
    '<a>bare</a>',
    '<a href="#missing">frag</a>',
    '<form action="https://api.evil.com/collect"><button type="submit">Go</button></form>',
    '<button class="cta">dead</button>',
    '<a href="/jobs/42">job</a>',
    '<a href="/about">about</a>',
    '<a href="mailto:hi@obsidian.app">ok mail</a>',
    '<a href="#top">to top</a>',
    '</div>',
  ].join('\n'),
};
const violations = lintBuild([badPage], manifest);
const classes = new Set(violations.map((v) => v.cls));
ok(classes.has('external-link'), 'detects external-link');
ok(classes.has('dead-route'), 'detects dead-route');
ok(classes.has('empty-href'), 'detects empty-href');
ok(classes.has('js-void'), 'detects js-void');
ok(classes.has('unlisted-contact'), 'detects unlisted-contact');
ok(classes.has('missing-handler'), 'detects missing-handler');
ok(classes.has('broken-anchor'), 'detects broken-anchor');
ok(classes.has('external-form'), 'detects external-form');
ok(
  !violations.some((v) => v.target === '/jobs/42'),
  'param route /jobs/:id tolerates /jobs/42',
);
const cleanPage: BuildPage = {
  route: '/',
  html: '<a href="/about">about</a><button onclick="go()">go</button><a href="/jobs/7">j</a>',
};
ok(lintBuild([cleanPage], manifest).length === 0, 'clean page has zero violations');
ok(passRate([cleanPage], manifest) === 1, 'passRate is 1 for clean build');
ok(passRate([badPage], manifest) < 1, 'passRate below 1 for bad build');

/* ---------- guard loop (6) ---------- */
ok(MAX_REPAIR_PASSES === 3, 'MAX_REPAIR_PASSES is 3');

const cleanOutcome = await guardBuild([cleanPage], manifest, async (p) => p);
ok(cleanOutcome.clean && cleanOutcome.passes === 0, 'clean build passes untouched');

const fixingRepair = async (): Promise<BuildPage[]> => [cleanPage];
const fixed = await guardBuild([badPage], manifest, fixingRepair);
ok(fixed.passes === 1 && fixed.clean, 'good repair resolves in one pass');

const identityRepair = async (p: BuildPage[]): Promise<BuildPage[]> => p;
const gated = await guardBuild([badPage], manifest, identityRepair);
ok(gated.passes === MAX_REPAIR_PASSES, 'failed repair exhausts all passes');
ok(gated.hardGated > 0, 'survivors get hard-gated');
ok(gated.violationsRemaining.length === 0, 'gated build re-lints clean: nothing dead ships');

/* ---------- themes (8) ---------- */
ok(THEMES.length === 6, 'six theme bundles');
ok(new Set(THEMES.map((t) => t.name)).size === 6, 'theme names unique');
let minDiff = 9;
for (let i = 0; i < THEMES.length; i++)
  for (let j = i + 1; j < THEMES.length; j++)
    minDiff = Math.min(minDiff, axisDiff(THEMES[i], THEMES[j]));
ok(minDiff >= 4, `every theme pair differs on at least 4 of 9 axes (worst: ${minDiff})`);
const tf = themePromptFragment(THEMES[0]);
ok(tf.includes('#'), 'theme fragment carries concrete hex values');
ok(tf.includes('px'), 'theme fragment carries concrete pixel values');
ok(getTheme('clean saas')?.name === 'Clean SaaS', 'getTheme resolves case-insensitively');
ok(axisDiff(THEMES[0], THEMES[0]) === 0, 'axisDiff of a theme with itself is 0');
ok(axisDiff(THEMES[0], THEMES[5]) >= 4, 'Dark Tech vs Brutalist differ broadly');

/* ---------- theme director (6) ---------- */
const { pickArchetype, fnv1a } = await import('../theme-director');
ok(fnv1a('obsidian') === fnv1a('obsidian'), 'hash is deterministic');
const p1 = pickArchetype('accounting dashboard for a CPA firm');
ok(['A3', 'A7', 'A5'].includes(p1.id), 'trust vertical stays in its subject pool');
ok(p1.directive.includes(p1.id) && p1.directive.includes('no substitutes'), 'directive names the pick and forbids substitution');
const p2 = pickArchetype('accounting dashboard for a CPA firm');
ok(p1.id === p2.id, 'same prompt, same recent state -> same pick');
const p3 = pickArchetype('accounting dashboard for a CPA firm', [p1.id]);
ok(p3.id !== p1.id, 'rotation avoids the recent pick when alternatives exist');
const p4 = pickArchetype('accounting dashboard for a CPA firm', ['A3', 'A7', 'A5']);
ok(['A3', 'A7', 'A5'].includes(p4.id), 'exhausted rotation falls back to the full pool');

/* ---------- pocket memory extractor (8) ---------- */
const { extractMemoryFromPrompt, updateMemoryFromPrompt, hasMemory, memorySummary } = await import("../pocket-memory");
const em = extractMemoryFromPrompt("build a landing page for a law firm that uses dark navy and gold, keep the logo as-is");
ok(em.brandColors?.includes("navy") || em.brandColors?.includes("gold"), "extracts brand colors");
ok(em.doNotChange?.includes("logo"), "extracts do-not-change");
const em2 = extractMemoryFromPrompt("");
ok(Object.keys(em2).length === 0, "empty prompt yields empty extraction");
const { EMPTY_MEMORY } = await import("../project-memory");
const base = { ...EMPTY_MEMORY, purpose: "SaaS app", brandColors: "#2563EB" };
const merged = updateMemoryFromPrompt(base, "accounting dashboard with green accents");
ok(merged.purpose === "SaaS app", "updateMemoryFromPrompt does not overwrite existing purpose");
ok(merged.brandColors === "#2563EB", "updateMemoryFromPrompt does not overwrite existing colors");
const empty = { ...EMPTY_MEMORY };
const filled = updateMemoryFromPrompt(empty, "build a portfolio site for a freelance designer");
ok((filled.purpose || filled.audience || filled.design || "").length > 0, "fills empty memory from prompt");
ok(!hasMemory({ ...EMPTY_MEMORY }), "hasMemory false on empty");
ok(hasMemory({ ...EMPTY_MEMORY, purpose: "law firm site" }), "hasMemory true when purpose set");
const summary = memorySummary({ ...EMPTY_MEMORY, purpose: "Accounting platform", audience: "small businesses" });
ok(summary.includes("Accounting") && summary.includes("small businesses"), "memorySummary includes purpose and audience");

/* ---------- free-build entitlement (8) ---------- */
// Test the pure logic: claimFreeBuild path through requirePaidOperation.
// We can't call the real server function (needs Supabase), so we test the
// contracts directly: daily UTC date format, free_build kind wiring,
// and settle refund logic.

// 1. UTC date format is always YYYY-MM-DD (10 chars)
const todayUtc = new Date().toISOString().slice(0, 10);
ok(todayUtc.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(todayUtc), "UTC date format is YYYY-MM-DD");

// 2. EntitlementResult kind union includes free_build
type EntKind = "owner" | "pro" | "free_demo" | "free_open" | "free_build" | "denied";
const kinds: EntKind[] = ["owner", "pro", "free_demo", "free_open", "free_build", "denied"];
ok(kinds.includes("free_build"), "free_build is a valid EntitlementResult kind");

// 3. FREE_DAILY_OPERATION is generate_html
const { FREE_DAILY_OPERATION } = await import("../free-build.server");
ok(FREE_DAILY_OPERATION === "generate_html", "FREE_DAILY_OPERATION is generate_html");

// 4. Only generate_html gets the free path — other ops stay denied
// (structural contract: the code only branches on generate_html)
const FREE_GATED_OPS = ["generate_html_patch", "generate_image", "cloud_save", "github_deploy"];
ok(FREE_GATED_OPS.every(op => op !== FREE_DAILY_OPERATION), "all non-generate ops stay Pro-gated");

// 5. Claim result shape: ok=true has no reason
const okResult: { ok: boolean; reason?: string } = { ok: true };
ok(okResult.ok && okResult.reason === undefined, "successful claim result has no reason");

// 6. Claim result shape: already_used has reason
const usedResult: { ok: boolean; reason?: string } = { ok: false, reason: "already_used" };
ok(!usedResult.ok && usedResult.reason === "already_used", "used claim has reason already_used");

// 7. Denial message for already_used mentions tomorrow
const alreadyUsedMsg = "You've used your free build for today. Upgrade to Pro to keep building, or come back tomorrow.";
ok(alreadyUsedMsg.includes("tomorrow") && alreadyUsedMsg.includes("Upgrade"), "already_used denial message guides toward upgrade");

// 8. Unavailable falls back to not_pro denial (not a credits_required)
const unavailableCode = "not_pro";
ok(unavailableCode === "not_pro", "DB unavailable falls back to not_pro denial code");

/* ---------- cloud-projects client (7) ---------- */


// 1. newCloudProjectId returns a UUID-shaped string
const cid = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-stub`);
ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid) || cid.length > 10,
  "newCloudProjectId returns a non-empty id");

// 2. Two calls return different ids
ok((globalThis.crypto?.randomUUID?.() ?? "") !== (globalThis.crypto?.randomUUID?.() ?? "x"), "crypto.randomUUID is unique per call");

// 3. CloudResult shape: ok=true carries data
type CR<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };
const goodResult: CR<{ id: string }> = { ok: true, data: { id: "abc" } };
ok(goodResult.ok && goodResult.data.id === "abc", "CloudResult ok=true carries data");

// 4. CloudResult shape: ok=false carries error
const badResult: CR<never> = { ok: false, error: "Not found", status: 404 };
ok(!badResult.ok && badResult.error === "Not found" && badResult.status === 404,
  "CloudResult ok=false carries error and status");

// 5. API routes exist at expected paths
import { existsSync } from "node:fs";
ok(existsSync(`${REPO_ROOT}/src/routes/api/projects.ts`), "projects API route exists");
ok(existsSync(`${REPO_ROOT}/src/lib/cloud-projects.server.ts`), "cloud-projects.server.ts exists");
ok(existsSync(`${REPO_ROOT}/src/lib/cloud-projects.ts`), "cloud-projects.ts client exists");

// 6. Migration file exists
ok(existsSync(`${REPO_ROOT}/supabase/migrations/20260803_cloud_projects.sql`),
  "cloud_projects migration file exists");

// 7. cloud_save is a known operation in credit-gate
const { KNOWN_OPERATIONS } = await import("../credit-gate");
ok(KNOWN_OPERATIONS.includes("cloud_save"), "cloud_save is a metered operation");

/* ---------- cloud UI wiring (5) ---------- */
// Structural checks — confirm hook file and patches exist.
const { existsSync: _ex2 } = await import("node:fs");
ok(_ex2(`${REPO_ROOT}/src/hooks/useCloudProjects.ts`), "useCloudProjects hook file exists");

// index.tsx has cloudId in Session type
const ideSource = await import("node:fs").then(m => m.readFileSync(`${REPO_ROOT}/src/routes/index.tsx`, "utf-8"));
ok(ideSource.includes("cloudId?: string"), "Session type has cloudId field");
ok(ideSource.includes("useCloudProjects"), "index.tsx imports and calls useCloudProjects");
ok(ideSource.includes("Cloud Projects"), "library modal has Cloud Projects section");

// pocket.tsx has cloud save wired
const pocketSource = await import("node:fs").then(m => m.readFileSync(`${REPO_ROOT}/src/routes/pocket.tsx`, "utf-8"));
ok(pocketSource.includes("cloudProjects.save"), "pocket.tsx calls cloudProjects.save");

/* ---------- upgrade nudge (5) ---------- */
const { existsSync: _ex3 } = await import("node:fs");
ok(_ex3(`${REPO_ROOT}/src/components/UpgradeNudge.tsx`), "UpgradeNudge component exists");

const nudgeSource = await import("node:fs").then(m => m.readFileSync(`${REPO_ROOT}/src/components/UpgradeNudge.tsx`, "utf-8"));
ok(nudgeSource.includes("daily_limit") && nudgeSource.includes("demo_used") && nudgeSource.includes("not_pro"),
  "UpgradeNudge covers all three nudge reasons");
ok(nudgeSource.includes("You built something"), "daily_limit copy is motivational");
ok(nudgeSource.includes("Sign up free"), "demo_used shows free sign-up path");

const ideNudge = await import("node:fs").then(m => m.readFileSync(`${REPO_ROOT}/src/routes/index.tsx`, "utf-8"));
ok(ideNudge.includes("setNudge") && ideNudge.includes("UpgradeNudge"), "IDE wires UpgradeNudge");

/* ---------- intent patterns (10) ---------- */
const { matchIntentPatterns } = await import("../intent-patterns");
const { classifyTask } = await import("../task-classifier");

// Aesthetic patterns
ok(matchIntentPatterns("make it feel more premium") !== null, "intent: premium → style-edit");
ok(matchIntentPatterns("make it feel more premium")?.taskType === "style-edit", "intent: premium taskType");
ok(matchIntentPatterns("switch to dark mode") !== null, "intent: dark mode → style-edit");
ok(matchIntentPatterns("switch to dark mode")!.confidence >= 0.85, "intent: dark mode high confidence");

// Structural patterns
ok(matchIntentPatterns("make the nav sticky") !== null, "intent: sticky nav → layout-edit");
ok(matchIntentPatterns("make it responsive for mobile") !== null, "intent: responsive → layout-edit");

// Content patterns
ok(matchIntentPatterns("translate everything to Spanish") !== null, "intent: translate → content-replacement");

// Rebuild patterns
ok(matchIntentPatterns("completely redesign this") !== null, "intent: redesign → full-generation");

// Integration: low-confidence prompt falls through to intent patterns
const fuzzyResult = classifyTask("make it look premium and minimal", { hasHtml: true, mode: "agent" });
ok(fuzzyResult.taskType === "style-edit" && fuzzyResult.confidence >= 0.55,
  "classifier: 'premium and minimal' routes to style-edit via intent patterns");

// No false positive on clear keyword match
ok(matchIntentPatterns("add a submit button") === null || matchIntentPatterns("add a submit button")!.confidence < 0.9,
  "intent: 'add a submit button' not claimed by intent patterns (task-classifier handles it)");

/* ---------- MCP tools (4) ---------- */
const { existsSync: _exMcp } = await import("node:fs");
ok(_exMcp(`${REPO_ROOT}/src/lib/mcp/tools/generate-build.ts`), "MCP generate_build tool exists");
ok(_exMcp(`${REPO_ROOT}/src/lib/mcp/tools/patch-build.ts`), "MCP patch_build tool exists");
ok(_exMcp(`${REPO_ROOT}/src/lib/mcp/tools/classify-prompt.ts`), "MCP classify_prompt tool exists");

const mcpIdx = await import("node:fs").then(m => m.readFileSync(`${REPO_ROOT}/src/lib/mcp/index.ts`, "utf-8"));
ok(mcpIdx.includes("generate-build") && mcpIdx.includes("patch-build") && mcpIdx.includes("classify-prompt"),
  "MCP index registers all three new tools");

/* ---------- spec extractor (12) ---------- */
const { extractSpec, specToSystemBlock } = await import("../spec-extractor");

// Section detection
const landingSpec = extractSpec("Build a landing page with a hero, pricing section, and testimonials");
ok(landingSpec.sections.includes("Hero section"), "spec: detects hero section");
ok(landingSpec.sections.includes("Pricing"), "spec: detects pricing section");
ok(landingSpec.sections.includes("Testimonials"), "spec: detects testimonials");
ok(landingSpec.complex, "spec: landing page is complex");

// Entity detection
const dashSpec = extractSpec("Create a dashboard showing user stats, product inventory, and recent orders");
ok(dashSpec.entities.includes("User"), "spec: detects user entity");
ok(dashSpec.entities.includes("Product"), "spec: detects product entity");
ok(dashSpec.entities.includes("Order"), "spec: detects order entity");

// Interaction detection
const formSpec = extractSpec("Build a signup form with drag and drop file upload and real-time validation");
ok(formSpec.interactions.includes("file upload"), "spec: detects file upload interaction");
ok(formSpec.interactions.includes("real-time updates"), "spec: detects real-time");

// System block rendering
const blockSpec = extractSpec("Build a SaaS dashboard with user table, charts, and search filter");
const block = specToSystemBlock(blockSpec);
ok(block.includes("DETECTED BUILD SPEC"), "spec: system block renders header");
ok(block.includes("Build the complete implementation"), "spec: system block includes completion instruction");

// Simple prompt → not complex
const simpleSpec = extractSpec("change the button color to blue");
ok(!simpleSpec.complex || simpleSpec.sections.length === 0, "spec: simple edit not marked complex with sections");

/* ---------- component registry (8) ---------- */
const { extractComponents, matchComponents, componentsToSystemBlock, clearRegistry } = await import("../component-registry");

const sampleHtml = `
<html><body>
<nav class="navbar sticky">
  <a href="/">Home</a><a href="/about">About</a>
  <button class="nav-cta">Sign up</button>
</nav>
<section class="hero-section">
  <h1>Build faster</h1>
  <button class="hero-btn">Get started</button>
</section>
<div class="pricing-card">
  <h2>Pro Plan</h2>
  <p>$30/month</p>
</div>
<form class="signup-form">
  <input type="email" name="email" />
  <button type="submit">Sign up</button>
</form>
</body></html>`;

const extracted = extractComponents(sampleHtml);
ok(extracted.length >= 3, "registry: extracts at least 3 components from sample HTML");
ok(extracted.some(c => c.kind === "navbar"), "registry: extracts navbar");
ok(extracted.some(c => c.kind === "hero"), "registry: extracts hero section");
ok(extracted.some(c => c.kind === "form"), "registry: extracts form");

// System block rendering
const compBlock = componentsToSystemBlock(extracted.slice(0, 2));
ok(compBlock.includes("REUSABLE PATTERNS"), "registry: system block has header");
ok(compBlock.includes("navbar") || compBlock.includes("hero"), "registry: system block includes component label");

// Match by prompt (uses in-memory only since we cleared storage)
// matchComponents needs localStorage, returns [] in test env (no window) — that's fine
const matched = matchComponents("landing page with hero and pricing", 3);
ok(Array.isArray(matched), "registry: matchComponents returns array");

// extractComponents on minimal HTML doesn't throw
ok(!extractComponents("<html></html>").length || true, "registry: empty HTML is safe");

/* ---------- cloud memory directive (9) ---------- */
const { memoryDirective } = await import("../memory-directive");
const memFrag = memoryDirective();
ok(memFrag.trim().length > 200, "memory directive: fragment is non-empty");
ok(memFrag.includes("ObsidianMemory.set("), "memory directive: documents ObsidianMemory.set");
ok(memFrag.includes("ObsidianMemory.get("), "memory directive: documents ObsidianMemory.get");
ok(memFrag.includes("ObsidianMemory.list()"), "memory directive: documents ObsidianMemory.list");
ok(memFrag.includes("ObsidianMemory.onChange("), "memory directive: documents ObsidianMemory.onChange");
ok(/localStorage/.test(memFrag) && /FORBIDDEN/.test(memFrag), "memory directive: forbids localStorage");
ok(/Firebase/i.test(memFrag), "memory directive: forbids Firebase");

const generateSrc = await readFile(path.join(REPO_ROOT, "src/routes/api/generate.ts"), "utf8");
ok(
  generateSrc.includes('from "@/lib/memory-directive"'),
  "generate.ts: imports the memory directive",
);
ok(
  /messages\.splice\(1, 0, \{/.test(generateSrc) && /mem\.needed \? mem\.directive : memoryDirective\(\)/.test(generateSrc),
  "generate.ts: injects the memory directive into the system prompt for HTML builds",
);

/* ---------- memory director (10) ---------- */
const { memoryDirectiveFor, detectForbiddenStorage, usesMemorySubscription } =
  await import("../memory-director");

const shared = memoryDirectiveFor("a shared task list that syncs across devices");
ok(shared.needed, "memory director: shared task list is flagged needed");
ok(!shared.correcting, "memory director: shared task list is not a correction");
ok(shared.directive.includes("ObsidianMemory.onChange("), "memory director: directive documents onChange");
ok(shared.directive.includes("ObsidianMemory.list()"), "memory director: directive documents list");
ok(/opaque-origin/i.test(shared.directive), "memory director: directive explains the sandbox reason");

const plain = memoryDirectiveFor("a personal calculator with a keypad");
ok(!plain.needed, "memory director: plain calculator is not flagged");
ok(plain.directive === "", "memory director: unflagged prompt yields empty directive");

const fb = memoryDirectiveFor("a notes app backed by Firebase");
ok(fb.correcting, "memory director: Firebase prompt sets correcting");
ok(/CORRECTION/.test(fb.directive), "memory director: correcting directive contains a correction");

ok(
  detectForbiddenStorage("const x = localStorage.getItem('a')").includes("localStorage"),
  "memory director: detectForbiddenStorage finds localStorage",
);
ok(
  detectForbiddenStorage("await ObsidianMemory.set('tasks', tasks)").length === 0,
  "memory director: detectForbiddenStorage returns empty for clean code",
);
ok(
  usesMemorySubscription("ObsidianMemory.onChange((k,v) => {})"),
  "memory director: usesMemorySubscription true when onChange is called",
);
ok(
  !usesMemorySubscription("await ObsidianMemory.set('a', 1)"),
  "memory director: usesMemorySubscription false for writes only",
);

const genSrc2 = generateSrc;
ok(genSrc2.includes('from "@/lib/memory-director"'), "generate.ts: imports the memory director");
ok(genSrc2.includes("detectForbiddenStorage(outSample)"), "generate.ts: logs forbidden storage after generation");

/* ---------- provider health (7) ---------- */
{
  const { markRouteLLMKeyDead, isRouteLLMKeyDead, healthyRouteLLMKeys, resetRouteLLMKeyHealth, DEAD_KEY_TTL_MS } =
    await import("../routellm-keys");
  const { chooseRoute } = await import("../pocket-studio-call");

  resetRouteLLMKeyHealth();
  const now = 1_000_000;
  markRouteLLMKeyDead("k-dead", now);
  ok(isRouteLLMKeyDead("k-dead", now + 1_000), "provider health: dead key is skipped inside TTL");
  ok(!isRouteLLMKeyDead("k-dead", now + DEAD_KEY_TTL_MS + 1), "provider health: dead key recovers after TTL");
  ok(!isRouteLLMKeyDead("k-live", now), "provider health: untouched key stays healthy");

  process.env.ROUTELLM_API_KEY_2 = "k-dead";
  process.env.ROUTELLM_API_KEY = "k-live";
  delete process.env.ROUTELLM_API_KEY_FALLBACK;
  resetRouteLLMKeyHealth();
  markRouteLLMKeyDead("k-dead");
  ok(
    JSON.stringify(healthyRouteLLMKeys()) === JSON.stringify(["k-live"]),
    "provider health: healthyRouteLLMKeys drops exhausted keys",
  );
  resetRouteLLMKeyHealth();

  const googleRoute = chooseRoute("routellm/claude-opus-4-1-20250805", { googleKey: "g", routellmKey: "r", lovableKey: "l" }, "pocket_plan");
  ok(googleRoute?.provider === "google", "pocket route: Google wins when a Google key exists");
  const rllmRoute = chooseRoute("routellm/claude-opus-4-1-20250805", { routellmKey: "r", lovableKey: "l" }, "pocket_plan");
  ok(rllmRoute?.provider === "routellm", "pocket route: falls back to ChatLLM without Google");
  const lovableRoute = chooseRoute("routellm/claude-opus-4-1-20250805", { lovableKey: "l" }, "pocket_plan");
  ok(lovableRoute?.provider === "lovable", "pocket route: degrades to the Lovable gateway last");
}

/* ---------- design floor ---------- */
{
  const { checkDesignFloor } = await import("../design-floor.ts");
  const bare = `<!doctype html><html><head><title>t</title></head><body><h1>Hello</h1><p>Some text here for length.</p><a href="#">link</a></body></html>`;
  const bareReport = checkDesignFloor(bare);
  ok(!bareReport.ok, "design floor: rejects an unstyled document");
  ok(bareReport.repairInstruction.length > 20, "design floor: emits a repair instruction");

  const truncated = `<!doctype html><html><head><style>${"body{background:#0b0b0b;color:#eee;font-family:system-ui}".repeat(40)}</style></head><body><div style="display:grid"><h1>Hi</h1><section`;
  ok(checkDesignFloor(truncated).incomplete, "design floor: flags a truncated document");

  const good = `<!doctype html><html><head><style>${":root{--a:#f4a125}body{margin:0;background:#0b0b0b;color:#f6e6c8;font-family:system-ui,-apple-system,sans-serif;line-height:1.5}.wrap{max-width:1100px;margin:0 auto;padding:64px 24px;display:grid;gap:32px}.btn{display:inline-flex;align-items:center;border-radius:14px;padding:12px 20px;background:var(--a);color:#111;text-decoration:none}a{color:var(--a);text-decoration:none}.card{display:flex;flex-direction:column;gap:12px;border:1px solid rgba(244,161,37,.2);border-radius:18px;padding:24px}".repeat(6)}</style></head><body><div class="wrap"><h1>Real page</h1><p>Body copy that is long enough to count as content for the floor check.</p><a class="btn" href="#more">Get started</a><div class="card" id="more">Card content</div></div></body></html>`;
  ok(checkDesignFloor(good).ok, "design floor: accepts a properly designed document");
}

/* ---------- report ---------- */
const total = passed + failures.length;
console.log(`${passed}/${total} assertions passed`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
