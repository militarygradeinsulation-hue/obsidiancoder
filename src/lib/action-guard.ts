// Centralized client-side guard for every protected action. If the current
// entitlement is not owner/pro (or unresolved), it opens the PricingModal via
// the global `obs:paywall` event and returns false — the caller MUST return
// before starting any protected network request or server-function call.

import { getEntitlementSnapshot, refreshEntitlement, isPaidMode } from "@/hooks/useEntitlement";
import { creditsRequiredEnvelope, type Operation } from "@/lib/credit-gate";

export type GuardOperation =
  | Operation
  | "cloud_publish"
  | "github_verify"
  | "github_list"
  | "github_import"
  | "supabase_write"
  | "adaptive_write"
  | "analytics";

export interface GuardResult { allowed: boolean; reason?: "auth_required" | "not_pro" | "unresolved"; }

function dispatchPaywall(op: GuardOperation, reason: "auth_required" | "not_pro" | "unresolved") {
  if (typeof window === "undefined") return;
  const envelope = creditsRequiredEnvelope({
    code: reason === "auth_required" ? "auth_required" : "not_pro",
    // Operation strings from credit-gate are a subset; cast for envelope.
    operation: (["generate_html","generate_html_patch","generate_image","enhance_prompt","cloud_save","cloud_share","github_deploy"] as string[]).includes(op) ? (op as Operation) : undefined,
    message:
      reason === "auth_required" ? "Sign in and activate Obsidian Pro to use this feature. Local editing remains free." :
      reason === "not_pro"       ? "This action requires Obsidian Pro. Local editing remains free." :
                                   "Checking your account… reopen this action once your status loads.",
  });
  window.dispatchEvent(new CustomEvent("obs:paywall", {
    detail: { envelope, status: reason === "auth_required" ? 401 : 402, url: `client-guard:${op}` },
  }));
}

/**
 * Guard a protected action BEFORE any network I/O. Returns true when the
 * caller may proceed (owner or active Pro). On any other case it dispatches
 * `obs:paywall` and returns false without touching the network.
 * Async only because it may need to load the entitlement snapshot once.
 */
export async function requirePaidAction(op: GuardOperation): Promise<GuardResult> {
  let snap = getEntitlementSnapshot();
  if (!snap) {
    // Try once to resolve, but never let the guard hang forever.
    snap = await Promise.race<Awaited<ReturnType<typeof refreshEntitlement>>>([
      refreshEntitlement(),
      new Promise((r) => setTimeout(() => r(null), 1500)),
    ]);
  }
  if (!snap) {
    dispatchPaywall(op, "unresolved");
    return { allowed: false, reason: "unresolved" };
  }
  if (isPaidMode(snap.mode)) return { allowed: true };
  const reason: "auth_required" | "not_pro" = snap.authed ? "not_pro" : "auth_required";
  dispatchPaywall(op, reason);
  return { allowed: false, reason };
}

/** Synchronous variant for tight loops / render decisions. Never triggers I/O. */
export function isPaidNow(): boolean {
  const snap = getEntitlementSnapshot();
  return !!snap && isPaidMode(snap.mode);
}
