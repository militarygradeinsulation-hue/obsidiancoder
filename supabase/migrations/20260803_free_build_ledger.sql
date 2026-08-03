-- Per-user daily free build entitlement.
-- NOTE: The free_build_ledger table already existed with a fingerprint-based
-- schema (for anonymous demo builds). The per-user daily build table was
-- created as user_daily_builds instead to avoid conflict.
-- This migration documents what was applied directly to the database.

CREATE TABLE IF NOT EXISTS public.user_daily_builds (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  build_date  date        NOT NULL,
  environment text        NOT NULL CHECK (environment IN ('sandbox', 'live')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, build_date, environment)
);

ALTER TABLE public.user_daily_builds ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_free_build(
  _user_id     uuid,
  _date        date,
  _environment text
) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_daily_builds (user_id, build_date, environment)
  VALUES (_user_id, _date, _environment)
  ON CONFLICT (user_id, build_date, environment) DO NOTHING;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_free_build(
  _user_id     uuid,
  _date        date,
  _environment text
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.user_daily_builds
  WHERE user_id    = _user_id
    AND build_date = _date
    AND environment = _environment
    AND created_at >= now() - INTERVAL '10 minutes';
END;
$$;

CREATE OR REPLACE FUNCTION public.free_build_used(
  _user_id     uuid,
  _date        date,
  _environment text
) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_daily_builds
    WHERE user_id    = _user_id
      AND build_date = _date
      AND environment = _environment
  );
$$;

GRANT EXECUTE ON FUNCTION public.claim_free_build   TO service_role;
GRANT EXECUTE ON FUNCTION public.release_free_build TO service_role;
GRANT EXECUTE ON FUNCTION public.free_build_used    TO service_role;
