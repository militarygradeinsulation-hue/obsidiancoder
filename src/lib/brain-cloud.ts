// Cloud Brain: small, structured, user-owned records, separate from build_memory.
// No generated HTML, credentials, or account/library codes are sent to the cloud.
import { supabase } from "@/integrations/supabase/client";
import { readBuildLearning, type BuildLearningEntry } from "./build-learning";

export type BrainRecordKind = "learning" | "note" | "fact" | "decision";
export interface BrainRecord {
  record_id: string;
  project_key: string;
  kind: BrainRecordKind;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  updated_at: number;
  deleted_at: number | null;
}
const KEY = (uid: string) => `obs.brain.pending.${uid}.v1`;
const MAX_RECORDS = 250;
const now = () => Date.now();
const isRecord = (v: unknown): v is BrainRecord => {
  if (!v || typeof v !== "object") return false;
  const x = v as Partial<BrainRecord>;
  return typeof x.record_id === "string" && typeof x.project_key === "string" &&
    ["learning", "note", "fact", "decision"].includes(x.kind ?? "") &&
    typeof x.updated_at === "number" && Number.isFinite(x.updated_at);
};
function readCache(uid: string): BrainRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(uid)) || "[]") as unknown;
    return Array.isArray(raw) ? raw.filter(isRecord).slice(0, MAX_RECORDS) : [];
  } catch { return []; }
}
function writeCache(uid: string, entries: BrainRecord[]): void {
  try { localStorage.setItem(KEY(uid), JSON.stringify(entries.slice(0, MAX_RECORDS))); } catch { /* offline and quota safe */ }
}
export function mergeBrainRecords(a: readonly BrainRecord[], b: readonly BrainRecord[]): BrainRecord[] {
  const map = new Map<string, BrainRecord>();
  for (const item of [...a, ...b]) {
    if (!isRecord(item)) continue;
    const prior = map.get(item.record_id);
    if (!prior || item.updated_at > prior.updated_at ||
      (item.updated_at === prior.updated_at && item.deleted_at !== null && prior.deleted_at === null)) {
      map.set(item.record_id, item);
    }
  }
  return [...map.values()].sort((x, y) => y.updated_at - x.updated_at).slice(0, MAX_RECORDS);
}
export function cachedBrainRecords(uid: string): BrainRecord[] { return readCache(uid); }
export function queueBrainRecord(uid: string, record: BrainRecord): BrainRecord[] {
  const next = mergeBrainRecords(readCache(uid), [record]);
  writeCache(uid, next);
  return next;
}
export function createBrainRecord(projectKey: string, kind: Exclude<BrainRecordKind, "learning">, title: string, body: string): BrainRecord {
  return {
    record_id: crypto.randomUUID(), project_key: projectKey.slice(0, 100), kind,
    title: title.trim().slice(0, 120), body: body.trim().slice(0, 4000),
    payload: {}, updated_at: now(), deleted_at: null,
  };
}
export function removeBrainRecord(record: BrainRecord): BrainRecord {
  const at = Math.max(now(), record.updated_at + 1);
  return { ...record, updated_at: at, deleted_at: at };
}
// Build outcomes already strip prompts, markup and PII in build-learning.ts.
// Stable IDs allow independent devices to merge without duplicate examples.
export function learningRecords(libraryCode?: string): BrainRecord[] {
  return readBuildLearning(libraryCode).entries.map((e: BuildLearningEntry) => ({
    record_id: `learning:${e.id}`, project_key: "global", kind: "learning" as const,
    title: "", body: "", payload: e as unknown as Record<string, unknown>,
    updated_at: e.at, deleted_at: null,
  }));
}
export function validatedCloudLearnings(records: readonly BrainRecord[]): BuildLearningEntry[] {
  return records.filter((r) => r.kind === "learning" && !r.deleted_at).map((r) => r.payload)
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" &&
      typeof e.id === "string" && typeof e.at === "number" &&
      typeof e.family === "string" && typeof e.model === "string" &&
      ["kept", "discarded", "restored"].includes(String(e.outcome)))
    .map((e) => e as unknown as BuildLearningEntry).slice(0, 60);
}
export async function syncBrainRecords(uid: string, libraryCode?: string): Promise<BrainRecord[]> {
  const { data: session } = await supabase.auth.getSession();
  if (session.session?.user.id !== uid) throw new Error("Sign in to sync Brain.");
  const table = supabase.from("obsidian_brain_records" as never);
  const { data, error } = await table.select("*").order("updated_at", { ascending: false }).limit(MAX_RECORDS);
  if (error) throw error;
  const remote = (Array.isArray(data) ? data : []).filter(isRecord) as BrainRecord[];
  const local = mergeBrainRecords(readCache(uid), learningRecords(libraryCode));
  const remoteById = new Map(remote.map((r) => [r.record_id, r]));
  const unsent = local.filter((r) => {
    const cloud = remoteById.get(r.record_id);
    return !cloud || cloud.updated_at < r.updated_at ||
      (cloud.updated_at === r.updated_at && r.deleted_at !== null && cloud.deleted_at === null);
  });
  // Keep the local queue untouched on write failure; retry on next sync.
  if (unsent.length) {
    const { error: writeError } = await supabase.from("obsidian_brain_records" as never)
      .upsert(unsent.map((r) => ({ ...r, user_id: uid })) as never, { onConflict: "user_id,record_id" });
    if (writeError) throw writeError;
  }
  const { data: confirmed, error: refreshError } = await supabase.from("obsidian_brain_records" as never)
    .select("*").order("updated_at", { ascending: false }).limit(MAX_RECORDS);
  if (refreshError) throw refreshError;
  const merged = mergeBrainRecords(local, (confirmed as unknown[] ?? []).filter(isRecord));
  writeCache(uid, merged);
  return merged;
}

/** Merge cloud-scored outcomes into a build query only for the active signed-in user.
 * The caller must obtain the user ID from useAuth, never from a library code.
 */
export function brainLearningForUser(uid: string, libraryCode?: string): BuildLearningEntry[] {
  const local = readBuildLearning(libraryCode).entries;
  const cloud = validatedCloudLearnings(readCache(uid));
  return [...new Map([...cloud, ...local].map((e) => [e.id, e])).values()]
    .sort((a, b) => b.at - a.at).slice(0, 60);
}
