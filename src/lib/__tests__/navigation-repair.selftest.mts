import { repairNavigation, __neutralizeScriptNavigationForTest as neutralizeScriptNavigation } from '../navigation-repair';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

function scriptBody(html: string): string {
  const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  return m ? m[1] : '';
}

function isSyntacticallyPlausible(js: string): boolean {
  // Not a real parser — just the specific shape this bug produced:
  // a declaration keyword with no valid binding target.
  return !/\b(?:let|const|var)\s*\(void 0/.test(js);
}

console.log('\nnavigation-repair: the actual bug — bare "location" as a variable name');
console.log('(this is what silently blanked a live published dashboard: one ordinary');
console.log(' field name turned a whole <script> block into a SyntaxError)');

{
  const { body } = neutralizeScriptNavigation('let location = raw.city + ", " + raw.state; use(location);');
  check('let location = ... survives untouched', body === 'let location = raw.city + ", " + raw.state; use(location);');
  check('result is not the broken "let (void 0...)" shape', isSyntacticallyPlausible(body));
}

{
  const { body } = neutralizeScriptNavigation('const location = data.region;');
  check('const location = ... survives untouched', body === 'const location = data.region;');
}

{
  const { body } = neutralizeScriptNavigation('var location = point.lat + "," + point.lng;');
  check('var location = ... survives untouched', body === 'var location = point.lat + "," + point.lng;');
}

{
  const html = '<html><body><script>function loadRow(raw){ let location = raw.city; state.push({location}); } function renderKPIs(){ paint(); } loadRow(x); renderKPIs();</script></body></html>';
  const result = repairNavigation(html);
  const out = scriptBody(result.html);
  check('surrounding functions in the same script survive (renderKPIs)', out.includes('function renderKPIs(){ paint(); }'));
  check('the call site after the declaration survives (renderKPIs())', out.includes('renderKPIs();'));
  check('no repairs were (wrongly) applied for a plain declaration', result.repairs.length === 0);
}

{
  // Multiple declarations in the same script — none should be touched.
  const { body } = neutralizeScriptNavigation(
    'let location = a; for (const r of rows) { let location = r.city; add(location); }',
  );
  check('repeated let location across scopes all survive', isSyntacticallyPlausible(body) && body.includes('add(location)'));
}

console.log('\nnavigation-repair: real navigation hijacks must still be caught (no regression)');

{
  const { body, repairs } = neutralizeScriptNavigation('location = "https://evil.example/";');
  check('bare `location = <url>` (real hijack) is neutralized', body.includes('obs-nav-blocked') && !body.includes('evil.example'));
  check('reports script-location-write-neutralized', repairs.some((r) => r.code === 'script-location-write-neutralized'));
}

{
  const { body } = neutralizeScriptNavigation('window.location.href = "https://evil.example/";');
  check('window.location.href = ... is neutralized', body.includes('obs-nav-blocked') && !body.includes('evil.example'));
}

{
  const { body } = neutralizeScriptNavigation('top.location.href = "https://evil.example/";');
  check('top.location.href = ... is neutralized', body.includes('obs-nav-blocked'));
}

{
  const { body } = neutralizeScriptNavigation('location.assign("https://evil.example/");');
  check('location.assign(...) call is neutralized', body.includes('obs-nav-blocked') && !body.includes('evil.example'));
}

{
  const { body } = neutralizeScriptNavigation('location.replace("https://evil.example/");');
  check('location.replace(...) call is neutralized', body.includes('obs-nav-blocked'));
}

{
  const { body } = neutralizeScriptNavigation('window.open("https://evil.example/");');
  check('window.open(...) call is neutralized', body.includes('obs-nav-blocked') && !body.includes('evil.example'));
}

{
  // A hijack disguised inside a function that ALSO happens to use
  // `location` as a variable name elsewhere — both rules must apply
  // independently and correctly.
  const src = 'let location = row.city; function hijack(){ window.location = "https://evil.example/"; } render(location);';
  const { body } = neutralizeScriptNavigation(src);
  check('the declaration survives', body.includes('let location = row.city;'));
  check('the real hijack in the same script is still neutralized', body.includes('obs-nav-blocked') && !body.includes('evil.example'));
}

console.log('\nnavigation-repair: comparisons and arrow functions are not assignments');

{
  const { body, repairs } = neutralizeScriptNavigation('if (location === "home") render();');
  check('`location ===` (comparison, not assignment) is left alone', body === 'if (location === "home") render();');
  check('no repair reported for a comparison', repairs.length === 0);
}

{
  const { body, repairs } = neutralizeScriptNavigation('const go = () => location;');
  check('`=>` (arrow function) is not treated as `=`', body === 'const go = () => location;');
  check('no repair reported for an arrow function', repairs.length === 0);
}

console.log('\nnavigation-repair: anchors, forms, meta-refresh (baseline coverage)');

{
  const result = repairNavigation('<a href="https://evil.example/">Click</a>');
  check('off-page anchor href is stripped', !result.html.includes('evil.example'));
  check('off-page anchor is marked blocked', result.html.includes('data-obsidian-blocked="1"'));
  check('reports anchor-disabled', result.repairs.some((r) => r.code === 'anchor-disabled'));
}

{
  const result = repairNavigation('<div id="section-1">x</div><a href="#section-1">Jump</a>');
  check('a valid in-page anchor to an existing id is preserved', result.html.includes('href="#section-1"'));
  check('no repair applied for a valid internal anchor', result.repairs.length === 0);
}

{
  const result = repairNavigation('<a href="#missing">Jump</a>');
  check('an anchor to a NON-existent id is disabled', !result.html.includes('href="#missing"'));
  check('reports missing-anchor-disabled', result.repairs.some((r) => r.code === 'missing-anchor-disabled'));
}

{
  const result = repairNavigation('<form action="https://evil.example/collect"><input></form>');
  check('form action is stripped', !result.html.includes('evil.example'));
  check('form is marked local-only', result.html.includes('data-obsidian-local-form="1"'));
  check('a form guard script is injected exactly once', (result.html.match(/data-obsidian-form-guard/g) || []).length === 1);
}

{
  const result = repairNavigation('<meta http-equiv="refresh" content="0;url=https://evil.example/">');
  check('meta refresh is stripped entirely', !result.html.includes('evil.example') && !result.html.includes('http-equiv'));
}

{
  const result = repairNavigation('<div onclick="window.location.href=\'https://evil.example/\'">Click</div>');
  check('inline onclick with a navigation expression is neutralized', result.html.includes('data-obsidian-blocked="1"'));
}

{
  const result = repairNavigation('<div onclick="doThing(location)">Click</div>');
  check('inline onclick that only READS location (no assignment/call) is left alone', result.html.includes('onclick="doThing(location)"'));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
