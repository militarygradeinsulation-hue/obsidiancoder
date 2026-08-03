// Inline upgrade nudge — appears at the bottom of the build surface when a
// user hits their daily free-build limit or exhausts their free demo.
// Intentionally not a modal: it sits in context so the user sees their build
// AND the path forward simultaneously. Dismissible, lightweight, no Stripe
// until they click through.

import { useState } from "react";
import { X, Zap, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { CreditsRequiredEnvelope } from "@/lib/credit-gate";

export type NudgeReason =
  | "daily_limit"    // credits_required after free daily build
  | "demo_used"      // free_demo_used
  | "not_pro";       // catch-all not_pro on a non-gated surface

interface Props {
  reason: NudgeReason;
  envelope?: CreditsRequiredEnvelope;
  onUpgrade?: (priceId?: string) => void;   // open PricingModal
  onDismiss: () => void;
}

const COPY: Record<NudgeReason, { headline: string; sub: string; cta: string }> = {
  daily_limit: {
    headline: "You built something. Keep going.",
    sub: "Your free build for today is used. Upgrade to Pro for 1,000 AI credits every month — unlimited builds, cloud saves, and deploy.",
    cta: "Upgrade to Pro — $30/mo",
  },
  demo_used: {
    headline: "Ready to build for real?",
    sub: "Your free demo is complete. Create a free account and get one AI build every day, or upgrade to Pro for unlimited.",
    cta: "Create account or upgrade",
  },
  not_pro: {
    headline: "This feature requires Pro.",
    sub: "Upgrade to Obsidian Pro for 1,000 AI credits/month, cloud saves, GitHub export, and deploy.",
    cta: "See plans",
  },
};

export function UpgradeNudge({ reason, envelope, onUpgrade, onDismiss }: Props) {
  const [leaving, setLeaving] = useState(false);
  const copy = COPY[reason];
  const suggestedPriceId = envelope?.suggestedPriceId;

  function dismiss() {
    setLeaving(true);
    setTimeout(onDismiss, 200);
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 500,
        padding: "12px 16px",
        background: "linear-gradient(135deg, #1a1200 0%, #0f1216 100%)",
        borderTop: "1px solid #c9953d40",
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity: leaving ? 0 : 1,
        transform: leaving ? "translateY(8px)" : "translateY(0)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
      }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#F4A12520",
          border: "1px solid #F4A12540",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        <Zap size={14} color="#F4A125" />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#f2eee7", lineHeight: 1.3 }}>
          {copy.headline}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#8a919b", lineHeight: 1.4 }}>
          {copy.sub}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {reason === "demo_used" && (
          <Link
            to="/auth"
            search={{ mode: "signup" } as Record<string, string>}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid #F4A125",
              color: "#F4A125",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Sign up free
          </Link>
        )}
        <button
          type="button"
          onClick={() => { dismiss(); onUpgrade?.(suggestedPriceId); }}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            background: "#F4A125",
            border: 0,
            color: "#111317",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {copy.cta} <ArrowRight size={12} />
        </button>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: 0,
          color: "#8a919b",
          cursor: "pointer",
          padding: 4,
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
