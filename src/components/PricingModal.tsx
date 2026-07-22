import { useState } from "react";
import { X, Check, Lock, Mail } from "lucide-react";
import { StripeEmbeddedCheckout } from "./StripeEmbeddedCheckout";
import { useAuth, useCredits, useSubscription } from "@/hooks/useSubscription";
import { Link } from "@tanstack/react-router";
import { PLAN_TIERS, type PlanTier } from "@/lib/plans";

const FREE_FEATURES = [
  "Deterministic edits, preview, and export",
  "Project Fusion, local version history",
  "Local screenshots and downloads",
  "Nothing leaves your browser",
];

const waitlistHref = (tierId: string) => `/waitlist?tier=${encodeURIComponent(tierId)}`;
const CONTACT_MAILTO = "mailto:hello@aetheris.technology?subject=Obsidian%20Enterprise%20inquiry";

export function PricingModal({ onClose, initialPriceId }: { onClose: () => void; initialPriceId?: string }) {
  const { userId, loading } = useAuth();
  const { isPro } = useSubscription();
  const credits = useCredits();
  const [selected, setSelected] = useState<string | null>(initialPriceId ?? null);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-6xl my-8 rounded-2xl border border-[#c9953d]/30 bg-[#0a0b0d] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-[#f2eee7]">Build, Launch, and Grow Software with AI</h2>
            <p className="text-xs text-[#B6BCC8]">
              Choose the plan that matches the software you want to ship. Free Local Mode always works.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-white/5 text-[#B6BCC8]" aria-label="Close upgrade modal">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isPro && !credits.loading && (
          <div className="px-6 py-3 border-b border-white/10 text-xs text-[#B6BCC8]">
            Active plan · <span className="text-[#f2eee7]">{credits.used.toLocaleString()}</span> used
            {credits.reserved > 0 && <> · <span className="text-[#f2eee7]">{credits.reserved.toLocaleString()}</span> reserved</>}
            {" · "}<span className="text-[#f2eee7]">{credits.remaining.toLocaleString()}</span> of {credits.cap.toLocaleString()} remaining
            {credits.periodStart && credits.periodEnd && (
              <span className="opacity-70"> · {new Date(credits.periodStart).toLocaleDateString()} → {new Date(credits.periodEnd).toLocaleDateString()}</span>
            )}
          </div>
        )}

        {!loading && !userId && (
          <div className="p-8 text-center border-b border-white/10">
            <p className="text-sm text-[#B6BCC8] mb-4">Sign in to purchase and unlock features on your account.</p>
            <Link to="/auth" className="inline-flex px-4 py-2 rounded-md bg-[#F4A125] hover:bg-[#DD9324] text-black text-sm font-medium">
              Sign in / Create account
            </Link>
          </div>
        )}

        {userId && selected ? (
          <div className="p-6">
            <button onClick={() => setSelected(null)} className="text-xs text-[#B6BCC8] hover:text-[#f2eee7] mb-3">← Back to plans</button>
            <StripeEmbeddedCheckout priceId={selected} />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Free Local — always available */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Lock className="h-4 w-4 text-[#B6BCC8]" />
                  <h3 className="text-[#f2eee7] font-semibold">Free Local</h3>
                  <span className="text-xs text-[#B6BCC8]">$0 · always</span>
                </div>
                <p className="text-xs text-[#B6BCC8]">Local editing only. Nothing is sent to our servers.</p>
              </div>
              <ul className="text-xs text-[#B6BCC8] grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {FREE_FEATURES.map((f) => <li key={f}>• {f}</li>)}
              </ul>
            </div>

            {/* Tier grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {PLAN_TIERS.map((p) => (
                <TierCard key={p.id} tier={p} disabled={!userId} onCheckout={() => p.priceId && setSelected(p.priceId)} />
              ))}
            </div>

            <p className="text-[11px] text-[#B6BCC8] opacity-70 text-center">
              Prices in USD. Cancel anytime. Additional tiers roll out as new plans go live in Stripe.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TierCard({ tier, disabled, onCheckout }: { tier: PlanTier; disabled: boolean; onCheckout: () => void }) {
  const Icon = tier.icon;
  const isFeatured = !!tier.featured;

  const cta = (() => {
    if (tier.cta === "checkout" && tier.priceId) {
      return (
        <button
          onClick={onCheckout}
          disabled={disabled}
          className="w-full py-2 rounded-md bg-[#F4A125] hover:bg-[#DD9324] disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-semibold transition-colors"
        >
          {disabled ? "Sign in to continue" : `Choose ${tier.name}`}
        </button>
      );
    }
    if (tier.cta === "contact") {
      return (
        <a
          href={CONTACT_MAILTO}
          className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-md border border-[#c9953d]/40 text-[#F4A125] hover:bg-[#F4A125]/10 text-sm font-semibold transition-colors"
        >
          <Mail className="h-3.5 w-3.5" /> Contact sales
        </a>
      );
    }
    return (
      <a
        href={waitlistHref(tier.id)}
        className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-md border border-white/15 text-[#f2eee7] hover:bg-white/5 text-sm font-medium transition-colors"
      >
        Join Early Access
      </a>
    );
  })();

  return (
    <div
      className={`relative rounded-xl border p-5 flex flex-col bg-white/[0.02] ${
        isFeatured ? "border-[#F4A125]/60 shadow-[0_0_0_1px_rgba(244,161,37,0.15)]" : "border-white/10"
      }`}
    >
      {isFeatured && (
        <div className="absolute -top-2 left-4 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#F4A125] text-black font-semibold">
          Most popular
        </div>
      )}
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-[#F4A125]" />
        <h3 className="text-[#f2eee7] font-semibold">{tier.name}</h3>
      </div>
      <div className="mb-2">
        <span className="text-3xl font-bold text-[#f2eee7]">{tier.price}</span>
        {tier.originalPrice && (
          <span className="text-sm text-[#B6BCC8] line-through ml-2">{tier.originalPrice}</span>
        )}
        {tier.cadence && <span className="text-sm text-[#B6BCC8] ml-1">{tier.cadence}</span>}
      </div>
      {tier.founding && (
        <p className="text-[11px] uppercase tracking-widest text-[#F4A125] mb-1">
          Founding Member Pricing · First 100 · locked in for life
        </p>
      )}
      <p className="text-xs text-[#f2eee7] mb-1">{tier.headline}</p>
      <p className="text-[11px] text-[#B6BCC8] mb-4">{tier.bestFor}</p>
      <ul className="text-xs text-[#B6BCC8] space-y-1.5 mb-5 flex-1">
        {tier.outcomes.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="h-3.5 w-3.5 text-[#F4A125] shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {cta}
    </div>
  );
}
