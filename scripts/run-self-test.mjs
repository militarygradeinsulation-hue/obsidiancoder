import { runSelfTests } from '../src/lib/self-test.ts';
const r = await runSelfTests();
console.log(`passed=${r.passed} failed=${r.failed}`);
if (r.failed) {
  for (const t of r.results.filter(x => !x.ok)) console.log('FAIL:', t.name, t.detail ?? '');
  process.exit(1);
}
