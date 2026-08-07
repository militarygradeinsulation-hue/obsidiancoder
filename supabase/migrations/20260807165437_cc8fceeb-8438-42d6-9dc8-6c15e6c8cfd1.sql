CREATE POLICY "Public builds are viewable by everyone"
ON public.builds FOR SELECT TO anon, authenticated
USING (is_public = true);
GRANT SELECT ON public.builds TO anon, authenticated;