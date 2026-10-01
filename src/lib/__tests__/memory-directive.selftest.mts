import { memoryDirectiveFor, detectForbiddenStorage, usesMemorySubscription } from '../memory-director';
import { memoryDirective } from '../memory-directive';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

console.log('\nmemory-directive: detection logic (memoryDirectiveFor)');

check(
  'a CRM-shaped prompt is detected as needing the directive',
  memoryDirectiveFor('Build a CRM to track customer leads').needed,
);
check(
  'a task tracker prompt is detected as needing the directive',
  memoryDirectiveFor('A simple task tracker for my team').needed,
);
check(
  'a plain, stateless prompt (a calculator) is NOT flagged as needing it',
  !memoryDirectiveFor('A tip calculator that splits a bill').needed,
);
check(
  'a prompt naming Firebase is flagged as correcting',
  memoryDirectiveFor('A todo app using Firebase for storage').correcting,
);
check(
  'a prompt naming Supabase is flagged as correcting',
  memoryDirectiveFor('Build a CRM backed by Supabase').correcting,
);
check(
  'a plain prompt with no forbidden backend is not flagged as correcting',
  !memoryDirectiveFor('A simple landing page for a bakery').correcting,
);
check(
  'empty/non-string input never throws and resolves to not-needed',
  memoryDirectiveFor('').needed === false && memoryDirectiveFor(undefined as unknown as string).needed === false,
);

console.log('\nmemory-directive: the directive text actually teaches per-record keys, not the old whole-array pattern');

const needed = memoryDirectiveFor('A CRM to track customers').directive;
const fallback = memoryDirective();

for (const [label, text] of [['memory-director (needed path)', needed], ['memory-directive (fallback)', fallback]] as const) {
  check(
    `${label}: does NOT contain the old prescriptive "store ONE array under ONE key" instruction`,
    !/store\s+ONE\s+array\s+under\s+ONE\s+key/i.test(text),
  );
  check(
    `${label}: DOES explicitly warn against that old pattern (prohibitive, not prescriptive)`,
    /never store a collection as one array under one key/i.test(text),
  );
  check(`${label}: does NOT tell the model to "write the whole array back"`, !/write the whole array back/i.test(text));
  check(`${label}: DOES teach a per-record key pattern`, /task:<id>|customer:<id>/.test(text));
  check(`${label}: DOES mention crypto.randomUUID for record ids`, /crypto\.randomUUID/.test(text));
  check(`${label}: still forbids localStorage as a substitute`, /FORBIDDEN/i.test(text) && /localStorage/.test(text));
  check(`${label}: still requires ObsidianMemory.onChange`, /onChange/.test(text));
}

console.log('\nmemory-directive: the correction fragment still appears when needed');

check(
  'a Firebase-naming prompt gets the CORRECTION fragment appended',
  /CORRECTION/.test(memoryDirectiveFor('A todo app using Firebase').directive),
);
check(
  'a plain stateful prompt (no forbidden backend named) does NOT get the CORRECTION fragment',
  !/CORRECTION/.test(memoryDirectiveFor('A CRM to track customers').directive),
);

console.log('\nmemory-directive: the telemetry helpers still work correctly');

check(
  'detectForbiddenStorage finds localStorage usage in generated HTML',
  detectForbiddenStorage('<script>localStorage.setItem("x","y")</script>').includes('localStorage'),
);
check(
  'detectForbiddenStorage finds nothing in clean ObsidianMemory-only code',
  detectForbiddenStorage('<script>ObsidianMemory.set("task:1", {})</script>').length === 0,
);
check(
  'usesMemorySubscription is true when onChange is wired',
  usesMemorySubscription('<script>ObsidianMemory.onChange((k,v)=>{})</script>'),
);
check(
  'usesMemorySubscription is false when the build only writes, never listens',
  !usesMemorySubscription('<script>ObsidianMemory.set("x", 1)</script>'),
);

console.log(`\nmemory-directive: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
