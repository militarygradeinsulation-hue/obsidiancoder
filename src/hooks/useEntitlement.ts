// Entitlement hook + module-level snapshot. Consumed both reactively (via the
// hook) and synchronously by the client action guard.
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import type { EntitlementSnapshot, EntitlementMode } from "@/routes/api/public/entitlement";

export type { EntitlementSnapshot, EntitlementMode };

const UNRESOLVED: EntitlementSnapshot = {
  mode: "free", authed: false, subStatus: null, environment: "sandbox",
  periodStart: null, periodEnd: null, used: 0, reserved: 0, cap: 0, remaining: 0,
};

let currentSnapshot: EntitlementSnapshot | null = null;
const listeners = new Set<(s: EntitlementSnapshot | null) => void>();

/** Latest snapshot or null if never resolved. Synchronous, safe for guards. */
export function getEntitlementSnapshot(): EntitlementSnapshot | null {
  return currentSnapshot;
}

export function isPaidMode(m: EntitlementMode | null | undefined): boolean {
  return m === "owner" || m === "pro";
}

export function subscribeEntitlement(fn: (s: EntitlementSnapshot | null) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

async function loadOnce(): Promise<EntitlementSnapshot | null> {
  try {
    const res = await authFetch("/api/public/entitlement", { method: "GET" });
    if (!res.ok) return null;
    const j = (await res.json()) as EntitlementSnapshot;
    currentSnapshot = j;
    listeners.forEach((l) => { try { l(j); } catch { /* noop */ } });
    return j;
  } catch { return null; }
}

/** Force a refresh (call after sign-in/out or checkout completion). */
export function refreshEntitlement(): Promise<EntitlementSnapshot | null> {
  return loadOnce();
}

export function useEntitlement(): { snap: EntitlementSnapshot; loading: boolean; refetch: () => void } {
  const [snap, setSnap] = useState<EntitlementSnapshot | null>(currentSnapshot);
  const [loading, setLoading] = useState<boolean>(currentSnapshot == null);
  useEffect(() => {
    let mounted = true;
    if (!currentSnapshot) {
      loadOnce().then((s) => { if (mounted) { setSnap(s); setLoading(false); } });
    } else {
      setLoading(false);
    }
    const off = subscribeEntitlement((s) => { if (mounted) setSnap(s); });
    return () => { mounted = false; off(); };
  }, []);
  return {
    snap: snap ?? UNRESOLVED,
    loading,
    refetch: () => { setLoading(true); loadOnce().finally(() => setLoading(false)); },
  };
}
