# Make the provider fallback actually hold up

## What's there today (verified in the code)

The main build route does have a fallback chain. For each build it queues:

1. Google (Gemini) with your Google key
2. Every healthy ChatLLM/Abacus key, in priority order
3. The Lovable gateway (this is where OpenAI/GPT models come from — there is no separate OpenAI key in the project; OpenAI is reachable only through the Lovable gateway)

So the design you remember is real. Three things stop it from working the way you expect.

## Why it still fails

**1. Only a billing error moves to the next provider.** After the Google attempt, the chain advances only when the error text looks like "no credits / unauthorized / quota". A ChatLLM key that times out, returns a 500, or is blocked by the circuit breaker ends the whole request instead of trying the Lovable gateway. That surfaces as "Upstream did not respond in time."

**2. The time budget is shared but handed out whole.** Each attempt is given the full 32s open budget, while the request as a whole must produce a first byte within 55s. Two slow attempts eat the deadline before the third provider is ever dialed, so the last (working) provider never runs.

**3. The other AI surfaces don't have the chain.** Patch (`/api/patch`), QA (`/api/qa`), and build chat still resolve a single ChatLLM key with no Google step, so those features die when Abacus is out of credits even though builds now survive.

## The fix

1. **Chain on any failure, not just billing.** In the build route, advance to the next attempt for any error except a client cancel. Keep marking a key dead only when the error really is credit exhaustion, so the 30-minute dead-key skip stays accurate.
2. **Slice the budget across attempts.** Compute each attempt's timeout from the remaining first-response deadline divided by the attempts left (with a sane floor), so the chain always reaches the last provider before the deadline.
3. **Give Patch, QA, and build chat the same chain** — Google first, then healthy ChatLLM keys, then the Lovable equivalent model — reusing the existing helpers rather than new per-route logic.
4. **Honest error text.** Distinguish "every provider failed" from "credits exhausted at one provider," and name the provider that failed last.
5. Run the self-test suite and report the pass count.

## Technical detail

- `src/routes/api/generate.ts`: rework the `openStream` attempt loop (~line 1079) — replace the `exhausted` gate with cancel-only bail, derive per-attempt `totalTimeoutMs` from `remainingFirstResponseMs()` and `attempts.length - i`.
- `src/routes/api/patch.ts`: prepend a Google attempt to the chain built at ~line 160, switch `routellmKeys()` to `healthyRouteLLMKeys()`, mark dead keys.
- `src/routes/api/qa.ts` and `src/lib/build-chat.functions.ts`: same chain via a small shared helper instead of `routellmKey()` alone.
- New assertions in `src/lib/__tests__/selftest.mts` covering: non-billing error still advances the chain, budget slicing reaches the final attempt, and Patch/QA prefer Google when a Google key is set.

## Note

None of this restores Claude/Opus — those only exist on the Abacus account, which needs credits. Everything else runs on Gemini plus the Lovable gateway (GPT-5.x, Gemini). If you'd rather add a direct OpenAI key as a fourth provider, say so and I'll add that step.
