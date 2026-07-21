
CREATE TABLE public.featured_demos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'App',
  url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.featured_demos TO anon, authenticated;
GRANT ALL ON public.featured_demos TO service_role;

ALTER TABLE public.featured_demos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view featured demos"
  ON public.featured_demos FOR SELECT
  USING (true);

CREATE INDEX featured_demos_sort_idx ON public.featured_demos (sort_order DESC, created_at DESC);
