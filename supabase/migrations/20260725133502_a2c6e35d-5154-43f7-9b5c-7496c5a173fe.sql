
CREATE TABLE public.feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  contact TEXT CHECK (contact IS NULL OR char_length(contact) <= 200),
  path TEXT CHECK (path IS NULL OR char_length(path) <= 500),
  user_agent TEXT CHECK (user_agent IS NULL OR char_length(user_agent) <= 500),
  handled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.feedback TO anon, authenticated;
GRANT ALL ON public.feedback TO service_role;

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit feedback"
  ON public.feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "No client can read feedback"
  ON public.feedback FOR SELECT
  TO anon, authenticated
  USING (false);

CREATE INDEX feedback_created_at_idx ON public.feedback (created_at DESC);
