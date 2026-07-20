// Phase 1 tier catalog for the AI Engineering Operating System.
// Outcome-focused descriptions; no per-credit accounting exposed here.
// Only tiers with `priceId` route through Stripe checkout. Others surface
// a waitlist CTA until the corresponding Stripe price is live.

import type { LucideIcon } from "lucide-react";
import { Rocket, Sparkles, Briefcase, Building2, Crown, Landmark } from "lucide-react";

export type PlanTierId =
  | "starter"
  | "creator"
  | "professional"
  | "business"
  | "elite"
  | "enterprise";

export interface PlanTier {
  id: PlanTierId;
  name: string;
  price: string;            // display price, e.g. "$29"
  cadence: string;          // "/month" or "Custom"
  headline: string;         // one-line outcome positioning
  bestFor: string;          // who it's for
  outcomes: string[];       // what you can accomplish
  featured?: boolean;
  priceId?: string;         // Stripe lookup key when live
  cta: "checkout" | "waitlist" | "contact";
  icon: LucideIcon;
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$29",
    cadence: "/month",
    headline: "Ship your first product with an AI engineering team.",
    bestFor: "Solo founders validating an idea.",
    outcomes: [
      "Launch a working web app end-to-end",
      "Publish a live URL with one click",
      "AI-authored code, copy, and imagery",
      "Baseline security and performance checks",
    ],
    priceId: "obsidian_starter_monthly",
    cta: "checkout",
    icon: Rocket,
  },
  {
    id: "creator",
    name: "Creator",
    price: "$79",
    cadence: "/month",
    headline: "Turn ideas into shippable products, week after week.",
    bestFor: "Independent builders and side-project founders.",
    outcomes: [
      "Ship multiple production-ready projects",
      "Automated deployments and rollbacks",
      "Design system + branded UI generation",
      "Product readiness reports on every build",
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
    headline: "Operate real software with an AI engineering org.",
    bestFor: "Freelancers and small studios delivering client work.",
    outcomes: [
      "Everything in Creator",
      "Chief Engineer multi-agent review",
      "Priority AI models and faster generations",
      "Custom domains and GitHub deploys",
    ],
    cta: "waitlist",
    icon: Briefcase,
  },
  {
    id: "business",
    name: "Business",
    price: "$299",
    cadence: "/month",
    headline: "Run a product line without hiring an engineering team.",
    bestFor: "Small companies shipping customer-facing software.",
    outcomes: [
      "Everything in Professional",
      "Team collaboration and shared libraries",
      "Advanced security scans and audit logs",
      "Revenue and product analytics dashboard",
    ],
    cta: "waitlist",
    icon: Building2,
  },
  {
    id: "elite",
    name: "Elite",
    price: "$499",
    cadence: "/month",
    headline: "An AI engineering department on demand.",
    bestFor: "Growing companies running multiple products.",
    outcomes: [
      "Everything in Business",
      "Highest-tier models with expanded throughput",
      "Dedicated deployment pipelines",
      "Launch-readiness and compliance reviews",
    ],
    cta: "waitlist",
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

/** Map a Stripe priceId (or lookup key) back to a tier. */
export function tierForPriceId(priceId: string | null | undefined): PlanTier | undefined {
  if (!priceId) return undefined;
  return PLAN_TIERS.find((t) => t.priceId === priceId);
}

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
