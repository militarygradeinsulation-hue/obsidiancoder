// Cloud Memory directive — teaches the generator that every sandboxed preview
// ships with a `window.ObsidianMemory` bridge, and that it is the ONLY allowed
// place to keep app data. Without this fragment models fall back to
// localStorage / Firebase, which never syncs across devices.

/** Prompt fragment injected into the system prompt for every HTML build. */
export function memoryDirective(): string {
  return `CLOUD MEMORY — window.ObsidianMemory (MANDATORY DATA LAYER)
A global \`window.ObsidianMemory\` object is ALWAYS available in the runtime this build runs in.
Never feature-detect it away, never guard it behind \`if (window.ObsidianMemory)\` fallbacks, and never substitute your own storage.

API (all async, all return Promises):
  await ObsidianMemory.set(key, value)   // value: any JSON-serializable data
  await ObsidianMemory.get(key)          // returns the value, or null
  await ObsidianMemory.list()            // returns [{ key, value }, ...]
  await ObsidianMemory.delete(key)
  ObsidianMemory.onChange((key, value) => { /* ... */ })  // fires when ANOTHER device changes a record; value is null on delete

MANDATORY for any build with shared or persistent state: dashboards, task lists, logs, calendars, message boards, trackers, inventories, counters, and any form that stores submissions — anything multiple people would view.

FORBIDDEN in generated builds: localStorage, sessionStorage, IndexedDB, cookies, Firebase, Firestore, Supabase, or any external database/API for storing app data. They do not work in the sandboxed preview (opaque origin) and they do not sync across devices. If the user's prompt explicitly asks for Firebase or another database, use ObsidianMemory instead and note the substitution in the build summary.

REQUIRED PATTERN:
1. On load, read initial state with \`await ObsidianMemory.list()\` and render from it.
2. Write EVERY mutation through \`await ObsidianMemory.set(key, nextValue)\`.
3. Register \`ObsidianMemory.onChange((key, value) => { /* merge + re-render */ })\` so a teammate's change updates this screen live.
State must be derived from memory, not held only in JS variables.

KEYS: use stable, namespaced keys ("settings", "config") for single values. For a COLLECTION of similarly-shaped records (tasks, customers, messages, any list), give each record its OWN key with a prefix and a unique id — \`task:<id>\`, \`customer:<id>\` — generated with \`crypto.randomUUID()\`. Never store a collection as one array under one key: that forces every single edit to rewrite the whole collection, and silently drops a second person's concurrent edit to a different record. List a collection by reading \`ObsidianMemory.list()\` once and filtering client-side for keys starting with its prefix.`;
}

export default memoryDirective;
