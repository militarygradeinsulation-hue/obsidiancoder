import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";

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
  // Admin code override: entering 9822 unlocks unlimited access forever.
  let adminOverride = false;
  try {
    adminOverride = typeof window !== "undefined" && window.localStorage.getItem("obs.adminCode") === "9822";
  } catch { /* ignore */ }
  const isPro = adminOverride || (!!subscription
    && ["active", "trialing"].includes(subscription.status)
    && (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > now));

  return { subscription, isPro, loading, refetch: load };
}
