DROP POLICY IF EXISTS "Deny all direct client access to builds" ON public.builds;

CREATE POLICY "builds_no_client_insert" ON public.builds AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "builds_no_client_update" ON public.builds AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "builds_no_client_delete" ON public.builds AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

GRANT SELECT ON public.builds TO anon, authenticated;
GRANT ALL ON public.builds TO service_role;