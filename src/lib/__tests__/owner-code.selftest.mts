import { readFileSync } from 'node:fs';
import { isOwnerCode, OWNER_CODE_HEADER } from '../credit-gate.server';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

console.log('\nowner-code: recognized codes');

check('9822 is recognized as a full-access code', isOwnerCode('9822'));
check('963169 is recognized as a full-access code', isOwnerCode('963169'));
check('surrounding whitespace is tolerated', isOwnerCode('  9822  '));

console.log('\nowner-code: rejected input');

check('empty string is rejected', !isOwnerCode(''));
check('null is rejected', !isOwnerCode(null));
check('undefined is rejected', !isOwnerCode(undefined));
check('the free-tier site code (482917) does NOT grant owner', !isOwnerCode('482917'));
check('an arbitrary wrong code is rejected', !isOwnerCode('1234'));
check('a near-miss of a real code is rejected', !isOwnerCode('98220'));
check('a long junk string is rejected', !isOwnerCode('x'.repeat(500)));

console.log('\nowner-code: header constant must not drift between client and server');

{
  // auth-fetch.ts deliberately re-declares this constant instead of
  // importing it (credit-gate.server.ts is server-only and would drag the
  // service-role Supabase client into the browser bundle). That means the
  // two can silently drift apart — and if they do, the owner header stops
  // being read and the owner silently drops back to HTTP 402, which is the
  // exact bug this whole mechanism exists to fix. Lock them together.
  const clientSrc = readFileSync(new URL('../auth-fetch.ts', import.meta.url), 'utf8');
  const m = clientSrc.match(/const OWNER_CODE_HEADER\s*=\s*["']([^"']+)["']/);
  check('auth-fetch.ts declares an OWNER_CODE_HEADER constant', !!m);
  check(
    `client header (${m?.[1]}) matches server header (${OWNER_CODE_HEADER})`,
    m?.[1] === OWNER_CODE_HEADER,
  );
  check('header name is lowercase (Headers normalizes, but keep them literally equal)',
    OWNER_CODE_HEADER === OWNER_CODE_HEADER.toLowerCase());
}

console.log('\nowner-code: SITE_PASSWORD fallback path');

{
  const prev = process.env.SITE_PASSWORD;
  process.env.SITE_PASSWORD = 'a-long-configured-site-password';
  check('a configured SITE_PASSWORD is accepted', isOwnerCode('a-long-configured-site-password'));
  check('a wrong value is still rejected when SITE_PASSWORD is set', !isOwnerCode('not-the-password'));
  delete process.env.SITE_PASSWORD;
  check('unknown code rejected when SITE_PASSWORD is unset (no crash)', !isOwnerCode('anything'));
  check('hardcoded full-access codes still work with SITE_PASSWORD unset', isOwnerCode('9822'));
  if (prev === undefined) delete process.env.SITE_PASSWORD;
  else process.env.SITE_PASSWORD = prev;
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
