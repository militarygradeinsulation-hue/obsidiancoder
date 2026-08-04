// Client-side Cloud Memory helpers.
//   • Owner path  → /api/memory   (Supabase bearer)
//   • Team path   → /api/public/team/<slug> (team token)
// Result shapes only; never throws.

import { authFetch } from "@/lib/auth-fetch";

export interface MemoryRecord {
  key: string;
  value: unknown;
  updatedBy: string | null;
  updatedAt: string;
}

export type MemResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : "Network error." };
}

/* ------------------------------------------------------------- owner side */

export async function ownerListMemory(id: string): Promise<MemResult<MemoryRecord[]>> {
  try {
    const res = await authFetch(`/api/memory?id=${encodeURIComponent(id)}`);
    const j = (await res.json()) as { ok: boolean; records?: MemoryRecord[]; error?: string };
    return j.ok ? { ok: true, data: j.records ?? [] } : { ok: false, error: j.error ?? "Read failed." };
  } catch (err) { return fail(err); }
}

export async function ownerSetMemory(
  id: string, key: string, value: unknown, device: string,
): Promise<MemResult<string>> {
  try {
    const res = await authFetch("/api/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, key, value, device }),
    });
    const j = (await res.json()) as { ok: boolean; updatedAt?: string; error?: string };
    return j.ok ? { ok: true, data: j.updatedAt ?? "" } : { ok: false, error: j.error ?? "Write failed." };
  } catch (err) { return fail(err); }
}

export async function ownerDeleteMemory(id: string, key: string): Promise<MemResult<boolean>> {
  try {
    const res = await authFetch("/api/memory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, key }),
    });
    const j = (await res.json()) as { ok: boolean; deleted?: boolean; error?: string };
    return j.ok ? { ok: true, data: Boolean(j.deleted) } : { ok: false, error: j.error ?? "Delete failed." };
  } catch (err) { return fail(err); }
}

/* -------------------------------------------------------------- team side */

const teamBase = (slug: string) => `/api/public/team/${encodeURIComponent(slug)}`;

export async function teamUnlock(slug: string, code: string): Promise<MemResult<{ token: string; title: string }>> {
  try {
    const res = await fetch(teamBase(slug), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const j = (await res.json()) as { ok: boolean; token?: string; title?: string; error?: string };
    return j.ok && j.token
      ? { ok: true, data: { token: j.token, title: j.title ?? "Shared build" } }
      : { ok: false, error: j.error ?? "Team access failed." };
  } catch (err) { return fail(err); }
}

export async function teamListMemory(slug: string, token: string): Promise<MemResult<MemoryRecord[]>> {
  try {
    const res = await fetch(`${teamBase(slug)}?token=${encodeURIComponent(token)}`);
    const j = (await res.json()) as { ok: boolean; records?: MemoryRecord[]; error?: string };
    return j.ok ? { ok: true, data: j.records ?? [] } : { ok: false, error: j.error ?? "Read failed." };
  } catch (err) { return fail(err); }
}

export async function teamSetMemory(
  slug: string, token: string, key: string, value: unknown, device: string,
): Promise<MemResult<string>> {
  try {
    const res = await fetch(teamBase(slug), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, key, value, device }),
    });
    const j = (await res.json()) as { ok: boolean; updatedAt?: string; error?: string };
    return j.ok ? { ok: true, data: j.updatedAt ?? "" } : { ok: false, error: j.error ?? "Write failed." };
  } catch (err) { return fail(err); }
}

export async function teamDeleteMemory(
  slug: string, token: string, key: string,
): Promise<MemResult<boolean>> {
  try {
    const res = await fetch(teamBase(slug), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, key }),
    });
    const j = (await res.json()) as { ok: boolean; deleted?: boolean; error?: string };
    return j.ok ? { ok: true, data: Boolean(j.deleted) } : { ok: false, error: j.error ?? "Delete failed." };
  } catch (err) { return fail(err); }
}

/* --------------------------------------------------------------- storage */

const TOKEN_KEY = (slug: string) => `obs.team.token.${slug}`;

export function rememberTeamToken(slug: string, token: string): void {
  try { window.localStorage.setItem(TOKEN_KEY(slug), token); } catch { /* ignore */ }
}

export function recallTeamToken(slug: string): string | null {
  try { return window.localStorage.getItem(TOKEN_KEY(slug)); } catch { return null; }
}

export function forgetTeamToken(slug: string): void {
  try { window.localStorage.removeItem(TOKEN_KEY(slug)); } catch { /* ignore */ }
}

/** Team URL a teammate opens — the collaborative page, not the raw share HTML. */
export function teamUrlFor(slug: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/team/${slug}`;
}
