// Server-only: Cloud Memory data access. Everything goes through service-role
// RPCs; the browser never touches build_memory directly.

import type { AuthedUser } from "@/lib/credit-gate.server";
import { hashTeamCode, shortDeviceLabel } from "@/lib/build-memory";

export interface MemoryRecord {
  key: string;
  value: unknown;
  updatedBy: string | null;
  updatedAt: string;
}

export interface TeamAccess {
  projectId: string;
  ownerId: string;
  title: string;
  cloudMemory: boolean;
  live: boolean;
  teamCodeHash: string | null;
}

function rows<T>(data: unknown): T[] {
  return (Array.isArray(data) ? data : data ? [data] : []) as T[];
}

/** Owner-only: turn Cloud Memory on/off and optionally rotate the team code. */
export async function setCloudMemory(
  user: AuthedUser,
  projectId: string,
  enabled: boolean,
  teamCode: string | null,
): Promise<{ cloudMemory: boolean; live: boolean; shareSlug: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const codeHash = teamCode ? await hashTeamCode(projectId, teamCode) : null;
  const { data, error } = await supabaseAdmin.rpc("project_sync_set_cloud_memory" as never, {
    _user_id:    user.userId,
    _project_id: projectId,
    _enabled:    enabled,
    _code_hash:  codeHash,
  } as never);
  if (error) throw new Error(`set_cloud_memory failed: ${error.message}`);
  const r = rows<{ cloud_memory: boolean; live: boolean; share_slug: string | null }>(data)[0];
  return {
    cloudMemory: r?.cloud_memory ?? enabled,
    live: r?.live ?? false,
    shareSlug: r?.share_slug ?? null,
  };
}

/** Resolve a public share slug to its build + team gate settings. */
export async function lookupTeamAccess(slug: string): Promise<TeamAccess | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("build_memory_lookup" as never, {
    _slug: slug,
  } as never);
  if (error) throw new Error(`build_memory_lookup failed: ${error.message}`);
  const r = rows<{
    project_id: string; owner_id: string; title: string;
    cloud_memory: boolean; live: boolean; team_code_hash: string | null;
  }>(data)[0];
  if (!r) return null;
  return {
    projectId: r.project_id,
    ownerId: r.owner_id,
    title: r.title,
    cloudMemory: r.cloud_memory,
    live: r.live,
    teamCodeHash: r.team_code_hash,
  };
}

export async function readBuildMemory(projectId: string): Promise<MemoryRecord[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("build_memory_list" as never, {
    _project_id: projectId,
  } as never);
  if (error) throw new Error(`build_memory_list failed: ${error.message}`);
  return rows<{ key: string; value: unknown; updated_by: string | null; updated_at: string }>(data)
    .map((r) => ({ key: r.key, value: r.value, updatedBy: r.updated_by, updatedAt: r.updated_at }));
}

export async function writeBuildMemory(
  projectId: string,
  ownerId: string,
  key: string,
  value: unknown,
  updatedBy: string,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("build_memory_upsert" as never, {
    _project_id: projectId,
    _owner_id:   ownerId,
    _key:        key,
    _value:      value ?? null,
    _updated_by: shortDeviceLabel(updatedBy),
  } as never);
  if (error) throw new Error(error.message.includes("memory_full")
    ? "This build's shared memory is full."
    : `build_memory_upsert failed: ${error.message}`);
  return typeof data === "string" ? data : new Date().toISOString();
}

export async function deleteBuildMemory(projectId: string, key: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("build_memory_delete" as never, {
    _project_id: projectId,
    _key:        key,
  } as never);
  if (error) throw new Error(`build_memory_delete failed: ${error.message}`);
  return Boolean(data);
}

/** Owner-only: wipe every shared record for a build (never touches the code). */
export async function resetBuildMemory(user: AuthedUser, projectId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("build_memory_reset" as never, {
    _user_id:    user.userId,
    _project_id: projectId,
  } as never);
  if (error) throw new Error(`build_memory_reset failed: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

export async function buildMemoryStats(
  user: AuthedUser,
  projectId: string,
): Promise<{ entries: number; lastUpdate: string | null; lastBy: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("build_memory_stats" as never, {
    _user_id:    user.userId,
    _project_id: projectId,
  } as never);
  if (error) throw new Error(`build_memory_stats failed: ${error.message}`);
  const r = rows<{ entries: number; last_update: string | null; last_by: string | null }>(data)[0];
  return { entries: r?.entries ?? 0, lastUpdate: r?.last_update ?? null, lastBy: r?.last_by ?? null };
}

/** Owner-only: current Cloud Memory switch state for one build. */
export async function getCloudMemoryState(
  user: AuthedUser,
  projectId: string,
): Promise<{ cloudMemory: boolean; teamCodeSet: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("project_sync" as never)
    .select("cloud_memory, team_code_hash")
    .eq("project_id", projectId)
    .eq("user_id", user.userId)
    .maybeSingle();
  if (error) throw new Error(`cloud_memory state failed: ${error.message}`);
  const row = (data ?? null) as { cloud_memory?: boolean; team_code_hash?: string | null } | null;
  return { cloudMemory: Boolean(row?.cloud_memory), teamCodeSet: Boolean(row?.team_code_hash) };
}
