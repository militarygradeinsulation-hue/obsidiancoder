import {
  buildProviderChain,
  runProviderChain,
  computeAttemptBudgetMs,
  chainFailureMessage,
  ATTEMPT_BUDGET_FLOOR_MS,
  type ChainAttempt,
  type ChainAttemptResult,
} from '../provider-chain';
import { markRouteLLMKeyDead } from '../routellm-keys';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
};

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ---------- non-billing error still advances the chain ----------
console.log('\nnon-billing errors advance the chain (not just billing-shaped ones)');

const mkAttempt = (label: string, routed = false): ChainAttempt => ({
  key: `key-${label}`, url: `https://example/${label}`, wireModel: 'm', label, routed,
});

async function runSequence(
  attempts: ChainAttempt[],
  results: Array<ChainAttemptResult<string>>,
) {
  let i = 0;
  const calls: string[] = [];
  const outcome = await runProviderChain(attempts, async (a) => {
    calls.push(a.label);
    const r = results[i++];
    return r;
  });
  return { outcome, calls };
}

{
  // First attempt fails with a plain timeout (NOT billing-shaped), second succeeds.
  const attempts = [mkAttempt('a', true), mkAttempt('b')];
  const { outcome, calls } = await runSequence(attempts, [
    { ok: false, error: new Error('upstream timeout after 4000ms') },
    { ok: true, value: 'ok-from-b' },
  ]);
  check('advances past a non-billing timeout to the next attempt', calls.length === 2 && calls[1] === 'b');
  check('succeeds using the second attempt', outcome.ok && outcome.value === 'ok-from-b');
  check('reports the second attempt as used', outcome.usedAttempt?.label === 'b');
}

{
  // A 500 (also not billing-shaped) on attempt 1 of 3 should still reach attempt 3.
  const attempts = [mkAttempt('a', true), mkAttempt('b', true), mkAttempt('c')];
  const { outcome, calls } = await runSequence(attempts, [
    { ok: false, error: new Error('502 Bad Gateway') },
    { ok: false, error: new Error('circuit_open') },
    { ok: true, value: 'ok-from-c' },
  ]);
  check('a 5xx then a breaker-open both advance the chain', calls.length === 3);
  check('reaches the final (working) attempt', outcome.ok && outcome.usedAttempt?.label === 'c');
}

{
  // Client cancel stops immediately — does not burn the rest of the chain.
  const attempts = [mkAttempt('a', true), mkAttempt('b')];
  const { outcome, calls } = await runSequence(attempts, [
    { ok: false, error: new Error('cancelled'), isClientCancel: true },
    { ok: true, value: 'should-not-be-called' },
  ]);
  check('client cancel does not advance to the next attempt', calls.length === 1);
  check('client cancel result is not ok', !outcome.ok);
}

{
  // Every attempt fails, none is a real cancel — chain gives up honestly.
  const attempts = [mkAttempt('a'), mkAttempt('b')];
  const { outcome } = await runSequence(attempts, [
    { ok: false, error: new Error('timeout') },
    { ok: false, error: new Error('timeout') },
  ]);
  check('gives up cleanly once every attempt has failed', !outcome.ok && outcome.usedAttempt === null);
  check('preserves the last error for message-building', outcome.lastError instanceof Error);
}

// ---------- budget slicing reaches the final attempt ----------
console.log('\nbudget slicing reaches the final attempt');

{
  // 3 attempts, one already burned most of a 32s budget on a slow failure —
  // the remaining two must still get a usable, non-zero slice each, and
  // the arithmetic must never exceed the floor-respecting bound.
  const total = 32_000;
  const afterFirstFailureRemaining = 6_000; // attempt 1 alone ate 26s
  const b2 = computeAttemptBudgetMs(afterFirstFailureRemaining, 2, ATTEMPT_BUDGET_FLOOR_MS, total);
  check('mid-chain slice never drops below the floor', b2 >= ATTEMPT_BUDGET_FLOOR_MS);
  check('mid-chain slice is a real fraction of what remains, not the full original budget', b2 < total);

  const afterSecondFailureRemaining = Math.max(0, afterFirstFailureRemaining - b2);
  const b3 = computeAttemptBudgetMs(afterSecondFailureRemaining, 1, ATTEMPT_BUDGET_FLOOR_MS, total);
  check('final attempt still gets at least the floor even when almost no time is left', b3 >= ATTEMPT_BUDGET_FLOOR_MS);
}

{
  // Plenty of time left, 3 attempts — should divide roughly evenly, not
  // hand every attempt the full remaining budget (the original bug).
  const b = computeAttemptBudgetMs(30_000, 3, ATTEMPT_BUDGET_FLOOR_MS, 32_000);
  check('even split when time is abundant', b === 10_000);
}

{
  // A single remaining attempt gets everything that's left, capped by budgetMs.
  const b = computeAttemptBudgetMs(9_000, 1, ATTEMPT_BUDGET_FLOOR_MS, 32_000);
  check('last attempt gets the full remaining slice', b === 9_000);
}

{
  // Never exceeds the caller's own budget ceiling even if remaining time
  // looks larger (defends the two-layer primary/fallback split upstream).
  const b = computeAttemptBudgetMs(50_000, 1, ATTEMPT_BUDGET_FLOOR_MS, 16_000);
  check('never exceeds the caller-supplied budget cap', b === 16_000);
}

// ---------- Chain order: ChatLLM -> OpenAI -> Gemini ----------
console.log('\nchain construction follows ChatLLM -> OpenAI -> Gemini');

withEnv({ GOOGLE_AI_API_KEY: 'test-google-key' }, () => {
  const attempts = buildProviderChain('routellm/claude-sonnet-5', 'lovable-key');
  check('Google is the LAST attempt', attempts[attempts.length - 1]?.google === true);
  check('an OpenAI gateway attempt comes before Google', attempts.some((a) => a.wireModel.startsWith('openai/')));
});

withEnv({ GOOGLE_AI_API_KEY: undefined }, () => {
  const attempts = buildProviderChain('routellm/claude-sonnet-5', 'lovable-key');
  check('no Google attempt when no Google key is configured', !attempts.some((a) => a.google));
});

withEnv({ GOOGLE_AI_API_KEY: 'test-google-key' }, () => {
  const attempts = buildProviderChain('openai/gpt-5.4-mini', 'lovable-key');
  check('a non-RouteLLM model still reaches the Google fallback last', attempts[attempts.length - 1]?.google === true);
  check('the requested model itself is still reachable', attempts.some((a) => a.wireModel === 'openai/gpt-5.4-mini'));
});

{
  const attempts = buildProviderChain('routellm/claude-sonnet-5', undefined);
  check('no crash and no Lovable attempt when no Lovable key is available', !attempts.some((a) => a.url.includes('lovable')));
}

// ---------- honest failure messages ----------
console.log('\nhonest failure messages distinguish billing exhaustion from a dead chain');

{
  const attempts = [mkAttempt('a', true)];
  markRouteLLMKeyDead(attempts[0].key);
  const outcome = { ok: false, value: null, usedAttempt: null, lastError: new Error('No remaining credits on this account'), noAttempts: false };
  const { billing, message } = chainFailureMessage(outcome as never, attempts, 'No remaining credits on this account');
  check('billing exhaustion is flagged as billing', billing === true);
  check('billing message names the provider', message.includes('a'));
}

{
  const attempts = [mkAttempt('a'), mkAttempt('b')];
  const outcome = { ok: false, value: null, usedAttempt: null, lastError: new Error('502'), noAttempts: false };
  const { billing, message } = chainFailureMessage(outcome as never, attempts, '502 Bad Gateway');
  check('a non-billing multi-attempt failure is not flagged as billing', billing === false);
  check('multi-attempt failure message says every provider failed', message.includes('Every configured AI provider failed'));
  check('message names the last provider tried', message.includes('b'));
}

{
  const attempts = [mkAttempt('solo')];
  const outcome = { ok: false, value: null, usedAttempt: null, lastError: new Error('502'), noAttempts: false };
  const { message } = chainFailureMessage(outcome as never, attempts, '502');
  check('single-attempt failure message does not claim "every provider" for just one', !message.includes('Every configured'));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
