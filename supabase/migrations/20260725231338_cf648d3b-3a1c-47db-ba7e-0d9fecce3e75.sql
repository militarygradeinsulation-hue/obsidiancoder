alter table public.subscriptions
  add column if not exists plan_tier text,
  add column if not exists custom_amount_cents integer;

create index if not exists idx_subscriptions_plan_tier
  on public.subscriptions(plan_tier) where plan_tier is not null;