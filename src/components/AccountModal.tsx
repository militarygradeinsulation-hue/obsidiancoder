import { useState } from "react";
import { X, LogOut, ExternalLink, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useSubscription } from "@/hooks/useSubscription";
import { createPortalSession, cancelSubscriptionNow } from "@/utils/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";

export function AccountModal({ onClose }: { onClose: () => void }) {
  const { userId, email } = useAuth();
  const { subscription, isPro, refetch } = useSubscription();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    await supabase.auth.signOut();
    onClose();
  }

  async function openPortal() {
    setBusy("portal"); setError(null);
    try {
      const res = await createPortalSession({
        data: { environment: getStripeEnvironment(), returnUrl: window.location.href },
      });
      if ("error" in res) throw new Error(res.error);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open billing portal");
    } finally { setBusy(null); }
  }

  async function cancelNow() {
    if (!confirm("Cancel Obsidian Pro immediately? Access ends the moment you confirm.")) return;
    setBusy("cancel"); setError(null);
    try {
      const res = await cancelSubscriptionNow({ data: { environment: getStripeEnvironment() } });
      if ("error" in res) throw new Error(res.error);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#c9953d]/30 bg-[#0a0b0d] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-[#f2eee7]">Account</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 text-[#B6BCC8]"><X className="h-4 w-4" /></button>
        </div>

        {!userId ? (
          <div className="p-6 text-center">
            <p className="text-sm text-[#B6BCC8] mb-4">You're not signed in.</p>
            <Link to="/auth" onClick={onClose} className="inline-flex px-4 py-2 rounded-md bg-[#F4A125] hover:bg-[#DD9324] text-black text-sm font-medium">
              Sign in / Create account
            </Link>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#B6BCC8]">Signed in as</div>
              <div className="text-sm text-[#f2eee7] break-all">{email}</div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[#B6BCC8] mb-1">Plan</div>
              {isPro ? (
                <>
                  <div className="text-sm text-[#F4A125] font-semibold">Obsidian Pro — Active</div>
                  {subscription?.current_period_end && (
                    <div className="text-[11px] text-[#B6BCC8] mt-0.5">
                      Renews {new Date(subscription.current_period_end).toLocaleDateString()}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-[#f2eee7]">Free</div>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-200 flex gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}

            {isPro && (
              <div className="grid gap-2">
                <button
                  onClick={openPortal}
                  disabled={busy !== null}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-white/10 hover:bg-white/5 text-xs text-[#f2eee7] disabled:opacity-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Manage billing & invoices
                </button>
                <button
                  onClick={cancelNow}
                  disabled={busy !== null}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-red-800/60 hover:bg-red-950/40 text-xs text-red-200 disabled:opacity-50"
                >
                  {busy === "cancel" ? "Canceling…" : "Cancel subscription immediately"}
                </button>
              </div>
            )}

            <button
              onClick={signOut}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-white/10 hover:bg-white/5 text-xs text-[#B6BCC8]"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
