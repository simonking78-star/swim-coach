-- A-043: in-app feedback button -> app_feedback. Ops data, not swimmer data --
-- read restricted to superadmin only, same pattern as app_events (A-042).
create table public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id),
  club text,
  page text,
  message text not null
);

create index app_feedback_created_idx on public.app_feedback (created_at desc);

alter table public.app_feedback enable row level security;

create policy rbac_insert on public.app_feedback
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy rbac_select on public.app_feedback
  for select
  to authenticated
  using (is_superadmin());
