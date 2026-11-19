-- Free-text session planner: layer 1 (original text) and layer 2 (summary) on session_plans
-- (Applied to production 16 Nov 2026 from the planner chat; added to the repo 19 Nov 2026.)
alter table public.session_plans
  add column if not exists source text,
  add column if not exists raw_text text,
  add column if not exists parsed_at timestamptz,
  add column if not exists parser_version text,
  add column if not exists session_focus text,
  add column if not exists main_set text,
  add column if not exists distance_by_stroke jsonb,
  add column if not exists distance_by_zone jsonb,
  add column if not exists distance_by_type jsonb,
  add column if not exists flags jsonb;

comment on column public.session_plans.raw_text is 'Free-text plan exactly as the coach wrote it';
comment on column public.session_plans.source is 'freetext when written in the free-text planner';

-- Layer 3: one row per set
create table if not exists public.session_plan_sets (
  id uuid primary key default gen_random_uuid(),
  session_plan_id uuid not null references public.session_plans(id) on delete cascade,
  club_id uuid references public.clubs(id),
  set_order integer not null,
  section text,
  group_label text,
  group_reps integer not null default 1,
  reps integer,
  distance_m integer,
  total_m integer,
  stroke text,
  kind text check (kind is null or kind in ('swim','kick','pull','drill','scull','mixed','other')),
  effort text,
  interval_text text,
  interval_s integer,
  target_text text,
  rest_s integer,
  equipment text[],
  drill_id uuid references public.drills_library(id),
  drill_name text,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists session_plan_sets_plan_idx on public.session_plan_sets(session_plan_id);
create index if not exists session_plan_sets_drill_idx on public.session_plan_sets(drill_id);
create index if not exists session_plan_sets_club_idx on public.session_plan_sets(club_id);

alter table public.session_plan_sets enable row level security;
create policy rbac_select on public.session_plan_sets for select to authenticated
  using (app_private.can_c('plans', false, club_id));
create policy rbac_insert on public.session_plan_sets for insert to authenticated
  with check (app_private.can_c('plans', true, club_id));
create policy rbac_update on public.session_plan_sets for update to authenticated
  using (app_private.can_c('plans', true, club_id)) with check (app_private.can_c('plans', true, club_id));
create policy rbac_delete on public.session_plan_sets for delete to authenticated
  using (app_private.can_c('plans', true, club_id));
grant select, insert, update, delete on public.session_plan_sets to authenticated;

-- Shared routine: link a squad's registers for the plan's session to the plan and credit distance.
-- Runs as the caller, so normal attendance permissions apply. Only fills registers with no plan yet.
create or replace function public.link_attendance_to_plan(p_plan uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  p record; ms record; n integer := 0; times int;
begin
  select id, squad_id, intended_date, micro_session_id, total_distance_m into p
  from public.session_plans where id = p_plan;
  if p.id is null or p.squad_id is null or p.intended_date is null then return 0; end if;

  if p.micro_session_id is not null then
    select start_time, timetable_session_id into ms from public.micro_sessions where id = p.micro_session_id;
  end if;

  if ms.start_time is null and ms.timetable_session_id is null then
    -- No Season Planner slot: only link when the squad has exactly one register that day.
    select count(distinct (a.session_time, a.pool_size)) into times
    from public.attendance_records a
    where a.session_date = p.intended_date
      and a.swimmer_id in (select swimmer_id from public.squad_memberships where squad_id = p.squad_id and ended_on is null);
    if times <> 1 then return 0; end if;
  end if;

  update public.attendance_records a
  set session_plan_id = p.id,
      distance_m = case
        when p.total_distance_m is null then null
        when a.status = 'in' or (a.status is null and a.present) then p.total_distance_m
        when a.status = 'partial' and a.minutes_attended is not null and a.session_minutes > 0
          then round(p.total_distance_m * least(1.0, a.minutes_attended::numeric / a.session_minutes))::int
        else null end,
      updated_at = now()
  where a.session_date = p.intended_date
    and a.session_plan_id is null
    and a.swimmer_id in (select swimmer_id from public.squad_memberships where squad_id = p.squad_id and ended_on is null)
    and (
      (ms.start_time is null and ms.timetable_session_id is null)
      or (ms.timetable_session_id is not null and a.timetable_session_id = ms.timetable_session_id)
      or (ms.start_time is not null and a.session_time = ms.start_time)
    );
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.link_attendance_to_plan(uuid) to authenticated;
