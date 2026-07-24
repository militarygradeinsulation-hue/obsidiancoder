## Wire 21st.dev component library into build generation

Goal: when a user asks for a landing page / dashboard / pricing section / etc., Obsidian queries 21st.dev's component API for a few polished shadcn/Tailwind components matching the request and injects their code into the model's system context. The model then adapts those real components instead of writing generic markup — same fix pattern as the Leonardo image work.

## 1. Store the API key

- Save `TWENTYFIRST_API_KEY = 21st_sk_40804a…aada` via `set_secret` (value is already in chat, no user form needed).

## 2. New server helper: `src/lib/twentyfirst.server.ts`

Server-only wrapper around 21st.dev's component search endpoint (`https://api.21st.dev/v1/components/search` — auth via `Authorization: Bearer <key>`). Exports:

- `searchComponents(query: string, opts?: { limit?: number; signal?: AbortSignal }) → Promise<ComponentHit[]>` returning `{ name, description, code, previewUrl, tags }[]`.
- Silent-fail on 4xx/5xx/timeout (returns `[]`) so it never blocks a build.
- 4-second per-call timeout via `aiFetch` with breaker key `21st/search`.
- In-memory LRU cache (60 entries, 10-minute TTL) keyed by normalized query — component catalogs change slowly and prompts repeat.

## 3. Component-planning phase in `src/routes/api/generate.ts`

Mirrors the existing `planAndGenerateImages` flow:

- New helper `planAndFetchComponents(apiKey, prompt, currentHtml, requestId, signal)`.
- Runs in parallel with `planAndGenerateImages` inside `Promise.all` so it adds zero wall-clock latency.
- Uses `google/gemini-3.1-flash-lite` to convert the user prompt into up to **3 short component queries** (e.g. `["hero section with app screenshot", "3-tier pricing table", "testimonial grid"]`). Returns `{"queries":[]}` when the prompt is a small tweak, dashboard-only, or clearly non-UI.
- Gate: skip the planner entirely when `data.currentHtml` is non-empty AND the prompt looks like an edit (`add`, `change`, `fix`, `remove`, `update` at word start) — component library helps first-build variety, not micro-edits.
- Calls `searchComponents` for each query in parallel, keeps the top hit per query.
- Returns `{ components: ComponentHit[], planUsage: UsageRecord | null }` (no per-fetch usage record — 21st.dev is flat-rate for us).

## 4. Inject into the model call

Where the request currently builds the messages array for the streaming chat call, append one extra system message when components come back:

```text
REFERENCE COMPONENTS (adapt into a single cohesive design — do not copy 1:1, restyle to match the amber/dark aesthetic; keep only what fits the user request):

// COMPONENT: <name> — <description>
<code>

// COMPONENT: ...
```

Cap total injected size at ~40 KB (truncate longest first) so it doesn't blow the context window on Gemini Flash Lite.

## 5. System prompt tweak

One-line addition to `SYSTEM_PROMPT`: "When REFERENCE COMPONENTS are provided in system context, adapt their structure and idioms into a single cohesive design; do not paste them verbatim, do not import external libraries, and inline any needed Tailwind or CSS."

Nothing else in the prompt changes.

## 6. Observability

- Add `X-Obs-Components` response header listing the component names actually injected (comma-separated, first 200 chars). Mirrors the existing `X-Obs-Image-Providers` header so `/demos` can show at a glance whether the library is firing.
- Log the query list + hit count via `console.info` on the server so `stack_modern--server-function-logs` shows real usage.

## 7. Failure behavior

- Missing key → helper returns `[]`, planner is skipped, build behaves exactly as it does today.
- 21st.dev 401 (key rejected) → log once, cache the failure for 5 minutes to avoid retry storms, treat as missing key.
- Any exception inside `planAndFetchComponents` → swallowed, return empty; the outer generation pipeline is untouched.

## 8. Verification

- `curl` the new `/api/generate` route with prompt `"a landing page for a coffee shop"` and confirm the response header `X-Obs-Components` names 2–3 real component ids.
- `stack_modern--server-function-logs` search=`21st` to confirm the search calls fire.
- Visually spot-check one generated build in Playwright vs. a build made before the change — the new one should have more polished hero/pricing/testimonial structure.

## Files touched

- `src/lib/twentyfirst.server.ts` (new)
- `src/routes/api/generate.ts` — add planner + inject system message + response header
- No schema changes, no new dependencies, no client-side changes
- Secret stored: `TWENTYFIRST_API_KEY`

## Explicitly NOT in this plan

- Manual browse/search panel in the sandbox UI (user picked the auto-injection option, not the inspiration-only one).
- Persistent per-build record of which components were used (can add later on `builds` table if useful).
- Rewriting the existing image pipeline.
