import { resolvePocketPromoCap, POCKET_PROMO_CREDITS, POCKET_PROMO_ENDS_AT } from '../plans';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

const CUTOFF_MS = new Date(POCKET_PROMO_ENDS_AT).getTime();
const BEFORE = CUTOFF_MS - 1000;
const AFTER = CUTOFF_MS + 1000;

console.log('\npocket-promo: the happy path grants the promo cap');

check(
  'a genuinely new Pocket subscription, before the cutoff, gets the promo cap',
  resolvePocketPromoCap({ isNewSubscription: true, tierId: 'pocket', now: BEFORE }) === POCKET_PROMO_CREDITS,
);

console.log('\npocket-promo: every disqualifying reason is actually enforced');

check(
  'NOT a new subscription (renewal/update) never grants the promo, even before the cutoff',
  resolvePocketPromoCap({ isNewSubscription: false, tierId: 'pocket', now: BEFORE }) === undefined,
);
check(
  'the Vibe tier never gets the Pocket promo, even as a genuinely new subscription before the cutoff',
  resolvePocketPromoCap({ isNewSubscription: true, tierId: 'vibe', now: BEFORE }) === undefined,
);
check(
  'the Custom tier never gets the Pocket promo',
  resolvePocketPromoCap({ isNewSubscription: true, tierId: 'custom', now: BEFORE }) === undefined,
);
check(
  'an unresolvable tier (undefined, e.g. an unmapped price id) never grants the promo',
  resolvePocketPromoCap({ isNewSubscription: true, tierId: undefined, now: BEFORE }) === undefined,
);
check(
  'after the cutoff, a genuinely new Pocket subscription no longer gets the promo',
  resolvePocketPromoCap({ isNewSubscription: true, tierId: 'pocket', now: AFTER }) === undefined,
);
check(
  'exactly at the cutoff instant, the promo has already ended (inclusive-until semantics)',
  resolvePocketPromoCap({ isNewSubscription: true, tierId: 'pocket', now: CUTOFF_MS }) === undefined,
);
check(
  'one millisecond before the cutoff still qualifies',
  resolvePocketPromoCap({ isNewSubscription: true, tierId: 'pocket', now: CUTOFF_MS - 1 }) === POCKET_PROMO_CREDITS,
);
check(
  'both disqualifiers at once (not new AND wrong tier) still correctly returns undefined, not a false positive',
  resolvePocketPromoCap({ isNewSubscription: false, tierId: 'vibe', now: BEFORE }) === undefined,
);

console.log('\npocket-promo: the returned value is the real, current constant, not a stale copy');

check(
  'the granted cap is exactly POCKET_PROMO_CREDITS, not a hardcoded number that could drift from it',
  resolvePocketPromoCap({ isNewSubscription: true, tierId: 'pocket', now: BEFORE }) === 1000 &&
    POCKET_PROMO_CREDITS === 1000,
);

console.log(`\npocket-promo: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
