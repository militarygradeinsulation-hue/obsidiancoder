import { useCallback, useEffect, useRef, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCheckoutSession, createCustomAmountSubscription } from "@/utils/payments.functions";
import { nextCheckoutState, checkoutErrorFromThrow, type CheckoutState } from "@/lib/checkout-state";

/**
 * Wrapper around Stripe Embedded Checkout that surfaces explicit
 * loading / error / retry / cancel states. Accepts either a fixed
 * `priceId` (tier checkout) or an `amountCents` value (custom-amount
 * monthly subscription via inline price_data).
 */
export function CheckoutSurface({
  priceId,
  amountCents,
  returnUrl,
  onCancel,
}: {
  priceId?: string;
  amountCents?: number;
  returnUrl?: string;
  onCancel?: () => void;
}) {
  const [state, setState] = useState<CheckoutState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const focusRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const resolvedReturn = returnUrl
        || `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
      const environment = getStripeEnvironment();

      const result = amountCents && amountCents > 0
        ? await createCustomAmountSubscription({
            data: { amountCents, returnUrl: resolvedReturn, environment },
          })
        : priceId
          ? await createCheckoutSession({
              data: { priceId, returnUrl: resolvedReturn, environment },
            })
          : { error: "No plan selected." };

      setState(nextCheckoutState(result));
    } catch (err) {
      setState(checkoutErrorFromThrow(err));
    }
  }, [priceId, amountCents, returnUrl]);

  useEffect(() => { load(); }, [load, attempt]);

  // Move focus to the live region when state changes so screen readers announce.
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
