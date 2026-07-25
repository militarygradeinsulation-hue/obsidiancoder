// Phase 1 tier catalog for the AI Engineering Operating System.
// Outcome-focused descriptions; no per-credit accounting exposed here.
// Only tiers with `priceId` route through Stripe checkout. Others surface
// a waitlist CTA until the corresponding Stripe price is live.

import type { LucideIcon } from "lucide-react";
import { Rocket, Sparkles, Briefcase, Building2, Crown, Landmark, Zap } from "lucide-react";

export type PlanTierId =
  | "try_pro"
  | "starter"
  | "creator"
  | "professional"
  | "business"
  | "elite"
  | "enterprise";


export interface PlanTier {
  id: PlanTierId;
  name: string;
  price: string;            // display price (founding if applicable), e.g. "$19"
  cadence: string;          // "/month" or "Custom"
  headline: string;         // one-line outcome positioning
  bestFor: string;          // who it's for
  outcomes: string[];       // what you can accomplish
  featured?: boolean;
  priceId?: string;         // Stripe lookup key when live
  cta: "checkout" | "waitlist" | "contact";
  icon: LucideIcon;
  /** Original/future price shown struck through when founding pricing is active. */
  originalPrice?: string;
  /** When true, surface the Founding Member Pricing label (first 100, locked for life). */
  founding?: boolean;
}

export const TRY_PRO_PRICE_ID = "obsidian_try_pro_7day";
export const TRIAL_CREDIT_COUPON_ID = "obsidian_trial_credit_5";

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "try_pro",
    name: "Try Pro",
    price: "$5",
    cadence: "one-time · 7 days",
    headline: "Build one real app with the full premium experience.",
    bestFor: "Anyone who wants to feel the Creator experience before committing.",
    outcomes: [
      "1 premium project for 7 days",
      "Full premium model access",
      "Deploy & share your build",
      "$5 credited toward Creator if you upgrade",
      "One trial per account",
    ],
    priceId: TRY_PRO_PRICE_ID,
    cta: "checkout",
    icon: Zap,
  },

  {
    id: "starter",
    name: "Starter",
    price: "$19",
    originalPrice: "$29",
    founding: true,
    cadence: "/month",
    headline: "Perfect for learning and small projects.",
    bestFor: "First-time builders exploring what AI can ship.",
    outcomes: [
      "1 active workspace",
      "AI app & website generation",
      "Landing pages",
      "Basic editing",
      "Community support",
    ],
    priceId: "obsidian_starter_monthly",
    cta: "checkout",
    icon: Rocket,
  },
  {
    id: "creator",
    name: "Creator",
    price: "$49",
    originalPrice: "$79",
    founding: true,
    cadence: "/month",
    headline: "For solo builders shipping regularly.",
    bestFor: "Independent builders and side-project founders.",
    outcomes: [
      "Everything in Starter",
      "Unlimited workspaces",
      "Full-stack app generation",
      "Deploy to the web",
      "GitHub integration",
      "Priority AI",
      "Faster generations",
    ],
    priceId: "obsidian_creator_monthly",
    cta: "checkout",
    featured: true,
    icon: Sparkles,
  },
  {
    id: "professional",
    name: "Professional",
    price: "$149",
    cadence: "/month",
    headline: "For businesses shipping products.",
    bestFor: "Freelancers and small studios delivering client work.",
    outcomes: [
      "Everything in Creator",
      "Advanced AI engineering",
      "Team features",
      "API integrations",
      "Higher usage limits",
      "Priority support",
    ],
    priceId: "obsidian_professional_monthly",
    cta: "checkout",
    icon: Briefcase,
  },
  {
    id: "business",
    name: "Business",
    price: "$299",
    cadence: "/month",
    headline: "For agencies and growing companies.",
    bestFor: "Small companies shipping customer-facing software.",
    outcomes: [
      "Everything in Professional",
      "Multi-user collaboration",
      "Shared projects",
      "White-label/client work",
      "Highest limits",
      "Dedicated onboarding",
    ],
    priceId: "obsidian_business_monthly",
    cta: "checkout",
    icon: Building2,
  },
  {
    id: "elite",
    name: "Elite",
    price: "$499",
    cadence: "/month",
    headline: "Your AI engineering department.",
    bestFor: "Growing companies running multiple products.",
    outcomes: [
      "Unlimited projects",
      "Maximum AI capacity",
      "Fastest generation queue",
      "Premium support",
      "Early access to new capabilities",
      "Direct founder feedback channel",
    ],
    priceId: "obsidian_elite_monthly",
    cta: "checkout",
    icon: Crown,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    headline: "Custom AI engineering, security, and support.",
    bestFor: "Regulated industries and platform teams.",
    outcomes: [
      "SSO, SCIM, and role-based access",
      "Private model routing and data controls",
      "Dedicated success and engineering partner",
      "Custom SLAs and procurement",
    ],
    cta: "contact",
    icon: Landmark,
  },
];

export function getTierById(id: PlanTierId): PlanTier | undefined {
  return PLAN_TIERS.find((t) => t.id === id);
}

/**
 * Legacy Stripe lookup keys → current tier id.
 * `obsidian_pro_monthly` was the pre-tier $30/mo entry price. Existing
 * subscribers on that price are treated as Creator so entitlement, plan
 * badges, and dashboards resolve correctly. NEW checkout for Creator must
 * use `obsidian_creator_monthly` — never re-route it back to the legacy key.
 */
export const LEGACY_PRICE_TIER_MAP: Record<string, PlanTierId> = {
  obsidian_pro_monthly: "creator",
};

/** Map a Stripe priceId (or lookup key) back to a tier. */
export function tierForPriceId(priceId: string | null | undefined): PlanTier | undefined {
  if (!priceId) return undefined;
  const direct = PLAN_TIERS.find((t) => t.priceId === priceId);
  if (direct) return direct;
  const legacy = LEGACY_PRICE_TIER_MAP[priceId];
  if (legacy) return getTierById(legacy);
  return undefined;
}

/**
 * Monthly AI credit cap per tier. Enterprise is negotiated per-contract and
 * defaults to Elite until custom terms are provisioned. `capForTier(null)`
 * returns 0 (free plan — no paid AI operations).
 */
export const TIER_CREDIT_CAP: Record<PlanTierId, number> = {
  starter: 400,
  creator: 1000,
  professional: 2500,
  business: 6000,
  elite: 12000,
  enterprise: 12000,
};

export function capForTier(tier: PlanTierId | null | undefined): number {
  if (!tier) return 0;
  return TIER_CREDIT_CAP[tier] ?? 0;
}

/** Lookup keys the server accepts for Stripe checkout (Enterprise is contact-sales). */
export const PURCHASABLE_LOOKUP_KEYS: readonly string[] = PLAN_TIERS
  .filter((t) => t.cta === "checkout" && t.priceId)
  .map((t) => t.priceId!) as readonly string[];



/** Plan-aware navigation entries, gated by tier when `minTier` is set. */
export interface PlanNavItem {
  id: string;
  label: string;
  href: string;
  minTier?: PlanTierId;
  soon?: boolean;
}

// Ordered lowest → highest for gating comparisons.
const TIER_ORDER: PlanTierId[] = [
  "starter", "creator", "professional", "business", "elite", "enterprise",
];

export function tierAtLeast(current: PlanTierId | null | undefined, min: PlanTierId): boolean {
  if (!current) return false;
  return TIER_ORDER.indexOf(current) >= TIER_ORDER.indexOf(min);
}

export const DASHBOARD_NAV: PlanNavItem[] = [
  { id: "overview",     label: "Overview",         href: "/dashboard" },
  { id: "projects",     label: "Projects",         href: "/dashboard#projects" },
  { id: "deployments",  label: "Deployments",      href: "/dashboard#deployments", soon: true },
  { id: "revenue",      label: "Revenue",          href: "/dashboard#revenue", minTier: "business", soon: true },
  { id: "security",     label: "Security",         href: "/dashboard#security", soon: true },
  { id: "performance",  label: "Performance",      href: "/dashboard#performance", soon: true },
  { id: "team",         label: "Team",             href: "/dashboard#team", minTier: "business", soon: true },
  { id: "compliance",   label: "Compliance",       href: "/dashboard#compliance", minTier: "elite", soon: true },
];
