
CREATE OR REPLACE FUNCTION public.claim_free_demo(
  _fingerprint text,
  _environment text,
  _ip_prefix   text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted boolean := false;
BEGIN
  IF _fingerprint IS NULL OR length(_fingerprint) < 8 THEN
    RETURN false;
  END IF;
  IF _environment NOT IN ('sandbox','live') THEN
    RETURN false;
  END IF;
  INSERT INTO public.free_build_ledger (fingerprint, environment, ip_prefix)
  VALUES (_fingerprint, _environment, _ip_prefix)
  ON CONFLICT (fingerprint, environment) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_free_demo(
  _fingerprint text,
  _environment text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted integer := 0;
BEGIN
  DELETE FROM public.free_build_ledger
   WHERE fingerprint = _fingerprint
     AND environment = _environment
     -- only release very fresh claims (safety window)
     AND used_at > now() - interval '10 minutes';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.free_demo_used(
  _fingerprint text,
  _environment text
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.free_build_ledger
     WHERE fingerprint = _fingerprint
       AND environment = _environment
  );
$$;

REVOKE ALL ON FUNCTION public.claim_free_demo(text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_free_demo(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.free_demo_used(text,text)     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_free_demo(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_free_demo(text,text)    TO service_role;
GRANT EXECUTE ON FUNCTION public.free_demo_used(text,text)       TO service_role;
