// Server-only: cloud project save/load/list/delete.
// All access is via service_role RPCs — RLS never applies.
// Auth is resolved upstream (resolveUserFromRequest) before any call here.

import type { AuthedUser, Environment } from "@/lib/credit-gate.server";

export interface CloudProjectMeta {
  id: string;
  projectName: string | null;
  prompt: string;
  model: string | null;
  byteSize: number;
  updatedAt: string;
  createdAt: string;
}

export interface CloudProjectFull extends CloudProjectMeta {
  html: string;
  projectJson: unknown | null;
}

export interface UpsertInput {
  /** Stable client-side id (uuid). Generated on first save, reused on updates. */
  id: string;
  name: string;
  html: string;
  prompt: string;
  projectJson?: unknown;
  model?: string;
}

/** Save or update a cloud project. Returns the project id. */
export async function upsertCloudProject(
  user: AuthedUser,
  input: UpsertInput,
  env: Environment,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("upsert_cloud_project" as never, {
    _user_id:      user.userId,
    _id:           input.id,
    _name:         input.name.slice(0, 200),
    _html:         input.html,
    _prompt:       input.prompt.slice(0, 10_000),
    _project_json: input.projectJson ?? null,
    _model:        input.model ?? null,
    _environment:  env,
  } as never);
  if (error) throw new Error(`upsert_cloud_project failed: ${error.message}`);
  return data as string;
}

/** List the user's cloud projects (newest 50, metadata only — no html). */
export async function listCloudProjects(
  user: AuthedUser,
  env: Environment,
): Promise<CloudProjectMeta[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("list_cloud_projects" as never, {
    _user_id:     user.userId,
    _environment: env,
  } as never);
  if (error) throw new Error(`list_cloud_projects failed: ${error.message}`);
  const rows = (data ?? []) as Array<{
    id: string; project_name: string | null; prompt: string;
    model: string | null; byte_size: number; updated_at: string; created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    projectName: r.project_name,
    prompt: r.prompt,
    model: r.model,
    byteSize: r.byte_size,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  }));
}

/** Load one full project (html + json). Returns null if not found or not owned. */
export async function getCloudProject(
  user: AuthedUser,
  id: string,
): Promise<CloudProjectFull | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_cloud_project" as never, {
    _user_id: user.userId,
    _id:      id,
  } as never);
  if (error) throw new Error(`get_cloud_project failed: ${error.message}`);
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
    id: string; project_name: string | null; html: string; prompt: string;
    project_json: unknown; model: string | null; byte_size: number;
    updated_at: string; created_at: string;
  }>;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    projectName: r.project_name,
    html: r.html,
    prompt: r.prompt,
    projectJson: r.project_json,
    model: r.model,
    byteSize: r.byte_size,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  };
}

/** Delete a project. Returns true if deleted, false if not found / not owned. */
export async function deleteCloudProject(
  user: AuthedUser,
  id: string,
): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("delete_cloud_project" as never, {
    _user_id: user.userId,
    _id:      id,
  } as never);
  if (error) throw new Error(`delete_cloud_project failed: ${error.message}`);
  return data === true;
}
