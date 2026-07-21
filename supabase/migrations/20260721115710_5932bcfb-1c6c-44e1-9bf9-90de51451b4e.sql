
CREATE TABLE public.saved_ideas (
  library_code text PRIMARY KEY,
  ideas jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.saved_ideas TO service_role;
ALTER TABLE public.saved_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all direct client access to saved_ideas"
  ON public.saved_ideas AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
