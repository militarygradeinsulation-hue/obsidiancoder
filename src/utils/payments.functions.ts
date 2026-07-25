import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";
import { tierForPriceId, PURCHASABLE_LOOKUP_KEYS, TRY_PRO_PRICE_ID, TRIAL_CREDIT_COUPON_ID } from "@/lib/plans";

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



export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { priceId: string; returnUrl: string; environment: StripeEnv }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(data.priceId)) throw new Error("Invalid priceId");
    // Launch policy: allow any tier whose Stripe price has been provisioned
    // in the Obsidian catalog. Enterprise is contact-sales, not self-serve.
    // Legacy `obsidian_pro_monthly` remains callable for backward compat.
    const allowed = new Set<string>([...PURCHASABLE_LOOKUP_KEYS, "obsidian_pro_monthly"]);
    if (!allowed.has(data.priceId)) {
      throw new Error("This plan is not available for self-serve checkout. Contact sales for Enterprise.");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutSessionResult> => {
    try {
      const { supabase, userId } = context;
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email ?? undefined;

      const stripe = createStripeClient(data.environment);

      // ── Try Pro $5 trial guard: one paid trial per user/email/customer ──
      const isTrial = data.priceId === TRY_PRO_PRICE_ID;
      if (isTrial) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: existing } = await supabaseAdmin
          .from("trial_claims" as never)
          .select("id, paid")
          .eq("user_id", userId)
          .eq("environment", data.environment)
          .eq("paid", true)
          .limit(1)
          .maybeSingle();
        if (existing) {
          return { error: "You've already used your $5 Try Pro trial. Upgrade to Creator to continue." };
        }
      }

      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error("Price not found");
      const stripePrice = prices.data[0];
      const isRecurring = stripePrice.type === "recurring";

      const customerId = await resolveOrCreateCustomer(stripe, { email, userId });

      let productDescription: string | undefined;
      if (!isRecurring) {
        const productId = typeof stripePrice.product === "string"
          ? stripePrice.product
          : stripePrice.product.id;
        const product = await stripe.products.retrieve(productId);
        productDescription = product.name;
      }

      // ── Apply $5 trial credit toward Creator if unused ──
      let discounts: Array<{ coupon: string }> | undefined;
      const tier = tierForPriceId(data.priceId)?.id;
      if (isRecurring && tier === "creator") {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: claim } = await supabaseAdmin
            .from("trial_claims" as never)
            .select("id, paid, credit_applied")
            .eq("user_id", userId)
            .eq("environment", data.environment)
            .eq("paid", true)
            .eq("credit_applied", false)
            .limit(1)
            .maybeSingle();
          if (claim) {
            // Ensure the coupon exists (best-effort; ignore if already present)
            try {
              await stripe.coupons.retrieve(TRIAL_CREDIT_COUPON_ID);
            } catch {
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
        } catch { /* best-effort — never block checkout */ }
      }

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        ...(!isRecurring && { payment_intent_data: { description: productDescription } }),
        ...(discounts && { discounts }),
        metadata: {
          userId,
          priceId: data.priceId,
          planTier: tier ?? "",
          ...(isTrial && { trial_claim: "1" }),
          ...(discounts && { trial_credit_applied: "1" }),
        },
        ...(isRecurring && {
          subscription_data: {
            metadata: {
              userId,
              priceId: data.priceId,
              planTier: tier ?? "",
              ...(discounts && { trial_credit_applied: "1" }),
            },
            proration_behavior: "create_prorations",
          },
        }),
      } as any);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });


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

// User chose "Revoke immediately on cancel" — cancel the sub via API,
// not just at period end. Webhook flips status → 'canceled' and
// has_active_pro() returns false immediately.
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

// ─── Whitelist / early-access checkout ────────────────────────────────────────
// Public (unauthenticated) $100 one-time purchase. Creates a pending waitlist
// row first, then opens Stripe embedded checkout with the row id in metadata.
// The payments webhook flips the row to paid=true on
// `checkout.session.completed`. Capped at 1,000 paid entries.

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

      // Cap check — reject once 1,000 paid spots are taken.
      const { data: countData, error: countErr } = await supabaseAdmin
        .rpc("waitlist_paid_count" as never);
      if (countErr) return { error: countErr.message };
      const paidCount = (countData as unknown as number) ?? 0;
      const remaining = Math.max(0, WHITELIST_CAP - paidCount);
      if (remaining <= 0) {
        return { error: "The first 1,000 early-access spots are all claimed.", full: true, remaining: 0 };
      }

      // Insert pending row (paid=false). Uses service role → bypasses RLS.
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
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer_email: data.email.toLowerCase(),
        client_reference_id: entryId,
        payment_intent_data: { description: product.name },
        metadata: {
          waitlist_entry_id: entryId,
          waitlist_email: data.email.toLowerCase(),
          waitlist_tier: data.tier || "",
        },
      } as never);

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

