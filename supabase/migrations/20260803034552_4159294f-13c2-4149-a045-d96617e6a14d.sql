GRANT SELECT ON public.project_sync TO authenticated;
GRANT ALL ON public.project_sync TO service_role;
ALTER TABLE public.project_sync REPLICA IDENTITY FULL;