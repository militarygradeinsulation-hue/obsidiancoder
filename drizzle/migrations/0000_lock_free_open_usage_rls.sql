-- Lock down free_open_usage: rate-limit bookkeeping (fingerprints, IP prefixes)
-- that must never be readable or writable by client roles. All access goes
-- through the claim_free_open security-definer RPC and the service role.
ALTER TABLE public.free_open_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.free_open_usage FROM anon;
REVOKE ALL ON public.free_open_usage FROM authenticated;

GRANT ALL ON public.free_open_usage TO service_role;

-- Intentionally no permissive policies: with RLS enabled and no policies,
-- every Data API (anon/authenticated) access is denied. The server writes
-- rows via the security-definer claim_free_open function, which bypasses RLS.