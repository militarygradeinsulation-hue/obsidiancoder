
-- Lock down builds: remove public read access, drop stored IP/UA
DROP POLICY IF EXISTS "Anyone can view builds" ON public.builds;
REVOKE SELECT ON public.builds FROM anon, authenticated;
ALTER TABLE public.builds DROP COLUMN IF EXISTS ip;
ALTER TABLE public.builds DROP COLUMN IF EXISTS user_agent;
