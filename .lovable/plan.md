## Goal

Let the horizontal pricing slider stop at any dollar amount ($5–$500) and, on Buy Now, charge that exact amount as a monthly Stripe subscription — routing unauthenticated users through signup first.

## Changes

### 1. Slider — remove snapping (`src/components/PricingConfigurator.tsx`)
- Delete magnetic pull + release-snap in `setFromClientX`; every pointer position maps 1:1 to the dollar amount.
- Keep the tier anchor ticks purely as visual reference labels (click still jumps to that amount as a convenience). Remove the "snapped-anchor pulse" indicator.
- Keep keyboard arrow keys stepping by $1 (Shift+Arrow = $10); Home/End clamp to $5/$500.
- Live price wordmark shows `$<amount>` for 5–499, and "Custom" only at exactly 500 (Enterprise). Plan-name label shows the nearest tier ("~ Creator tier") for context, not for pricing.
- Feature-unlock cards continue to light up based on the picked $ threshold — already dollar-driven.
- CTA rules:
  - Amount 5–499 → "Continue at $<amount>/month" (or "Try Pro for $5" when exactly $5, kept as the 7-day trial one-time flow).
  - Amount = 500 → "Contact sales" → mailto (unchanged).

### 2. Dynamic subscription server function (`src/utils/payments.functions.ts`)
Add `createCustomAmountCheckoutSession` alongside the existing checkout fn:
- Input: `{ amountInCents, customerEmail?, userId?, returnUrl, environment }`, validated (min 500 = $5, max 49900 = $499, integer, `amount % 100 === 0` so the UI stays in whole dollars).
- Resolves/creates a Stripe Customer via the existing `resolveOrCreateCustomer` helper (userId metadata for later Search API lookups).
- Creates a Stripe subscription checkout session using inline `price_data`:
  ```ts
  line_items: [{
    price_data: {
      currency: "usd",
      recurring: { interval: "month" },
      unit_amount: amountInCents,
      product: OBSIDIAN_CUSTOM_PRODUCT_ID, // one shared product, reused
    },
    quantity: 1,
  }],
  mode: "subscription",
  ui_mode: "embedded_page",
  return_url,
  customer: customerId,
  subscription_data: { metadata: { userId, custom_amount_cents: String(amountInCents) } },
  metadata: { userId, custom_amount_cents: String(amountInCents) },
  ```
- Wraps Stripe errors with `getStripeErrorMessage` and returns `{ clientSecret } | { error }`, matching the existing pattern.
- One-time setup: a shared product `obsidian_custom_monthly` (name: "Obsidian — Custom Plan") registered via `payments--create_product` with SaaS tax code `txcd_10103001`. No fixed price attached — every checkout mints its own `price_data`. Existing fixed prices ($5 trial, $29, $79, $149, $299, $499) stay untouched for the tier anchor buttons and legacy links.

### 3. Signup-then-checkout routing
- Configurator's Buy Now for a custom amount navigates to:
  `/unlock?intent=buy&checkout=1&amount=<dollars>` (no `priceId`).
- `src/routes/unlock.tsx`:
  - Extend `validateSearch` with `amount?: number` (integer 5–499).
  - The existing "no-session → redirect to signup preserving query" effect (added in the last turn) already covers the custom-amount case as long as `amount` is forwarded — extend it to include `amount` in the preserved query string.
  - When authenticated and `amount` is present, render `CheckoutSurface` in "custom amount" mode.
- `src/components/CheckoutSurface.tsx`: accept either `priceId` OR `amountCents`. When `amountCents` is set, call `createCustomAmountCheckoutSession` instead of `createCheckoutSession`. Same loading / error / retry UX.
- Post-purchase: existing `/checkout/return` page and webhook path already handle `checkout.session.completed` for subscription mode — the custom subscription flows through the same code path, and `subscriptions` rows get written with the custom price via the webhook.

### 4. Entitlement handling
- `useSubscription` / `hasActivePro` currently gate on any active Stripe subscription for the user — unchanged; custom-amount subscribers get Pro entitlement automatically.
- Tier-specific gates (`tierForPriceId`) will return `undefined` for the custom `price_data` price. Add a fallback: if the subscription row has no known tier but is active, treat it as **Creator equivalent** for feature gating (Creator is the current baseline paid tier). This keeps custom-amount subscribers from being locked out of Creator-tier UI.
- Credit cap for custom amounts: scale linearly against the Creator baseline (`Math.round((amountDollars / 79) * TIER_CREDIT_CAP.creator)`, clamped between Starter and Elite caps). Implemented in a small helper used by the credit-gate.

### 5. Cleanup
- Keep tier anchor snap-clicks for accessibility (users can click a tick to jump exactly to $79, etc.), but no forced snap on drag release.
- Remove `SNAP_DISTANCE` constant and the magnetic-pull math.
- No visual regressions elsewhere — homepage, orb, gallery, auth, free-build untouched.

## Technical notes

- Stripe subscriptions with inline `price_data` are supported and create an ad-hoc Price under the parent product; this is exactly the pattern Stripe recommends for pay-what-you-want subscriptions.
- We enforce whole-dollar amounts server-side (`amountInCents % 100 === 0`) so displayed price = charged price.
- Full compliance handling (`managed_payments`) is not toggled on in this change — it can be layered on later without touching the slider UX.

## Acceptance

- Drag slider to any $5–$499 → wordmark shows that exact amount, CTA reads "Continue at $<amount>/month".
- Click Buy Now while signed out → land on signup with `amount` preserved → after signup return to `/unlock` and see embedded Stripe Checkout for a monthly subscription at that exact amount.
- Completing checkout returns to `/checkout/return`, webhook fires, `subscriptions` row appears, user gains Pro entitlement.
- $5 continues to run the existing 7-day trial (one-time) flow; $500 continues to route to Contact Sales.
- No `$49` or legacy pricing surfaces anywhere.
