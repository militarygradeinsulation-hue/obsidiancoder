// Per-build discussion state ("Discuss this build").
//
// Pure, client-safe, browser/session-local. Each build/tab owns its own
// discussion; nothing here talks to the network, the database, or auth.
// Everything that enters the state passes through `normalizeBuildDiscussion`
// so a malformed or oversized payload can never poison a session.

export const BUILD_DISCUSSION_VERSION = 1;

export const DISCUSSION_LIMITS = {
  maxMessages: 60,
  maxConfirmed: 40,
  maxContentChars: 10_000,
  maxSuggestionChars: 400,
} as const;

export type DiscussionRole = "user" | "assistant";
export type DiscussionProvider = "claude" | "grok" | "auto";

export type DiscussionMessage = {
  role: DiscussionRole;
  content: string;
  revisionId?: string;
  ts?: number;
};

export type BuildDiscussionState = {
  v: number;
  messages: DiscussionMessage[];
  confirmed: string[];
  provider: DiscussionProvider;
  lastProvider?: string;
};

export const EMPTY_BUILD_DISCUSSION: BuildDiscussionState = {
  v: BUILD_DISCUSSION_VERSION,
  messages: [],
  confirmed: [],
  provider: "claude",
};

const PROVIDERS: DiscussionProvider[] = ["claude", "grok", "auto"];

function clampText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function normalizeMessage(input: unknown): DiscussionMessage | null {
  if (!input || typeof input !== "object") return null;
  const m = input as Partial<DiscussionMessage>;
  if (m.role !== "user" && m.role !== "assistant") return null;
  const content = clampText(m.content, DISCUSSION_LIMITS.maxContentChars);
  if (content === null) return null;
  const out: DiscussionMessage = { role: m.role, content };
  const rev = clampText(m.revisionId, 64);
  if (rev) out.revisionId = rev;
  if (typeof m.ts === "number" && Number.isFinite(m.ts) && m.ts > 0) out.ts = Math.floor(m.ts);
  return out;
}

export function normalizeMessages(input: unknown): DiscussionMessage[] {
  if (!Array.isArray(input)) return [];
  const out: DiscussionMessage[] = [];
  for (const raw of input) {
    const m = normalizeMessage(raw);
    if (m) out.push(m);
  }
  return out.slice(-DISCUSSION_LIMITS.maxMessages);
}

export function normalizeConfirmed(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    const s = clampText(raw, DISCUSSION_LIMITS.maxSuggestionChars);
    if (s) seen.add(s);
  }
  return Array.from(seen).slice(-DISCUSSION_LIMITS.maxConfirmed);
}

export function normalizeBuildDiscussion(input: unknown): BuildDiscussionState {
  if (!input || typeof input !== "object") return { ...EMPTY_BUILD_DISCUSSION };
  const d = input as Partial<BuildDiscussionState>;
  const provider = PROVIDERS.includes(d.provider as DiscussionProvider)
    ? (d.provider as DiscussionProvider)
    : "claude";
  const lastProvider = clampText(d.lastProvider, 64);
  const out: BuildDiscussionState = {
    v: BUILD_DISCUSSION_VERSION,
    messages: normalizeMessages(d.messages),
    confirmed: normalizeConfirmed(d.confirmed),
    provider,
  };
  if (lastProvider) out.lastProvider = lastProvider;
  return out;
}

/** Bounded merge — every write path goes through here. */
export function updateBuildDiscussion(
  current: BuildDiscussionState | undefined,
  patch: Partial<BuildDiscussionState>,
): BuildDiscussionState {
  const base = normalizeBuildDiscussion(current);
  return normalizeBuildDiscussion({ ...base, ...patch });
}

export function appendDiscussionMessages(
  current: BuildDiscussionState | undefined,
  messages: DiscussionMessage[],
): BuildDiscussionState {
  const base = normalizeBuildDiscussion(current);
  return updateBuildDiscussion(base, { messages: [...base.messages, ...messages] });
}

export function toggleConfirmedSuggestion(
  current: BuildDiscussionState | undefined,
  suggestion: string,
): BuildDiscussionState {
  const base = normalizeBuildDiscussion(current);
  const s = (suggestion ?? "").trim();
  if (!s) return base;
  const next = base.confirmed.includes(s)
    ? base.confirmed.filter((x) => x !== s)
    : [...base.confirmed, s];
  return updateBuildDiscussion(base, { confirmed: next });
}

export function clearBuildDiscussion(current?: BuildDiscussionState): BuildDiscussionState {
  const provider = normalizeBuildDiscussion(current).provider;
  return { ...EMPTY_BUILD_DISCUSSION, provider };
}

export function isDiscussionEmpty(d: BuildDiscussionState | undefined): boolean {
  const n = normalizeBuildDiscussion(d);
  return n.messages.length === 0 && n.confirmed.length === 0;
}

// ---------------------------------------------------------------------------
// One-time migration of the legacy global discussion into the active build.
// ---------------------------------------------------------------------------

export const LEGACY_HISTORY_KEY = "obs.build-chat.history.v3";
export const LEGACY_CONFIRMED_KEY = "obs.build-chat.confirmed.v2";
export const DISCUSSION_MIGRATION_KEY = "obs.build-chat.migrated.v4";
export const LEGACY_STALE_KEYS = ["obs.build-chat.history.v2", "obs.build-chat.confirmed.v1"];

/** Minimal storage shape so tests can inject a fake or a throwing store. */
export type DiscussionStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

function browserStore(): DiscussionStore | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson(store: DiscussionStore, key: string): unknown {
  try {
    const raw = store.getItem(key);
    if (raw == null) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function isDiscussionMigrated(store?: DiscussionStore | null): boolean {
  const s = store ?? browserStore();
  if (!s) return true; // no storage → nothing to migrate, never retry
  try {
    return s.getItem(DISCUSSION_MIGRATION_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * Read the legacy global discussion, if any. Returns null when there is
 * nothing usable to import. Never throws.
 */
export function readLegacyDiscussion(store?: DiscussionStore | null): BuildDiscussionState | null {
  const s = store ?? browserStore();
  if (!s) return null;
  const messages = normalizeMessages(readJson(s, LEGACY_HISTORY_KEY));
  const confirmed = normalizeConfirmed(readJson(s, LEGACY_CONFIRMED_KEY));
  if (messages.length === 0 && confirmed.length === 0) return null;
  return normalizeBuildDiscussion({ ...EMPTY_BUILD_DISCUSSION, messages, confirmed });
}

/** Marks migration done and drops the legacy + stale global keys. Never throws. */
export function finishDiscussionMigration(store?: DiscussionStore | null): void {
  const s = store ?? browserStore();
  if (!s) return;
  try {
    s.setItem(DISCUSSION_MIGRATION_KEY, "1");
  } catch {
    /* ignore */
  }
  for (const key of [LEGACY_HISTORY_KEY, LEGACY_CONFIRMED_KEY, ...LEGACY_STALE_KEYS]) {
    try {
      s.removeItem?.(key);
    } catch {
      /* ignore */
    }
  }
}
