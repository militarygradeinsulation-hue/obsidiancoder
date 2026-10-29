import { planWithLocalCache, planCacheKey, getCachedPlan, putCachedPlan, planCacheStats, clearPlanCache, sanitizePlanJson, PLAN_CACHE_MAX, PLAN_CACHE_TTL_MS, type PlanCacheKV } from '../plan-cache';
import { newest, shouldApplyHydrated, persistWorkspace, readDurable, readHot, HOT_SNAPSHOT_MAX_CHARS, type LocalKV, type HotStore } from '../fullapp-local';
import { deterministicConceptPlan } from '../pocket-concept';

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) { if (cond) { pass++; console.log('  PASS ', name); } else { fail++; console.log('  FAIL ', name); } }

function memKV(): PlanCacheKV & LocalKV & { m: Map<string, unknown> } {
  const m = new Map<string, unknown>();
  return { m, get: async (k) => structuredClone(m.get(k)) as never, set: async (k, v) => { m.set(k, structuredClone(v)); return true; }, remove: async (k) => { m.delete(k); } };
}
const blockedKV: PlanCacheKV & LocalKV = { get: async () => { throw new Error('blocked'); }, set: async () => false, remove: async () => { throw new Error('x'); } };
function memHot(throwOnSet = false): HotStore & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { if (throwOnSet) throw new Error('QuotaExceeded'); m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const base = deterministicConceptPlan({ prompt: 'a bakery site', family: 'auto', recent: [] });
const good = JSON.stringify({ concepts: [0, 1, 2].map((i) => ({ name: `N${i}`, concept: `C${i}`, layout: 'split', sections: ['a', 'b', 'c'], risk: 'low', html: '<script>x</script>' })), selectedId: base.concepts[0].id });

function caller(json = good) {
  let calls = 0;
  const call = async () => { calls++; return { ok: true as const, rawJson: json, model: 'm', cached: false }; };
  return { call, get calls() { return calls; } };
}

console.log('\nplanner cache');
{
  const kv = memKV(); const c = caller();
  const a = await planWithLocalCache({ userId: U1, model: 'm1', plannerPrompt: 'P', base, call: c.call, kv });
  ok('first call goes to network', a.source === 'network' && c.calls === 1);
  const b = await planWithLocalCache({ userId: U1, model: 'm1', plannerPrompt: 'P', base, call: c.call, kv });
  ok('valid hit → zero metered calls', b.source === 'local' && c.calls === 1);
  ok('hit plan uses cached names', b.source === 'local' && b.plan.concepts[0].name === 'N0');
  ok('no html stored', !JSON.stringify([...kv.m.values()]).includes('<script>'));
  ok('raw prompt not stored', !JSON.stringify([...kv.m.values()]).includes('"P"'));
  await planWithLocalCache({ userId: U2, model: 'm1', plannerPrompt: 'P', base, call: c.call, kv });
  ok('other user → miss', c.calls === 2);
  await planWithLocalCache({ userId: U1, model: 'm2', plannerPrompt: 'P', base, call: c.call, kv });
  ok('model change → miss', c.calls === 3);
  await planWithLocalCache({ userId: U1, model: 'm1', plannerPrompt: 'P2', base, call: c.call, kv });
  ok('prompt change → miss', c.calls === 4);
  const k1 = await planCacheKey({ userId: U1, model: 'm1', plannerPrompt: 'P' });
  const k2 = await planCacheKey({ userId: U1, model: 'm1', plannerPrompt: 'P', policy: 'other' });
  ok('policy change → different key', k1 !== k2 && /^[0-9a-f]{64}$/.test(k1));
  ok('stats count hits', (await planCacheStats(U1, kv))?.hits === 1);
  await clearPlanCache(U1, kv);
  ok('clear removes only own bucket', (await planCacheStats(U1, kv))?.entries === 0 && (await planCacheStats(U2, kv))!.entries === 1);
}
{
  const kv = memKV(); const c = caller();
  await planWithLocalCache({ userId: null, model: 'm', plannerPrompt: 'P', base, call: c.call, kv });
  await planWithLocalCache({ userId: null, model: 'm', plannerPrompt: 'P', base, call: c.call, kv });
  ok('signed out never caches', c.calls === 2 && kv.m.size === 0);
}
{
  const kv = memKV(); const t0 = 1_000_000_000;
  const key = await planCacheKey({ userId: U1, model: 'm', plannerPrompt: 'P' });
  await putCachedPlan({ userId: U1, key, rawJson: good, kv, now: t0 });
  ok('fresh within TTL', !!(await getCachedPlan({ userId: U1, key, base, kv, now: t0 + PLAN_CACHE_TTL_MS - 1 })));
  ok('expired after 72h', !(await getCachedPlan({ userId: U1, key, base, kv, now: t0 + PLAN_CACHE_TTL_MS + 1 })));
}
{
  const kv = memKV(); const key = await planCacheKey({ userId: U1, model: 'm', plannerPrompt: 'P' });
  ok('malformed not stored', !(await putCachedPlan({ userId: U1, key, rawJson: '{"concepts":[1,2]}', kv })));
  ok('non-JSON not stored', !(await putCachedPlan({ userId: U1, key, rawJson: 'oops', kv })));
  ok('sanitize rejects 2 concepts', sanitizePlanJson({ concepts: [{ name: 'a', concept: 'b' }, { name: 'a', concept: 'b' }] }) === null);
  kv.m.set('obs.plancache.v1.' + U1, { v: 1, hits: 0, misses: 0, entries: [{ k: key, at: Date.now(), json: '{corrupt' }] });
  const c = caller();
  const r = await planWithLocalCache({ userId: U1, model: 'm', plannerPrompt: 'P', base, call: c.call, kv });
  ok('corrupt entry → falls back to metered call', r.source === 'network' && c.calls === 1);
  const r2 = await planWithLocalCache({ userId: U1, model: 'm', plannerPrompt: 'P', base, call: c.call, kv });
  ok('corrupt entry replaced by valid one', r2.source === 'local' && c.calls === 1);
  const fail1 = async () => ({ ok: false as const, reason: 'provider_failed' as const });
  const kv2 = memKV();
  await planWithLocalCache({ userId: U1, model: 'm', plannerPrompt: 'Q', base, call: fail1, kv: kv2 });
  ok('failed response not cached', (await planCacheStats(U1, kv2))?.entries === 0);
  const pw = async () => ({ paywall: { x: 1 } });
  await planWithLocalCache({ userId: U1, model: 'm', plannerPrompt: 'Q', base, call: pw, kv: kv2 });
  ok('paywall not cached', (await planCacheStats(U1, kv2))?.entries === 0);
}
{
  const kv = memKV();
  for (let i = 0; i < 30; i++) {
    const key = await planCacheKey({ userId: U1, model: 'm', plannerPrompt: 'P' + i });
    await putCachedPlan({ userId: U1, key, rawJson: good, kv, now: 1_000 + i });
  }
  ok('max 24 entries', (await planCacheStats(U1, kv, 2_000))?.entries === PLAN_CACHE_MAX);
  const oldest = await planCacheKey({ userId: U1, model: 'm', plannerPrompt: 'P0' });
  const newestK = await planCacheKey({ userId: U1, model: 'm', plannerPrompt: 'P29' });
  ok('oldest evicted', !(await getCachedPlan({ userId: U1, key: oldest, base, kv, now: 2_000 })));
  ok('newest kept', !!(await getCachedPlan({ userId: U1, key: newestK, base, kv, now: 2_000 })));
}
{
  const c = caller();
  const r = await planWithLocalCache({ userId: U1, model: 'm', plannerPrompt: 'P', base, call: c.call, kv: blockedKV });
  ok('IDB blocked → safe network fallback', r.source === 'network' && c.calls === 1);
}

console.log('\nfull app local durability');
type W = { updatedAt: number; sourceHtml: string; files: Record<string, string> };
const v = (raw: unknown): W | null => (raw && typeof raw === 'object' && typeof (raw as W).updatedAt === 'number' && typeof (raw as W).sourceHtml === 'string') ? raw as W : null;
const w = (t: number, size = 10): W => ({ updatedAt: t, sourceHtml: 'x'.repeat(size), files: {} });
{
  ok('newest wins', newest(w(1), w(5), null)!.updatedAt === 5);
  ok('newer IDB applies when untouched', shouldApplyHydrated({ keyAtStart: 'a', keyNow: 'a', editedSinceMount: false, current: w(1), candidate: w(2) }));
  ok('new edit wins over IDB', !shouldApplyHydrated({ keyAtStart: 'a', keyNow: 'a', editedSinceMount: true, current: w(1), candidate: w(9) }));
  ok('older IDB never clobbers', !shouldApplyHydrated({ keyAtStart: 'a', keyNow: 'a', editedSinceMount: false, current: w(5), candidate: w(4) }));
  ok('account switch ignores stale hydrate', !shouldApplyHydrated({ keyAtStart: 'u1', keyNow: 'u2', editedSinceMount: false, current: null, candidate: w(9) }));
  const kv = memKV(); const hot = memHot();
  const r = await persistWorkspace(w(3), 'k', kv, hot);
  ok('small saved to IDB + hot', r.durable && r.hot && r.ok);
  ok('IDB round trip', (await readDurable(kv, 'k', v))?.updatedAt === 3);
  ok('hot round trip', readHot(hot, 'k', v)?.updatedAt === 3);
  const big = await persistWorkspace(w(4, HOT_SNAPSHOT_MAX_CHARS + 10), 'k', kv, hot);
  ok('large → IDB only, stale hot removed', big.durable && !big.hot && hot.m.size === 0);
  ok('large workspace survives', (await readDurable(kv, 'k', v))?.sourceHtml.length === HOT_SNAPSHOT_MAX_CHARS + 10);
  const off = await persistWorkspace(w(5), 'k', blockedKV, memHot());
  ok('IDB offline → hot fallback still ok', !off.durable && off.hot && off.ok);
  const quota = await persistWorkspace(w(6), 'k', blockedKV, memHot(true));
  ok('quota + no IDB → not ok (warning shown)', !quota.ok);
  ok('IDB blocked read → null', (await readDurable(blockedKV, 'k', v)) === null);
  ok('identity isolation: other key empty', (await readDurable(kv, 'k2', v)) === null);
  ok('malformed hot ignored', readHot({ getItem: () => '{bad', setItem() {}, removeItem() {} }, 'k', v) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
