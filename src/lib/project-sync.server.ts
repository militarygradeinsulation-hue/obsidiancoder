// Server-only: project sync state (revision, live publishing, per-build memory).
// All access goes through service_role RPCs — RLS never applies here.
// Auth is resolved upstream (resolveUserFromRequest) before any call.

import type { AuthedUser, Environment } from "@/lib/credit-gate.server";

export type SyncSurface = "coder" | "pocket";

export interface ProjectSyncState {
  projectId: string;
  title: string;
  surface: SyncSurface;
  revision: number;
  live: boolean;
  shareSlug: string | null;
  memory: Record<string, unknown>;
  lastDevice: string | null;
  updatedAt: string;
}

/** URL-safe random slug for public live links. */
export function newShareSlug(): string {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

function coerceSurface(value: unknown): SyncSurface {
  return value === "pocket" ? "pocket" : "coder";
}

/** Bump the revision after a content save so other devices notice. */
export async function touchProjectSync(
  user: AuthedUser,
  input: { projectId: string; title: string; surface: SyncSurface; device?: string },
  env: Environment,
): Promise<{ revision: number; live: boolean; shareSlug: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("project_sync_touch" as never, {
    _user_id:     user.userId,
    _project_id:  input.projectId,
    _title:       input.title.slice(0, 200),
    _surface:     coerceSurface(input.surface),
    _device:      (input.device ?? "").slice(0, 80) || null,
    _environment: env,
  } as never);
  if (error) throw new Error(`project_sync_touch failed: ${error.message}`);
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
    revision: number; live: boolean; share_slug: string | null;
  }>;
  const r = rows[0];
  return { revision: r?.revision ?? 1, live: r?.live ?? false, shareSlug: r?.share_slug ?? null };
}

/** Read the sync row (memory + live state) for one project. */
export async function getProjectSync(
  user: AuthedUser,
  projectId: string,
): Promise<ProjectSyncState | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("project_sync_get" as never, {
    _user_id:    user.userId,
    _project_id: projectId,
  } as never);
  if (error) throw new Error(`project_sync_get failed: ${error.message}`);
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
    project_id: string; title: string; surface: string; revision: number;
    live: boolean; share_slug: string | null; memory: Record<string, unknown> | null;
    last_device: string | null; updated_at: string;
  }>;
  const r = rows[0];
  if (!r) return null;
  return {
    projectId: r.project_id,
    title: r.title,
    surface: coerceSurface(r.surface),
    revision: r.revision,
    live: r.live,
    shareSlug: r.share_slug,
    memory: r.memory ?? {},
    lastDevice: r.last_device,
    updatedAt: r.updated_at,
  };
}

/** Persist per-build project memory. */
export async function setProjectMemory(
  user: AuthedUser,
  projectId: string,
  memory: Record<string, unknown>,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("project_sync_set_memory" as never, {
    _user_id:    user.userId,
    _project_id: projectId,
    _memory:     memory,
  } as never);
  if (error) throw new Error(`project_sync_set_memory failed: ${error.message}`);
}

/**
 * Turn the public live URL on or off. When on, the build row gets a stable
 * share slug and is marked public, so /api/public/share/<slug> always serves
 * the latest saved HTML.
 */
export async function setProjectLive(
  user: AuthedUser,
  projectId: string,
  live: boolean,
): Promise<{ live: boolean; shareSlug: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("project_sync_set_live" as never, {
    _user_id:    user.userId,
    _project_id: projectId,
    _live:       live,
    _slug:       newShareSlug(),
  } as never);
  if (error) throw new Error(`project_sync_set_live failed: ${error.message}`);
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
    live: boolean; share_slug: string | null;
  }>;
  const r = rows[0];
  return { live: r?.live ?? live, shareSlug: r?.share_slug ?? null };
}
