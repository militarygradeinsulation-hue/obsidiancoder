const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full bg-red-950/60 border-b border-red-800/60 px-4 py-2 text-center text-xs text-red-200">
        Production checkout is not configured. Complete Stripe go-live in your Lovable project to accept real payments.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full bg-amber-950/60 border-b border-amber-800/60 px-4 py-1.5 text-center text-[11px] text-amber-200">
        Payments in test mode — use card 4242 4242 4242 4242 with any future date & CVC.
      </div>
    );
  }
  return null;
}
