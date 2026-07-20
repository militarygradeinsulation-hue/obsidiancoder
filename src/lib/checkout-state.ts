// Small pure state helpers for CheckoutSurface — extracted so self-tests can
// exercise the loading/ready/error/retry/cancel state machine deterministically
// without mounting Stripe or React.

export type CheckoutState =
  | { kind: "loading" }
  | { kind: "ready"; clientSecret: string }
  | { kind: "error"; message: string };

export type CheckoutSessionResult =
  | { clientSecret: string }
  | { clientSecret: "" }
  | { error: string };

/** Deterministic reducer from server-fn result → next UI state. */
export function nextCheckoutState(result: CheckoutSessionResult): CheckoutState {
  if ("error" in result && typeof result.error === "string" && result.error.length > 0) {
    return { kind: "error", message: result.error };
  }
  if ("clientSecret" in result && typeof result.clientSecret === "string" && result.clientSecret.length > 0) {
    return { kind: "ready", clientSecret: result.clientSecret };
  }
  return {
    kind: "error",
    message: "Checkout is temporarily unavailable. Please try again in a moment.",
  };
}

/** Normalize a caught exception into a user-facing error state. */
export function checkoutErrorFromThrow(err: unknown): CheckoutState {
  const message = err instanceof Error && err.message ? err.message : "Could not start checkout.";
  return { kind: "error", message };
}
