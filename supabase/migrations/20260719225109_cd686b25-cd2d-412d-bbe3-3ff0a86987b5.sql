
-- Lock down builds table: all access goes through the server (service role).
DROP POLICY IF EXISTS "Anyone can insert a build" ON public.builds;

REVOKE ALL ON public.builds FROM anon;
REVOKE ALL ON public.builds FROM authenticated;
GRANT ALL ON public.builds TO service_role;

-- Ensure RLS is on so any accidental future grants still deny by default.
ALTER TABLE public.builds ENABLE ROW LEVEL SECURITY;

-- Lock down SECURITY DEFINER functions so they are not callable via the API.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.has_active_pro(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_pro(uuid, text) TO service_role;
