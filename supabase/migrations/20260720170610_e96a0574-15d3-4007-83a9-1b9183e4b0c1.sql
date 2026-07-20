
-- ============================================================
-- Runtime billing hardening: single ai_usage ledger, subscription-only window
-- ============================================================

-- 1. Strict nonnegative checks on ai_usage.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_nonneg_check') THEN
    ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_nonneg_check CHECK (
      input_tokens >= 0 AND output_tokens >= 0 AND total_tokens >= 0
      AND image_count >= 0
      AND credits_reserved >= 0 AND credits_charged >= 0
      AND (actual_cost_usd IS NULL OR actual_cost_usd >= 0)
      AND (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0)
    );
  END IF;
END $$;

-- Index for period-window scans (per user / env / created_at).
CREATE INDEX IF NOT EXISTS ai_usage_user_env_created_idx
  ON public.ai_usage (user_id, environment, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Updated-at trigger for finalize/refund UPDATEs.
CREATE OR REPLACE FUNCTION public.ai_usage_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS ai_usage_set_updated_at ON public.ai_usage;
CREATE TRIGGER ai_usage_set_updated_at
BEFORE UPDATE ON public.ai_usage
FOR EACH ROW EXECUTE FUNCTION public.ai_usage_touch_updated_at();

-- 2. Tighten has_active_pro: real period only, no NULL fallback.
CREATE OR REPLACE FUNCTION public.has_active_pro(user_uuid uuid, check_env text DEFAULT 'sandbox'::text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = user_uuid
      AND environment = check_env
      AND status IN ('active', 'trialing')
      AND current_period_start IS NOT NULL
      AND current_period_end   IS NOT NULL
      AND current_period_start <= now()
      AND current_period_end    > now()
  );
$fn$;

-- 3. New usage_reserve — single row, subscription-window-only, cap-safe.
--    Returns period_start/period_end alongside reservation for the UI.
--    Raises 'no_active_subscription_period' when Pro window is missing.
CREATE OR REPLACE FUNCTION public.usage_reserve(
  _user_id uuid,
  _amount integer,
  _cap integer,
  _env text,
  _operation text,
  _request_id text
)
RETURNS TABLE (
  reservation_id uuid,
  credits integer,
  used_before integer,
  remaining_after integer,
  idempotent boolean,
  period_start timestamptz,
  period_end   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _existing_id  uuid;
  _existing_amt integer;
  _ps timestamptz;
  _pe timestamptz;
  _used integer;
  _new_id uuid;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF _cap    <  0 THEN RAISE EXCEPTION 'cap must be non-negative'; END IF;
  IF _request_id IS NULL OR length(_request_id) = 0 THEN
    RAISE EXCEPTION 'request_id required';
  END IF;

  -- Concurrency: serialize per user+env so two racing requests cannot
  -- both fit under the cap. Advisory lock is transaction-scoped.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('usage_reserve:' || _user_id::text || ':' || _env, 0)
  );

  -- Idempotency: same request_id ⇒ return the existing row without
  -- re-charging. Match on (env, request_id) which is UNIQUE on ai_usage.
  SELECT id, credits_reserved
    INTO _existing_id, _existing_amt
  FROM public.ai_usage
  WHERE environment = _env
    AND request_id  = _request_id
    AND actor_type  = 'user'
    AND user_id     = _user_id
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    SELECT current_period_start, current_period_end INTO _ps, _pe
    FROM public.subscriptions
    WHERE user_id = _user_id AND environment = _env
      AND status IN ('active','trialing')
    ORDER BY created_at DESC LIMIT 1;
    reservation_id  := _existing_id;
    credits         := _existing_amt;
    used_before     := 0;
    remaining_after := 0;
    idempotent      := true;
    period_start    := _ps;
    period_end      := _pe;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Require real subscription window (no calendar fallback in prod billing).
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

  -- Sum active credits in this exact period (subscription-only window).
  SELECT COALESCE(SUM(credits_reserved), 0) INTO _used
  FROM public.ai_usage
  WHERE user_id     = _user_id
    AND environment = _env
    AND actor_type  = 'user'
    AND status      IN ('pending','committed')
    AND created_at >= _ps
    AND created_at <  _pe;

  IF _used + _amount > _cap THEN
    -- Return no rows → caller treats as cap-exceeded.
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
$fn$;

-- 4. usage_finalize — updates the SAME pending row (no second insert).
--    Idempotent: already-committed returns true.
CREATE OR REPLACE FUNCTION public.usage_finalize(
  _reservation_id uuid,
  _actual_credits integer,
  _request_id     text,
  _status         text DEFAULT 'committed',
  _error_code     text DEFAULT NULL,
  _provider       text DEFAULT NULL,
  _model          text DEFAULT NULL,
  _input_tokens   integer DEFAULT 0,
  _output_tokens  integer DEFAULT 0,
  _total_tokens   integer DEFAULT 0,
  _image_count    integer DEFAULT 0,
  _actual_cost_usd    numeric DEFAULT NULL,
  _estimated_cost_usd numeric DEFAULT NULL,
  _cost_basis     text DEFAULT NULL,
  _meta           jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _row public.ai_usage%ROWTYPE;
  _charge integer;
BEGIN
  IF _status NOT IN ('committed','failed') THEN
    RAISE EXCEPTION 'usage_finalize: invalid status %', _status;
  END IF;
  IF _actual_credits < 0 THEN
    RAISE EXCEPTION 'usage_finalize: actual_credits must be >= 0';
  END IF;

  SELECT * INTO _row FROM public.ai_usage WHERE id = _reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Idempotent no-op if already terminal.
  IF _row.status IN ('committed','refunded','failed') THEN
    RETURN true;
  END IF;
  IF _row.status <> 'pending' THEN
    RAISE EXCEPTION 'usage_finalize: unexpected status %', _row.status;
  END IF;

  -- Never charge more than we reserved.
  _charge := GREATEST(0, LEAST(_actual_credits, _row.credits_reserved));

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
         meta             = COALESCE(_meta,           meta),
         request_id       = COALESCE(_request_id,     request_id)
   WHERE id = _reservation_id;

  RETURN true;
END;
$fn$;

-- 5. usage_refund — cancels a pending row entirely; idempotent for already-refunded.
CREATE OR REPLACE FUNCTION public.usage_refund(_reservation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE _row public.ai_usage%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.ai_usage WHERE id = _reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _row.status = 'refunded' THEN RETURN true; END IF;
  IF _row.status <> 'pending' THEN RETURN false; END IF;

  UPDATE public.ai_usage
     SET status = 'refunded', credits_reserved = 0, credits_charged = 0
   WHERE id = _reservation_id;
  RETURN true;
END;
$fn$;

-- 6. usage_balance — subscription-window balance. Returns NULL period fields
--    (and remaining=0) when the caller has no active/valid Pro window.
CREATE OR REPLACE FUNCTION public.usage_balance(
  _user_id uuid,
  _env     text,
  _cap     integer
)
RETURNS TABLE (
  used integer,
  reserved integer,
  cap integer,
  remaining integer,
  period_start timestamptz,
  period_end   timestamptz,
  active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
    GREATEST(_cap - COALESCE(SUM(CASE WHEN status IN ('pending','committed') THEN credits_reserved ELSE 0 END), 0)::integer, 0),
    _ps, _pe, true
  FROM public.ai_usage
  WHERE user_id = _user_id
    AND environment = _env
    AND actor_type  = 'user'
    AND status IN ('pending','committed')
    AND created_at >= _ps
    AND created_at <  _pe;
END;
$fn$;

-- 7. Explicit EXECUTE grants — service_role only. Callers reach these via
--    the admin client from server routes; user role cannot invoke directly.
REVOKE ALL ON FUNCTION public.usage_reserve(uuid, integer, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usage_finalize(uuid, integer, text, text, text, text, text, integer, integer, integer, integer, numeric, numeric, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usage_refund(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usage_balance(uuid, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.usage_reserve(uuid, integer, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.usage_finalize(uuid, integer, text, text, text, text, text, integer, integer, integer, integer, numeric, numeric, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.usage_refund(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.usage_balance(uuid, text, integer) TO service_role, authenticated;
