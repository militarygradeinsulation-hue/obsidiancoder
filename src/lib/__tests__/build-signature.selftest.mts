import { ensureBuildSignature, SIGNATURE_MARKER, SIGNATURE_TAGLINE } from '../build-signature';

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log('  PASS ', name); }
  else { fail++; console.log('  FAIL ', name); }
}
const doc = (body = '<h1>Hi</h1>') => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

console.log('\nbuild-signature');
{
  const r = ensureBuildSignature(doc());
  ok('adds the footer', r.added && r.html.includes(SIGNATURE_MARKER));
  ok('credits Aetheris.technology', r.html.includes('Aetheris.technology'));
  ok('credits Obsidianvibe.live', r.html.includes('Obsidianvibe.live'));
  ok('carries the tagline', r.html.includes(SIGNATURE_TAGLINE));
  ok('carries the blurb', r.html.includes('experimentation is cheap'));
  ok('sits before </body>', r.html.indexOf(SIGNATURE_MARKER) < r.html.indexOf('</body>'));
  ok('preserves body content', r.html.includes('<h1>Hi</h1>'));

  const again = ensureBuildSignature(r.html);
  ok('idempotent', !again.added && again.html === r.html);
  ok('only one footer', (r.html.match(new RegExp(SIGNATURE_MARKER, 'g')) || []).length === 1);
}
{
  const frag = '<section>just a fragment</section>';
  const r = ensureBuildSignature(frag);
  ok('leaves a bodyless fragment untouched', !r.added && r.html === frag);
  ok('empty input is safe', ensureBuildSignature('').html === '');
}
{
  const r = ensureBuildSignature('<html><body>x</BODY></html>');
  ok('handles uppercase closing tag', r.added && r.html.includes(SIGNATURE_MARKER));
}

console.log(`\nbuild-signature: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
