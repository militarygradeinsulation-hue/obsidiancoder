// Memory director — deterministic Cloud Memory directive for generated builds.
//
// Problem this solves: the runtime bridge (src/lib/runtime-bridge.ts) injects
// `window.ObsidianMemory` into every preview iframe, and
// src/hooks/useCloudMemoryHost.ts syncs it (owner Realtime, teammate polling).
// But nothing ever told the generating model the API exists, so models reached
// for localStorage or an external DB (Firebase, Supabase) — neither of which
// works inside a sandboxed opaque-origin iframe, and neither of which syncs.
// Result: build_memory had zero rows across every build ever generated.
//
// Same pattern as theme-director.ts: pure, regex-based, no AI call, no cost.

export interface MemoryDirectiveResult {
  /** Whether the build implies shared or persisted state. */
  needed: boolean;
  /** True when the prompt explicitly asked for an unsupported backend. */
  correcting: boolean;
  /** Text to append to the generation system prompt. Empty when not needed. */
  directive: string;
}

/** Shapes that imply shared or persisted state and therefore need the bridge. */
const STATEFUL_PATTERNS: RegExp[] = [
  /\b(dashboard|kanban|board|tracker|log|ledger|register)\b/i,
  /\b(todo|to-do|task|checklist|punch\s?list|work\s?order)\b/i,
  /\b(chat|message|comment|thread|feed|inbox)\b/i,
  /\b(calendar|schedule|booking|appointment|roster|shift)\b/i,
  /\b(inventory|stock|asset|equipment|fleet)\b/i,
  /\b(crm|lead|pipeline|contact|customer\s?list)\b/i,
  /\b(form|intake|submission|request|ticket|application)\b/i,
  /\b(vote|poll|score|leaderboard|tally|counter)\b/i,
  /\b(note|journal|entry|entries|record|records)\b/i,
  /\b(save|saves|saved|persist|store|stored|remember|sync|synced|syncs|shared|share|collaborat\w*|real-?time|live-?updating|multi-?user|team)\b/i,
];

/** External storage the sandbox cannot support. */
const FORBIDDEN_STORAGE: RegExp[] = [
  /\bfirebase\b/i,
  /\bfirestore\b/i,
  /\bsupabase\b/i,
  /\bmongo(db)?\b/i,
  /\blocal\s?storage\b/i,
  /\bsession\s?storage\b/i,
  /\bindexed\s?db\b/i,
  /\bairtable\b/i,
  /\bpocketbase\b/i,
];

/**
 * Decide whether a prompt describes a build with shared state, and produce the
 * directive that forces that state through ObsidianMemory.
 */
export function memoryDirectiveFor(prompt: string): MemoryDirectiveResult {
  const p = typeof prompt === "string" ? prompt : "";
  const needed = STATEFUL_PATTERNS.some((re) => re.test(p));
  const correcting = FORBIDDEN_STORAGE.some((re) => re.test(p));
  if (!needed && !correcting) return { needed: false, correcting: false, directive: "" };
  return { needed: true, correcting, directive: buildDirective(correcting) };
}

function buildDirective(correcting: boolean): string {
  const correction = correcting
    ? `
CORRECTION — the request names an external backend (Firebase, Firestore, Supabase, Mongo, localStorage or similar). Ignore it. Do NOT use it, do NOT import its SDK, and do NOT mention that service anywhere in your output. Use ObsidianMemory instead and present it as the app's storage.`
    : "";

  return `CLOUD MEMORY — window.ObsidianMemory (MANDATORY DATA LAYER)
A global \`window.ObsidianMemory\` object is ALWAYS injected by the host before your code runs. Never feature-detect it away, never guard it behind an \`if (window.ObsidianMemory)\` fallback, and never substitute your own storage.

API (all async, all return Promises):
  await ObsidianMemory.set(key, value)   // value: any JSON-serializable data
  await ObsidianMemory.get(key)          // returns the value, or null
  await ObsidianMemory.list()            // returns [{ key, value }, ...]
  await ObsidianMemory.delete(key)       // returns true
  ObsidianMemory.onChange((key, value) => { /* re-render */ })  // fires when ANOTHER device changes a record; value is null on delete

RULES:
1. Every piece of persistent or shared state goes through ObsidianMemory. No exceptions.
2. Register \`ObsidianMemory.onChange\` BEFORE first render. A build that writes but never listens looks broken to a second viewer.
3. On load, read initial state with \`await ObsidianMemory.list()\` (or \`.get\`) and render from it. Never assume an empty start.
4. FORBIDDEN as storage: localStorage, sessionStorage, IndexedDB, cookies, Firebase, Firestore, Supabase, or any external database/API. The build runs inside a sandboxed, opaque-origin iframe: browser storage throws, external SDKs fail to initialize (often a blank page), and none of them sync across devices.
5. COLLECTIONS (a CRM's customers, a tracker's tasks, a board's cards, any list of similarly-shaped records): give each record its OWN key, namespaced with a stable prefix and a unique id -- \`customer:<id>\`, \`task:<id>\`, \`card:<id>\`. Never store a collection as one array under one key. This is the difference between a real system and a shell: with per-record keys, adding, editing, or deleting ONE record is a single isolated write that touches nothing else, and two people editing two different records can never clobber each other. With one array under one key, every edit reads the whole collection, mutates it, and writes the whole thing back -- and a second person's concurrent edit to a DIFFERENT record silently vanishes the moment your write lands after theirs.
6. SINGLE VALUES (one settings object, one running counter, one config) still use one plain key -- the per-record rule is specifically for collections.
7. Use \`crypto.randomUUID()\` for new record ids (available in the sandbox). Never reuse an array index as an id -- it is not stable once an item is removed.
8. List a collection by reading \`await ObsidianMemory.list()\` once and filtering client-side for keys starting with its prefix (e.g. \`key.startsWith("task:")\`). Keep that filtered list in local state and update it incrementally from \`onChange\` rather than re-filtering the whole list on every event.

WORKED EXAMPLE (task list -- collection, per-record keys):
  let tasks = {};  // id -> task, the in-memory mirror of every "task:<id>" record
  function render() { /* paint Object.values(tasks) */ }
  ObsidianMemory.onChange((key, value) => {
    if (!key.startsWith("task:")) return;
    const id = key.slice("task:".length);
    if (value === null) delete tasks[id]; else tasks[id] = value;
    render();
  });
  (async () => {
    for (const row of await ObsidianMemory.list()) {
      if (row.key.startsWith("task:")) tasks[row.key.slice("task:".length)] = row.value;
    }
    render();
  })();
  async function addTask(text) {
    const id = crypto.randomUUID();
    const task = { id, text, done: false, at: Date.now() };
    tasks[id] = task;             // paint immediately, don't wait on the round trip
    render();
    await ObsidianMemory.set("task:" + id, task);
  }
  async function toggleTask(id) {
    tasks[id] = { ...tasks[id], done: !tasks[id].done };
    render();
    await ObsidianMemory.set("task:" + id, tasks[id]);
  }
  async function removeTask(id) {
    delete tasks[id];
    render();
    await ObsidianMemory.delete("task:" + id);
  }

WORKED EXAMPLE (settings -- single value, one key):
  let settings = {};
  ObsidianMemory.onChange((key, value) => { if (key === "settings") { settings = value || {}; render(); } });
  (async () => { settings = (await ObsidianMemory.get("settings")) || {}; render(); })();
  async function saveSettings(next) { settings = next; render(); await ObsidianMemory.set("settings", settings); }
${correction}`.trim();
}

/**
 * Post-generation telemetry: which forbidden storage APIs the model reached for
 * despite the directive.
 */
export function detectForbiddenStorage(html: string): string[] {
  const found = new Set<string>();
  const checks: Array<[RegExp, string]> = [
    [/\blocalStorage\b/, "localStorage"],
    [/\bsessionStorage\b/, "sessionStorage"],
    [/\bindexedDB\b/i, "indexedDB"],
    [/firebase/i, "firebase"],
    [/firestore/i, "firestore"],
    [/supabase/i, "supabase"],
    [/document\.cookie/, "cookies"],
  ];
  for (const [re, label] of checks) if (re.test(html)) found.add(label);
  return [...found];
}

/** True when the build actually wired the change listener, not just writes. */
export function usesMemorySubscription(html: string): boolean {
  return /ObsidianMemory\s*\.\s*onChange/.test(html);
}

export default memoryDirectiveFor;
