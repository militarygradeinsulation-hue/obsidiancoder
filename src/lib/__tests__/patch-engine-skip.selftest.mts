import { applyPatch } from '../patch-engine';
import type { Patch } from '../patch-protocol';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

const baseHtml = '<!doctype html><html><body><h1 id="title">Hi</h1><a href="#gone">Link</a></body></html>';

console.log('\npatch-engine: default behavior is completely unchanged (backward compatible)');

{
  // No options at all — every existing caller (the deterministic ai-patch
  // commit path) must see byte-identical behavior to before this change.
  const patch: Patch = {
    summary: 'test',
    operations: [{ op: 'set_attribute', id: '__missing__', attribute: 'class', value: 'x' }],
  };
  const result = applyPatch(baseHtml, patch);
  check('with no options, a missing element still aborts the whole patch', result.ok === false);
  check('the error message names the exact op that failed', !result.ok && result.error.includes('__missing__'));
}

{
  const patch: Patch = {
    summary: 'test',
    operations: [{ op: 'set_attribute', id: '__missing__', attribute: 'class', value: 'x' }],
  };
  const result = applyPatch(baseHtml, patch, { skipMissingElementOps: false });
  check('explicitly passing false is identical to omitting the option', result.ok === false);
}

console.log('\npatch-engine: the actual bug — skipMissingElementOps recovers a patch instead of discarding it');
console.log('(this is exactly what "Build blocked by the safety gate: qa-repair-apply-failed:');
console.log(' element #__missing__ not found" was — a QA patch bundling several fixes, one of');
console.log(' which referenced a nonexistent element, discarding every fix in the same patch)');

{
  const patch: Patch = {
    summary: 'test',
    operations: [{ op: 'set_attribute', id: '__missing__', attribute: 'class', value: 'x' }],
  };
  const result = applyPatch(baseHtml, patch, { skipMissingElementOps: true });
  check('a patch with only a missing-element op still succeeds (as a safe no-op)', result.ok === true);
  check('html is unchanged when the only operation was skipped', result.ok && result.html === baseHtml);
  check('the skip is recorded in applied[] for visibility', result.ok && result.applied.some((a) => a.summary.includes('Skipped') && a.summary.includes('__missing__')));
}

{
  // The scenario that actually matters: a real, valid fix bundled with a
  // bogus one. Today (skipMissingElementOps off), this whole patch is
  // discarded. With it on, the real fix survives.
  const patch: Patch = {
    summary: 'test',
    operations: [
      { op: 'set_attribute', id: 'title', attribute: 'class', value: 'fixed' },
      { op: 'set_attribute', id: '__missing__', attribute: 'class', value: 'x' },
    ],
  };
  const strict = applyPatch(baseHtml, patch, { skipMissingElementOps: false });
  const lenient = applyPatch(baseHtml, patch, { skipMissingElementOps: true });
  check('WITHOUT the option, one bad op still discards the real fix too', strict.ok === false);
  check('WITH the option, the real fix is applied', lenient.ok === true && lenient.html.includes('class="fixed"'));
  check('WITH the option, the bad op is skipped, not silently ignored', lenient.ok && lenient.applied.some((a) => a.summary.includes('Skipped')));
}

console.log('\npatch-engine: skipMissingElementOps is scoped narrowly — only "element not found"');

{
  // Ambiguous match: a genuinely different, still-unsafe-to-skip failure —
  // must still abort regardless of the option.
  const html = '<!doctype html><html><body><p>hi</p><p>hi</p></body></html>';
  const patch: Patch = { summary: 't', operations: [{ op: 'replace_text', find: 'hi', replace: 'bye' }] };
  const result = applyPatch(html, patch, { skipMissingElementOps: true });
  check('an ambiguous replace_text match still aborts even with the option on', result.ok === false);
}

{
  // rename_id target-already-exists: a real collision, not a "missing"
  // case — must still abort regardless of the option.
  const html = '<!doctype html><html><body><div id="a">x</div><div id="b">y</div></body></html>';
  const patch: Patch = { summary: 't', operations: [{ op: 'rename_id', from: 'a', to: 'b' }] };
  const result = applyPatch(html, patch, { skipMissingElementOps: true });
  check('a rename_id collision (target already exists) still aborts — not a "missing" case', result.ok === false);
  check('the error is about the collision, not a skip', !result.ok && result.error.includes('already exists'));
}

{
  // rename_id FROM missing — this IS a "missing element" case and should skip.
  const html = '<!doctype html><html><body><div id="a">x</div></body></html>';
  const patch: Patch = { summary: 't', operations: [{ op: 'rename_id', from: '__missing__', to: 'b' }] };
  const result = applyPatch(html, patch, { skipMissingElementOps: true });
  check('rename_id with a missing FROM id is skipped, not aborted, when the option is on', result.ok === true);
}

{
  // remove_class where the class isn't present — a different failure mode
  // (element exists, but the specific thing being removed doesn't) — must
  // still abort; this is not the same as the element itself being missing.
  const html = '<!doctype html><html><body><div id="a" class="foo">x</div></body></html>';
  const patch: Patch = { summary: 't', operations: [{ op: 'remove_class', id: 'a', class_name: 'bar' }] };
  const result = applyPatch(html, patch, { skipMissingElementOps: true });
  check('removing an absent class still aborts (element exists, class does not)', result.ok === false);
}

console.log('\npatch-engine: skip coverage across every element-lookup operation type');

const opsToTest: Array<{ name: string; op: Patch['operations'][number] }> = [
  { name: 'replace_element_by_id', op: { op: 'replace_element_by_id', id: '__missing__', content: '<p>x</p>' } },
  { name: 'remove_element_by_id', op: { op: 'remove_element_by_id', id: '__missing__' } },
  { name: 'remove_attribute', op: { op: 'remove_attribute', id: '__missing__', attribute: 'class' } },
  { name: 'add_class', op: { op: 'add_class', id: '__missing__', class_name: 'x' } },
  { name: 'insert_child', op: { op: 'insert_child', id: '__missing__', content: '<p>x</p>', position: 'last' } },
  { name: 'update_inline_style', op: { op: 'update_inline_style', id: '__missing__', property: 'color', value: 'red' } },
];

for (const { name, op } of opsToTest) {
  const patch: Patch = { summary: 't', operations: [op] };
  const result = applyPatch(baseHtml, patch, { skipMissingElementOps: true });
  check(`${name}: missing element is skipped cleanly (option on)`, result.ok === true && result.html === baseHtml);
  const strict = applyPatch(baseHtml, patch, { skipMissingElementOps: false });
  check(`${name}: missing element still aborts by default (option off)`, strict.ok === false);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
