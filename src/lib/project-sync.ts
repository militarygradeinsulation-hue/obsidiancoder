// Client wrapper for /api/sync — per-build memory + live public URL.
// Result shapes only; never throws.

import { authFetch } from "@/lib/auth-fetch";

export interface ProjectSyncState {
  projectId: string;
  title: string;
  surface: "coder" | "pocket";
  revision: number;
  live: boolean;
  shareSlug: string | null;
  memory: Record<string, unknown>;
  lastDevice: string | null;
  updatedAt: string;
}

export type SyncResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** A short, stable, human label for this browser — shown as "edited on …". */
export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/i.test(ua) ? "iOS"
    : /Android/i.test(ua) ? "Android"
    : /Mac OS X/i.test(ua) ? "Mac"
    : /Windows/i.test(ua) ? "Windows"
    : /Linux/i.test(ua) ? "Linux"
    : "device";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "browser";
  return `${os} · ${browser}`;
}

/** Public URL that always serves the latest saved version of a live build. */
export function liveUrlFor(shareSlug: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/public/share/${shareSlug}`;
}

export async function fetchSyncState(id: string): Promise<SyncResult<ProjectSyncState | null>> {
  try {
    const res = await authFetch(`/api/sync?id=${encodeURIComponent(id)}`);
    const json = (await res.json()) as { ok: boolean; state?: ProjectSyncState | null; error?: string };
    if (!json.ok) return { ok: false, error: json.error ?? "Sync read failed." };
    return { ok: true, data: json.state ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error." };
  }
}

export async function saveProjectMemory(
  id: string,
  memory: Record<string, unknown>,
): Promise<SyncResult<true>> {
  try {
    const res = await authFetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, memory }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) return { ok: false, error: json.error ?? "Memory save failed." };
    return { ok: true, data: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error." };
  }
}

export async function setLive(
  id: string,
  live: boolean,
): Promise<SyncResult<{ live: boolean; shareSlug: string | null }>> {
  try {
    const res = await authFetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, live }),
    });
    const json = (await res.json()) as { ok: boolean; live?: boolean; shareSlug?: string | null; error?: string };
    if (!json.ok) return { ok: false, error: json.error ?? "Live toggle failed." };
    return { ok: true, data: { live: json.live ?? live, shareSlug: json.shareSlug ?? null } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error." };
  }
}
