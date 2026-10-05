import { directStripeSecret } from '../stripe.server';
let pass = 0, fail = 0;
const check = (n: string, c: boolean) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}`); } };
const K = ['STRIPE_SECRET_KEY', 'STRIPE_SANDBOX_SECRET_KEY'];
function withEnv(v: Record<string, string>, fn: () => void) {
  const saved: Record<string, string | undefined> = {}; for (const k of K) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, v); try { fn(); } finally { for (const k of K) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]!; } }
}
console.log('\nstripe-direct: direct mode only with a real secret key');
withEnv({}, () => check('no key: connector path (Lovable) is used', directStripeSecret('live') === undefined && directStripeSecret('sandbox') === undefined));
withEnv({ STRIPE_SECRET_KEY: 'sk_live_abc123' }, () => {
  check('live sk_live_ key enables direct mode for live', directStripeSecret('live') === 'sk_live_abc123');
  check('live key does not leak into sandbox', directStripeSecret('sandbox') === undefined);
});
withEnv({ STRIPE_SANDBOX_SECRET_KEY: 'sk_test_xyz' }, () => check('sandbox sk_test_ key enables direct sandbox', directStripeSecret('sandbox') === 'sk_test_xyz'));
withEnv({ STRIPE_SECRET_KEY: 'rk_live_restricted' }, () => check('restricted rk_ keys are accepted', directStripeSecret('live') === 'rk_live_restricted'));
withEnv({ STRIPE_SECRET_KEY: 'conn_lovable_whatever' }, () => check('a non-Stripe value (e.g. a connector key) never triggers direct mode', directStripeSecret('live') === undefined));
withEnv({ STRIPE_SECRET_KEY: 'pk_live_publishable' }, () => check('a publishable key is rejected as a secret', directStripeSecret('live') === undefined));
withEnv({ STRIPE_SECRET_KEY: '  sk_live_padded  ' }, () => check('surrounding whitespace is trimmed', directStripeSecret('live') === 'sk_live_padded'));
console.log(`\nstripe-direct: ${pass} passed, ${fail} failed\n`); if (fail > 0) process.exit(1);
