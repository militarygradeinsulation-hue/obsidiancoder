-- Fail-closed access for the free build ledger. This table stores
-- fingerprint/IP data used only by service-role code paths (edge/server
-- functions). RLS is already enabled; make the intent explicit by
-- revoking anon/authenticated privileges and adding restrictive
-- deny-all policies so no client-facing role can read or write it.
REVOKE ALL ON public.free_build_ledger FROM anon;
REVOKE ALL ON public.free_build_ledger FROM authenticated;
GRANT ALL ON public.free_build_ledger TO service_role;

DROP POLICY IF EXISTS "Deny all client access to free_build_ledger" ON public.free_build_ledger;
CREATE POLICY "Deny all client access to free_build_ledger"
  ON public.free_build_ledger
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);