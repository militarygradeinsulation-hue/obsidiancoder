// Local, per-account cache of VALID concept-planner results.
//
// Purpose: skip a repeat paid planner call when the exact same planner prompt,
// model and policy version were already answered for this signed-in account
// on this device. Stores ONLY sanitized concept fields (names, layouts,
// sections…) — never HTML, raw user prompts, tokens or payment state. The key
// is a SHA-256 over prompt + model + policy + user id, so the prompt itself is
// not stored. Signed-out users never read or write this cache.
//
// Browser data is device-local, unencrypted at rest and may be evicted by the
// browser at any time; the server remains the source of truth.

import { idbGet, idbSet, idbRemove } from "@/lib/idb-storage";
import {
  parseConceptPlan,
  POCKET_CONCEPT_VERSION,
  type PocketConceptPlan,
} from "@/lib/pocket-concept";

export const PLAN_CACHE_TTL_MS = 72 * 60 * 60 * 1000;
export const PLAN_CACHE_MAX = 24;
export const PLAN_CACHE_POLICY = `pocket-concept-v${POCKET_CONCEPT_VERSION}.local-v1`;
const BUCKET_PREFIX = "obs.plancache.v1.";

export interface PlanCacheKV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<boolean>;
  remove(key: string): Promise<void>;
}
export const idbPlanKV: PlanCacheKV = { get: idbGet, set: idbSet, remove: idbRemove };

interface Entry {
  k: string;
  at: number;
  json: string;
}
interface Bucket {
  v: 1;
  entries: Entry[];
  hits: number;
  misses: number;
}

function emptyBucket(): Bucket {
  return { v: 1, entries: [], hits: 0, misses: 0 };
}
function bucketKey(userId: string) {
  return BUCKET_PREFIX + userId;
}
function validUser(userId: string | null | undefined): userId is string {
  return typeof userId === "string" && /^[0-9a-f-]{16,64}$/i.test(userId);
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function planCacheKey(input: {
  userId: string;
  model: string;
  plannerPrompt: string;
  policy?: string;
}): Promise<string> {
  return sha256Hex(
    JSON.stringify([
      "obs-plan",
      input.policy ?? PLAN_CACHE_POLICY,
      input.userId,
      input.model,
      input.plannerPrompt,
    ]),
  );
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** Keep only the concept fields the planner is allowed to influence. Null if not exactly a usable 3-concept plan. */
export function sanitizePlanJson(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { concepts?: unknown; selectedId?: unknown; selectionReason?: unknown };
  if (!Array.isArray(obj.concepts) || obj.concepts.length !== 3) return null;
  const concepts = [];
  for (const c of obj.concepts) {
    if (!c || typeof c !== "object") return null;
    const r = c as Record<string, unknown>;
    if (typeof r.name !== "string" || typeof r.concept !== "string") return null;
    concepts.push({
      id: s(r.id, 40),
      name: s(r.name, 60),
      concept: s(r.concept, 220),
      family: s(r.family, 40),
      layout: s(r.layout, 80),
      hero: s(r.hero, 240),
      signatureMoment: s(r.signatureMoment, 160),
      risk: r.risk === "low" || r.risk === "medium" || r.risk === "high" ? r.risk : undefined,
      sections: Array.isArray(r.sections)
        ? r.sections
            .filter((x): x is string => typeof x === "string")
            .slice(0, 10)
            .map((x) => x.slice(0, 80))
        : undefined,
    });
  }
  return JSON.stringify({
    concepts,
    selectedId: s(obj.selectedId, 40),
    selectionReason: s(obj.selectionReason, 300),
  });
}

async function readBucket(kv: PlanCacheKV, userId: string): Promise<Bucket> {
  try {
    const b = await kv.get<Bucket>(bucketKey(userId));
    if (b && b.v === 1 && Array.isArray(b.entries)) {
      // A partially written or manually edited browser store is untrusted.
      const entries = b.entries.filter((e): e is Entry =>
        !!e && typeof e.k === "string" && /^[0-9a-f]{64}$/.test(e.k) &&
        typeof e.at === "number" && Number.isFinite(e.at) &&
        typeof e.json === "string" && e.json.length <= 20_000
      ).slice(0, PLAN_CACHE_MAX);
      return {
        v: 1,
        entries,
        hits: Number.isSafeInteger(b.hits) && b.hits >= 0 ? b.hits : 0,
        misses: Number.isSafeInteger(b.misses) && b.misses >= 0 ? b.misses : 0,
      };
    }
  } catch {
    /* blocked */
  }
  return emptyBucket();
}

/** Returns a plan parsed against the CURRENT deterministic base, or null (miss / stale / corrupt / signed out). */
export async function getCachedPlan(opts: {
  userId: string | null | undefined;
  key: string;
  base: PocketConceptPlan;
  kv?: PlanCacheKV;
  now?: number;
}): Promise<PocketConceptPlan | null> {
  if (!validUser(opts.userId)) return null;
  const kv = opts.kv ?? idbPlanKV;
  const now = opts.now ?? Date.now();
  const b = await readBucket(kv, opts.userId);
  const live = b.entries.filter(
    (e) => e && typeof e.k === "string" && now - e.at < PLAN_CACHE_TTL_MS && e.at <= now + 60_000,
  );
  const hit = live.find((e) => e.k === opts.key);
  let plan: PocketConceptPlan | null = null;
  if (hit) {
    try {
      const clean = sanitizePlanJson(JSON.parse(hit.json));
      if (clean) {
        const parsed = parseConceptPlan(JSON.parse(clean), opts.base);
        if (parsed !== opts.base) plan = parsed;
      }
    } catch {
      plan = null;
    }
  }
  // True bounded LRU: a hit becomes most recently used without extending
  // its original TTL. This avoids evicting frequently reused plans.
  const entries = plan && hit
    ? [hit, ...live.filter((e) => e.k !== opts.key)]
    : live.filter((e) => e.k !== opts.key);
  await kv
    .set(bucketKey(opts.userId), {
      ...b,
      entries,
      hits: b.hits + (plan ? 1 : 0),
      misses: b.misses + (plan ? 0 : 1),
    })
    .catch(() => false);
  return plan;
}

export async function putCachedPlan(opts: {
  userId: string | null | undefined;
  key: string;
  rawJson: string;
  kv?: PlanCacheKV;
  now?: number;
}): Promise<boolean> {
  if (!validUser(opts.userId)) return false;
  let clean: string | null = null;
  try {
    clean = sanitizePlanJson(JSON.parse(opts.rawJson));
  } catch {
    return false;
  }
  if (!clean) return false;
  const kv = opts.kv ?? idbPlanKV;
  const now = opts.now ?? Date.now();
  const b = await readBucket(kv, opts.userId);
  const entries = [
    { k: opts.key, at: now, json: clean },
    ...b.entries.filter((e) => e.k !== opts.key && now - e.at < PLAN_CACHE_TTL_MS),
  ].slice(0, PLAN_CACHE_MAX);
  return kv.set(bucketKey(opts.userId), { ...b, entries }).catch(() => false);
}

export async function planCacheStats(
  userId: string | null | undefined,
  kv: PlanCacheKV = idbPlanKV,
  now = Date.now(),
) {
  if (!validUser(userId)) return null;
  const b = await readBucket(kv, userId);
  return {
    entries: b.entries.filter((e) => now - e.at < PLAN_CACHE_TTL_MS).length,
    hits: b.hits,
    misses: b.misses,
  };
}

/** Clears ONLY this user's planner cache bucket. */
export async function clearPlanCache(
  userId: string | null | undefined,
  kv: PlanCacheKV = idbPlanKV,
): Promise<void> {
  if (!validUser(userId)) return;
  await kv.remove(bucketKey(userId)).catch(() => undefined);
}

/**
 * Cache-first wrapper around the paid planner call. `call` is only invoked on
 * a miss; only a valid successful response is stored.
 */
export async function planWithLocalCache<
  R extends { ok: true; rawJson: string; cached: boolean } | { ok: false } | { paywall: unknown },
>(opts: {
  userId: string | null | undefined;
  model: string;
  plannerPrompt: string;
  base: PocketConceptPlan;
  call: () => Promise<R>;
  kv?: PlanCacheKV;
  now?: number;
}): Promise<
  | { plan: PocketConceptPlan; source: "local" }
  | { source: "network"; res: R; plan: PocketConceptPlan | null }
> {
  let key: string | null = null;
  if (validUser(opts.userId)) {
    try {
      key = await planCacheKey({
        userId: opts.userId,
        model: opts.model,
        plannerPrompt: opts.plannerPrompt,
      });
      const plan = await getCachedPlan({
        userId: opts.userId,
        key,
        base: opts.base,
        kv: opts.kv,
        now: opts.now,
      });
      if (plan) return { plan, source: "local" };
    } catch {
      key = null;
    }
  }
  const res = await opts.call();
  let plan: PocketConceptPlan | null = null;
  if ("ok" in res && res.ok) {
    try {
      plan = parseConceptPlan(JSON.parse(res.rawJson) as unknown, opts.base);
      if (key && plan !== opts.base)
        await putCachedPlan({
          userId: opts.userId,
          key,
          rawJson: res.rawJson,
          kv: opts.kv,
          now: opts.now,
        });
    } catch {
      plan = null;
    }
  }
  return { source: "network", res, plan };
}
