import * as React from "react";
import { useAuth } from "@/hooks/useSubscription";
import { clearPlanCache, planCacheStats, PLAN_CACHE_MAX } from "@/lib/plan-cache";

/** Shows this account's device-local planner cache and lets the user clear only that cache. */
export function PlannerCachePanel() {
  const { userId } = useAuth();
  const [stats, setStats] = React.useState<{
    entries: number;
    hits: number;
    misses: number;
  } | null>(null);
  const [msg, setMsg] = React.useState("");
  const refresh = React.useCallback(() => {
    void planCacheStats(userId).then(setStats);
  }, [userId]);
  React.useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <section className="obs-node lg:col-span-3" aria-labelledby="planner-cache-h">
      <h3 id="planner-cache-h">
        Local planner cache{" "}
        <span className="obs-pill" data-tone="muted">
          this device
        </span>
      </h3>
      {!userId ? (
        <p className="text-sm opacity-70">
          Sign in to reuse art-direction plans on this device. Nothing is cached while signed out.
        </p>
      ) : (
        <div className="text-sm space-y-2">
          <p>
            {stats
              ? `${stats.hits} reused plans · ${stats.misses} lookups that needed the planner · ${stats.entries}/${PLAN_CACHE_MAX} saved (72-hour expiry)`
              : "Reading…"}
          </p>
          <p className="text-xs opacity-60">
            Stored only in this browser, unencrypted, and the browser may clear it. Your projects
            and cloud saves are not affected.
          </p>
          <button
            type="button"
            className="min-h-11 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            onClick={async () => {
              await clearPlanCache(userId);
              setMsg("Planner cache cleared.");
              refresh();
            }}
          >
            Clear planner cache
          </button>
          <p role="status" className="text-xs opacity-70">
            {msg}
          </p>
        </div>
      )}
    </section>
  );
}
