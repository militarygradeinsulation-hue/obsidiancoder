// Pocket launch-promo campaign — pure, dependency-free config + eligibility
// rules. No network, no cookies, no fingerprinting, no PII. All storage
// access is wrapped so a blocked/failing localStorage never throws.

export type PromoDismissSource = "close" | "escape" | "backdrop" | "continue";

export interface PromoCampaign {
  enabled: boolean;
  /** Bump this to release a new campaign; suppression is keyed on it. */
  campaignId: string;
  /** Optional ISO timestamps bounding the campaign window. */
  startAt?: string;
  endAt?: string;
  /** Days a plain dismissal suppresses the campaign. */
  dismissCooldownDays: number;
  /** Days a CTA engagement suppresses the campaign. */
  engagedCooldownDays: number;
  /** Delay after the hero settles before opening. */
  initialDelayMs: number;
  /** Internal destination route for the primary CTA. */
  destination: "/pocket";
  eyebrow: string;
  headline: string;
  body: string;
  primaryCta: string;
  secondaryCta: string;
  trustLine: string;
}

export const POCKET_PROMO: PromoCampaign = {
  enabled: true,
  campaignId: "pocket-launch-v1",
  dismissCooldownDays: 7,
  engagedCooldownDays: 30,
  initialDelayMs: 1400,
  destination: "/pocket",
  eyebrow: "NEW · OBSIDIAN POCKET",
  headline: "The fastest way to build with Obsidian.",
  body: "One prompt. Editable code. A live preview. Pocket puts Obsidian’s real generation, versions, QA, publishing, and project tools inside a simpler workspace.",
  primaryCta: "Try Obsidian Pocket",
  secondaryCta: "Continue to Obsidian Vibe",
  trustLine: "Same Obsidian engine. Simpler workspace.",
};

export const PROMO_STORAGE_KEY = "obs_pocket_promo_v1";

export interface PromoState {
  campaignId: string;
  dismissedAt?: number;
  engagedAt?: number;
}

/** Minimal storage surface so tests can inject fakes. */
export interface PromoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DAY_MS = 86_400_000;

export function readPromoState(storage: PromoStorage | null | undefined): PromoState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PROMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const s = parsed as PromoState;
    if (typeof s.campaignId !== "string") return null;
    return {
      campaignId: s.campaignId,
      dismissedAt: typeof s.dismissedAt === "number" ? s.dismissedAt : undefined,
      engagedAt: typeof s.engagedAt === "number" ? s.engagedAt : undefined,
    };
  } catch {
    return null;
  }
}

export function writePromoState(
  storage: PromoStorage | null | undefined,
  next: PromoState,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PROMO_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function withinWindow(campaign: PromoCampaign, now: number): boolean {
  if (campaign.startAt) {
    const start = Date.parse(campaign.startAt);
    if (Number.isFinite(start) && now < start) return false;
  }
  if (campaign.endAt) {
    const end = Date.parse(campaign.endAt);
    if (Number.isFinite(end) && now > end) return false;
  }
  return true;
}

export interface PromoEligibilityInput {
  campaign: PromoCampaign;
  now: number;
  /** True while any other modal/panel/expanded surface is active. */
  blocked: boolean;
  /** Auth/session resolution still in flight. */
  sessionLoading: boolean;
  /** Signed-in visitors may be auto-unlocked/redirected — never interrupt. */
  signedIn: boolean;
  /** URL search flags that indicate an intentional buy/code/checkout flow. */
  search?: { checkout?: string; intent?: string };
  /** Already shown once in this tab session. */
  sessionShown: boolean;
  stored: PromoState | null;
}

export function isPromoEligible(input: PromoEligibilityInput): boolean {
  const { campaign, now, stored } = input;
  if (!campaign.enabled) return false;
  if (!withinWindow(campaign, now)) return false;
  if (input.sessionLoading || input.signedIn) return false;
  if (input.blocked) return false;
  if (input.sessionShown) return false;

  const search = input.search ?? {};
  if (search.checkout === "1") return false;
  if (search.intent === "buy" || search.intent === "code") return false;

  if (stored && stored.campaignId === campaign.campaignId) {
    if (
      typeof stored.engagedAt === "number" &&
      now - stored.engagedAt < campaign.engagedCooldownDays * DAY_MS
    ) {
      return false;
    }
    if (
      typeof stored.dismissedAt === "number" &&
      now - stored.dismissedAt < campaign.dismissCooldownDays * DAY_MS
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Higher-priority flows that must reclaim the screen from an ALREADY-OPEN
 * promo. Deliberately excludes cooldown/session-shown state: those describe
 * whether the promo may *open*, not whether an open one must yield.
 *
 * A true result triggers an automatic safety close — not a user dismissal —
 * so it records no timestamp and emits no dismissal event.
 */
export function shouldForceClosePromo(input: {
  campaign: PromoCampaign;
  now: number;
  blocked: boolean;
  sessionLoading: boolean;
  signedIn: boolean;
  search?: { checkout?: string; intent?: string };
}): boolean {
  const { campaign, now } = input;
  if (!campaign.enabled) return true;
  if (!withinWindow(campaign, now)) return true;
  if (input.sessionLoading || input.signedIn) return true;
  if (input.blocked) return true;
  const search = input.search ?? {};
  if (search.checkout === "1") return true;
  if (search.intent === "buy" || search.intent === "code") return true;
  return false;
}

export type PromoAnalyticsEvent =
  | "pocket_promo_impression"
  | "pocket_promo_cta_clicked"
  | "pocket_promo_dismissed";

/** Bounded, no-PII payload for the shared `obs:analytics` convention. */
export function promoEventDetail(
  event: PromoAnalyticsEvent,
  campaignId: string,
  source?: PromoDismissSource,
): { event: PromoAnalyticsEvent; campaignId: string; source?: PromoDismissSource } {
  return source ? { event, campaignId, source } : { event, campaignId };
}

export function emitPromoEvent(
  event: PromoAnalyticsEvent,
  campaignId: string,
  source?: PromoDismissSource,
): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("obs:analytics", { detail: promoEventDetail(event, campaignId, source) }),
    );
  } catch {
    /* noop */
  }
}
