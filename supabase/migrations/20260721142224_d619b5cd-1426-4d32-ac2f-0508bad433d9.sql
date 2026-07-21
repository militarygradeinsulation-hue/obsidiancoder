
ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS amount_paid integer,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_stripe_session_id_key
  ON public.waitlist_entries(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_paid
  ON public.waitlist_entries(paid) WHERE paid = true;

-- Public visibility: allow anyone to read the paid COUNT via a security-definer
-- function (no PII), so the whitelist form can show remaining spots.
CREATE OR REPLACE FUNCTION public.waitlist_paid_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.waitlist_entries WHERE paid = true;
$$;

REVOKE ALL ON FUNCTION public.waitlist_paid_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.waitlist_paid_count() TO anon, authenticated, service_role;
