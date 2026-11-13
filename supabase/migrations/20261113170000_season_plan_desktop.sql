-- Season Plan page (desktop): calendar markers + data panels
-- Spec: claude/specs/season-plan-desktop.md (agreed 13 Nov 2026). Actions A-131 to A-143.
-- Applied 13 Nov 2026: staging (zefgaemhqgczyqwamfjs; panels function needs migrations staging lacks) then production (nxlgeykipnvswyeshrbl). Role tests passed on both.
--
-- Decisions (Simon, 13 Nov 2026):
--   * Each club confirms its own county standard (CQT and CCT) per season. No default.
--   * Team events are a fourth competition type ('team' is already allowed on macro_competitions).
--   * Competition registrations are recorded in the app.
--   * Volume shading is per squad; deeper blue = more volume.
--
-- What this adds
--   1. Access matrix row "registrations" (coach: own squads, edit).
--   2. season_windows  (test set windows, squad movement windows)
--   3. club_events     (Christmas event, summer barbecue, open water swim...)
--   4. competition_registrations (child data, ordinary category)
--   5. club_competition_standards (which standard is the CQT and which the CCT)
--   6. micros.planned_volume_m, macros.colour
--   7. public.season_plan_panels(season) — aggregates for the three panels (security invoker, so RLS applies)
-- No anon policies or grants on anything here.

begin;
set local lock_timeout = '5s';

-- 1. Access matrix -----------------------------------------------------------------------
create or replace function app_private.level(p_section text, p_role text) returns text
language sql immutable set search_path = '' as $f$
  select coalesce(('{
    "attendance":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"SE"},
    "feedback":  {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"SE","parent":"CR","swimmer":"CR"},
    "plans":     {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"R"},
    "timetables":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"R","helper":"R","parent":"R","swimmer":"R"},
    "season":    {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"R"},
    "roster":    {"superadmin":"E","club_admin":"E","head_coach":"R","coach":"SR","helper":"SR","parent":"CR"},
    "stats":     {"superadmin":"E","club_admin":"R","head_coach":"R","coach":"R","parent":"CR","swimmer":"CR"},
    "stopwatch": {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"SE"},
    "admin":     {"superadmin":"E","club_admin":"E"},
    "appdev":    {"superadmin":"E"},
    "membership":{"superadmin":"E","club_admin":"E","head_coach":"R"},
    "medical":   {"superadmin":"E","club_admin":"E","head_coach":"R","coach":"SR"},
    "registrations":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"SE"}
  }'::jsonb -> p_section ->> p_role), 'N');
$f$;

-- club_id is always copied from the parent record, so it cannot point at another club
create or replace function app_private.season_child_club() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
  if tg_table_name = 'competition_registrations' then
    new.club_id := app_private.season_comp_club_id(new.season_competition_id);
  else
    new.club_id := app_private.season_club_id(new.season_id);
  end if;
  if new.club_id is null then raise exception 'Unknown season or competition'; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $f$;

-- 2. Windows: test set and squad movement ---------------------------------------------------
create table public.season_windows (
  id                    uuid primary key default gen_random_uuid(),
  season_id             uuid not null references public.seasons(id),
  club_id               uuid not null references public.clubs(id),
  kind                  text not null check (kind in ('test_set','squad_move')),
  squad_id              uuid references public.squads(id),          -- null = all squads
  test_set_template_id  uuid references public.test_set_templates(id),
  title                 text not null,
  starts_on             date not null,
  ends_on               date not null,
  note                  text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  check (ends_on >= starts_on)
);
create index season_windows_season on public.season_windows (season_id, starts_on);

-- 3. Club events ----------------------------------------------------------------------------
create table public.club_events (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.seasons(id),
  club_id     uuid not null references public.clubs(id),
  title       text not null,
  kind        text not null default 'social' check (kind in ('social','open_water','fundraiser','other')),
  starts_on   date not null,
  ends_on     date not null,
  squad_ids   uuid[],                                                -- null = whole club
  location    text,
  note        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  check (ends_on >= starts_on)
);
create index club_events_season on public.club_events (season_id, starts_on);

-- 4. Competition registrations (recorded in the app) --------------------------------------
create table public.competition_registrations (
  id                     uuid primary key default gen_random_uuid(),
  season_competition_id  uuid not null references public.season_competitions(id),
  swimmer_id             uuid not null references public.swimmers(id) on delete cascade,
  club_id                uuid not null references public.clubs(id),
  status                 text not null default 'registered' check (status in ('registered','declined','not_selected')),
  recorded_by            uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  updated_by             uuid,
  unique (season_competition_id, swimmer_id)
);
create index competition_registrations_comp on public.competition_registrations (season_competition_id);

-- 5. Club competition standard (CQT / CCT), confirmed per club and season -----------------
create table public.club_competition_standards (
  id             uuid primary key default gen_random_uuid(),
  season_id      uuid not null references public.seasons(id),
  club_id        uuid not null references public.clubs(id),
  county         text not null,
  cqt_gala_id    uuid not null references public.galas(id),
  cqt_time_type  text not null,
  cct_gala_id    uuid references public.galas(id),               -- null: no separate CCT, CCT = CQT
  cct_time_type  text,
  age_at         date,                                             -- null: 31 Dec of the season's finish year
  confirmed_by   uuid default auth.uid(),
  confirmed_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  unique (season_id)
);

create trigger season_windows_club before insert or update on public.season_windows
  for each row execute function app_private.season_child_club();
create trigger club_events_club before insert or update on public.club_events
  for each row execute function app_private.season_child_club();
create trigger competition_registrations_club before insert or update on public.competition_registrations
  for each row execute function app_private.season_child_club();
create trigger club_competition_standards_club before insert or update on public.club_competition_standards
  for each row execute function app_private.season_child_club();

-- 6. Planned volume and macro colour ------------------------------------------------------
alter table public.micros add column if not exists planned_volume_m integer check (planned_volume_m is null or planned_volume_m >= 0);
alter table public.macros add column if not exists colour text check (colour is null or colour ~ '^#[0-9a-fA-F]{6}$');

-- RLS ---------------------------------------------------------------------------------------
alter table public.season_windows             enable row level security;
alter table public.club_events                enable row level security;
alter table public.competition_registrations  enable row level security;
alter table public.club_competition_standards enable row level security;

do $p$
declare t text;
begin
  foreach t in array array['season_windows','club_events'] loop
    execute format('create policy rbac_select on public.%I for select to authenticated using (app_private.can_c(''season'', false, club_id))', t);
    execute format('create policy rbac_insert on public.%I for insert to authenticated with check (app_private.can_c(''season'', true, app_private.season_club_id(season_id)))', t);
    execute format('create policy rbac_update on public.%I for update to authenticated using (app_private.can_c(''season'', true, club_id)) with check (app_private.can_c(''season'', true, app_private.season_club_id(season_id)))', t);
    execute format('create policy rbac_delete on public.%I for delete to authenticated using (app_private.can_c(''season'', true, club_id))', t);
  end loop;
end $p$;

-- standards: anyone with season access reads; only admin-level roles (superadmin, club admin) set them
create policy rbac_select on public.club_competition_standards for select to authenticated
  using (app_private.can_c('season', false, club_id));
create policy rbac_insert on public.club_competition_standards for insert to authenticated
  with check (app_private.can_c('admin', true, app_private.season_club_id(season_id)));
create policy rbac_update on public.club_competition_standards for update to authenticated
  using (app_private.can_c('admin', true, club_id)) with check (app_private.can_c('admin', true, app_private.season_club_id(season_id)));
create policy rbac_delete on public.club_competition_standards for delete to authenticated
  using (app_private.can_c('admin', true, club_id));

-- registrations: club editors, or a coach for swimmers in their own squads
create policy rbac_select on public.competition_registrations for select to authenticated
  using (app_private.can_c('registrations', false, club_id, (select s.squad_id from public.swimmers s where s.id = swimmer_id)));
create policy rbac_insert on public.competition_registrations for insert to authenticated
  with check (app_private.can_c('registrations', true, app_private.season_comp_club_id(season_competition_id),
              (select s.squad_id from public.swimmers s where s.id = swimmer_id))
              and app_private.swimmer_club_id(swimmer_id) = app_private.season_comp_club_id(season_competition_id));
create policy rbac_update on public.competition_registrations for update to authenticated
  using (app_private.can_c('registrations', true, club_id, (select s.squad_id from public.swimmers s where s.id = swimmer_id)))
  with check (app_private.can_c('registrations', true, app_private.season_comp_club_id(season_competition_id),
              (select s.squad_id from public.swimmers s where s.id = swimmer_id)));
create policy rbac_delete on public.competition_registrations for delete to authenticated
  using (app_private.can_c('registrations', true, club_id, (select s.squad_id from public.swimmers s where s.id = swimmer_id)));

revoke all on public.season_windows, public.club_events, public.competition_registrations, public.club_competition_standards from anon;
grant select, insert, update, delete on public.season_windows, public.club_events, public.competition_registrations,
  public.club_competition_standards to authenticated;

-- 7. Panels -------------------------------------------------------------------------------
-- Does a standard's age_group ("10", "16+", "10/11", "10-11") include this age?
create or replace function app_private.age_in_group(p_age int, p_group text) returns boolean
language sql immutable set search_path = '' as $f$
  select case
    when p_age is null or p_group is null then false
    when p_group ~ '^\d+$'            then p_age = p_group::int
    when p_group ~ '^\d+\+$'          then p_age >= rtrim(p_group, '+')::int
    when p_group ~ '^\d+\s*[/-]\s*\d+$' then p_age between (regexp_match(p_group, '^(\d+)'))[1]::int and (regexp_match(p_group, '(\d+)$'))[1]::int
    else false end;
$f$;

-- All three panels in one call. Security invoker: every table read here keeps its own RLS,
-- so a coach sees figures only for the swimmers and sessions their role can read.
-- Aggregates only — no swimmer names leave this function.
create or replace function public.season_plan_panels(p_season uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $f$
declare
  s record; p record; std record;
  v_today date; v_elapsed int; v_prev_to date; v_age_at date; v_next record;
  out jsonb := '{}'::jsonb;
begin
  select id, club_id, title, start_date, finish_date into s from public.seasons where id = p_season;
  if s.id is null then return null; end if;
  v_today := least(current_date, s.finish_date);
  v_elapsed := greatest(0, v_today - s.start_date);
  select id, title, start_date, finish_date into p from public.seasons
    where club_id = s.club_id and is_active and start_date < s.start_date order by start_date desc limit 1;
  v_prev_to := case when p.id is null then null else least(p.finish_date, p.start_date + v_elapsed) end;

  out := jsonb_build_object(
    'season', jsonb_build_object('id', s.id, 'title', s.title, 'start', s.start_date, 'finish', s.finish_date, 'today', v_today),
    'prev', case when p.id is null then null else jsonb_build_object('id', p.id, 'title', p.title, 'start', p.start_date, 'to', v_prev_to) end);

  -- Attendance, hours and metres, this season and like-for-like last season --------------
  with att as (
    select 'this'::text as period, s.start_date as base,
           ar.swimmer_id, ar.session_date, ar.status, ar.minutes_attended, ar.session_minutes, ar.timetable_session_id, ar.session_plan_id,
           (to_jsonb(ar) ->> 'distance_m')::numeric as distance_m  -- read by name: older databases may not have the column yet
      from public.attendance_records ar where ar.club_id = s.club_id and ar.session_date between s.start_date and v_today
    union all
    select 'prev', p.start_date,
           ar.swimmer_id, ar.session_date, ar.status, ar.minutes_attended, ar.session_minutes, ar.timetable_session_id, ar.session_plan_id,
           (to_jsonb(ar) ->> 'distance_m')::numeric as distance_m  -- read by name: older databases may not have the column yet
      from public.attendance_records ar where p.id is not null and ar.club_id = s.club_id and ar.session_date between p.start_date and v_prev_to
  ), x as (
    select a.period, a.swimmer_id,
           coalesce(t.squad_id, sw.squad_id) as squad_id,
           ((a.session_date - a.base) / 7) + 1 as week,
           public.attendance_weight(a.status, a.minutes_attended, a.session_minutes) as w,
           public.attendance_minutes(a.status, a.minutes_attended, a.session_minutes) as mins,
           coalesce(a.distance_m, sp.total_distance_m * public.attendance_weight(a.status, a.minutes_attended, a.session_minutes)) as metres
    from att a
    left join public.timetable_sessions ts on ts.id = a.timetable_session_id
    left join public.timetables t on t.id = ts.timetable_id
    left join public.swimmers sw on sw.id = a.swimmer_id
    left join public.session_plans sp on sp.id = a.session_plan_id
  )
  select out
    || jsonb_build_object('attendance', coalesce((select jsonb_agg(r) from (
         select period, squad_id, round(sum(w), 1) as attended, count(w) as counted, round(sum(mins) / 60.0, 1) as hours,
                round(coalesce(sum(metres), 0)) as metres, count(distinct (swimmer_id, week)) filter (where w > 0) as swimmer_weeks
         from x where squad_id is not null group by period, squad_id) r), '[]'::jsonb))
    || jsonb_build_object('weekly', coalesce((select jsonb_agg(r) from (
         select period, squad_id, week, round(coalesce(sum(metres), 0)) as metres, round(coalesce(sum(mins), 0) / 60.0, 1) as hours,
                count(distinct swimmer_id) filter (where w > 0) as swimmers
         from x where squad_id is not null group by period, squad_id, week) r), '[]'::jsonb))
  into out;

  -- Sessions available / completed / plans written ----------------------------------------
  with days as (select d::date as d from generate_series(s.start_date, v_today, interval '1 day') d),
  slots as (
    select t.squad_id, ts.id as ts_id, dd.d
    from public.timetables t
    join public.timetable_sessions ts on ts.timetable_id = t.id and ts.is_active
    join days dd on extract(isodow from dd.d) = ts.day_of_week and dd.d between t.season_start and t.season_end
    where t.is_active and (t.season_id = s.id or (t.season_id is null and t.season_start <= s.finish_date and t.season_end >= s.start_date))
      and not exists (select 1 from public.timetable_session_overrides o where o.timetable_session_id = ts.id and o.session_date = dd.d and o.cancelled)
  )
  select out || jsonb_build_object('sessions', coalesce((select jsonb_agg(r) from (
      select sq.id as squad_id,
             (select count(*) from slots where slots.squad_id = sq.id) as available,
             (select count(*) from slots where slots.squad_id = sq.id and exists (
                 select 1 from public.attendance_records ar where ar.timetable_session_id = slots.ts_id and ar.session_date = slots.d)) as completed,
             (select count(*) from public.session_plans pl where pl.squad_id = sq.id and pl.intended_date between s.start_date and v_today) as plans,
             (select count(*) from public.session_plans pl where pl.squad_id = sq.id and pl.intended_date between s.start_date and s.finish_date) as plans_season
      from public.squads sq where sq.club_id = s.club_id) r), '[]'::jsonb))
  into out;

  -- Test sets: squad comparison by template and level (median hidden when n < 3) ----------
  select out || jsonb_build_object('tests', coalesce((select jsonb_agg(r) from (
      select tr.template_name, tr.level, coalesce(tse.squad_id, sw.squad_id) as squad_id, count(*) as n,
             case when count(*) >= 3 then percentile_cont(0.5) within group (order by tr.score) end as median,
             case when count(*) >= 3 then min(tr.score) end as min, case when count(*) >= 3 then max(tr.score) end as max
      from public.test_results tr
      left join public.test_sessions tse on tse.id = tr.session_id
      left join public.swimmers sw on sw.id = tr.swimmer_id
      where tr.club_id = s.club_id and tr.session_date between s.start_date and v_today and tr.score is not null
      group by 1, 2, 3) r), '[]'::jsonb))
  into out;

  -- Competition bands against the club's confirmed standard ---------------------------------
  select * into std from public.club_competition_standards where season_id = s.id;
  if std.id is null then
    out := out || jsonb_build_object('standard', null);
  else
    v_age_at := coalesce(std.age_at, make_date(extract(year from s.finish_date)::int, 12, 31));
    out := out || jsonb_build_object('standard', jsonb_build_object('county', std.county, 'cqt_gala_id', std.cqt_gala_id, 'cqt_time_type', std.cqt_time_type,
                                                                    'cct_gala_id', std.cct_gala_id, 'cct_time_type', std.cct_time_type, 'age_at', v_age_at));
    with sw as (   -- birth year: recorded, else from the date of birth, else from a result's age at swim
      select z.id, z.squad_id, z.gender,
             coalesce(z.year_of_birth, extract(year from z.date_of_birth)::int,
                      (select max(extract(year from r.meet_date)::int - r.age_at_swim) from public.swim_results r
                        where r.swimmer_id = z.id and r.age_at_swim is not null)) as yob
      from public.swimmers z where z.club_id = s.club_id and z.active
    ), swims as (   -- best per swimmer, event, course: actual times plus converted times, last 12 months
      select r.swimmer_id, r.event, r.course, min(r.swim_time) as t from public.swim_results r
        join sw on sw.id = r.swimmer_id where r.meet_date between v_today - 365 and v_today and r.swim_time is not null group by 1, 2, 3
      union all
      select r.swimmer_id, r.event, case r.course when 'SC' then 'LC' else 'SC' end, min(r.converted_time) from public.swim_results r
        join sw on sw.id = r.swimmer_id where r.meet_date between v_today - 365 and v_today and r.converted_time is not null group by 1, 2, 3
    ), scored as (
      select sw.squad_id, b.swimmer_id, b.event,
             min(case
               when b.t <= q.swim_time then 1
               when b.t <= coalesce(c.swim_time, q.swim_time) then 2
               when extract(epoch from b.t) <= 1.05 * extract(epoch from coalesce(c.swim_time, q.swim_time)) then 3
               when extract(epoch from b.t) <= 1.10 * extract(epoch from coalesce(c.swim_time, q.swim_time)) then 4
               else 5 end) as band
      from swims b
      join sw on sw.id = b.swimmer_id
      join public.qualifying_times q on q.gala_id = std.cqt_gala_id and q.time_type = std.cqt_time_type and q.event = b.event
           and q.course = b.course and q.gender = sw.gender and q.swim_time is not null
           and app_private.age_in_group(extract(year from v_age_at)::int - sw.yob, q.age_group)
      left join public.qualifying_times c on std.cct_gala_id is not null and c.gala_id = std.cct_gala_id and c.time_type = std.cct_time_type
           and c.event = b.event and c.course = b.course and c.gender = sw.gender and c.swim_time is not null
           and app_private.age_in_group(extract(year from v_age_at)::int - sw.yob, c.age_group)
      group by 1, 2, 3
    )
    select out
      || jsonb_build_object('band_events', coalesce((select jsonb_agg(r) from (select squad_id, band, count(*) as n from scored group by 1, 2) r), '[]'::jsonb))
      || jsonb_build_object('band_swimmers', coalesce((select jsonb_agg(r) from (
           select squad_id, band, count(*) as n from (select squad_id, swimmer_id, min(band) as band from scored group by 1, 2) y group by 1, 2) r), '[]'::jsonb))
      -- swimmers with recent swims who can't be banded: no gender or birth year on record
      || jsonb_build_object('band_unscored', coalesce((select jsonb_agg(r) from (
           select sw.squad_id, count(*) as n from sw where (sw.gender is null or sw.yob is null)
             and exists (select 1 from swims b where b.swimmer_id = sw.id) group by 1) r), '[]'::jsonb))
    into out;
  end if;

  -- Non-competitors: active swimmers with no swim this season ------------------------------
  select out || jsonb_build_object('non_competitors', coalesce((select jsonb_agg(r) from (
      select sw.squad_id, count(*) as n, (select count(*) from public.swimmers z where z.club_id = s.club_id and z.active and z.squad_id is not distinct from sw.squad_id) as total
      from public.swimmers sw
      where sw.club_id = s.club_id and sw.active
        and not exists (select 1 from public.swim_results r where r.swimmer_id = sw.id and r.meet_date between s.start_date and v_today)
      group by sw.squad_id) r), '[]'::jsonb))
  into out;

  -- Next competition: registered / not registered (eligible squads only) -----------------
  select sc.id, sc.name, sc.date_from into v_next from public.season_competitions sc
    where sc.season_id = s.id and sc.is_active and sc.date_from >= current_date order by sc.date_from limit 1;
  if v_next.id is null then
    out := out || jsonb_build_object('next_comp', null);
  else
    with elig as (
      select distinct ms.squad_id from public.macro_competitions mc
      join public.macro_squads ms on ms.macro_id = mc.macro_id and ms.is_active
      where mc.season_competition_id = v_next.id and mc.is_active
    ), pool as (
      select sw.id, sw.squad_id from public.swimmers sw
      where sw.club_id = s.club_id and sw.active
        and (not exists (select 1 from elig) or sw.squad_id in (select squad_id from elig))
    )
    select out || jsonb_build_object('next_comp', jsonb_build_object('id', v_next.id, 'name', v_next.name, 'date', v_next.date_from,
      'squads', coalesce((select jsonb_agg(r) from (
         select pool.squad_id, count(*) as eligible,
                count(*) filter (where exists (select 1 from public.competition_registrations cr
                  where cr.season_competition_id = v_next.id and cr.swimmer_id = pool.id and cr.status = 'registered')) as registered
         from pool group by pool.squad_id) r), '[]'::jsonb)))
    into out;
  end if;

  return out;
end $f$;

revoke all on function public.season_plan_panels(uuid) from public, anon;
grant execute on function public.season_plan_panels(uuid) to authenticated;

commit;
