
-- All access to builds goes through server-only endpoints using the service role,
-- which bypasses RLS. Make the deny-by-default explicit for anon/authenticated.
REVOKE ALL ON public.builds FROM anon, authenticated;
GRANT ALL ON public.builds TO service_role;

-- Explicit restrictive policies so intent is documented and enforced even if
-- grants are later widened by mistake.
DROP POLICY IF EXISTS "Deny all direct client access to builds" ON public.builds;
CREATE POLICY "Deny all direct client access to builds"
  ON public.builds
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.builds IS
  'Server-only table. All reads/writes go through service-role endpoints in src/routes/api/public/*. Direct anon/authenticated access is denied by grants and a restrictive RLS policy.';
