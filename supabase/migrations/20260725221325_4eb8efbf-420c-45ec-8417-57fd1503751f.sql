
CREATE TABLE public.trial_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  stripe_customer_id TEXT,
  stripe_session_id TEXT UNIQUE,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'usd',
  environment TEXT NOT NULL DEFAULT 'sandbox',
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  credit_applied BOOLEAN NOT NULL DEFAULT false,
  credit_applied_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX trial_claims_user_env_unique
  ON public.trial_claims(user_id, environment) WHERE user_id IS NOT NULL;
CREATE INDEX trial_claims_email_env ON public.trial_claims(lower(email), environment);
CREATE INDEX trial_claims_customer ON public.trial_claims(stripe_customer_id);

GRANT SELECT ON public.trial_claims TO authenticated;
GRANT ALL ON public.trial_claims TO service_role;

ALTER TABLE public.trial_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trial claim"
  ON public.trial_claims FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages trial claims"
  ON public.trial_claims FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
