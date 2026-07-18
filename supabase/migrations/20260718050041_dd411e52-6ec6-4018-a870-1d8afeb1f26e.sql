
CREATE TABLE public.builds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT NOT NULL DEFAULT 'Untitled',
  prompt TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL,
  model TEXT,
  session_id TEXT,
  client_id TEXT,
  ip TEXT,
  user_agent TEXT,
  byte_size INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX builds_created_at_idx ON public.builds (created_at DESC);
GRANT SELECT, INSERT ON public.builds TO anon, authenticated;
GRANT ALL ON public.builds TO service_role;
ALTER TABLE public.builds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert a build" ON public.builds FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can view builds" ON public.builds FOR SELECT TO anon, authenticated USING (true);
