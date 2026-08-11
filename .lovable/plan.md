# Fix Obsidian Vibe build quality

Pocket produces high-end 21st.dev-grade pages; Vibe does not — even though both now share the same creative engine. I traced the actual differences in the code and the live providers.

## What I verified

- Providers are healthy. Two ChatLLM/Abacus keys answer with Claude Sonnet 4.5; a full "luxury landing page" request returned a 56 KB, complete document (`finish_reason: stop`) in ~1-3 minutes. One of the three keys returns 402 (no payment method) and is being tried on every build until its 30-minute dead-key TTL kicks in.
- Pocket sends `pickerModel: "auto"` and a profile-resolved Claude model (`pocketPickerModel`, `src/routes/pocket.tsx:349`). Vibe sends `pickerModel: current.model` (default `"fast"`), which the generate route reads as a user-pinned model (`src/routes/api/generate.ts:1030`) and which also makes Vibe drop its Claude art model whenever the picker holds any `vendor/model` id (`src/routes/index.tsx:2390`).
- Vibe routes requests through the classifier + adaptive router first (`src/routes/index.tsx:1920`), which prefers fast-tier models and can pick a deterministic-edit or AI-patch path instead of a full premium generation. Pocket always runs the full generation.
- Vibe stacks extra system messages Pocket never sends — design contract, theme blueprint, reusable component markup, project memory — around the premium Design DNA block, so the "be original, no generic three-card row" instruction competes with generic reference markup.
- The design floor is advisory-only for style problems (from the earlier regression fix), and the corrective pass escalates a Claude build to `google/gemini-3.1-pro-preview` (`src/lib/quality-retry.ts:32`) — a sideways/downward move, not a stronger retry.

## The fix

**1. Make Vibe's fresh-build path identical to Pocket's**
When there is no existing HTML (or the prompt is clearly a build request), skip the classifier's deterministic/AI-patch shortcuts and run the full premium generation with the profile-resolved Claude model. Edits keep today's fast patch path.

**2. Stop losing the Claude art model**
Reuse Pocket's `pocketPickerModel` logic in Vibe: send the resolved model as `model` and `"auto"` as `pickerModel` unless the user genuinely pinned one from the picker. This restores server-side fallback behaviour and keeps profile-managed builds on the strongest available Claude.

**3. Clean up the prompt stack for `surface: "vibe"`**
On fresh premium builds: drop the reusable-component markup injection, keep the design contract/blueprint only when the user set one, and always place the Design DNA + Aetheris visual standard last so they are authoritative. Trim chat history sent along with a fresh build.

**4. Real quality gate with a real escalation**
Keep truncation as the only hard blocker, but for a *fresh* build that trips the style floor, run the one corrective pass on a genuinely stronger model — Claude Opus via ChatLLM when the build ran on Claude, instead of jumping to a Gemini id.

**5. Provider hygiene**
Mark a 402 "valid payment method required" response as key-exhaustion so the dead key is skipped immediately instead of burning the first attempt of each build.

**6. Verify**
Add self-tests for: fresh Vibe build selects the premium full-generation path; `pickerModel` is `"auto"` for profile-managed builds; escalation from a Claude model stays on Claude; 402 marks a key dead. Then run one real Vibe build end-to-end in the preview and compare against a Pocket build of the same prompt.

## Technical notes

Files touched: `src/routes/index.tsx` (build path selection, model/pickerModel payload), `src/routes/api/generate.ts` (vibe-surface prompt stack ordering), `src/lib/quality-retry.ts` (escalation table), `src/lib/routellm-keys.ts` (402 detection), `src/lib/__tests__/selftest.mts`. No database, auth, or pricing changes. Extra model calls only fire when a fresh build actually fails the floor.
