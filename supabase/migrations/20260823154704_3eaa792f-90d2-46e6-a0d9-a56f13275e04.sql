
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Fire-and-forget dispatch of a build job to the durable server worker.
-- Runs from Postgres, so it is completely independent of the browser that
-- created the job: closing the tab cannot stop it.
CREATE OR REPLACE FUNCTION public.build_job_kick(_id uuid, _base_url text, _apikey text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE _req bigint;
BEGIN
  SELECT net.http_post(
    url := _base_url || '/api/public/jobs/run',
    headers := jsonb_build_object('Content-Type','application/json','apikey', _apikey),
    body := jsonb_build_object('jobId', _id::text),
    timeout_milliseconds := 1000
  ) INTO _req;
  RETURN _req;
END; $$;

REVOKE EXECUTE ON FUNCTION public.build_job_kick(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_job_kick(uuid, text, text) TO service_role;

SELECT cron.schedule(
  'obsidian-build-job-sweep',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://obsidianvibe.live/api/public/jobs/sweep',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjZHVteHhnam5ybm9scWtpc2hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDA3ODQsImV4cCI6MjA5OTc3Njc4NH0.C09jFD_Xw1XtZ4ImOFkR11FhWlpDMKuagkCFIyH--7o"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 4000
  );
  $$
);
