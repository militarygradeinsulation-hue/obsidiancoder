// Server functions for Stripe checkout. All amount-based self-serve purchases
// route through `createOfferCheckout` which delegates to `resolveOfferForAmount`
// (src/lib/pricing-resolver.ts). No route may create a Checkout Session with a
// legacy `priceId` — inline `price_data` at the exact selected amount is the
// canonical path, with a single fixed-price fallback for the $5 Try Pro trial.
//
// Every session uses `ui_mode: "embedded"` (the valid Stripe value) and
// `return_url` that includes the `{CHECKOUT_SESSION_ID}` template.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";
import { TRIAL_CREDIT_COUPON_ID } from "@/lib/plans";
import {
  resolveOfferForAmount,
  TRY_PRO_LOOKUP_KEY,
  MIN_AMOUNT_CENTS,
  MAX_AMOUNT_CENTS,
  type Offer,
} from "@/lib/pricing-resolver";

type CheckoutSessionResult = { clientSecret: string } | { error: string };
type PortalSessionResult = { url: string } | { error: string };
type CancelResult = { ok: true } | { error: string };

export const WHITELIST_PRICE_ID = "whitelist_early_access_onetime";
export const WHITELIST_CAP = 1000;

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId: string },
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");
  const found = await stripe.customers.search({
    query: `metadata['userId']:'${options.userId}'`,
    limit: 1,
  });
  if (found.data.length) return found.data[0].id;

  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    metadata: { userId: options.userId },
  });
  return created.id;
}

// ────────────────────────────────────────────────────────────────────────────
// Canonical checkout: amount (cents) → Stripe embedded checkout session.
// ────────────────────────────────────────────────────────────────────────────
export const createOfferCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { amountCents: number; returnUrl: string; environment: StripeEnv }) => {
    const offer = resolveOfferForAmount(data.amountCents);
    if (offer.kind === "invalid") throw new Error(offer.reason);
    if (offer.kind === "enterprise") {
      throw new Error("$500+ plans require contacting sales at sales@obsidianvibe.live.");
    }
    if (typeof data.returnUrl !== "string" || !/^https?:\/\//.test(data.returnUrl)) {
      throw new Error("Invalid returnUrl");
    }
    if (data.environment !== "sandbox" && data.environment !== "live") {
      throw new Error("Invalid environment");
    }
    return { ...data, amountCents: offer.amountCents };
  })
  .handler(async ({ data, context }): Promise<CheckoutSessionResult> => {
    const requestId = `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    let offer: Offer | null = null;
    try {
      offer = resolveOfferForAmount(data.amountCents);
      if (offer.kind !== "trial" && offer.kind !== "subscription") {
        return { error: "This amount cannot be purchased. Choose $5 to $499." };
      }

      const { supabase, userId } = context;
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email ?? undefined;
      const stripe = createStripeClient(data.environment);

      // Duplicate-subscription guard. Users with an active row must use the
      // Customer Portal to change plans — creating a second row here would
      // double-bill them.
      if (offer.kind === "subscription") {
        const { data: activeSub } = await supabase
          .from("subscriptions")
          .select("stripe_subscription_id, status")
          .eq("user_id", userId)
          .eq("environment", data.environment)
          .in("status", ["active", "trialing"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (activeSub?.stripe_subscription_id) {
          return {
            error: "You already have an active subscription. Open Manage subscription to change your plan.",
          };
        }
      }

      // Try-Pro guard: one paid trial per user + environment.
      if (offer.kind === "trial") {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: existing } = await supabaseAdmin
          .from("trial_claims" as never)
          .select("id")
          .eq("user_id", userId)
          .eq("environment", data.environment)
          .eq("paid", true)
          .limit(1)
          .maybeSingle();
        if (existing) {
          return { error: "You've already used your $5 Try Pro trial. Choose a paid plan to continue." };
        }
      }

      const customerId = await resolveOrCreateCustomer(stripe, { email, userId });

      // $5 trial credit toward ANY paid subscription (was Creator-only).
      let discounts: Array<{ coupon: string }> | undefined;
      if (offer.kind === "subscription") {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: claim } = await supabaseAdmin
            .from("trial_claims" as never)
            .select("id")
            .eq("user_id", userId)
            .eq("environment", data.environment)
            .eq("paid", true)
            .eq("credit_applied", false)
            .limit(1)
            .maybeSingle();
          if (claim) {
            try { await stripe.coupons.retrieve(TRIAL_CREDIT_COUPON_ID); }
            catch {
              try {
                await stripe.coupons.create({
                  id: TRIAL_CREDIT_COUPON_ID,
                  amount_off: 500,
                  currency: "usd",
                  duration: "once",
                  name: "Try Pro $5 credit",
                });
              } catch { /* concurrent create OK */ }
            }
            discounts = [{ coupon: TRIAL_CREDIT_COUPON_ID }];
          }
        } catch { /* best-effort, never block checkout */ }
      }

      if (offer.kind === "trial") {
        const prices = await stripe.prices.list({ lookup_keys: [TRY_PRO_LOOKUP_KEY] });
        if (!prices.data.length) return { error: "Trial price is not configured. Contact support." };
        const stripePrice = prices.data[0];
        const productId = typeof stripePrice.product === "string" ? stripePrice.product : stripePrice.product.id;
        const product = await stripe.products.retrieve(productId);

        console.log("[checkout]", { requestId, kind: "trial", amountCents: offer.amountCents, tier: offer.tier, env: data.environment });

        const session = await stripe.checkout.sessions.create({
          line_items: [{ price: stripePrice.id, quantity: 1 }],
          mode: "payment",
          ui_mode: "embedded",
          return_url: data.returnUrl,
          customer: customerId,
          payment_intent_data: { description: product.name },
          metadata: {
            userId,
            offer_kind: "trial",
            plan_tier: offer.tier,
            amount_cents: String(offer.amountCents),
            trial_claim: "1",
          },
        });
        return { clientSecret: session.client_secret ?? "" };
      }

      const dollars = Math.round(offer.amountCents / 100);
      console.log("[checkout]", { requestId, kind: "subscription", amountCents: offer.amountCents, tier: offer.tier, env: data.environment, trialCredit: !!discounts });

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        ui_mode: "embedded",
        return_url: data.returnUrl,
        customer: customerId,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            recurring: { interval: "month" },
            unit_amount: offer.amountCents,
            product_data: {
              name: `Obsidian ${offer.tier.replace(/_/g, " ")} — $${dollars}/mo`,
              metadata: {
                obsidian_offer: "1",
                amount_cents: String(offer.amountCents),
                plan_tier: offer.tier,
              },
            },
          },
        }],
        ...(discounts && { discounts }),
        metadata: {
          userId,
          offer_kind: "subscription",
          plan_tier: offer.tier,
          amount_cents: String(offer.amountCents),
          ...(discounts && { trial_credit_applied: "1" }),
        },
        subscription_data: {
          metadata: {
            userId,
            offer_kind: "subscription",
            plan_tier: offer.tier,
            amount_cents: String(offer.amountCents),
            ...(discounts && { trial_credit_applied: "1" }),
          },
          proration_behavior: "create_prorations",
        },
      });
      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      const errObj = error as { code?: string; type?: string; message?: string };
      console.error("[checkout error]", {
        requestId,
        code: errObj?.code ?? null,
        type: errObj?.type ?? null,
        env: data.environment,
        amountCents: offer?.kind === "trial" || offer?.kind === "subscription" ? offer.amountCents : data.amountCents,
        tier: offer?.kind === "trial" || offer?.kind === "subscription" ? offer.tier : null,
      });
      return { error: getStripeErrorMessage(error) };
    }
  });

// ────────────────────────────────────────────────────────────────────────────
// Manage-subscription portal (unchanged behavior, kept explicit for clarity).
// ────────────────────────────────────────────────────────────────────────────
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { returnUrl?: string; environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<PortalSessionResult> => {
    const { supabase, userId } = context;
    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError || !sub?.stripe_customer_id) return { error: "No subscription found" };
    try {
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id as string,
        ...(data.returnUrl && { return_url: data.returnUrl }),
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const cancelSubscriptionNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<CancelResult> => {
    const { supabase, userId } = context;
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub?.stripe_subscription_id) return { error: "No active subscription" };
    try {
      const stripe = createStripeClient(data.environment);
      await stripe.subscriptions.cancel(sub.stripe_subscription_id as string);
      return { ok: true };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

// ────────────────────────────────────────────────────────────────────────────
// Whitelist / early-access $100 one-time — kept isolated from tier flow.
// ────────────────────────────────────────────────────────────────────────────

const whitelistInput = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  intended_use: z.string().trim().max(2000).optional().or(z.literal("")),
  interest_level: z.enum(["exploring", "planning", "ready", "urgent"]).default("ready"),
  tier: z.string().trim().max(64).optional().or(z.literal("")),
  returnUrl: z.string().url().max(500),
  environment: z.enum(["sandbox", "live"]),
});

type WhitelistCheckoutResult =
  | { clientSecret: string; entryId: string; remaining: number }
  | { error: string; full?: boolean; remaining?: number };

export const createWhitelistCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => whitelistInput.parse(d))
  .handler(async ({ data }): Promise<WhitelistCheckoutResult> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: countData, error: countErr } = await supabaseAdmin
        .rpc("waitlist_paid_count" as never);
      if (countErr) return { error: countErr.message };
      const paidCount = (countData as unknown as number) ?? 0;
      const remaining = Math.max(0, WHITELIST_CAP - paidCount);
      if (remaining <= 0) {
        return { error: "The first 1,000 early-access spots are all claimed.", full: true, remaining: 0 };
      }

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("waitlist_entries")
        .insert({
          name: data.name,
          email: data.email.toLowerCase(),
          company: data.company || null,
          intended_use: data.intended_use || "Early-access whitelist",
          interest_level: data.interest_level,
          tier: data.tier || null,
          source: "unlock_whitelist_paid",
          paid: false,
        } as never)
        .select("id")
        .single();
      if (insertErr || !inserted) return { error: insertErr?.message ?? "Could not save entry" };
      const entryId = (inserted as { id: string }).id;

      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: [WHITELIST_PRICE_ID] });
      if (!prices.data.length) return { error: "Whitelist price not configured" };
      const stripePrice = prices.data[0];
      const productId = typeof stripePrice.product === "string"
        ? stripePrice.product
        : stripePrice.product.id;
      const product = await stripe.products.retrieve(productId);

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: "payment",
        ui_mode: "embedded",
        return_url: data.returnUrl,
        customer_email: data.email.toLowerCase(),
        client_reference_id: entryId,
        payment_intent_data: { description: product.name },
        metadata: {
          waitlist_entry_id: entryId,
          waitlist_email: data.email.toLowerCase(),
          waitlist_tier: data.tier || "",
        },
      });

      return {
        clientSecret: session.client_secret ?? "",
        entryId,
        remaining: remaining - 1,
      };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const getWhitelistStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("waitlist_paid_count" as never);
  if (error) return { cap: WHITELIST_CAP, paid: 0, remaining: WHITELIST_CAP };
  const paid = (data as unknown as number) ?? 0;
  return { cap: WHITELIST_CAP, paid, remaining: Math.max(0, WHITELIST_CAP - paid) };
});

// Re-export the amount window for client callers that need to display bounds.
export { MIN_AMOUNT_CENTS, MAX_AMOUNT_CENTS };
