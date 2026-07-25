import { useCallback, useEffect, useRef, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createOfferCheckout } from "@/utils/payments.functions";
import { nextCheckoutState, checkoutErrorFromThrow, type CheckoutState } from "@/lib/checkout-state";
import { resolveOfferForAmount } from "@/lib/pricing-resolver";

/**
 * Wrapper around Stripe Embedded Checkout. The ONLY input is `amountCents` —
 * every self-serve purchase resolves through `resolveOfferForAmount` so tier
 * lookup, capabilities, and billing come from a single source of truth.
 */
export function CheckoutSurface({
  amountCents,
  returnUrl,
  onCancel,
}: {
  amountCents: number;
  returnUrl?: string;
  onCancel?: () => void;
}) {
  const [state, setState] = useState<CheckoutState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const focusRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const offer = resolveOfferForAmount(amountCents);
      if (offer.kind === "invalid") {
        setState({ kind: "error", message: offer.reason });
        return;
      }
      if (offer.kind === "enterprise") {
        setState({ kind: "error", message: "$500+ plans are Enterprise — contact sales@obsidianvibe.live." });
        return;
      }
      const resolvedReturn = returnUrl
        || `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
      const environment = getStripeEnvironment();
      const result = await createOfferCheckout({
        data: { amountCents: offer.amountCents, returnUrl: resolvedReturn, environment },
      });
      setState(nextCheckoutState(result));
    } catch (err) {
      setState(checkoutErrorFromThrow(err));
    }
  }, [amountCents, returnUrl]);

  useEffect(() => { load(); }, [load, attempt]);

  useEffect(() => {
    if (state.kind !== "loading") focusRef.current?.focus();
  }, [state.kind]);

  return (
    <div className="checkout-surface" aria-busy={state.kind === "loading"}>
      {state.kind === "loading" && (
        <div ref={focusRef} tabIndex={-1} role="status" aria-live="polite" className="checkout-loading">
          <span aria-hidden className="checkout-spinner" />
          <p>Preparing secure checkout…</p>
        </div>
      )}

      {state.kind === "error" && (
        <div ref={focusRef} tabIndex={-1} role="alert" className="checkout-error">
          <p className="checkout-error-message">{state.message}</p>
          <div className="checkout-error-actions">
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="unlock-btn unlock-btn-primary"
            >
              Retry
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="unlock-btn-secondary"
                aria-label="Return to plan summary. Your subscription was not started."
              >
                Back to plan
              </button>
            )}
          </div>
        </div>
      )}

      {state.kind === "ready" && (
        <EmbeddedCheckoutProvider
          key={state.clientSecret}
          stripe={getStripe()}
          options={{ clientSecret: state.clientSecret }}
        >
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      )}
    </div>
  );
}
