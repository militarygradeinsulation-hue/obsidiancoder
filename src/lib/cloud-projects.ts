// Client-side cloud project API wrapper.
// Talks to /api/projects. Auth is via the Supabase session (Bearer token).
// All functions are async, return Result<T> shapes — never throw.

import { authFetch } from "@/lib/auth-fetch";

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

export type CloudResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

/** Save or update a cloud project. `id` must be a stable UUID (create once, reuse). */
export async function saveCloudProject(args: {
  id: string;
  name: string;
  html: string;
  prompt: string;
  projectJson?: unknown;
  model?: string;
}): Promise<CloudResult<{ id: string }>> {
  try {
    const res = await authFetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const json = await res.json() as { ok: boolean; id?: string; error?: string };
    if (!json.ok) return { ok: false, error: json.error ?? "Save failed.", status: res.status };
    return { ok: true, data: { id: json.id! } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error." };
  }
}

/** List the current user's cloud projects (metadata only). */
export async function listCloudProjects(): Promise<CloudResult<CloudProjectMeta[]>> {
  try {
    const res = await authFetch("/api/projects");
    const json = await res.json() as { ok: boolean; projects?: CloudProjectMeta[]; error?: string };
    if (!json.ok) return { ok: false, error: json.error ?? "List failed.", status: res.status };
    return { ok: true, data: json.projects ?? [] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error." };
  }
}

/** Load one full project by id. */
export async function loadCloudProject(id: string): Promise<CloudResult<CloudProjectFull>> {
  try {
    const res = await authFetch(`/api/projects?id=${encodeURIComponent(id)}`);
    const json = await res.json() as { ok: boolean; project?: CloudProjectFull; error?: string };
    if (!json.ok) return { ok: false, error: json.error ?? "Load failed.", status: res.status };
    if (!json.project) return { ok: false, error: "Project not found.", status: 404 };
    return { ok: true, data: json.project };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error." };
  }
}

/** Delete a project by id. */
export async function deleteCloudProject(id: string): Promise<CloudResult<{ deleted: boolean }>> {
  try {
    const res = await authFetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = await res.json() as { ok: boolean; deleted?: boolean; error?: string };
    if (!json.ok) return { ok: false, error: json.error ?? "Delete failed.", status: res.status };
    return { ok: true, data: { deleted: json.deleted ?? false } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error." };
  }
}

/** Generate a stable UUID for a new cloud project. Call once, persist in state. */
export function newCloudProjectId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
