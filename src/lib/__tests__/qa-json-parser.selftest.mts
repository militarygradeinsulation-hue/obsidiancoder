import { parseQaJson } from '../qa-json-parser';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

console.log('\nqa-json-parser: valid responses');

{
  const r = parseQaJson(JSON.stringify({
    verdict: 'pass', confidence: 0.9, defect_categories: [], explanation: 'looks fine', expected_improvement: '', patch: null,
  }));
  check('plain valid pass verdict parses', r?.verdict === 'pass');
  check('pass verdict has no patch', r?.patch === null);
}

{
  const r = parseQaJson(JSON.stringify({
    verdict: 'repair', confidence: 0.7, defect_categories: ['nav-external'],
    explanation: 'dead link', expected_improvement: 'link resolves',
    patch: { summary: 'fix link', operations: [{ op: 'set_attribute', id: 'a', attribute: 'href', value: '/jobs' }] },
  }));
  check('valid repair verdict with a real patch parses', r?.verdict === 'repair' && r?.patch !== null);
}

{
  // Wrapped in a markdown code fence — a common way models "help" despite
  // being told not to. The parser must strip this, not reject it.
  const raw = '```json\n' + JSON.stringify({ verdict: 'pass', confidence: 1, defect_categories: [], explanation: '', expected_improvement: '', patch: null }) + '\n```';
  const r = parseQaJson(raw);
  check('code-fenced JSON is still parsed', r?.verdict === 'pass');
}

{
  // Prose before/after the JSON — response_format:json_object should
  // prevent this, but the parser has a brace-extraction fallback for
  // exactly the case where a provider doesn't honor that.
  const raw = 'Here is my analysis:\n' + JSON.stringify({ verdict: 'block', confidence: 0.5, defect_categories: [], explanation: 'too risky', expected_improvement: '', patch: null }) + '\nLet me know if you need anything else.';
  const r = parseQaJson(raw);
  check('JSON surrounded by prose is extracted via brace-matching', r?.verdict === 'block');
}

console.log('\nqa-json-parser: exactly the malformed shapes that trigger qa_bad_response');

check('empty string is rejected', parseQaJson('') === null);
check('pure prose with no braces at all is rejected', parseQaJson('I cannot complete this request.') === null);
check('truncated JSON (hit a token limit mid-object) is rejected', parseQaJson('{"verdict": "repair", "confidence": 0.8, "patch": {"summ') === null);
check('trailing comma (a common near-miss) is rejected, not silently repaired', parseQaJson('{"verdict": "pass", "confidence": 1,}') === null);
check('unknown verdict string is rejected, never coerced', parseQaJson(JSON.stringify({ verdict: 'maybe', confidence: 0.5 })) === null);
check('missing verdict entirely is rejected', parseQaJson(JSON.stringify({ confidence: 0.5, explanation: 'no verdict field' })) === null);
check('repair verdict with patch:null is rejected (contract requires a patch)',
  parseQaJson(JSON.stringify({ verdict: 'repair', confidence: 0.5, patch: null })) === null);
check('repair verdict with patch missing entirely is rejected',
  parseQaJson(JSON.stringify({ verdict: 'repair', confidence: 0.5 })) === null);
check('a patch object failing its own schema is rejected',
  parseQaJson(JSON.stringify({ verdict: 'repair', confidence: 0.5, patch: { summary: 'bad', operations: [{ op: 'not_a_real_op' }] } })) === null);
check('patch with zero operations is rejected',
  parseQaJson(JSON.stringify({ verdict: 'repair', confidence: 0.5, patch: { summary: 'empty', operations: [] } })) === null);

console.log('\nqa-json-parser: tolerant defaults for optional fields');

{
  const r = parseQaJson(JSON.stringify({ verdict: 'pass' }));
  check('missing confidence defaults to 0.4, does not reject', r?.confidence === 0.4);
  check('missing explanation defaults to empty string', r?.explanation === '');
  check('missing defect_categories defaults to empty array', Array.isArray(r?.defectCategories) && r?.defectCategories.length === 0);
}

{
  const r = parseQaJson(JSON.stringify({ verdict: 'pass', confidence: 5 }));
  check('out-of-range confidence is clamped to 1, not rejected', r?.confidence === 1);
}

{
  const r = parseQaJson(JSON.stringify({ verdict: 'pass', confidence: -3 }));
  check('negative confidence is clamped to 0', r?.confidence === 0);
}

console.log('\nqa-json-parser: verdict/patch consistency enforcement');

{
  // A model incorrectly attaches a patch to a "pass" verdict — the parser
  // must silently drop it per contract, not reject the whole response.
  const r = parseQaJson(JSON.stringify({
    verdict: 'pass', confidence: 0.9,
    patch: { summary: 'unwanted', operations: [{ op: 'set_attribute', id: 'a', attribute: 'href', value: '/x' }] },
  }));
  check('a patch attached to a pass verdict is stripped, not rejected', r?.verdict === 'pass' && r?.patch === null);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
