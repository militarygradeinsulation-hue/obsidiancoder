CREATE TABLE public.waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  intended_use TEXT NOT NULL,
  interest_level TEXT NOT NULL,
  tier TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_waitlist_entries_created_at ON public.waitlist_entries(created_at DESC);
CREATE INDEX idx_waitlist_entries_email ON public.waitlist_entries(lower(email));

GRANT INSERT ON public.waitlist_entries TO anon, authenticated;
GRANT ALL ON public.waitlist_entries TO service_role;

ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit waitlist entry"
  ON public.waitlist_entries FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(name) BETWEEN 1 AND 200
    AND length(email) BETWEEN 3 AND 320
    AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND length(intended_use) BETWEEN 1 AND 2000
    AND interest_level IN ('exploring','planning','ready','urgent')
    AND (company IS NULL OR length(company) <= 200)
    AND (tier IS NULL OR length(tier) <= 64)
    AND (source IS NULL OR length(source) <= 64)
  );
