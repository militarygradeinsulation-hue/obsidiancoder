CREATE TABLE public.build_memory (
  project_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, key)
);

GRANT SELECT ON public.build_memory TO authenticated;
GRANT ALL ON public.build_memory TO service_role;

ALTER TABLE public.build_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY build_memory_select_own ON public.build_memory
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY build_memory_no_client_insert ON public.build_memory
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY build_memory_no_client_update ON public.build_memory
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY build_memory_no_client_delete ON public.build_memory
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

ALTER TABLE public.build_memory REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.build_memory;

CREATE INDEX build_memory_project_updated_idx ON public.build_memory (project_id, updated_at DESC);

ALTER TABLE public.project_sync
  ADD COLUMN IF NOT EXISTS cloud_memory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS team_code_hash text,
  ADD COLUMN IF NOT EXISTS team_code_set_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.project_sync_set_cloud_memory(
  _user_id uuid, _project_id uuid, _enabled boolean, _code_hash text
)
RETURNS TABLE(cloud_memory boolean, live boolean, share_slug text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.project_sync (project_id, user_id, cloud_memory, team_code_hash, team_code_set_at)
  VALUES (_project_id, _user_id, _enabled, _code_hash, CASE WHEN _code_hash IS NULL THEN NULL ELSE now() END)
  ON CONFLICT (project_id) DO UPDATE SET
    cloud_memory     = _enabled,
    team_code_hash   = COALESCE(_code_hash, public.project_sync.team_code_hash),
    team_code_set_at = CASE WHEN _code_hash IS NULL THEN public.project_sync.team_code_set_at ELSE now() END,
    revision         = public.project_sync.revision + 1,
    updated_at       = now()
  WHERE public.project_sync.user_id = _user_id;

  RETURN QUERY
    SELECT s.cloud_memory, s.live, s.share_slug
    FROM public.project_sync s
    WHERE s.project_id = _project_id AND s.user_id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.build_memory_lookup(_slug text)
RETURNS TABLE(project_id uuid, owner_id uuid, title text, cloud_memory boolean, live boolean, team_code_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.project_id, s.user_id, s.title, s.cloud_memory, s.live, s.team_code_hash
  FROM public.project_sync s
  WHERE s.share_slug = _slug AND s.live = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.build_memory_list(_project_id uuid)
RETURNS TABLE(key text, value jsonb, updated_by text, updated_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT m.key, m.value, m.updated_by, m.updated_at
  FROM public.build_memory m
  WHERE m.project_id = _project_id
  ORDER BY m.updated_at DESC
  LIMIT 2000;
$$;

CREATE OR REPLACE FUNCTION public.build_memory_upsert(
  _project_id uuid, _owner_id uuid, _key text, _value jsonb, _updated_by text
)
RETURNS timestamp with time zone
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _ts timestamptz;
BEGIN
  IF _key IS NULL OR length(_key) = 0 OR length(_key) > 200 THEN
    RAISE EXCEPTION 'invalid_key';
  END IF;
  IF (SELECT count(*) FROM public.build_memory WHERE project_id = _project_id) >= 2000
     AND NOT EXISTS (SELECT 1 FROM public.build_memory WHERE project_id = _project_id AND key = _key) THEN
    RAISE EXCEPTION 'memory_full';
  END IF;

  INSERT INTO public.build_memory (project_id, owner_id, key, value, updated_by)
  VALUES (_project_id, _owner_id, _key, COALESCE(_value, '{}'::jsonb), left(COALESCE(_updated_by, ''), 80))
  ON CONFLICT (project_id, key) DO UPDATE SET
    value      = COALESCE(_value, '{}'::jsonb),
    updated_by = left(COALESCE(_updated_by, ''), 80),
    updated_at = now()
  RETURNING updated_at INTO _ts;

  RETURN _ts;
END;
$$;

CREATE OR REPLACE FUNCTION public.build_memory_delete(_project_id uuid, _key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.build_memory WHERE project_id = _project_id AND key = _key;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.build_memory_reset(_user_id uuid, _project_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _n integer;
BEGIN
  DELETE FROM public.build_memory m
   WHERE m.project_id = _project_id
     AND m.owner_id = _user_id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.build_memory_stats(_user_id uuid, _project_id uuid)
RETURNS TABLE(entries integer, last_update timestamp with time zone, last_by text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT count(*)::integer,
         max(m.updated_at),
         (SELECT m2.updated_by FROM public.build_memory m2
           WHERE m2.project_id = _project_id ORDER BY m2.updated_at DESC LIMIT 1)
  FROM public.build_memory m
  WHERE m.project_id = _project_id AND m.owner_id = _user_id;
$$;