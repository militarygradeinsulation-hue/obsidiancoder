CREATE TABLE public.project_sync (
  project_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled',
  surface text NOT NULL DEFAULT 'coder',
  revision bigint NOT NULL DEFAULT 1,
  live boolean NOT NULL DEFAULT false,
  share_slug text,
  memory jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_device text,
  environment text NOT NULL DEFAULT 'sandbox',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_sync_user_idx ON public.project_sync (user_id, updated_at DESC);

GRANT SELECT ON public.project_sync TO authenticated;
GRANT ALL ON public.project_sync TO service_role;

ALTER TABLE public.project_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_sync_select_own ON public.project_sync
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY project_sync_no_client_insert ON public.project_sync
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY project_sync_no_client_update ON public.project_sync
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY project_sync_no_client_delete ON public.project_sync
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

ALTER TABLE public.project_sync REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_sync;

CREATE OR REPLACE FUNCTION public.project_sync_touch(
  _user_id uuid,
  _project_id uuid,
  _title text,
  _surface text,
  _device text,
  _environment text
) RETURNS TABLE(revision bigint, live boolean, share_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.project_sync (project_id, user_id, title, surface, last_device, environment)
  VALUES (_project_id, _user_id, COALESCE(NULLIF(_title, ''), 'Untitled'), COALESCE(_surface, 'coder'), _device, COALESCE(_environment, 'sandbox'))
  ON CONFLICT (project_id) DO UPDATE SET
    title       = COALESCE(NULLIF(_title, ''), public.project_sync.title),
    surface     = COALESCE(_surface, public.project_sync.surface),
    last_device = _device,
    revision    = public.project_sync.revision + 1,
    updated_at  = now()
  WHERE public.project_sync.user_id = _user_id;

  RETURN QUERY
    SELECT s.revision, s.live, s.share_slug
    FROM public.project_sync s
    WHERE s.project_id = _project_id AND s.user_id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_sync_set_memory(
  _user_id uuid,
  _project_id uuid,
  _memory jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.project_sync (project_id, user_id, memory)
  VALUES (_project_id, _user_id, COALESCE(_memory, '{}'::jsonb))
  ON CONFLICT (project_id) DO UPDATE SET
    memory     = COALESCE(_memory, '{}'::jsonb),
    revision   = public.project_sync.revision + 1,
    updated_at = now()
  WHERE public.project_sync.user_id = _user_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_sync_set_live(
  _user_id uuid,
  _project_id uuid,
  _live boolean,
  _slug text
) RETURNS TABLE(live boolean, share_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.project_sync (project_id, user_id, live, share_slug)
  VALUES (_project_id, _user_id, _live, CASE WHEN _live THEN _slug ELSE NULL END)
  ON CONFLICT (project_id) DO UPDATE SET
    live       = _live,
    share_slug = CASE WHEN _live THEN COALESCE(public.project_sync.share_slug, _slug) ELSE NULL END,
    revision   = public.project_sync.revision + 1,
    updated_at = now()
  WHERE public.project_sync.user_id = _user_id;

  UPDATE public.builds b
     SET share_slug = CASE WHEN _live THEN COALESCE(b.share_slug, _slug) ELSE b.share_slug END,
         is_public  = _live,
         published_at = CASE WHEN _live THEN now() ELSE NULL END
   WHERE b.id = _project_id AND b.user_id = _user_id;

  RETURN QUERY
    SELECT s.live, s.share_slug FROM public.project_sync s
    WHERE s.project_id = _project_id AND s.user_id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_sync_get(
  _user_id uuid,
  _project_id uuid
) RETURNS TABLE(project_id uuid, title text, surface text, revision bigint, live boolean, share_slug text, memory jsonb, last_device text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.project_id, s.title, s.surface, s.revision, s.live, s.share_slug, s.memory, s.last_device, s.updated_at
  FROM public.project_sync s
  WHERE s.project_id = _project_id AND s.user_id = _user_id
  LIMIT 1;
$$;