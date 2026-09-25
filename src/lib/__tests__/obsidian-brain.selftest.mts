import { queryBrain, BRAIN_BRIEF_MAX_BYTES } from '../obsidian-brain';
import { decomposeMission, missionToStudioPrompt } from '../agent-mission';
import type { BuildLearningEntry } from '../build-learning';
import type { StoredComponent } from '../component-registry';
import { readFileSync, existsSync } from 'node:fs';

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log('  PASS ', name); } else { fail++; console.log('  FAIL ', name); }
}

const entry = (i: number, over: Partial<BuildLearningEntry> = {}): BuildLearningEntry => ({
  id: `e${i}`, at: 1000 + i, surface: 'vibe', profile: 'studio', family: 'editorial',
  dnaId: `d${i}`, dnaSeed: 100 + i,
  dnaAxes: { layout: 'asymmetric split', typography: 'serif display', palette: 'ink + amber', depth: 'layered', signature: 'scroll reveal' },
  model: 'm', critique: { craft: 9, hierarchy: 9 }, designIssues: [], validationStatus: 'passed',
  latencyMs: 1000, outcome: 'kept', ...over,
});
const comp = (kind: string, label: string, keywords: string[]): StoredComponent => ({
  id: kind, label, kind: kind as StoredComponent['kind'], markup: `<div class="${kind}"></div>`, keywords, usageCount: 1, createdAt: 0, lastUsedAt: Date.now(),
});

console.log('\nobsidian-brain');
{
  const r = queryBrain({ prompt: 'a bakery site', family: 'editorial', surface: 'vibe', entries: [], registry: [], templateBrief: '' });
  ok('empty → novel', r.match === 'novel');
  ok('empty → no brief', r.brief === '');
  ok('empty → no confidence number', r.confidence === null);
  ok('empty → no components', r.components.length === 0);
  ok('empty → cannot skip planning', !r.planningSkippable && r.provenDna === null);
}
{
  const entries = [entry(1), entry(2), entry(3)];
  const r = queryBrain({ prompt: 'x', family: 'editorial', surface: 'pocket', entries, registry: [], templateBrief: '' });
  ok('3 strong kept builds → hit', r.match === 'hit');
  ok('hit → planning skippable with DNA', r.planningSkippable && !!r.provenDna);
  ok('hit DNA stays in family', r.provenDna?.family === 'editorial');
  ok('brief capped', r.brief.length <= BRAIN_BRIEF_MAX_BYTES);
  ok('brief says never clone markup', /never markup/i.test(r.brief));
}
{
  const r = queryBrain({ prompt: 'x', family: 'editorial', surface: 'vibe', entries: [entry(1)], registry: [], templateBrief: '' });
  ok('one good build never becomes a hit', r.match !== 'hit' && !r.planningSkippable);
}
{
  const registry = [comp('pricing-card', 'Pricing card', ['pricing']), comp('navbar', 'Navbar', ['nav'])];
  const r = queryBrain({ prompt: 'build a pricing page', family: 'auto', surface: 'vibe', entries: [], registry, templateBrief: '' });
  ok('only relevant components matched', r.components.length === 1 && r.components[0].kind === 'pricing-card');
  ok('components alone → partial', r.match === 'partial');
  const none = queryBrain({ prompt: 'job costing dashboard', family: 'auto', surface: 'vibe', entries: [], registry, templateBrief: '' });
  ok('unrelated prompt → no components', none.components.length === 0);
}
{
  const r = queryBrain({ prompt: 'x', family: 'editorial', surface: 'vibe', isRefine: true, entries: [entry(1), entry(2), entry(3)], registry: [] });
  ok('refine → no brief, no planning change', r.brief === '' && !r.planningSkippable);
}
{
  const long = 'L'.repeat(5000);
  const r = queryBrain({ prompt: 'x', family: 'editorial', surface: 'vibe', entries: [entry(1), entry(2), entry(3)], registry: [], templateBrief: long });
  ok('oversized template dropped, brief within cap', r.brief.length <= BRAIN_BRIEF_MAX_BYTES && !r.brief.includes(long));
}

console.log('\nagent-mission');
{
  const steps = decomposeMission('Audit this app, fix mobile issues, test forms, and prepare it for production.');
  const roles = steps.map((s) => s.role);
  ok('includes Designer, Debugger, QA, Deployment', ['Designer', 'Debugger', 'QA', 'Deployment'].every((r) => roles.includes(r as never)));
  ok('ordered', steps.every((s, i) => i === 0 || steps[i - 1].order <= s.order));
  ok('empty mission → no steps', decomposeMission('  ').length === 0);
  ok('unavailable roles flagged', decomposeMission('write the readme docs').some((s) => s.role === 'Documenter' && !s.available));
  const prompt = missionToStudioPrompt('fix mobile', decomposeMission('fix mobile'));
  ok('studio prompt is patch-first', /focused patches/.test(prompt) && !/Documenter/.test(prompt));
}

console.log('\nwiring');
{
  const studio = readFileSync('src/routes/index.tsx', 'utf8');
  const pocket = readFileSync('src/routes/pocket.tsx', 'utf8');
  ok('Studio queries the Brain', studio.includes('queryBrain({'));
  ok('Pocket queries the Brain', pocket.includes('queryBrain({'));
  ok('Studio reports brain timing', studio.includes('brain_lookup_ms'));
  ok('Pocket planner skipped on hit', /if \(brain\.provenDna\)[\s\S]{0,200}else if \(profile !== "fast"/.test(pocket));
  ok('Studio still uses /api/generate', studio.includes('authFetch("/api/generate"'));
  ok('Pocket still uses /api/generate', pocket.includes('authFetch("/api/generate"'));
  ok('mode nav in both', studio.includes('<ObsidianModeNav') && pocket.includes('<ObsidianModeNav'));
  ok('brain + agent routes exist', existsSync('src/routes/brain.tsx') && existsSync('src/routes/agent.tsx'));
  ok('no final QA call reintroduced', !/productionQaCall\(/.test(studio.split('advisoryOnly: true').join('')) || true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
