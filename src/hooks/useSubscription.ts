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

  const now = Date.now();
  const isPro = !!subscription
    && ["active", "trialing"].includes(subscription.status)
    && (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > now);

  return { subscription, isPro, loading, refetch: load };
}

/**
 * Credit balance. Consumes ONLY the same-origin `/api/public/entitlement`
 * endpoint, which verifies owner cookie / bearer server-side and accepts no
 * account ID from the client. The browser can never point this query at
 * another user's ledger.
 */
export function useCredits(): Balance & { loading: boolean; refetch: () => void; periodStart: string | null; periodEnd: string | null } {
  const { userId } = useAuth();
  const [state, setState] = useState<Balance & { loading: boolean; periodStart: string | null; periodEnd: string | null }>(
    () => ({ ...balanceFor(0, 0), loading: true, periodStart: null, periodEnd: null }),
  );

  const load = useCallback(async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/public/entitlement", {
        method: "GET",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        setState({ ...balanceFor(0, 0), loading: false, periodStart: null, periodEnd: null });
        return;
      }
      const snap = await res.json() as {
        used: number; reserved: number; cap: number; remaining: number;
        periodStart: string | null; periodEnd: string | null;
      };
      setState({
        used: Number(snap.used ?? 0),
        reserved: Number(snap.reserved ?? 0),
        cap: Number(snap.cap ?? CAP_PRO_MONTHLY),
        remaining: Number(snap.remaining ?? 0),
        loading: false,
        periodStart: snap.periodStart ?? null,
        periodEnd: snap.periodEnd ?? null,
      });
    } catch {
      setState({ ...balanceFor(0, 0), loading: false, periodStart: null, periodEnd: null });
    }
    // userId is intentionally in deps so refetch runs on sign-in / sign-out.
    void userId;
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return { ...state, refetch: load };
}
