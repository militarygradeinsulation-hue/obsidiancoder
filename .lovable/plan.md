## Goal
Give Aetheris Obsidian access to every chat/text model available through the Lovable AI Gateway, so users can pick any of them and the auto-router can route to them.

## Changes

### 1. `src/lib/models.ts` — expand `MODEL_REGISTRY`
Add the full current chat catalog (keep `google/gemini-3.1-flash-lite` as `DEFAULT_MODEL` for speed). New entries, grouped for the picker label:

- Google (current): `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3.1-pro-preview`
- Google (prior/preview): `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`
- OpenAI GPT-5.6 (current): `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol`
- OpenAI GPT-5.5 / 5.4 (current): `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`
- OpenAI GPT-5 / 5.2 (prior): `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.2`

`ALLOWED_MODEL_IDS` and `MODEL_PICKER_OPTIONS` regenerate from this array, so no other change is needed there.

### 2. `src/lib/model-router.ts` — refresh tier preferences
Update `TIER_PREFERENCE` to use the strongest current models per tier:
- economy: `gemini-3.1-flash-lite`, `gpt-5.4-nano`, `gpt-5.6-luna`
- balanced: `gemini-3.5-flash`, `gpt-5.6-terra`, `gpt-5.4-mini`
- advanced: `gpt-5.6-sol`, `gemini-3.1-pro-preview`, `gpt-5.5`, `gemini-2.5-pro`

### 3. `src/lib/aetheris.functions.ts` — GPT-5.6 reasoning guard
The current code sends `reasoning_effort: "none"` only for `openai/gpt-5.6*`. That stays correct; no change needed. Confirm the same guard exists in `src/routes/api/generate.ts` and `src/routes/api/patch.ts`; if either omits it, add the same conditional so 5.6 calls don't 400.

### 4. No UI change required
The model picker in `src/routes/index.tsx` already renders from `MODEL_PICKER_OPTIONS`, so all new models appear automatically under the existing "Automatic" + list.

## Out of scope
- Image, TTS, embeddings models (image gen already wired via `google/gemini-3.1-flash-image`; leave as-is unless asked).
- Fast-mode / `service_tier: "priority"` — separate follow-up if you want it.
