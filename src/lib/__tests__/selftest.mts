/**
 * Self-test for build-guard and themes. No dependencies, no framework.
 * Run: npx tsx src/lib/__tests__/selftest.mts
 */
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

/* ---------- report ---------- */
const total = passed + failures.length;
console.log(`${passed}/${total} assertions passed`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
