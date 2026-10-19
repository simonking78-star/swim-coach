-- A-042: client error logging / page-view / core-task telemetry.
-- Ops/product data, not swimmer data -- read restricted to superadmin only.
create table public.app_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id),
  club text,
  event_type text not null check (event_type in ('error','page_view','core_task')),
  event_name text not null,
  detail jsonb
);

create index app_events_type_created_idx on public.app_events (event_type, created_at desc);
create index app_events_created_idx on public.app_events (created_at desc);

alter table public.app_events enable row level security;

create policy rbac_insert on public.app_events
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy rbac_select on public.app_events
  for select
  to authenticated
  using (is_superadmin());
