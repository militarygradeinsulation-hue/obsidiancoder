-- credit_usage table
CREATE TABLE public.credit_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits integer NOT NULL CHECK (credits > 0),
  operation text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','committed','refunded')),
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);
GRANT SELECT ON public.credit_usage TO authenticated;
GRANT ALL ON public.credit_usage TO service_role;
ALTER TABLE public.credit_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_usage_select_own ON public.credit_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX credit_usage_user_env_created_idx
  ON public.credit_usage (user_id, environment, created_at DESC);

-- owner_usage table (server-only)
CREATE TABLE public.owner_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation text NOT NULL,
  credits integer NOT NULL DEFAULT 0,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.owner_usage TO service_role;
ALTER TABLE public.owner_usage ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role can touch it.

-- Atomic reservation with per-(user,env) advisory lock.
CREATE OR REPLACE FUNCTION public.reserve_credits(
  _user_id uuid,
  _amount integer,
  _cap integer,
  _env text,
  _operation text
) RETURNS TABLE(reservation_id uuid, used_before integer, remaining_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _used integer;
  _new_id uuid;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF _cap < 0 THEN RAISE EXCEPTION 'cap must be non-negative'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cr:' || _user_id::text || ':' || _env, 0));

  SELECT COALESCE(SUM(credits), 0) INTO _used
  FROM public.credit_usage
  WHERE user_id = _user_id
    AND environment = _env
    AND status IN ('pending','committed')
    AND created_at >= date_trunc('month', now());

  IF _used + _amount > _cap THEN
    RETURN;
  END IF;

  INSERT INTO public.credit_usage (user_id, credits, operation, environment, status)
  VALUES (_user_id, _amount, _operation, _env, 'pending')
  RETURNING id INTO _new_id;

  reservation_id := _new_id;
  used_before := _used;
  remaining_after := _cap - _used - _amount;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_credits(uuid, integer, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_credits(uuid, integer, integer, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.commit_credits(_reservation_id uuid, _request_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.credit_usage
     SET status = 'committed', committed_at = now(),
         request_id = COALESCE(_request_id, request_id)
   WHERE id = _reservation_id AND status = 'pending';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.commit_credits(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_credits(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_credits(_reservation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  DELETE FROM public.credit_usage
   WHERE id = _reservation_id AND status = 'pending';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.refund_credits(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_credits(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.credit_balance(_user_id uuid, _env text, _cap integer)
RETURNS TABLE(used integer, cap integer, remaining integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(credits), 0)::integer AS used,
    _cap AS cap,
    GREATEST(_cap - COALESCE(SUM(credits), 0)::integer, 0) AS remaining
  FROM public.credit_usage
  WHERE user_id = _user_id
    AND environment = _env
    AND status IN ('pending','committed')
    AND created_at >= date_trunc('month', now());
$$;
REVOKE ALL ON FUNCTION public.credit_balance(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_balance(uuid, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.log_owner_usage(_operation text, _credits integer, _request_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.owner_usage (operation, credits, request_id)
  VALUES (_operation, COALESCE(_credits, 0), _request_id);
$$;
REVOKE ALL ON FUNCTION public.log_owner_usage(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_owner_usage(text, integer, text) TO service_role;