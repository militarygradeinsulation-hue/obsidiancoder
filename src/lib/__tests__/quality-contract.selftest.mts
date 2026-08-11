import { declaredFontFamilies, enforceQualityContract, qualityContractFragment } from '../quality-contract';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

const doc = (head: string, body = '<p>hi</p>') =>
  `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;

console.log('\nquality-contract: prompt fragment');
{
  const f = qualityContractFragment();
  check('fragment names google fonts link requirement', /fonts\.googleapis\.com/.test(f));
  check('fragment demands inline svg', /<svg>/.test(f) || /inline <svg/.test(f));
  check('fragment demands focus-visible', /:focus-visible/.test(f));
  check('fragment demands breakpoints', /breakpoints/i.test(f));
}

console.log('\nquality-contract: font detection');
{
  const fams = declaredFontFamilies(`<style>body{font-family:'DM Sans',system-ui,sans-serif}h1{font-family:"Cabinet Grotesk",serif}</style>`);
  const names = fams.map((f) => f.name);
  check('picks up quoted families', names.includes('DM Sans') && names.includes('Cabinet Grotesk'));
  check('drops generic keywords', !names.some((n) => /system-ui|sans-serif|serif/i.test(n)));
}
{
  const fams = declaredFontFamilies(`<style>:root{--font-display:'Space Grotesk';}h1{font-family:var(--font-display)}</style>`);
  check('reads families from custom properties', fams.some((f) => f.name === 'Space Grotesk'));
  check('ignores var() references as family names', !fams.some((f) => f.name.startsWith('var(')));
}

console.log('\nquality-contract: font linking');
{
  const r = enforceQualityContract(doc(`<style>body{font-family:'DM Sans',sans-serif}</style>`));
  check('links a declared google font', /fonts\.googleapis\.com\/css2\?family=DM\+Sans/.test(r.html));
  check('adds preconnect once', (r.html.match(/fonts\.gstatic\.com/g) ?? []).length === 1);
  check('reports the fix', r.fixes.some((f) => f.includes('DM Sans')));
  check('no unloadable fonts reported', r.unloadableFonts.length === 0);
}
{
  const already = doc(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans&display=swap"><style>body{font-family:'DM Sans',sans-serif}</style>`);
  const r = enforceQualityContract(already);
  check('does not double-link an already loaded font', (r.html.match(/fonts\.googleapis\.com/g) ?? []).length === 1);
  check('no font fix reported when already linked', !r.fixes.some((f) => f.includes('linked')));
}
{
  const r = enforceQualityContract(doc(`<style>@font-face{font-family:'Cabinet Grotesk';src:url(/cg.woff2)}body{font-family:'Cabinet Grotesk',sans-serif}</style>`));
  check('@font-face counts as loaded', r.unloadableFonts.length === 0 && !r.fixes.some((f) => f.includes('linked')));
}
{
  const r = enforceQualityContract(doc(`<style>body{font-family:'Cabinet Grotesk',sans-serif}</style>`));
  check('flags a family that is not on google fonts', r.unloadableFonts.includes('Cabinet Grotesk'));
  check('does not fabricate a link for an unavailable family', !/fonts\.googleapis\.com/.test(r.html));
}

console.log('\nquality-contract: focus rings');
{
  const r = enforceQualityContract(doc('<style>a{color:red}</style>', '<button>Go</button>'));
  check('injects a focus-visible rule when missing', /button:focus-visible/.test(r.html));
  check('reports the focus fix', r.fixes.some((f) => f.includes('focus-visible')));
  const again = enforceQualityContract(r.html);
  check('idempotent — no second focus block', (again.html.match(/obs-focus-contract/g) ?? []).length === 1);
}
{
  const r = enforceQualityContract(doc('<style>button:focus-visible{outline:2px solid gold}</style>'));
  check('leaves an existing focus-visible rule alone', !r.fixes.some((f) => f.includes('focus-visible')));
}

console.log('\nquality-contract: safety');
{
  const fragment = '<div>no document here</div>';
  const r = enforceQualityContract(fragment);
  check('leaves a headless fragment untouched', r.html === fragment && r.fixes.length === 0);
}
{
  const src = doc(`<style>body{font-family:'Inter',sans-serif}</style>`, '<button>x</button>');
  const once = enforceQualityContract(src).html;
  const twice = enforceQualityContract(once).html;
  check('fully idempotent across repeated runs', once === twice);
  check('body content is preserved', twice.includes('<button>x</button>'));
}

console.log(`\nquality-contract: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
