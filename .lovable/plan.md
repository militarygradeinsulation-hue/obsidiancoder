## Problem

Builds created with a `routellm/*` model (Claude Haiku/Sonnet/Opus, GPT‑4o, Gemini 2.5, Grok 4.3) fail to edit. The streaming builder and one‑shot generator were updated to switch endpoints/keys for RouteLLM, but the **patch/edit route (`src/routes/api/patch.ts`)** was never updated. It still hardcodes the Lovable gateway URL + `LOVABLE_API_KEY`, and sends the full `routellm/…` id (which Abacus rejects). It also short‑circuits with `ai_unauthorized` when `LOVABLE_API_KEY` is missing, even for RouteLLM edits.

## Fix

Update `src/routes/api/patch.ts` so edits use the same engine switching as `/api/generate`.

1. **`callGateway`** — accept the model id and pick endpoint + key:
   - If `isRouteLLMModel(model)`: POST to `https://routellm.abacus.ai/v1/chat/completions` with `Bearer ROUTELLM_API_KEY`, and send `stripRouteLLMPrefix(model)` as the `model` field. Drop `response_format` (Abacus/Grok don't guarantee support — rely on the strict JSON system prompt + existing repair pass).
   - Otherwise: keep current Lovable gateway path unchanged.
   - Update `breakerKey` and usage `provider` (`"routellm"` vs `"lovable"`) accordingly.

2. **POST handler** — replace the single `apiKey` guard:
   - Resolve `needsLovable` and `needsRouteLLM` from `data.model`.
   - Require the matching secret; return `ai_unauthorized` only when the one actually needed is missing.
   - Pass the appropriate key into `callGateway`.

3. **Repair pass** — keep `CHEAP_REPAIR_MODEL = "google/gemini-3.1-flash-lite"` (Lovable). If `LOVABLE_API_KEY` is not configured (pure RouteLLM setup), fall back to repairing on the same RouteLLM model instead of failing hard.

4. Import `isRouteLLMModel`, `stripRouteLLMPrefix` from `@/lib/models`.

No UI, schema, or billing‑shape changes. This is the minimum change to make edits work for RouteLLM‑generated builds while keeping the Lovable path identical.

## Verification

After the edit: select a RouteLLM model, generate a build, then request a small edit ("change the button text to Buy Now"). Confirm the patch route returns `ok:true` and the preview updates.
