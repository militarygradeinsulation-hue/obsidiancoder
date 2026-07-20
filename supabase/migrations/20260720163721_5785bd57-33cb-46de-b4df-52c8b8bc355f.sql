
-- 1. Detailed AI usage ledger
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user','owner')),
  operation text NOT NULL,
  provider text,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  image_count integer NOT NULL DEFAULT 0,
  actual_cost_usd numeric(12,6),
  estimated_cost_usd numeric(12,6),
  cost_basis text NOT NULL DEFAULT 'estimated' CHECK (cost_basis IN ('actual','estimated','minimum')),
  credits_reserved integer NOT NULL DEFAULT 0,
  credits_charged integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','committed','refunded','failed')),
  environment text NOT NULL DEFAULT 'sandbox',
  subscription_period_start timestamptz,
  subscription_period_end timestamptz,
  error_code text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_request_id_env_uniq
  ON public.ai_usage (request_id, environment);
CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx
  ON public.ai_usage (user_id, created_at DESC);

GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_usage_select_own ON public.ai_usage
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

-- 2. Lock down owner_usage - private admin log only
REVOKE ALL ON public.owner_usage FROM anon, authenticated;
GRANT ALL ON public.owner_usage TO service_role;
ALTER TABLE public.owner_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_usage_no_client_access ON public.owner_usage;
CREATE POLICY owner_usage_no_client_access ON public.owner_usage
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 3. Idempotency: unique index on credit_usage.request_id per (user, env)
CREATE UNIQUE INDEX IF NOT EXISTS credit_usage_request_id_uniq
  ON public.credit_usage (user_id, environment, request_id)
  WHERE request_id IS NOT NULL;

-- 4. Subscription-period balance function
CREATE OR REPLACE FUNCTION public.credit_balance_period(_user_id uuid, _env text, _cap integer)
RETURNS TABLE(used integer, reserved integer, cap integer, remaining integer, period_start timestamptz, period_end timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ps timestamptz;
  _pe timestamptz;
BEGIN
  SELECT current_period_start, current_period_end
    INTO _ps, _pe
  FROM public.subscriptions
  WHERE user_id = _user_id
    AND environment = _env
    AND status IN ('active','trialing')
  ORDER BY created_at DESC
  LIMIT 1;

  IF _ps IS NULL THEN _ps := date_trunc('month', now()); END IF;
  IF _pe IS NULL THEN _pe := _ps + interval '1 month'; END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN status = 'committed' THEN credits ELSE 0 END), 0)::integer AS used,
    COALESCE(SUM(CASE WHEN status = 'pending'   THEN credits ELSE 0 END), 0)::integer AS reserved,
    _cap AS cap,
    GREATEST(_cap - COALESCE(SUM(CASE WHEN status IN ('pending','committed') THEN credits ELSE 0 END), 0)::integer, 0) AS remaining,
    _ps AS period_start,
    _pe AS period_end
  FROM public.credit_usage
  WHERE user_id = _user_id
    AND environment = _env
    AND status IN ('pending','committed')
    AND created_at >= _ps
    AND created_at <  _pe;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_balance_period(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.credit_balance_period(uuid, text, integer) TO authenticated, service_role;

-- 5. Idempotent reservation keyed by request_id, uses subscription period
CREATE OR REPLACE FUNCTION public.reserve_credits_v2(
  _user_id uuid, _amount integer, _cap integer, _env text, _operation text, _request_id text
) RETURNS TABLE(reservation_id uuid, credits integer, used_before integer, remaining_after integer, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _used integer;
  _new_id uuid;
  _existing_id uuid;
  _existing_amt integer;
  _ps timestamptz;
  _pe timestamptz;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF _cap < 0 THEN RAISE EXCEPTION 'cap must be non-negative'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cr2:' || _user_id::text || ':' || _env, 0));

  -- Idempotent: return existing reservation for this request_id
  IF _request_id IS NOT NULL THEN
    SELECT id, credits INTO _existing_id, _existing_amt
    FROM public.credit_usage
    WHERE user_id = _user_id AND environment = _env AND request_id = _request_id
    LIMIT 1;
    IF _existing_id IS NOT NULL THEN
      reservation_id := _existing_id;
      credits := _existing_amt;
      used_before := 0;
      remaining_after := 0;
      idempotent := true;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- Subscription period window
  SELECT current_period_start, current_period_end INTO _ps, _pe
  FROM public.subscriptions
  WHERE user_id = _user_id AND environment = _env AND status IN ('active','trialing')
  ORDER BY created_at DESC LIMIT 1;
  IF _ps IS NULL THEN _ps := date_trunc('month', now()); END IF;
  IF _pe IS NULL THEN _pe := _ps + interval '1 month'; END IF;

  SELECT COALESCE(SUM(credits), 0) INTO _used
  FROM public.credit_usage
  WHERE user_id = _user_id AND environment = _env
    AND status IN ('pending','committed')
    AND created_at >= _ps AND created_at < _pe;

  IF _used + _amount > _cap THEN
    RETURN;
  END IF;

  INSERT INTO public.credit_usage (user_id, credits, operation, environment, status, request_id)
  VALUES (_user_id, _amount, _operation, _env, 'pending', _request_id)
  RETURNING id INTO _new_id;

  reservation_id := _new_id;
  credits := _amount;
  used_before := _used;
  remaining_after := _cap - _used - _amount;
  idempotent := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_credits_v2(uuid, integer, integer, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credits_v2(uuid, integer, integer, text, text, text) TO service_role;

-- 6. Finalize reservation to actual credits (idempotent, valid transitions)
CREATE OR REPLACE FUNCTION public.finalize_credits(
  _reservation_id uuid, _actual_credits integer, _request_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cur_status text;
  _cur_credits integer;
BEGIN
  SELECT status, credits INTO _cur_status, _cur_credits
  FROM public.credit_usage WHERE id = _reservation_id FOR UPDATE;
  IF _cur_status IS NULL THEN RETURN false; END IF;
  -- Idempotent: already committed → no-op success
  IF _cur_status = 'committed' THEN RETURN true; END IF;
  IF _cur_status <> 'pending' THEN RETURN false; END IF;

  UPDATE public.credit_usage
  SET credits = GREATEST(0, LEAST(_actual_credits, _cur_credits)),
      status = 'committed',
      committed_at = now(),
      request_id = COALESCE(_request_id, request_id)
  WHERE id = _reservation_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_credits(uuid, integer, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_credits(uuid, integer, text) TO service_role;
