-- Obsidian Brain: account-scoped, per-record sync with recoverable tombstones.
-- Distinct from generated-build Cloud Memory and from cloud project HTML.
create table if not exists public.obsidian_brain_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null,
  project_key text not null,
  kind text not null check (kind in ('learning', 'note', 'fact', 'decision')),
  title text not null default '',
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  updated_at bigint not null,
  deleted_at bigint,
  created_at timestamptz not null default now(),
  primary key (user_id, record_id),
  constraint brain_record_id_length check (char_length(record_id) between 1 and 100),
  constraint brain_project_key_length check (char_length(project_key) between 1 and 100),
  constraint brain_title_length check (char_length(title) <= 120),
  constraint brain_body_length check (char_length(body) <= 4000),
  constraint brain_payload_length check (octet_length(payload::text) <= 12000),
  constraint brain_updated_at_valid check (updated_at > 0),
  constraint brain_deleted_at_valid check (deleted_at is null or deleted_at > 0)
);

create index if not exists obsidian_brain_user_project_recent_idx
  on public.obsidian_brain_records(user_id, project_key, updated_at desc);

alter table public.obsidian_brain_records enable row level security;
revoke all on public.obsidian_brain_records from anon;
grant select, insert, update on public.obsidian_brain_records to authenticated;

create policy "Read own Brain records"
  on public.obsidian_brain_records for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Create own Brain records"
  on public.obsidian_brain_records for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own Brain records"
  on public.obsidian_brain_records for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Last-update-wins is enforced in SQL, not dependent on the order of two
-- browsers' network requests. Older writes (including stale undeletes)
-- cannot replace a newer record. Client timestamps are advisory; sync
-- resolves equal timestamps by keeping tombstones.
create or replace function public.obsidian_brain_prevent_stale_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.updated_at < old.updated_at
     or (new.updated_at = old.updated_at and old.deleted_at is not null and new.deleted_at is null) then
    return old;
  end if;
  if new.user_id <> old.user_id or new.record_id <> old.record_id then
    raise exception 'Brain record identity cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function public.obsidian_brain_prevent_stale_write() from public;
create trigger obsidian_brain_guard_update
  before update on public.obsidian_brain_records
  for each row execute function public.obsidian_brain_prevent_stale_write();
