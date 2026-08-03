// Live sync for cloud builds: realtime mirror across devices, per-build
// project memory, and an optional public live URL.
//
// The server owns all writes (service role); the browser only listens to its
// own project_sync rows via Supabase Realtime and pulls the full build from
// /api/projects when another device pushes a newer revision.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchSyncState,
  saveProjectMemory,
  setLive,
  deviceLabel,
  liveUrlFor,
  type ProjectSyncState,
} from "@/lib/project-sync";

/** Stable per-tab device identity so our own writes aren't seen as remote. */
export function thisDeviceId(): string {
  const base = deviceLabel();
  if (typeof window === "undefined") return base;
  try {
    const key = "obs.device.tag";
    let tag = window.sessionStorage.getItem(key);
    if (!tag) {
      tag = Math.random().toString(36).slice(2, 6);
      window.sessionStorage.setItem(key, tag);
    }
    return `${base} #${tag}`;
  } catch {
    return base;
  }
}

export interface RemoteUpdate {
  revision: number;
  device: string | null;
  at: number;
}

export interface UseLiveSyncOptions {
  /** Cloud project id (uuid) currently open, or undefined when unsaved. */
  cloudId?: string;
  /** Only subscribe when signed in. */
  isAuthenticated: boolean;
  /** Called when another device saved a newer revision of this build. */
  onRemoteRevision?: (update: RemoteUpdate) => void;
}

export function useLiveSync({ cloudId, isAuthenticated, onRemoteRevision }: UseLiveSyncOptions) {
  const [state, setState] = useState<ProjectSyncState | null>(null);
  const [remote, setRemote] = useState<RemoteUpdate | null>(null);
  const [busy, setBusy] = useState(false);
  const deviceRef = useRef<string>("");
  const remoteCb = useRef(onRemoteRevision);
  remoteCb.current = onRemoteRevision;

  if (!deviceRef.current) deviceRef.current = thisDeviceId();

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !cloudId) { setState(null); return; }
    const r = await fetchSyncState(cloudId);
    if (r.ok) setState(r.data);
  }, [isAuthenticated, cloudId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime mirror — one channel per open build.
  useEffect(() => {
    if (!isAuthenticated || !cloudId) return;
    const channel = supabase
      .channel(`project-sync-${cloudId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_sync", filter: `project_id=eq.${cloudId}` },
        (payload) => {
          const row = payload.new as Partial<ProjectSyncState> & {
            revision?: number; last_device?: string | null; share_slug?: string | null; live?: boolean;
          } | null;
          if (!row || typeof row.revision !== "number") return;
          setState((prev) => (prev ? {
            ...prev,
            revision: row.revision!,
            live: row.live ?? prev.live,
            shareSlug: row.share_slug ?? prev.shareSlug,
            lastDevice: row.last_device ?? prev.lastDevice,
          } : prev));
          // Ignore echoes of our own writes.
          if ((row.last_device ?? "") === deviceRef.current) return;
          const update: RemoteUpdate = {
            revision: row.revision!,
            device: row.last_device ?? null,
            at: Date.now(),
          };
          setRemote(update);
          remoteCb.current?.(update);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isAuthenticated, cloudId]);

  const pushMemory = useCallback(async (memory: Record<string, unknown>) => {
    if (!isAuthenticated || !cloudId) return false;
    const r = await saveProjectMemory(cloudId, memory);
    if (r.ok) setState((prev) => (prev ? { ...prev, memory } : prev));
    return r.ok;
  }, [isAuthenticated, cloudId]);

  const toggleLive = useCallback(async (next?: boolean) => {
    if (!isAuthenticated || !cloudId) return null;
    setBusy(true);
    try {
      const want = typeof next === "boolean" ? next : !(state?.live ?? false);
      const r = await setLive(cloudId, want);
      if (!r.ok) return null;
      setState((prev) => (prev
        ? { ...prev, live: r.data.live, shareSlug: r.data.shareSlug }
        : prev));
      if (!state) await refresh();
      return r.data;
    } finally {
      setBusy(false);
    }
  }, [isAuthenticated, cloudId, state, refresh]);

  const clearRemote = useCallback(() => setRemote(null), []);

  return {
    state,
    memory: state?.memory ?? null,
    live: state?.live ?? false,
    shareSlug: state?.shareSlug ?? null,
    liveUrl: state?.shareSlug ? liveUrlFor(state.shareSlug) : null,
    remote,
    busy,
    device: deviceRef.current,
    refresh,
    pushMemory,
    toggleLive,
    clearRemote,
  };
}

/**
 * Debounced autosave. Fires `save` `delayMs` after `signature` last changed,
 * skipping the first render and any run where saving is disabled.
 */
export function useAutosave(
  signature: string,
  save: () => void,
  { enabled, delayMs = 4000 }: { enabled: boolean; delayMs?: number },
) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const firstRef = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    if (firstRef.current) { firstRef.current = false; return; }
    if (!signature) return;
    const t = setTimeout(() => saveRef.current(), delayMs);
    return () => clearTimeout(t);
  }, [signature, enabled, delayMs]);
}
