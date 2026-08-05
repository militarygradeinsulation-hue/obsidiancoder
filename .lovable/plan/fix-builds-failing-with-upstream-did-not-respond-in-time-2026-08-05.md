# Fix: builds failing with "Upstream did not respond in time"

## What's actually wrong

Two separate problems, both confirmed in the live server logs from your last attempts:

1. **The ChatLLM (Abacus) account is out of credits.** Every call to it returns
   `{"success": false, "error": "You have no remaining credits to use the LLM apis."}`.
   All three configured keys fail the same way, and the app retries each one on every build.
2. **The time budget is far too small.** The generator gives the whole provider chain
   only ~6 seconds to produce a first byte, with a 17-second hard ceiling for the
   request. Between the dead ChatLLM keys and a long build prompt, that ceiling is hit
   before the working provider can answer — which surfaces as
   "Upstream did not respond in time."

The Google (Gemini) key is fine: I tested it directly and it answered in 2.4s with HTTP 200.
So there is a working provider; the app just never gets far enough to use it.

## The fix

**1. Stop wasting time on dead ChatLLM keys**
Remember, per server process, any key that reported "no remaining credits" and skip it
for the rest of that process (with a short expiry so a topped-up account recovers
automatically). No behaviour change once credits are restored.

**2. Raise the time budgets**
First-response ceiling 17s → 55s, primary open budget 6s → 32s, fallback 16s. These are
first-byte budgets only; once streaming starts nothing changes.

**3. Let Obsidian Pocket use Google too**
Pocket's planning/critique calls currently only know about ChatLLM and the Lovable
gateway, so they die immediately with the credit error. Add Google as the first choice
there, matching the main build path.

**4. Clearer error message**
When every provider fails for a billing reason, say "AI provider credits exhausted"
instead of a generic timeout, so this is obvious next time.

## Technical detail

- `src/lib/routellm-keys.ts` — add `markRouteLLMKeyDead(key)` / `healthyRouteLLMKeys()`
  (in-memory, ~30 min TTL).
- `src/routes/api/generate.ts` — build the attempt chain from `healthyRouteLLMKeys()`;
  mark a key dead when `isRouteLLMKeyExhausted(err)`; update the four budget constants
  and the derived `remainingFirstResponseMs()` subtractions.
- `src/lib/pocket-studio-call.ts` — add a `google` provider route (Gemini
  OpenAI-compatible endpoint, model via `googleModelFor`) as the first choice in
  `chooseRoute`, keeping the one-dispatch-per-call contract.
- Self-test suite updated and run at the end; report the pass count.

## Note on credits

The code fix routes around the dead ChatLLM keys, but if you want Claude/Opus models
specifically, the Abacus account needs credits topped up. Everything will run on Gemini
plus the Lovable gateway until then.
