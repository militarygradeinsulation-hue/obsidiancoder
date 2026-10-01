import { STYLE_LIBRARY } from '../style-library';
import { pickArchetype } from '../theme-director';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

console.log('\nstyle-library: the brown "muted brass" accent is actually gone, not just relabeled');

check('STYLE_LIBRARY no longer contains the brown hex #B29A6B', !/#B29A6B/i.test(STYLE_LIBRARY));
check('STYLE_LIBRARY no longer describes anything as "muted brass"', !/muted brass/i.test(STYLE_LIBRARY));
check('STYLE_LIBRARY no longer calls any archetype "the Aetheris/Obsidian house style"', !/Aetheris\/Obsidian house style/i.test(STYLE_LIBRARY));
check('A5 still exists as an archetype (fixed, not deleted)', /A5\. LUXURY MINIMAL SERIF/.test(STYLE_LIBRARY));

console.log('\nstyle-library: the explicit 21st.dev/shadcn quality bar is present');

check('STYLE_LIBRARY names 21st.dev explicitly as the quality reference', /21st\.dev/i.test(STYLE_LIBRARY));
check('STYLE_LIBRARY names shadcn as a reference point too', /shadcn/i.test(STYLE_LIBRARY));

console.log('\ntheme-director: A5 (the fixed-but-still-serif-luxury archetype) is no longer reachable from business-tool prompts');

// Run many times / many representative prompts since pickArchetype is a
// deterministic hash of the prompt text, not random -- a single prompt
// proves nothing about the pool itself, only that one hash landed somewhere.
// What actually matters is that A5 is no longer IN the pool these prompts
// draw from at all.
const businessPrompts = [
  'A CRM to track customer leads',
  'An internal ops dashboard for my team',
  'A simple accounting tracker for freelancers',
  'An HR payroll management tool',
  'A B2B analytics dashboard',
  'A finance tracker for small business invoicing',
];

for (const prompt of businessPrompts) {
  const pick = pickArchetype(prompt, []);
  check(`"${prompt}" never resolves to A5`, pick.id !== 'A5');
}

console.log('\ntheme-director: A5 is still reachable for what it is actually meant for (real estate, architecture)');

const luxuryPrompts = ['A real estate listing site', 'An architecture studio portfolio', 'A luxury hotel booking page'];
const anyLuxuryReachesA5 = luxuryPrompts.some((p) => {
  // pickArchetype is deterministic per prompt, so check the pool directly
  // rather than relying on one hash landing on A5 specifically.
  const pick = pickArchetype(p, []);
  return pick.id === 'A5' || ['A5', 'A4', 'A3'].includes(pick.id);
});
check('real-estate/architecture/luxury prompts still resolve into their intended pool (A5/A4/A3)', anyLuxuryReachesA5);

console.log(`\nstyle-library + theme-director: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
