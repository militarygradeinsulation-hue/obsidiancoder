import { useState } from "react";
import { X, Sparkles, Save, Lock } from "lucide-react";
import { StripeEmbeddedCheckout } from "./StripeEmbeddedCheckout";
import { useAuth, useCredits, useSubscription } from "@/hooks/useSubscription";
import { Link } from "@tanstack/react-router";
import { COST_PER_CREDIT_USD, CAP_PRO_MONTHLY } from "@/lib/credit-gate";

type Plan = { priceId: string; title: string; price: string; cadence: string; blurb: string; features: string[]; icon: any };

// Free plan is descriptive-only — no priceId, no checkout.
const FREE_FEATURES = [
  "Deterministic edits, preview, and export",
  "Project Fusion, local version history",
  "Local screenshots and downloads",
  "Nothing leaves your browser",
  "AI generation, image generation, cloud save, and GitHub deploy are OFF",
];

const PRO_CREDIT_USD = (CAP_PRO_MONTHLY * COST_PER_CREDIT_USD).toFixed(2);

const PLANS: Plan[] = [
  {
    priceId: "obsidian_pro_monthly",
    title: "Obsidian Pro",
    price: "$30",
    cadence: "/month",
    blurb: `Cloud AI, image generation, save, share, and GitHub deploy. Includes ${CAP_PRO_MONTHLY.toLocaleString()} credits per subscription period (~$${PRO_CREDIT_USD} of provider cost at $${COST_PER_CREDIT_USD.toFixed(3)}/credit).`,
    features: [
      `${CAP_PRO_MONTHLY.toLocaleString()} credits per billing period`,
      "Cloud AI generation (Gemini 3 · GPT-5 tiers)",
      "Image generation (Leonardo · Higgsfield · Gemini)",
      "Save to your library, publish share URLs",
      "Push to GitHub and enable GitHub Pages",
      "Cancel anytime",
    ],
    icon: Sparkles,
  },
];
// Save & Host one-time purchase is temporarily unavailable until atomic
// per-build consumption is wired end-to-end. Keeping the icon import for
// future re-enable.
void Save;

export function PricingModal({ onClose, initialPriceId }: { onClose: () => void; initialPriceId?: string }) {
  const { userId, loading } = useAuth();
  const { isPro } = useSubscription();
  const credits = useCredits();
  const [selected, setSelected] = useState<string | null>(initialPriceId ?? null);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-4xl my-8 rounded-2xl border border-[#c9953d]/30 bg-[#0a0b0d] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-[#f2eee7]">Upgrade Aetheris Obsidian</h2>
            <p className="text-xs text-[#B6BCC8]">
              Free Local Mode always works. Pro unlocks cloud AI, image generation, save, share, and deploy.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-white/5 text-[#B6BCC8]" aria-label="Close upgrade modal">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isPro && !credits.loading && (
          <div className="px-6 py-3 border-b border-white/10 text-xs text-[#B6BCC8] space-y-0.5">
            <div>
              Obsidian Pro · <span className="text-[#f2eee7]">{credits.used.toLocaleString()}</span> used
              {credits.reserved > 0 && <> · <span className="text-[#f2eee7]">{credits.reserved.toLocaleString()}</span> reserved</>}
              {" · "}<span className="text-[#f2eee7]">{credits.remaining.toLocaleString()}</span> of {credits.cap.toLocaleString()} remaining
            </div>
            {credits.periodStart && credits.periodEnd && (
              <div className="opacity-70">
                Period: {new Date(credits.periodStart).toLocaleDateString()} → {new Date(credits.periodEnd).toLocaleDateString()}
              </div>
            )}
          </div>
        )}

        {!loading && !userId && (
          <div className="p-8 text-center">
            <p className="text-sm text-[#B6BCC8] mb-4">Sign in to purchase and unlock features on your account.</p>
            <Link to="/auth" className="inline-flex px-4 py-2 rounded-md bg-[#F4A125] hover:bg-[#DD9324] text-black text-sm font-medium">
              Sign in / Create account
            </Link>
          </div>
        )}

        {userId && !selected && (
          <div className="p-6 grid gap-4 sm:grid-cols-2">
            {/* Free Local — descriptive only, no checkout */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 flex flex-col opacity-90">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="h-4 w-4 text-[#B6BCC8]" />
                <h3 className="text-[#f2eee7] font-semibold">Free Local</h3>
              </div>
              <div className="mb-2">
                <span className="text-3xl font-bold text-[#f2eee7]">$0</span>
                <span className="text-sm text-[#B6BCC8] ml-1">always</span>
              </div>
              <p className="text-xs text-[#B6BCC8] mb-4">
                Local editing only. Nothing is sent to our servers. No AI, no cloud save, no deploy.
              </p>
              <ul className="text-xs text-[#B6BCC8] space-y-1.5 mb-5 flex-1">
                {FREE_FEATURES.map((f) => (<li key={f}>• {f}</li>))}
              </ul>
              <div className="w-full py-2 rounded-md border border-white/10 text-[#B6BCC8] text-sm text-center">
                Included with any account
              </div>
            </div>

            {PLANS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.priceId} className="rounded-xl border border-[#c9953d]/30 bg-white/[0.02] p-5 flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4 text-[#F4A125]" />
                    <h3 className="text-[#f2eee7] font-semibold">{p.title}</h3>
                  </div>
                  <div className="mb-2">
                    <span className="text-3xl font-bold text-[#f2eee7]">{p.price}</span>
                    <span className="text-sm text-[#B6BCC8] ml-1">{p.cadence}</span>
                  </div>
                  <p className="text-xs text-[#B6BCC8] mb-4">{p.blurb}</p>
                  <ul className="text-xs text-[#B6BCC8] space-y-1.5 mb-5 flex-1">
                    {p.features.map((f) => (<li key={f}>• {f}</li>))}
                  </ul>
                  <button
                    onClick={() => setSelected(p.priceId)}
                    className="w-full py-2 rounded-md bg-[#F4A125] hover:bg-[#DD9324] text-black text-sm font-semibold transition-colors"
                  >
                    Continue
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {userId && selected && (
          <div className="p-4">
            <button onClick={() => setSelected(null)} className="text-xs text-[#B6BCC8] hover:text-[#f2eee7] mb-3">← Back to plans</button>
            <StripeEmbeddedCheckout priceId={selected} />
          </div>
        )}
      </div>
    </div>
  );
}
