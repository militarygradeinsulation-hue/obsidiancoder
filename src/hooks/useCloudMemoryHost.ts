// Host-side ObsidianMemory bridge. Answers memory requests coming out of the
// sandboxed preview iframe and pushes remote changes back into it.
//
// Two adapters: the signed-in owner (Obsidian Vibe / Pocket) and a teammate on
// the shared /team/<slug> page. Both are DATA-only — neither can change the
// build itself.

import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseMemoryMessage, memoryReply, memoryChanged } from "@/lib/runtime-bridge";
import {
  ownerListMemory, ownerSetMemory, ownerDeleteMemory,
  teamListMemory, teamSetMemory, teamDeleteMemory,
  type MemoryRecord,
} from "@/lib/cloud-memory";

export interface MemoryAdapter {
  list: () => Promise<MemoryRecord[]>;
  set: (key: string, value: unknown) => Promise<boolean>;
  remove: (key: string) => Promise<boolean>;
}

export function ownerAdapter(projectId: string, device: string): MemoryAdapter {
  return {
    list: async () => { const r = await ownerListMemory(projectId); return r.ok ? r.data : []; },
    set: async (k, v) => (await ownerSetMemory(projectId, k, v, device)).ok,
    remove: async (k) => (await ownerDeleteMemory(projectId, k)).ok,
  };
}

export function teamAdapter(slug: string, token: string, device: string): MemoryAdapter {
  return {
    list: async () => { const r = await teamListMemory(slug, token); return r.ok ? r.data : []; },
    set: async (k, v) => (await teamSetMemory(slug, token, k, v, device)).ok,
    remove: async (k) => (await teamDeleteMemory(slug, token, k)).ok,
  };
}

export interface UseCloudMemoryHostOptions {
  /** The preview iframe the build runs in. */
  frame: HTMLIFrameElement | null;
  /** Build id — also the realtime channel key. */
  projectId: string | null;
  /** Off → requests are answered from the frame's own localStorage fallback. */
  enabled: boolean;
  adapter: MemoryAdapter | null;
  /** Called whenever a record changes (locally or remotely). */
  onChange?: (records: number) => void;
  /** Owners get Realtime (they can read their own rows). Teammates poll. */
  realtime?: boolean;
  /** Poll interval for teammates, ms. 0 disables polling. */
  pollMs?: number;
}

export function useCloudMemoryHost({
  frame, projectId, enabled, adapter, onChange, realtime = true, pollMs = 0,
}: UseCloudMemoryHostOptions) {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  // Pocket swaps between two preview buffers, so the frame element is not
  // stable. Remember whichever window last spoke to us and answer that.
  const sourceRef = useRef<Window | null>(null);

  const post = useCallback((msg: unknown) => {
    const target = frame?.contentWindow ?? sourceRef.current;
    try { target?.postMessage(msg, "*"); } catch { /* ignore */ }
  }, [frame]);

  // Answer memory requests from the sandboxed build.
  useEffect(() => {
    if (!enabled || !adapter) return;
    const onMessage = async (evt: MessageEvent) => {
      const req = parseMemoryMessage(evt, frame ? frame.contentWindow : null);
      if (!req) return;
      if (!frame && evt.source) sourceRef.current = evt.source as Window;
      const a = adapterRef.current;
      if (!a) { post(memoryReply(req.id, false, null)); return; }
      try {
        if (req.op === "list") {
          post(memoryReply(req.id, true, (await a.list()).map((r) => ({ key: r.key, value: r.value }))));
        } else if (req.op === "get") {
          const rows = await a.list();
          const hit = rows.find((r) => r.key === req.key);
          post(memoryReply(req.id, true, hit ? hit.value : null));
        } else if (req.op === "set") {
          const ok = await a.set(req.key!, req.value);
          post(memoryReply(req.id, ok, ok));
          if (ok) changeRef.current?.(1);
        } else {
          const ok = await a.remove(req.key!);
          post(memoryReply(req.id, ok, ok));
          if (ok) changeRef.current?.(-1);
        }
      } catch {
        post(memoryReply(req.id, false, null));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [enabled, adapter, frame, post]);

  // Mirror remote record changes into the running build.
  useEffect(() => {
    if (!enabled || !projectId || !realtime) return;
    const channel = supabase
      .channel(`build-memory-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "build_memory", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { key?: string; value?: unknown } | null;
          if (!row || typeof row.key !== "string") return;
          post(memoryChanged(row.key, payload.eventType === "DELETE" ? null : row.value));
          changeRef.current?.(0);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [enabled, projectId, post, realtime]);

  // Teammates cannot subscribe to Realtime (their rows are owner-scoped in the
  // database), so they poll the team endpoint and push diffs into the frame.
  useEffect(() => {
    if (!enabled || !adapter || pollMs <= 0) return;
    let stopped = false;
    let seen = new Map<string, string>();
    const tick = async () => {
      const a = adapterRef.current;
      if (!a) return;
      const rows = await a.list();
      if (stopped) return;
      const next = new Map<string, string>();
      for (const r of rows) {
        const sig = `${r.updatedAt}|${JSON.stringify(r.value)}`;
        next.set(r.key, sig);
        if (seen.size > 0 && seen.get(r.key) !== sig) post(memoryChanged(r.key, r.value));
      }
      for (const key of seen.keys()) if (!next.has(key)) post(memoryChanged(key, null));
      seen = next;
      changeRef.current?.(0);
    };
    void tick();
    const t = setInterval(() => { void tick(); }, pollMs);
    return () => { stopped = true; clearInterval(t); };
  }, [enabled, adapter, pollMs, post]);
}
