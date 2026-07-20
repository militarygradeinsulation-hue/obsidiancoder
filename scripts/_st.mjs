import { runSelfTests } from "../src/lib/self-test.ts";
const r = await runSelfTests();
console.log(`passed=${r.passed} failed=${r.failed}`);
if (r.failed) for (const x of r.results.filter(x=>!x.ok)) console.log("FAIL:", x.name, x.detail||"");
