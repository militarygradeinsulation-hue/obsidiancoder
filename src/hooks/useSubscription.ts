import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { CAP_PRO_MONTHLY, balanceFor, type Balance } from "@/lib/credit-gate";

export interface SubscriptionRow {
  id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: string;
  price_id: string;
  product_id: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  environment: string;
}

export interface AuthState {
  userId: string | null;
  email: string | null;
}

export function useAuth(): AuthState & { loading: boolean } {
  const [state, setState] = useState<AuthState & { loading: boolean }>({ userId: null, email: null, loading: true });
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState({ userId: data.session?.user.id ?? null, email: data.session?.user.email ?? null, loading: false });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setState({ userId: session?.user.id ?? null, email: session?.user.email ?? null, loading: false });
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);
  return state;
}

export function useSubscription(): {
  subscription: SubscriptionRow | null;
  isPro: boolean;
  loading: boolean;
  refetch: () => void;
} {
  const { userId } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setSubscription(null); setLoading(false); return; }
    let env = "sandbox";
    try { env = getStripeEnvironment(); } catch { /* not configured */ }
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSubscription((data as SubscriptionRow) ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`subs-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  // Server is the source of truth for entitlement. The client hook is a
  // display-only heuristic; no localStorage overrides. A "9822" owner session
  // still bypasses the server gate via the SITE_PASSWORD cookie, but it is
  // NEVER treated as Pro on the client (which would fake up the UI without
  // affecting server enforcement).
  const now = Date.now();
  const isPro = !!subscription
    && ["active", "trialing"].includes(subscription.status)
    && (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > now);

  return { subscription, isPro, loading, refetch: load };
}

/**
 * Monthly credit balance for the signed-in user in the current Stripe env.
 * Zero when there is no signed-in user. Refreshes on demand and after any
 * subscription-table change (matches useSubscription).
 */
export function useCredits(): Balance & { loading: boolean; refetch: () => void } {
  const { userId } = useAuth();
  const [state, setState] = useState<Balance & { loading: boolean }>(
    () => ({ ...balanceFor(0, 0), loading: true }),
  );

  const load = useCallback(async () => {
    if (!userId) { setState({ ...balanceFor(0, 0), loading: false }); return; }
    let env = "sandbox";
    try { env = getStripeEnvironment(); } catch { /* ignore */ }
    try {
      const { data, error } = await supabase.rpc("credit_balance" as never, {
        _user_id: userId,
        _env: env,
        _cap: CAP_PRO_MONTHLY,
      } as never);
      if (error || !data) {
        setState({ ...balanceFor(0, CAP_PRO_MONTHLY), loading: false });
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as
        | { used: number; cap: number; remaining: number } | null | undefined;
      setState({
        used: Number(row?.used ?? 0),
        cap: Number(row?.cap ?? CAP_PRO_MONTHLY),
        remaining: Number(row?.remaining ?? CAP_PRO_MONTHLY),
        loading: false,
      });
    } catch {
      setState({ ...balanceFor(0, CAP_PRO_MONTHLY), loading: false });
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { ...state, refetch: load };
}
