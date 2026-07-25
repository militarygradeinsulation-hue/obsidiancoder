import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: any = null;
function getSupabase(): any {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

async function handleSubscriptionUpsert(sub: any, env: StripeEnv) {
  const userId = sub.metadata?.userId;
  if (!userId) {
    console.error("subscription missing userId metadata");
    return;
  }
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.lookup_key
    || item?.price?.metadata?.lovable_external_id
    || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? sub.current_period_start;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;

  await getSupabase().from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: sub.customer,
      product_id: productId,
      price_id: priceId,
      status: sub.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
}

async function handleSubscriptionDeleted(sub: any, env: StripeEnv) {
  await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", sub.id)
    .eq("environment", env);
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  if (session.mode !== "payment") {
    // Subscription checkout — mark Creator trial credit as consumed.
    if (session.metadata?.trial_credit_applied === "1" && session.metadata?.userId) {
      await getSupabase()
        .from("trial_claims")
        .update({ credit_applied: true, credit_applied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", session.metadata.userId)
        .eq("environment", env);
    }
    return;
  }

  // ── Whitelist / early-access ────────────────────────────────────────────
  const waitlistEntryId = session.metadata?.waitlist_entry_id;
  if (waitlistEntryId) {
    await getSupabase()
      .from("waitlist_entries")
      .update({
        paid: true,
        stripe_session_id: session.id,
        amount_paid: session.amount_total ?? 0,
        currency: session.currency ?? "usd",
        paid_at: new Date().toISOString(),
      })
      .eq("id", waitlistEntryId);
    return;
  }

  const userId = session.metadata?.userId;
  if (!userId) return;
  const line = session.line_items?.data?.[0] || null;
  let priceId = line?.price?.lookup_key || line?.price?.id || "";
  if (!priceId && session.id) {
    try {
      const { createStripeClient } = await import("@/lib/stripe.server");
      const stripe = createStripeClient(env);
      const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
      const p = items.data[0]?.price;
      priceId = p?.lookup_key || p?.id || "";
    } catch (e) {
      console.error("listLineItems failed", e);
    }
  }

  // ── Try Pro $5 trial claim ──────────────────────────────────────────────
  if (session.metadata?.trial_claim === "1" || priceId === "obsidian_try_pro_7day") {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await getSupabase().from("trial_claims").upsert(
      {
        user_id: userId,
        email: session.customer_details?.email ?? session.customer_email ?? null,
        stripe_customer_id: session.customer,
        stripe_session_id: session.id,
        amount_paid: session.amount_total ?? 500,
        currency: session.currency ?? "usd",
        environment: env,
        paid: true,
        paid_at: new Date().toISOString(),
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_session_id" },
    );
  }

  await getSupabase().from("one_time_purchases").upsert(
    {
      user_id: userId,
      stripe_session_id: session.id,
      stripe_customer_id: session.customer,
      price_id: priceId,
      amount_paid: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      environment: env,
    },
    { onConflict: "stripe_session_id" },
  );
}


async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("webhook invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv as StripeEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
