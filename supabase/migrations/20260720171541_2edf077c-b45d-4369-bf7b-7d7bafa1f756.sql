
-- ============================================================
-- 1. REVOKE billing / admin function EXECUTE from PUBLIC + client roles
-- ============================================================
DO $$
DECLARE
  fn text;
  sig text;
BEGIN
  FOR fn, sig IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'usage_balance','usage_reserve','usage_finalize','usage_refund',
        'has_active_pro',
        'reserve_credits','reserve_credits_v2','commit_credits',
        'finalize_credits','refund_credits',
        'credit_balance','credit_balance_period',
        'log_owner_usage'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', fn, sig);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', fn, sig);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated', fn, sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', fn, sig);
  END LOOP;
END $$;

-- ============================================================
-- 2. ai_usage RLS — SELECT own only, no INSERT/UPDATE/DELETE for clients
-- ============================================================
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.ai_usage FROM anon, authenticated, PUBLIC;
REVOKE SELECT ON public.ai_usage FROM anon, PUBLIC;
GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

-- Recreate SELECT policy idempotently.
DROP POLICY IF EXISTS ai_usage_select_own ON public.ai_usage;
CREATE POLICY ai_usage_select_own ON public.ai_usage
  FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND auth.uid() = user_id);

-- Explicit deny-all for client-side writes (no matching policy = deny anyway,
-- but be defensive against future GRANT drift).
DROP POLICY IF EXISTS ai_usage_no_client_writes ON public.ai_usage;
CREATE POLICY ai_usage_no_client_writes ON public.ai_usage
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Owner-select policy must still permit SELECT for authenticated.
-- RESTRICTIVE + permissive: SELECT gets (false AND own) → the restrictive
-- would block reads. Re-shape as PERMISSIVE deny for write ops only:
DROP POLICY IF EXISTS ai_usage_no_client_writes ON public.ai_usage;
CREATE POLICY ai_usage_no_client_insert ON public.ai_usage
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);
CREATE POLICY ai_usage_no_client_update ON public.ai_usage
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY ai_usage_no_client_delete ON public.ai_usage
  AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

-- ============================================================
-- 3. usage_reserve — validate inputs, exact period, period-locked idempotency
-- ============================================================
CREATE OR REPLACE FUNCTION public.usage_reserve(
  _user_id uuid, _amount integer, _cap integer, _env text,
  _operation text, _request_id text
) RETURNS TABLE(
  reservation_id uuid, credits integer, used_before integer,
  remaining_after integer, idempotent boolean,
  period_start timestamptz, period_end timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _existing_id  uuid;
  _existing_amt integer;
  _existing_ps  timestamptz;
  _existing_pe  timestamptz;
  _ps timestamptz;
  _pe timestamptz;
  _used integer;
  _new_id uuid;
BEGIN
  -- Strict input validation. Bounds mirror the pure-JS mock in
  -- src/lib/usage-ledger-mock.ts so the self-test suite matches SQL.
  IF _env IS NULL OR _env NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'invalid_environment';
  END IF;
  IF _operation IS NULL OR _operation !~ '^[a-z][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'invalid_operation';
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF _cap IS NULL OR _cap < 0 OR _cap > 1000000 THEN
    RAISE EXCEPTION 'invalid_cap';
  END IF;
  IF _request_id IS NULL OR length(_request_id) = 0 THEN
    RAISE EXCEPTION 'request_id required';
  END IF;

  -- Serialize per (user, env). Also used by usage_finalize.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('usage:' || _user_id::text || ':' || _env, 0)
  );

  -- Active exact Stripe period MUST exist before honouring idempotency.
  SELECT current_period_start, current_period_end INTO _ps, _pe
  FROM public.subscriptions
  WHERE user_id = _user_id
    AND environment = _env
    AND status IN ('active','trialing')
  ORDER BY created_at DESC
  LIMIT 1;
  IF _ps IS NULL OR _pe IS NULL OR _ps > now() OR _pe <= now() THEN
    RAISE EXCEPTION 'no_active_subscription_period';
  END IF;

  -- Idempotency, scoped by user/env/request_id AND matching the current period.
  SELECT id, credits_reserved, subscription_period_start, subscription_period_end
    INTO _existing_id, _existing_amt, _existing_ps, _existing_pe
  FROM public.ai_usage
  WHERE environment = _env
    AND request_id  = _request_id
    AND actor_type  = 'user'
    AND user_id     = _user_id
  LIMIT 1;
  IF _existing_id IS NOT NULL THEN
    IF _existing_ps IS DISTINCT FROM _ps OR _existing_pe IS DISTINCT FROM _pe THEN
      RAISE EXCEPTION 'request_id_period_mismatch';
    END IF;
    reservation_id := _existing_id;
    credits        := _existing_amt;
    used_before    := 0;
    remaining_after := 0;
    idempotent     := true;
    period_start   := _ps;
    period_end     := _pe;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Correct balance math: committed → credits_charged, pending → credits_reserved.
  SELECT COALESCE(SUM(
    CASE WHEN status = 'committed' THEN credits_charged
         WHEN status = 'pending'   THEN credits_reserved
         ELSE 0 END
  ), 0) INTO _used
  FROM public.ai_usage
  WHERE user_id     = _user_id
    AND environment = _env
    AND actor_type  = 'user'
    AND status      IN ('pending','committed')
    AND created_at >= _ps
    AND created_at <  _pe;

  IF _used + _amount > _cap THEN
    RETURN;
  END IF;

  INSERT INTO public.ai_usage (
    request_id, user_id, actor_type, operation,
    credits_reserved, credits_charged, status,
    environment, subscription_period_start, subscription_period_end
  ) VALUES (
    _request_id, _user_id, 'user', _operation,
    _amount, 0, 'pending',
    _env, _ps, _pe
  )
  RETURNING id INTO _new_id;

  reservation_id  := _new_id;
  credits         := _amount;
  used_before     := _used;
  remaining_after := _cap - _used - _amount;
  idempotent      := false;
  period_start    := _ps;
  period_end      := _pe;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.usage_reserve(uuid,integer,integer,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usage_reserve(uuid,integer,integer,text,text,text) TO service_role;

-- ============================================================
-- 4. usage_finalize — verify request_id, hold same lock, cap-limited top-up
-- ============================================================
CREATE OR REPLACE FUNCTION public.usage_finalize(
  _reservation_id uuid,
  _actual_credits integer,
  _request_id text,
  _status text DEFAULT 'committed',
  _error_code text DEFAULT NULL,
  _provider text DEFAULT NULL,
  _model text DEFAULT NULL,
  _input_tokens integer DEFAULT 0,
  _output_tokens integer DEFAULT 0,
  _total_tokens integer DEFAULT 0,
  _image_count integer DEFAULT 0,
  _actual_cost_usd numeric DEFAULT NULL,
  _estimated_cost_usd numeric DEFAULT NULL,
  _cost_basis text DEFAULT NULL,
  _meta jsonb DEFAULT NULL,
  _cap integer DEFAULT 1000
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _row public.ai_usage%ROWTYPE;
  _period_used integer;
  _available integer;
  _charge integer;
  _cap_limited boolean := false;
  _new_meta jsonb;
BEGIN
  IF _status NOT IN ('committed','failed') THEN
    RAISE EXCEPTION 'usage_finalize: invalid status %', _status;
  END IF;
  IF _actual_credits < 0 THEN
    RAISE EXCEPTION 'usage_finalize: actual_credits must be >= 0';
  END IF;
  IF _cap IS NULL OR _cap < 0 THEN
    RAISE EXCEPTION 'usage_finalize: invalid cap';
  END IF;
  IF _request_id IS NULL OR length(_request_id) = 0 THEN
    RAISE EXCEPTION 'request_id required';
  END IF;

  SELECT * INTO _row FROM public.ai_usage WHERE id = _reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Request_id must belong to this reservation.
  IF _row.request_id IS DISTINCT FROM _request_id THEN
    RAISE EXCEPTION 'request_id_mismatch';
  END IF;

  -- Hold the same per-(user,env) advisory lock used by usage_reserve so a
  -- concurrent reservation cannot slip in between the top-up cap check
  -- and the UPDATE.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('usage:' || _row.user_id::text || ':' || _row.environment, 0)
  );

  IF _row.status IN ('committed','refunded','failed') THEN
    RETURN true;
  END IF;
  IF _row.status <> 'pending' THEN
    RAISE EXCEPTION 'usage_finalize: unexpected status %', _row.status;
  END IF;

  -- Period usage EXCLUDING this pending row.
  SELECT COALESCE(SUM(
    CASE WHEN status = 'committed' THEN credits_charged
         WHEN status = 'pending'   THEN credits_reserved
         ELSE 0 END
  ), 0) INTO _period_used
  FROM public.ai_usage
  WHERE user_id     = _row.user_id
    AND environment = _row.environment
    AND actor_type  = 'user'
    AND status      IN ('pending','committed')
    AND id         <> _row.id
    AND created_at >= _row.subscription_period_start
    AND created_at <  _row.subscription_period_end;

  _available := GREATEST(0, _cap - _period_used);
  IF _actual_credits <= _available THEN
    _charge := _actual_credits;
  ELSE
    _charge := _available;
    _cap_limited := true;
  END IF;

  _new_meta := COALESCE(_meta, COALESCE(_row.meta, '{}'::jsonb));
  IF _cap_limited THEN
    _new_meta := _new_meta || jsonb_build_object(
      'cap_limited', true,
      'requested_credits', _actual_credits,
      'available_credits', _available
    );
  END IF;

  UPDATE public.ai_usage
     SET credits_reserved = _charge,
         credits_charged  = _charge,
         status           = _status,
         provider         = COALESCE(_provider,       provider),
         model            = COALESCE(_model,          model),
         input_tokens     = GREATEST(input_tokens,    _input_tokens),
         output_tokens    = GREATEST(output_tokens,   _output_tokens),
         total_tokens     = GREATEST(total_tokens,    _total_tokens),
         image_count      = GREATEST(image_count,     _image_count),
         actual_cost_usd  = COALESCE(_actual_cost_usd,    actual_cost_usd),
         estimated_cost_usd = COALESCE(_estimated_cost_usd, estimated_cost_usd),
         cost_basis       = COALESCE(_cost_basis,     cost_basis),
         error_code       = COALESCE(_error_code,     error_code),
         meta             = _new_meta
   WHERE id = _reservation_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.usage_finalize(uuid,integer,text,text,text,text,text,integer,integer,integer,integer,numeric,numeric,text,jsonb,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usage_finalize(uuid,integer,text,text,text,text,text,integer,integer,integer,integer,numeric,numeric,text,jsonb,integer) TO service_role;

-- ============================================================
-- 5. usage_balance — correct math for committed vs pending
-- ============================================================
CREATE OR REPLACE FUNCTION public.usage_balance(
  _user_id uuid, _env text, _cap integer
) RETURNS TABLE(
  used integer, reserved integer, cap integer, remaining integer,
  period_start timestamptz, period_end timestamptz, active boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _ps timestamptz;
  _pe timestamptz;
BEGIN
  SELECT current_period_start, current_period_end INTO _ps, _pe
  FROM public.subscriptions
  WHERE user_id = _user_id AND environment = _env
    AND status IN ('active','trialing')
  ORDER BY created_at DESC LIMIT 1;

  IF _ps IS NULL OR _pe IS NULL OR _ps > now() OR _pe <= now() THEN
    used := 0; reserved := 0; cap := _cap; remaining := 0;
    period_start := _ps; period_end := _pe; active := false;
    RETURN NEXT; RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN status = 'committed' THEN credits_charged  ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN status = 'pending'   THEN credits_reserved ELSE 0 END), 0)::integer,
    _cap,
    GREATEST(
      _cap -
      COALESCE(SUM(
        CASE WHEN status = 'committed' THEN credits_charged
             WHEN status = 'pending'   THEN credits_reserved
             ELSE 0 END
      ), 0)::integer,
      0
    ),
    _ps, _pe, true
  FROM public.ai_usage
  WHERE user_id = _user_id
    AND environment = _env
    AND actor_type  = 'user'
    AND status IN ('pending','committed')
    AND created_at >= _ps
    AND created_at <  _pe;
END;
$$;

REVOKE ALL ON FUNCTION public.usage_balance(uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usage_balance(uuid,text,integer) TO service_role;
