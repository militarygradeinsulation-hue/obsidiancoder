# Cloud Memory (`window.ObsidianMemory`)

Cloud Memory is how a generated build stores state that survives reloads and
syncs across devices and teammates. Generated builds must use it for **all**
persistent state.

## The API (injected into every preview iframe)

```js
await ObsidianMemory.set(key, value)  // value: any JSON-serializable data
await ObsidianMemory.get(key)         // value, or null
await ObsidianMemory.list()           // [{ key, value }, ...]
await ObsidianMemory.delete(key)      // true
ObsidianMemory.onChange((key, value) => { /* re-render */ })
```

- All calls are async.
- `onChange` fires when **another** device changes a record; `value` is `null`
  on delete.
- Register `onChange` **before** first render, and hydrate initial state with
  `list()`/`get()` on load.

## Never use in generated builds

`localStorage`, `sessionStorage`, `IndexedDB`, cookies, Firebase, Firestore,
Supabase, or any external database SDK.

Builds run inside a **sandboxed, opaque-origin iframe**: browser storage APIs
throw, external SDKs frequently fail to initialize (blank page), and none of
them sync across devices. If a user asks for Firebase/Supabase, silently use
ObsidianMemory instead and don't mention the external service in the output.

## Where the wiring lives

| Concern | File |
| --- | --- |
| Bridge injected into the iframe (`get/set/delete/list/onChange`) | `src/lib/runtime-bridge.ts` |
| Host side: owner Realtime subscription on `build_memory`, teammate polling + diffing, pushing `memoryChanged` into the frame | `src/hooks/useCloudMemoryHost.ts` |
| Read/write API + team-code unlock | `src/routes/api/memory.ts` |
| Hashing, default team code, key rules | `src/lib/build-memory.ts` |
| Sync row / revision / `cloud_memory` flag | `src/lib/project-sync.server.ts` |
| UI toggle | `src/components/CloudMemoryButton.tsx` |

Storage table: `public.build_memory` (`project_id`, `owner_id`, `key`,
`value` jsonb), one row per key per project.

## Prompting the model

`src/lib/memory-director.ts` is a deterministic, regex-based director (same
pattern as `theme-director.ts`, no AI call, no per-build cost):

- `memoryDirectiveFor(prompt)` → `{ needed, correcting, directive }`.
  `needed` when the prompt implies shared/persisted state; `correcting` when it
  names an unsupported backend (Firebase, Supabase, localStorage, ...).
- `detectForbiddenStorage(html)` → list of forbidden APIs found in the output
  (telemetry only; never blocks a build).
- `usesMemorySubscription(html)` → whether the build actually calls
  `onChange`, not just `set`.

It is injected in `src/routes/api/generate.ts` next to the theme directive, so
both the Coder and Pocket surfaces get it (they share the generation path).

## Enabling

Saving a build to cloud enables `cloud_memory` **by default** and provisions the
default team code. It is a default, not a lock: an owner can still turn it off
or set their own team code, and a configured row is never overwritten
(`team_code_hash IS NULL` guard in `touchProjectSync`).
