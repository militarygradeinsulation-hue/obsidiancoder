import {
  readOrMintFreeOpenCookie,
  fingerprintFromFreeOpenCookie,
  FREE_OPEN_DAILY_CAP,
  FREE_OPEN_WINDOW_HOURS,
  FREE_OPEN_REQUEST_HEADER,
} from '../free-open.server';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

function req(headers: Record<string, string>): Request {
  return new Request('https://example.test/api/generate', { headers });
}

console.log('\nfree-open: cookie minting');

const fresh = readOrMintFreeOpenCookie(req({}));
check('no existing cookie: a new one is minted', !!fresh.cookieId && fresh.cookieId.length >= 32);
check('no existing cookie: a Set-Cookie header is returned', !!fresh.setCookieHeader);
check('the minted Set-Cookie is HttpOnly and scoped to the right name', (fresh.setCookieHeader ?? '').includes('obs-free-open=') && (fresh.setCookieHeader ?? '').includes('HttpOnly'));

const existingId = 'a'.repeat(64);
const reused = readOrMintFreeOpenCookie(req({ cookie: `obs-free-open=${existingId}` }));
check('a valid existing cookie is reused as-is', reused.cookieId === existingId);
check('a valid existing cookie does NOT get a new Set-Cookie header', !reused.setCookieHeader);

const malformed = readOrMintFreeOpenCookie(req({ cookie: 'obs-free-open=not-hex-!!!' }));
check('a malformed existing cookie value is treated as absent and re-minted', malformed.cookieId !== 'not-hex-!!!' && !!malformed.setCookieHeader);

const tooShort = readOrMintFreeOpenCookie(req({ cookie: 'obs-free-open=abc123' }));
check('a too-short existing cookie value is treated as absent and re-minted', !!tooShort.setCookieHeader);

console.log('\nfree-open: fingerprint consistency and uniqueness');

const infoA = readOrMintFreeOpenCookie(req({ cookie: `obs-free-open=${existingId}`, 'user-agent': 'Mozilla/5.0 (Macintosh)' }));
const infoAAgain = readOrMintFreeOpenCookie(req({ cookie: `obs-free-open=${existingId}`, 'user-agent': 'Mozilla/5.0 (Macintosh)' }));
check(
  'identical cookie + UA produce the identical fingerprint',
  fingerprintFromFreeOpenCookie(infoA) === fingerprintFromFreeOpenCookie(infoAAgain),
);

const otherId = 'b'.repeat(64);
const infoB = readOrMintFreeOpenCookie(req({ cookie: `obs-free-open=${otherId}`, 'user-agent': 'Mozilla/5.0 (Macintosh)' }));
check(
  'a different cookie id produces a different fingerprint',
  fingerprintFromFreeOpenCookie(infoA) !== fingerprintFromFreeOpenCookie(infoB),
);

const infoMobile = readOrMintFreeOpenCookie(req({ cookie: `obs-free-open=${existingId}`, 'user-agent': 'Mozilla/5.0 (iPhone Mobile)' }));
check(
  'the same cookie id with a different UA class produces a different fingerprint',
  fingerprintFromFreeOpenCookie(infoA) !== fingerprintFromFreeOpenCookie(infoMobile),
);

console.log('\nfree-open: IP prefix hashing never exposes the raw IP, groups by subnet');

const infoIpA = readOrMintFreeOpenCookie(req({ cookie: `obs-free-open=${existingId}`, 'x-forwarded-for': '203.0.113.5' }));
const infoIpB = readOrMintFreeOpenCookie(req({ cookie: `obs-free-open=${existingId}`, 'x-forwarded-for': '203.0.113.250' }));
check(
  'two IPv4 addresses in the same /24 produce the same prefix hash (same fingerprint)',
  fingerprintFromFreeOpenCookie(infoIpA) === fingerprintFromFreeOpenCookie(infoIpB),
);
check('the stored prefix hash never contains the raw IP octets', !(infoIpA.ipPrefixHash ?? '').includes('203.0.113'));

const infoIpC = readOrMintFreeOpenCookie(req({ cookie: `obs-free-open=${existingId}`, 'x-forwarded-for': '198.51.100.5' }));
check(
  'a different /24 subnet produces a different fingerprint',
  fingerprintFromFreeOpenCookie(infoIpA) !== fingerprintFromFreeOpenCookie(infoIpC),
);

console.log('\nfree-open: exported constants are sane and match what generate.ts expects');

check('FREE_OPEN_DAILY_CAP is a positive, generous integer (not a one-shot cap)', FREE_OPEN_DAILY_CAP > 1 && Number.isInteger(FREE_OPEN_DAILY_CAP));
check('FREE_OPEN_WINDOW_HOURS is a sane rolling window (not zero, not absurdly long)', FREE_OPEN_WINDOW_HOURS > 0 && FREE_OPEN_WINDOW_HOURS <= 168);
check('FREE_OPEN_REQUEST_HEADER matches the header the Pocket client actually sends', FREE_OPEN_REQUEST_HEADER === 'x-obs-free');

console.log(`\nfree-open: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
