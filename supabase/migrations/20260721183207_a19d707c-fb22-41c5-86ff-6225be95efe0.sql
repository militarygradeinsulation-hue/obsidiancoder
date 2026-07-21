
-- Revoke public EXECUTE on all SECURITY DEFINER functions that shouldn't be
-- callable by anon/authenticated. These are all invoked only server-side via
-- the service role client. Also revoke from PUBLIC to be defensive.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated;', fn.proname, fn.args);
  END LOOP;
END $$;

-- Explicit reads are server-only. Ensure no anon/authenticated privileges
-- exist on waitlist_entries; INSERT-only via the /api/public/waitlist route
-- which uses the service role (bypasses RLS and grants).
REVOKE ALL ON public.waitlist_entries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.waitlist_entries TO service_role;

-- Add an explicit deny-SELECT policy for defense-in-depth. Even though RLS is
-- default-deny without a policy, this makes the intent explicit for scanners
-- and future changes.
DROP POLICY IF EXISTS "No client reads on waitlist" ON public.waitlist_entries;
CREATE POLICY "No client reads on waitlist"
  ON public.waitlist_entries
  FOR SELECT
  TO anon, authenticated
  USING (false);
