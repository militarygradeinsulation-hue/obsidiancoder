-- Cloud project storage: per-user saved projects across all surfaces.
-- Adds user_id + name + project_json to the existing builds table (non-destructive).
-- A "cloud project" is a builds row with user_id set and is_cloud = true.
-- Anonymous builds (user_id IS NULL) are unaffected.

ALTER TABLE public.builds
  ADD COLUMN IF NOT EXISTS user_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_cloud     boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS project_json jsonb,
  ADD COLUMN IF NOT EXISTS updated_at   timestamptz NOT NULL DEFAULT now();

-- Index for per-user project listing, newest first.
CREATE INDEX IF NOT EXISTS builds_user_cloud_idx
  ON public.builds (user_id, is_cloud, updated_at DESC)
  WHERE user_id IS NOT NULL AND is_cloud = true;

-- RPC: upsert_cloud_project
-- Inserts a new cloud project row or updates an existing one (matched by id + user_id).
-- Returns the row id so callers can track which build they're working on.
-- SECURITY DEFINER: service_role only — all auth is done by the server before calling.
CREATE OR REPLACE FUNCTION public.upsert_cloud_project(
  _user_id      uuid,
  _id           uuid,         -- client-supplied stable id (gen_random_uuid() on first save)
  _name         text,
  _html         text,
  _prompt       text,
  _project_json jsonb,
  _model        text,
  _environment  text
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.builds (
    id, user_id, is_cloud, project_name, html, prompt,
    project_json, model, byte_size, title, updated_at, surface
  ) VALUES (
    _id, _user_id, true, _name, _html, _prompt,
    _project_json, _model, octet_length(_html), _name, now(),
    coalesce(_environment, 'live')
  )
  ON CONFLICT (id) DO UPDATE SET
    project_name  = EXCLUDED.project_name,
    html          = EXCLUDED.html,
    prompt        = EXCLUDED.prompt,
    project_json  = EXCLUDED.project_json,
    model         = EXCLUDED.model,
    byte_size     = EXCLUDED.byte_size,
    title         = EXCLUDED.title,
    updated_at    = now()
  WHERE builds.user_id = _user_id;  -- safety: never let a user overwrite another's row
  RETURN _id;
END;
$$;

-- RPC: list_cloud_projects — newest 50 for a user.
CREATE OR REPLACE FUNCTION public.list_cloud_projects(
  _user_id     uuid,
  _environment text
) RETURNS TABLE (
  id            uuid,
  project_name  text,
  prompt        text,
  model         text,
  byte_size     integer,
  updated_at    timestamptz,
  created_at    timestamptz
)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, project_name, prompt, model, byte_size, updated_at, created_at
  FROM public.builds
  WHERE user_id = _user_id
    AND is_cloud = true
  ORDER BY updated_at DESC
  LIMIT 50;
$$;

-- RPC: get_cloud_project — returns full row for one project (ownership checked).
CREATE OR REPLACE FUNCTION public.get_cloud_project(
  _user_id uuid,
  _id      uuid
) RETURNS TABLE (
  id            uuid,
  project_name  text,
  html          text,
  prompt        text,
  project_json  jsonb,
  model         text,
  byte_size     integer,
  updated_at    timestamptz,
  created_at    timestamptz
)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, project_name, html, prompt, project_json, model, byte_size, updated_at, created_at
  FROM public.builds
  WHERE id = _id AND user_id = _user_id AND is_cloud = true
  LIMIT 1;
$$;

-- RPC: delete_cloud_project — hard delete; ownership enforced.
CREATE OR REPLACE FUNCTION public.delete_cloud_project(
  _user_id uuid,
  _id      uuid
) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.builds WHERE id = _id AND user_id = _user_id AND is_cloud = true;
  RETURN FOUND;
END;
$$;

-- Grants: service_role only — client never calls these directly.
GRANT EXECUTE ON FUNCTION public.upsert_cloud_project   TO service_role;
GRANT EXECUTE ON FUNCTION public.list_cloud_projects    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_cloud_project      TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_cloud_project   TO service_role;
