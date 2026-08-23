
CREATE TABLE public.build_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id text,
  library_code text,
  session_id text,
  project_id uuid,
  surface text NOT NULL DEFAULT 'pocket',
  title text,
  prompt text NOT NULL,
  mode text NOT NULL DEFAULT 'create',
  profile text NOT NULL DEFAULT 'fast',
  style_family text,
  model_request text,
  dna jsonb,
  concept jsonb,
  memory jsonb,
  learning_brief text,
  previous_html text,
  request_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  stage text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  partial_html text,
  result_html text,
  error text,
  served_model text,
  memory_hit boolean NOT NULL DEFAULT false,
  provider_attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
  timings jsonb NOT NULL DEFAULT '{}'::jsonb,
  cancel_requested boolean NOT NULL DEFAULT false,
  retry_count integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  environment text NOT NULL DEFAULT 'live',
  entitlement_kind text,
  request_id text,
  reservation_id uuid,
  reservation_credits integer,
  reservation_cap integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  first_byte_at timestamptz,
  first_preview_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX build_jobs_idempotency_key_uidx ON public.build_jobs (idempotency_key);
CREATE INDEX build_jobs_user_idx ON public.build_jobs (user_id, created_at DESC);
CREATE INDEX build_jobs_scope_idx ON public.build_jobs (library_code, created_at DESC);
CREATE INDEX build_jobs_pending_idx ON public.build_jobs (status, lease_until);

GRANT ALL ON public.build_jobs TO service_role;

ALTER TABLE public.build_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY build_jobs_no_client_access ON public.build_jobs
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.build_job_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER build_jobs_set_updated_at BEFORE UPDATE ON public.build_jobs
FOR EACH ROW EXECUTE FUNCTION public.build_job_touch_updated_at();

-- Atomically take ownership of a job. Returns true only for the winner:
-- either a queued job, or a running job whose lease expired (crash recovery).
CREATE OR REPLACE FUNCTION public.build_job_claim(_id uuid, _lease_seconds integer DEFAULT 300)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.build_jobs
     SET status = 'running',
         stage = CASE WHEN stage = 'queued' THEN 'memory_match' ELSE stage END,
         started_at = COALESCE(started_at, now()),
         lease_until = now() + make_interval(secs => GREATEST(30, _lease_seconds)),
         retry_count = CASE WHEN status = 'running' THEN retry_count + 1 ELSE retry_count END
   WHERE id = _id
     AND cancel_requested = false
     AND (status = 'queued' OR (status = 'running' AND (lease_until IS NULL OR lease_until < now())));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END; $$;

-- Jobs that need (re)dispatching: queued, or running past their lease.
CREATE OR REPLACE FUNCTION public.build_jobs_stale(_limit integer DEFAULT 5)
RETURNS TABLE(id uuid, retry_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.retry_count
  FROM public.build_jobs b
  WHERE b.cancel_requested = false
    AND b.retry_count < 2
    AND (
      (b.status = 'queued' AND b.created_at < now() - interval '10 seconds')
      OR (b.status = 'running' AND b.lease_until IS NOT NULL AND b.lease_until < now())
    )
  ORDER BY b.created_at
  LIMIT GREATEST(1, _limit);
$$;

REVOKE EXECUTE ON FUNCTION public.build_job_claim(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.build_jobs_stale(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_job_claim(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_jobs_stale(integer) TO service_role;
