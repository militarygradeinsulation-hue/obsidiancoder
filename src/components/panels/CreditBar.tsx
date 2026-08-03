// Compact credit bar shown in the topbar. Combines authoritative plan
// credits (from useEntitlement) with the live session cost estimate
// (from cost-metrics). Progress bar shows plan usage; the session
// estimate sits underneath as a secondary line.

import { Zap } from "lucide-react";
import type { CostSnapshot } from "@/lib/cost-metrics";

type Props = {
  mode: "owner" | "pro" | "free" | "loading" | string;
  used: number;
  cap: number;
  remaining: number;
  cost: CostSnapshot;
  onUpgrade?: () => void;
};

export function CreditBar({ mode, used, cap, remaining, cost, onUpgrade }: Props) {
  const isOwner = mode === "owner";
  const isPro = mode === "pro";
  // Free signed-in users have cap:1 (daily build); free unsigned have cap:0.
  const isFreeBuild = mode === "free" && cap === 1;
  const showBar = isOwner || isPro || isFreeBuild;
  const pct = showBar && cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const barLabel = isOwner
    ? "Unlimited"
    : isPro
      ? `${remaining} / ${cap} left`
      : isFreeBuild
        ? remaining > 0 ? "1 free build today" : "Daily build used"
        : "Locked";
  const editVsBuild = `${cost.deterministicEdits} edit${cost.deterministicEdits === 1 ? "" : "s"} · ${cost.aiCalls} build${cost.aiCalls === 1 ? "" : "s"}`;

  return (
    <div
      className="obs-credit-bar"
      title={
        isOwner
          ? `Owner — unlimited. Session: ${editVsBuild} · ~$${cost.estimatedCostUsd.toFixed(4)}`
          : isPro
            ? `Plan: ${used}/${cap} credits used this period. Session: ${editVsBuild} · ~$${cost.estimatedCostUsd.toFixed(4)}`
            : isFreeBuild
              ? remaining > 0 ? `1 free AI build available today. Session: ${editVsBuild}` : `Daily build used — resets tomorrow. Upgrade for 1,000/month. Session: ${editVsBuild}`
              : `Upgrade to unlock credits. Session: ${editVsBuild}`
      }
      role="group"
      aria-label="Credit usage"
    >
      <div className="obs-credit-head">
        <Zap className="h-3 w-3" strokeWidth={2} />
        <span className="obs-credit-label">{barLabel}</span>
        <span className="obs-credit-sub">~${cost.estimatedCostUsd.toFixed(3)}</span>
      </div>
      <div className="obs-credit-track" aria-hidden={!showBar}>
        <div
          className={"obs-credit-fill " + (pct > 90 ? "is-warn" : "")}
          style={{ width: isOwner ? "100%" : `${pct}%` }}
        />
      </div>
      <div className="obs-credit-foot">
        <span>{editVsBuild}</span>
        {!showBar && onUpgrade && (
          <button type="button" className="obs-credit-upgrade" onClick={onUpgrade}>
            Upgrade
          </button>
        )}
      </div>
    </div>
  );
}
