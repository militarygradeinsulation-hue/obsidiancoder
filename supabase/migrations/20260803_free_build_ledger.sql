-- Free daily build ledger for signed-in free-tier users.
-- One row per user per UTC date per environment.
-- claim_free_build: atomic INSERT — returns true on first claim, false on duplicate.
-- release_free_build: DELETE within 10-min safety window (refund if provider never ran).
-- free_build_used: read-only existence check.

CREATE TABLE IF NOT EXISTS public.free_build_ledger (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  build_date  date        NOT NULL,  -- UTC calendar date, e.g. '2026-08-03'
  environment text        NOT NULL CHECK (environment IN ('sandbox', 'live')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, build_date, environment)
);

-- Service-role only; no RLS needed — all access via functions with SECURITY DEFINER.
ALTER TABLE public.free_build_ledger ENABLE ROW LEVEL SECURITY;

-- claim_free_build: INSERT OR IGNORE pattern.
-- Returns TRUE on fresh insert (claim granted), FALSE when row already exists (already used).
CREATE OR REPLACE FUNCTION public.claim_free_build(
  _user_id     uuid,
  _date        date,
  _environment text
) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.free_build_ledger (user_id, build_date, environment)
  VALUES (_user_id, _date, _environment)
  ON CONFLICT (user_id, build_date, environment) DO NOTHING;
  RETURN FOUND;
END;
$$;

-- release_free_build: DELETE only within 10-minute safety window.
CREATE OR REPLACE FUNCTION public.release_free_build(
  _user_id     uuid,
  _date        date,
  _environment text
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.free_build_ledger
  WHERE user_id    = _user_id
    AND build_date = _date
    AND environment = _environment
    AND created_at >= now() - INTERVAL '10 minutes';
END;
$$;

-- free_build_used: read-only check.
CREATE OR REPLACE FUNCTION public.free_build_used(
  _user_id     uuid,
  _date        date,
  _environment text
) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.free_build_ledger
    WHERE user_id    = _user_id
      AND build_date = _date
      AND environment = _environment
  );
$$;

GRANT EXECUTE ON FUNCTION public.claim_free_build   TO service_role;
GRANT EXECUTE ON FUNCTION public.release_free_build TO service_role;
GRANT EXECUTE ON FUNCTION public.free_build_used    TO service_role;
