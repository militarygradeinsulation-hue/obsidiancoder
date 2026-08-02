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

/* ---------- report ---------- */
const total = passed + failures.length;
console.log(`${passed}/${total} assertions passed`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
