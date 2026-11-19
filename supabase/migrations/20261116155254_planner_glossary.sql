-- Club shorthand the free-text planner has learned from coaches' explanations.
-- (Applied to production 16 Nov 2026 from the planner chat; added to the repo 19 Nov 2026.)
create table if not exists public.planner_glossary (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id),
  term text not null,
  meaning text not null,
  drill_id uuid references public.drills_library(id) on delete set null,
  created_by uuid references auth.users(id),
  coach text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists planner_glossary_club_term_key on public.planner_glossary (club_id, lower(term));

alter table public.planner_glossary enable row level security;
create policy rbac_select on public.planner_glossary for select to authenticated
  using (app_private.can_c('plans', false, club_id));
create policy rbac_insert on public.planner_glossary for insert to authenticated
  with check (app_private.can_c('plans', true, club_id));
create policy rbac_update on public.planner_glossary for update to authenticated
  using (app_private.can_c('plans', true, club_id)) with check (app_private.can_c('plans', true, club_id));
create policy rbac_delete on public.planner_glossary for delete to authenticated
  using (app_private.can_c('plans', true, club_id));
grant select, insert, update, delete on public.planner_glossary to authenticated;
