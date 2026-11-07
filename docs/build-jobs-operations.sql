-- Run in the Obsidian application's existing Supabase database.
-- Uses the already-existing build_jobs table and build_job_claim/stale functions.
-- pg_net must keep the runner connection alive longer than the 180s AI ceiling.
create or replace function public.build_job_kick(_id uuid, _base_url text, _apikey text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare request_id bigint;
begin
  if _base_url !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$' then
    raise exception 'HTTPS application origin required';
  end if;
  select net.http_post(
    url := _base_url || '/api/public/jobs/run',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', _apikey),
    body := jsonb_build_object('jobId', _id),
    timeout_milliseconds := 240000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function public.build_job_kick(uuid,text,text) from public, anon, authenticated;
grant execute on function public.build_job_kick(uuid,text,text) to service_role;
-- Retain the existing minute sweep, using the same 240000ms timeout.
-- Inspect cron.job and net._http_response to confirm delivery and completion.
