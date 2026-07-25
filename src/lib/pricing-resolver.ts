// Canonical amount → offer resolver.
//
// Pure module: no DB, no I/O, no side effects. Used by every surface that
// touches pricing — the horizontal PricingConfigurator, /unlock, the checkout
// server function, the webhook fulfillment writer, capForUser (runtime
// entitlement cap), and the self-test suite. Amount (in cents) is the ONLY
// source of truth. Never invent a Creator/Pro fallback for missing input.

export type ResolvedTier =
  | "try_pro"
  | "custom_entry"
  | "starter"
  | "creator"
  | "professional"
  | "business"
  | "elite";

/** Fixed Stripe lookup key used for the $5 one-time trial. */
export const TRY_PRO_LOOKUP_KEY = "obsidian_try_pro_7day";

/** Only fixed Stripe lookup key still allowed at checkout — everything else is inline price_data. */
export const ALLOWED_FIXED_LOOKUP_KEYS: readonly string[] = [TRY_PRO_LOOKUP_KEY];

/** Legal amount window for self-serve purchase (in cents). */
export const MIN_AMOUNT_CENTS = 500;      // $5
export const MAX_AMOUNT_CENTS = 49900;    // $499
export const ENTERPRISE_MIN_CENTS = 50000; // $500+ contact sales

/** Ordered high → low: pick the highest tier whose threshold ≤ amount. */
const TIER_THRESHOLDS_CENTS: ReadonlyArray<{ min: number; tier: ResolvedTier }> = [
  { min: 49900, tier: "elite" },
  { min: 29900, tier: "business" },
  { min: 14900, tier: "professional" },
  { min: 7900,  tier: "creator" },
  { min: 2900,  tier: "starter" },
  { min: 600,   tier: "custom_entry" },
  { min: 500,   tier: "try_pro" },
];

/** Floor cap per resolved tier — server never grants less than this for that tier. */
export const BASE_CAP_BY_TIER: Readonly<Record<ResolvedTier, number>> = {
  try_pro: 400,
  custom_entry: 200,
  starter: 400,
  creator: 1000,
  professional: 2500,
  business: 6000,
  elite: 12000,
};

/**
 * Deterministic linear scaling factor: every extra dollar buys 25 additional
 * usage credits. Combined with the tier floor via `Math.max`, the effective
 * cap is monotone non-decreasing in `amountCents`, satisfying the spec:
 * "paying more never gives less".
 */
export const CAP_PER_DOLLAR = 25;

export type Offer =
  | {
      kind: "trial";
      amountCents: 500;
      tier: "try_pro";
      priceLookupKey: typeof TRY_PRO_LOOKUP_KEY;
      mode: "payment";
      cap: number;
      displayName: string;
    }
  | {
      kind: "subscription";
      amountCents: number;
      tier: ResolvedTier;
      mode: "subscription";
      cap: number;
      displayName: string;
    }
  | { kind: "enterprise"; amountCents: number; reason: string }
  | { kind: "invalid"; reason: string; amountCents: number | null };

const TIER_DISPLAY: Record<ResolvedTier, string> = {
  try_pro: "Try Pro",
  custom_entry: "Custom Entry",
  starter: "Starter",
  creator: "Creator",
  professional: "Professional",
  business: "Business",
  elite: "Elite",
};

/** Coerce any incoming value to whole-dollar cents, or null when invalid. */
export function normalizeAmountCents(input: unknown): number | null {
  if (input == null || input === "") return null;
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n);
  if (cents <= 0) return null;
  if (cents % 100 !== 0) return null; // whole dollars only
  return cents;
}

/** Coerce a whole-dollar amount (from a URL param or slider) to cents. */
export function dollarsToCents(dollars: unknown): number | null {
  if (dollars == null || dollars === "") return null;
  const n = typeof dollars === "number" ? dollars : Number(dollars);
  if (!Number.isFinite(n)) return null;
  const d = Math.round(n);
  if (d <= 0) return null;
  return d * 100;
}

export function resolveTier(amountCents: number): ResolvedTier {
  for (const t of TIER_THRESHOLDS_CENTS) if (amountCents >= t.min) return t.tier;
  return "try_pro";
}

export function capForAmount(amountCents: number): number {
  const tier = resolveTier(amountCents);
  const scaled = Math.floor(amountCents / 100) * CAP_PER_DOLLAR;
  return Math.max(BASE_CAP_BY_TIER[tier], scaled);
}

/**
 * Canonical resolver — every checkout, entitlement lookup, and display value
 * MUST go through this function. Never fall back to a default plan (Creator,
 * Pro, etc.) — return "invalid" and let the caller surface an error.
 */
export function resolveOfferForAmount(rawAmountCents: unknown): Offer {
  const cents = normalizeAmountCents(rawAmountCents);
  if (cents === null) {
    return { kind: "invalid", reason: "Enter a whole dollar amount from $5 to $499.", amountCents: null };
  }
  if (cents < MIN_AMOUNT_CENTS) {
    return { kind: "invalid", reason: "Minimum is $5.", amountCents: cents };
  }
  if (cents >= ENTERPRISE_MIN_CENTS) {
    return { kind: "enterprise", amountCents: cents, reason: "$500+ requires contacting sales." };
  }
  if (cents === MIN_AMOUNT_CENTS) {
    return {
      kind: "trial",
      amountCents: 500,
      tier: "try_pro",
      priceLookupKey: TRY_PRO_LOOKUP_KEY,
      mode: "payment",
      cap: BASE_CAP_BY_TIER.try_pro,
      displayName: "Try Pro (7-day)",
    };
  }
  const tier = resolveTier(cents);
  const dollars = Math.round(cents / 100);
  return {
    kind: "subscription",
    amountCents: cents,
    tier,
    mode: "subscription",
    cap: capForAmount(cents),
    displayName: `${TIER_DISPLAY[tier]} — $${dollars}/mo`,
  };
}

/** Named-tier → dollars, used to render legacy PLAN_TIER cards as slider targets. */
export const ANCHOR_DOLLARS: Readonly<Record<ResolvedTier, number>> = {
  try_pro: 5,
  custom_entry: 6,
  starter: 29,
  creator: 79,
  professional: 149,
  business: 299,
  elite: 499,
};

/**
 * Backward-compat map from legacy Stripe lookup keys → ResolvedTier. Only
 * used by `resolveEntitlementFromRow` when reading historical subscription
 * rows that predate the amount-based schema. NEW purchases MUST populate
 * `custom_amount_cents` + `plan_tier` and never re-enter this map.
 */
const LEGACY_PRICE_TO_TIER: Readonly<Record<string, ResolvedTier>> = {
  obsidian_pro_monthly: "creator",
  obsidian_starter_monthly: "starter",
  obsidian_creator_monthly: "creator",
  obsidian_professional_monthly: "professional",
  obsidian_business_monthly: "business",
  obsidian_elite_monthly: "elite",
  obsidian_try_pro_7day: "try_pro",
};

/**
 * Server-side entitlement resolver. Consults the canonical
 * `custom_amount_cents` first, `plan_tier` second, then falls back to the
 * legacy `price_id` map. Returns `{ tier: null, cap: 0 }` on total miss so
 * the caller can decide whether to grant a hardcoded floor.
 */
export function resolveEntitlementFromRow(row: {
  plan_tier?: string | null;
  custom_amount_cents?: number | null;
  price_id?: string | null;
}): { tier: ResolvedTier | null; cap: number; amountCents: number | null } {
  const amount = row.custom_amount_cents ?? null;
  if (amount && amount > 0) {
    const declaredTier = row.plan_tier && (LEGACY_PRICE_TO_TIER[""] ?? undefined, isResolvedTier(row.plan_tier))
      ? (row.plan_tier as ResolvedTier)
      : resolveTier(amount);
    return { tier: declaredTier, cap: capForAmount(amount), amountCents: amount };
  }
  if (row.plan_tier && isResolvedTier(row.plan_tier)) {
    const tier = row.plan_tier;
    return { tier, cap: BASE_CAP_BY_TIER[tier], amountCents: null };
  }
  const legacyTier = row.price_id ? LEGACY_PRICE_TO_TIER[row.price_id] : undefined;
  if (legacyTier) return { tier: legacyTier, cap: BASE_CAP_BY_TIER[legacyTier], amountCents: null };
  return { tier: null, cap: 0, amountCents: null };
}

function isResolvedTier(v: string): v is ResolvedTier {
  return v === "try_pro" || v === "custom_entry" || v === "starter"
    || v === "creator" || v === "professional" || v === "business" || v === "elite";
}
