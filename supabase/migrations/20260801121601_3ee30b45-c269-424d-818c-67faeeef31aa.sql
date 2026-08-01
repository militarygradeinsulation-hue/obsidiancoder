ALTER TABLE public.builds
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS author_label text,
  ADD COLUMN IF NOT EXISTS remix_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surface text;

CREATE INDEX IF NOT EXISTS builds_public_idx ON public.builds (is_public, published_at DESC);

UPDATE public.builds
   SET is_public = true,
       published_at = COALESCE(published_at, created_at),
       surface = COALESCE(surface, 'pocket')
 WHERE is_public = false
   AND html IS NOT NULL
   AND length(html) > 40;