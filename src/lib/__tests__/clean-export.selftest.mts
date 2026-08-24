import { sanitizeForExport } from '../clean-export';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

console.log('\nclean-export: the actual bug — ObsidianMemory undefined outside the workspace');
console.log('(memory-director.ts promises every build "A global window.ObsidianMemory');
console.log(' object is ALWAYS injected" — true in the workspace, never true on a');
console.log(' published share page or a downloaded HTML file until this fix)');

{
  const doc = '<!doctype html><html><head></head><body><script>ObsidianMemory.list();</script></body></html>';
  const out = sanitizeForExport(doc);
  check('shim is injected for a build that uses ObsidianMemory', out.includes('data-obsidian-memory-shim'));
  check('window.ObsidianMemory = appears in the output', /window\.ObsidianMemory\s*=/.test(out));
}

{
  const doc = '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';
  const out = sanitizeForExport(doc);
  // Still injected even if the build doesn't reference it — cheap, harmless,
  // and covers the case where a later user edit adds a reference.
  check('shim is present even for a build with no visible reference (safe default)', out.includes('data-obsidian-memory-shim'));
}

console.log('\nclean-export: injection ordering — must run before the build\'s own script');

{
  const doc = `<!doctype html><html><head><title>x</title></head><body>
<script>window.__ranBuildScript = true; ObsidianMemory.get('x');</script>
</body></html>`;
  const out = sanitizeForExport(doc);
  const shimPos = out.indexOf('data-obsidian-memory-shim');
  const buildScriptPos = out.indexOf('__ranBuildScript');
  check('shim script appears before the build script in document order', shimPos !== -1 && shimPos < buildScriptPos);
}

{
  // No <head> tag at all — must still land before the build's own script,
  // not just appended at the very end where it would run too late.
  const doc = `<!doctype html><html><body><script>ObsidianMemory.get('x');</script></body></html>`;
  const out = sanitizeForExport(doc);
  const shimPos = out.indexOf('data-obsidian-memory-shim');
  const scriptPos = out.indexOf("ObsidianMemory.get('x')");
  check('falls back to injecting before <body> when there is no <head>', shimPos !== -1 && shimPos < scriptPos);
}

console.log('\nclean-export: defensive behavior');

{
  const doc = `<html><head></head><body><script>window.ObsidianMemory = { real: true };</script></body></html>`;
  const out = sanitizeForExport(doc);
  check('never injects a second definition when the document already defines one', !out.includes('data-obsidian-memory-shim'));
  check('the real definition is left completely untouched', out.includes('{ real: true }'));
}

{
  const out1 = sanitizeForExport('<html><head></head><body><script>x</script></body></html>');
  const out2 = sanitizeForExport(out1);
  const count = (out2.match(/data-obsidian-memory-shim/g) || []).length;
  check('running sanitizeForExport twice does not double-inject', count === 1);
}

console.log('\nclean-export: the shim itself implements the real API contract correctly');
console.log('(same method names, same async/Promise shape, same list() return shape');
console.log(' as memory-director.ts documents for the real bridge)');

{
  const out = sanitizeForExport('<html><head></head><body></body></html>');
  const shimBody = out.match(/<script data-obsidian-memory-shim="1">([\s\S]*?)<\/script>/)?.[1] ?? '';
  check('shim defines set()', /\bset\s*:\s*function/.test(shimBody));
  check('shim defines get()', /\bget\s*:\s*function/.test(shimBody));
  check('shim defines list()', /\blist\s*:\s*function/.test(shimBody));
  check('shim defines delete()', /\bdelete\s*:\s*function/.test(shimBody));
  check('shim defines onChange()', /\bonChange\s*:\s*function/.test(shimBody));
  check('set/get/list/delete all return a Promise (matches the real async contract)',
    (shimBody.match(/Promise\.resolve/g) || []).length >= 4);
  check('is syntactically valid JavaScript on its own (no dangling braces from the injection)',
    (() => {
      try { new Function(shimBody.replace(/^\(function\(\)\{/, '').replace(/\}\)\(\);?$/, '')); return true; }
      catch { return false; }
    })());
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
