DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', r.sig);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

GRANT SELECT ON public.user_daily_builds TO authenticated;
GRANT ALL ON public.user_daily_builds TO service_role;

DROP POLICY IF EXISTS user_daily_builds_select_own ON public.user_daily_builds;
CREATE POLICY user_daily_builds_select_own
  ON public.user_daily_builds FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can read their own storage objects" ON storage.objects;
CREATE POLICY "Owners can read their own storage objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (auth.uid() = owner_id::uuid);

DROP POLICY IF EXISTS "Owners can upload their own storage objects" ON storage.objects;
CREATE POLICY "Owners can upload their own storage objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id::uuid);

DROP POLICY IF EXISTS "Owners can update their own storage objects" ON storage.objects;
CREATE POLICY "Owners can update their own storage objects"
  ON storage.objects FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id::uuid)
  WITH CHECK (auth.uid() = owner_id::uuid);

DROP POLICY IF EXISTS "Owners can delete their own storage objects" ON storage.objects;
CREATE POLICY "Owners can delete their own storage objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (auth.uid() = owner_id::uuid);