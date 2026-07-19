ALTER TABLE public.builds ADD COLUMN IF NOT EXISTS library_code TEXT;
ALTER TABLE public.builds ADD COLUMN IF NOT EXISTS share_slug TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS builds_library_code_idx ON public.builds (library_code, created_at DESC);
CREATE INDEX IF NOT EXISTS builds_share_slug_idx ON public.builds (share_slug);