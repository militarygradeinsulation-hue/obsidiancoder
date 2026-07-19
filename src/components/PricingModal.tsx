import { useState } from "react";
import { X, Sparkles, Save } from "lucide-react";
import { StripeEmbeddedCheckout } from "./StripeEmbeddedCheckout";
import { useAuth } from "@/hooks/useSubscription";
import { Link } from "@tanstack/react-router";

type Plan = { priceId: string; title: string; price: string; cadence: string; blurb: string; features: string[]; icon: any };

const PLANS: Plan[] = [
  {
    priceId: "obsidian_pro_monthly",
    title: "Obsidian Pro",
    price: "$30",
    cadence: "/month",
    blurb: "Unlimited builds, saves, Go Live, and GitHub deploys.",
    features: ["Unlimited AI generations", "Priority Gemini 3 & GPT-5 models", "Unlimited Save Project", "Unlimited Go Live URLs", "GitHub push & Pages", "Cancel anytime"],
    icon: Sparkles,
  },
  {
    priceId: "save_build_onetime",
    title: "Save & Host a Build",
    price: "$20",
    cadence: "one-time",
    blurb: "Permanently save one build and host it at a public live URL.",
    features: ["Keep this build forever", "Public share URL", "No login required to view", "One-time payment"],
    icon: Save,
  },
];

export function PricingModal({ onClose, initialPriceId }: { onClose: () => void; initialPriceId?: string }) {
  const { userId, loading } = useAuth();
  const [selected, setSelected] = useState<string | null>(initialPriceId ?? null);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
      <div className="w-full max-w-4xl my-8 rounded-2xl border border-[#c9953d]/30 bg-[#0a0b0d] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-[#f2eee7]">Upgrade Aetheris Obsidian</h2>
            <p className="text-xs text-[#B6BCC8]">Unlock unlimited builds or permanently save this one.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-white/5 text-[#B6BCC8]"><X className="h-4 w-4" /></button>
        </div>

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
            {PLANS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.priceId} className="rounded-xl border border-white/10 bg-white/[0.02] p-5 flex flex-col">
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
