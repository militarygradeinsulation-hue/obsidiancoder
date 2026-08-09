-- Queue table backing the "Push to Lovable" button in the Obsidian chat UI.
-- A build gets inserted here as `pending`; an external worker (a scheduled
-- Claude Code Remote Routine, authenticated to the Lovable workspace) polls
-- for pending rows, creates/updates the corresponding Lovable project, and
-- writes the result back.
create table if not exists public.lovable_pushes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null default 'Untitled build',
  prompt_history jsonb not null default '[]'::jsonb,
  html text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  project_url text,
  editor_url text,
  error text
);

create index if not exists lovable_pushes_status_idx on public.lovable_pushes (status);
create index if not exists lovable_pushes_created_at_idx on public.lovable_pushes (created_at desc);

alter table public.lovable_pushes enable row level security;

-- This app has no login (see index.tsx), so the worker authenticates with the
-- same anon key the browser uses rather than a service-role secret. The data
-- here is just generated page content the user is explicitly asking to
-- publish, so anon read/write (no delete) is an acceptable trade-off.
create policy "anon can queue a push"
  on public.lovable_pushes for insert
  to anon
  with check (true);

create policy "anon can read pushes"
  on public.lovable_pushes for select
  to anon
  using (true);

create policy "anon/worker can update push status"
  on public.lovable_pushes for update
  to anon
  using (true)
  with check (true);
