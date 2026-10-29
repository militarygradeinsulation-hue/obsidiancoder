import * as React from "react";
import { useAuth } from "@/hooks/useSubscription";
import { getAccountCode } from "@/lib/account-code";
import { resolveBrainLibraryCode } from "@/lib/obsidian-brain";
import { syncBrainRecords } from "@/lib/brain-cloud";

/** Sync existing scored build outcomes while any Obsidian workspace is open.
 * The Brain dashboard is not required to be visited first.
 */
export function BrainCloudSync(): null {
  const { userId } = useAuth();
  React.useEffect(() => {
    if (!userId) return;
    let active = true;
    let running = false;
    const sync = async () => {
      if (!active || running || document.visibilityState === "hidden") return;
      running = true;
      try { await syncBrainRecords(userId, resolveBrainLibraryCode(getAccountCode())); }
      catch { /* local learning continues; retry on next focus/interval */ }
      finally { running = false; }
    };
    void sync();
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    const timer = window.setInterval(() => void sync(), 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
    };
  }, [userId]);
  return null;
}
