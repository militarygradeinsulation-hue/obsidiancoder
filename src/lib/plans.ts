// Tier catalog for the AI Engineering Operating System.
// Outcome-focused descriptions; no per-credit accounting exposed here.
// Only tiers with `priceId` route through Stripe checkout.
//
// Simplified to exactly 3 tiers on request: Pocket, Vibe, and a tailored business offering. No
// waitlist tier — the earlier 7-tier ladder (with 4 waitlist-gated
// placeholders) is gone entirely, not just hidden.

import type { LucideIcon } from "lucide-react";
import { Sparkles, Landmark } from "lucide-react";

export type PlanTierId =
  | "pocket"
  | "vibe"
  | "custom";

/** Monthly AI credit allowance for the Obsidian Pocket plan. */
export const POCKET_MONTHLY_CREDITS = 300;

/**
 * Credit Rollover add-on: for an extra $5/month on any paid plan, unused
 * AI credits from the previous billing period carry into the current one
 * instead of expiring. The carryover is capped at one month of the plan's
 * base allowance (standard rollover practice — credits can't accumulate
 * without bound). Stripe lookup key: obsidian_rollover_monthly.
 */
export const ROLLOVER_PRICE_ID = "obsidian_rollover_monthly";
export const ROLLOVER_MONTHLY_PRICE = 5;

/**
 * Limited-time launch promotion: a Pocket subscription CREATED (not
 * renewed, not updated -- see the webhook handler) before
 * POCKET_PROMO_ENDS_AT gets this many credits per month instead of the
 * standard POCKET_MONTHLY_CREDITS, for the life of that subscription.
 * Chosen as a concrete, communicable window rather than an open-ended
 * "for now" -- 14 days from the day this was built (2026-09-26), so it
 * reads as genuinely limited, not indefinite. Adjust the date directly
 * here if a different window is wanted; nothing else needs to change.
 */
export const POCKET_PROMO_CREDITS = 1000;
export const POCKET_PROMO_ENDS_AT = "2026-10-10T23:59:59Z";

/**
 * The promo-eligibility rule, extracted as a pure function so it's testable
 * in isolation from the webhook's Stripe/Supabase plumbing. Returns the
 * credit cap to grant, or undefined if this subscription doesn't qualify.
 * Deliberately requires the caller to state isNewSubscription explicitly
 * (no default) -- there is no safe default for "is this really a brand
 * new subscription," and a silent default here is exactly the kind of
 * mistake that would grant the promo on every renewal instead of once.
 */
export function resolvePocketPromoCap(params: {
  isNewSubscription: boolean;
  tierId: PlanTierId | undefined;
  now?: number;
}): number | undefined {
  const { isNewSubscription, tierId, now = Date.now() } = params;
  if (!isNewSubscription) return undefined;
  if (tierId !== "pocket") return undefined;
  if (now >= new Date(POCKET_PROMO_ENDS_AT).getTime()) return undefined;
  return POCKET_PROMO_CREDITS;
}

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

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "pocket",
    name: "Pocket",
    price: "$10",
    cadence: "/month",
    headline: "Describe it, get a working app. No setup, no learning curve.",
    bestFor: "Anyone who wants to ship something real this week.",
    outcomes: [
      `${POCKET_MONTHLY_CREDITS} AI credits every month`,
      "Full access to Obsidian Pocket",
      "Watch your app get built live, not a loading screen",
      "Builds survive a dropped connection — pick up right where you left off",
      "Choose the AI model that builds your app",
      "Save every project to your account",
      "Copy and export your code, anytime",
      "Publish and share to the community library",
    ],
    priceId: "obsidian_pocket_monthly",
    cta: "checkout",
    icon: Sparkles,
  },
  {
    id: "vibe",
    name: "Vibe",
    // Verified 2026-08-09: the Stripe price at lookup key
    // "obsidian_creator_monthly" is $39.00/month USD, matching this
    // display price. (It was previously $79 and has been corrected.)
    price: "$39",

    cadence: "/month",
    headline: "The full studio. Build it, deploy it, ship it to a real domain.",
    bestFor: "Builders who need what they make to actually go live.",
    outcomes: [
      "1,000 AI credits every month",
      "Everything in Pocket, plus:",
      "Deploy to the live web in one click",
      "Full-stack generation — database, auth, the works",
      "GitHub sync",
      "Priority AI and faster generations",
    ],
    priceId: "obsidian_creator_monthly",
    cta: "checkout",
    featured: true,
    icon: Sparkles,
  },
  {
    id: "custom",
    name: "Business Coder",
    price: "Tailored",
    cadence: "",
    headline: "We build the coder your business needs, specifically tailored so you can build anything you want.",
    bestFor: "Businesses that need their own purpose-built AI software creation system.",
    outcomes: [
      "SSO, SCIM, and role-based access",
      "Private model routing and data controls",
      "Dedicated success and engineering partner",
      "Business-specific SLAs and procurement",
    ],
    cta: "contact",
    icon: Landmark,
  },
];

/**
 * What a new visitor can actually see and buy. Pocket is the standard tool
 * for everyone; Vibe is intentionally excluded here while remaining fully
 * real in PLAN_TIERS above, since entitlement resolution (capForTier,
 * tierForPriceId) and the owner's own account still need it to exist as a
 * real tier, not deleted. Every PUBLIC-facing checkout surface should read
 * from this constant, not PLAN_TIERS directly, so there is exactly one
 * place that decides what's for sale rather than a filter repeated (and
 * potentially missed) at each render site.
 *
 * Custom stays included — it's a contact-sales escape hatch for people who
 * outgrow Pocket, not a self-serve tier competing with it.
 */
export const PUBLIC_CHECKOUT_TIERS: PlanTier[] = PLAN_TIERS.filter((t) => t.id !== "vibe");

export function getTierById(id: PlanTierId): PlanTier | undefined {
  return PLAN_TIERS.find((t) => t.id === id);
}

/**
 * Legacy Stripe lookup keys → current tier id.
 * `obsidian_pro_monthly` was the pre-tier $30/mo entry price. Existing
 * subscribers on that price are treated as Vibe (the current main paid
 * tier, formerly "Creator") so entitlement, plan badges, and dashboards
 * resolve correctly. NEW checkout for Vibe must use
 * `obsidian_creator_monthly` — never re-route it back to the legacy key.
 */
export const LEGACY_PRICE_TIER_MAP: Record<string, PlanTierId> = {
  obsidian_pro_monthly: "vibe",
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
 * Monthly AI credit cap per tier. Custom is negotiated per-contract and
 * defaults to Vibe's cap until custom terms are provisioned.
 * `capForTier(null)` returns 0 (free plan — no paid AI operations).
 */
export const TIER_CREDIT_CAP: Record<PlanTierId, number> = {
  // Pocket is metered by CREDITS, same as every other tier — no separate
  // build-counting path.
  pocket: POCKET_MONTHLY_CREDITS,
  vibe: 1000,
  custom: 1000,
};

export function capForTier(tier: PlanTierId | null | undefined): number {
  if (!tier) return 0;
  return TIER_CREDIT_CAP[tier] ?? 0;
}

/** Lookup keys the server accepts for Stripe checkout (Custom is contact-sales). */
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
  "pocket", "vibe", "custom",
];

export function tierAtLeast(current: PlanTierId | null | undefined, min: PlanTierId): boolean {
  if (!current) return false;
  return TIER_ORDER.indexOf(current) >= TIER_ORDER.indexOf(min);
}

export const DASHBOARD_NAV: PlanNavItem[] = [
  { id: "overview",     label: "Overview",         href: "/dashboard" },
  { id: "projects",     label: "Projects",         href: "/dashboard#projects" },
  { id: "deployments",  label: "Deployments",      href: "/dashboard#deployments", soon: true },
  { id: "revenue",      label: "Revenue",          href: "/dashboard#revenue", minTier: "custom", soon: true },
  { id: "security",     label: "Security",         href: "/dashboard#security", soon: true },
  { id: "performance",  label: "Performance",      href: "/dashboard#performance", soon: true },
  { id: "team",         label: "Team",             href: "/dashboard#team", minTier: "custom", soon: true },
  { id: "compliance",   label: "Compliance",       href: "/dashboard#compliance", minTier: "custom", soon: true },
];
