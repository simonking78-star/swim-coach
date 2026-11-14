-- Season plans per squad group (Simon, 14 Nov 2026)
-- Applied 14 Nov 2026 to staging then production (table, triggers, policies; panels change applied in place). Role and overlap tests passed on both.
--   * Each season plan links to one or more squads (season_squads).
--   * A club can run several season plans at once, but a squad can be in only one
--     active plan on any date: plans may overlap only if they share no squads.
--   * Existing seasons are left with no squads; coaches link them on the Planning page.
--   * Like-for-like "last season" on the Season Plan page now means the latest earlier
--     plan that shares a squad (else the club's latest earlier plan).

begin;
set local lock_timeout = '5s';

create table public.season_squads (
  season_id   uuid not null references public.seasons(id),
  squad_id    uuid not null references public.squads(id),
  club_id     uuid not null references public.clubs(id),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  primary key (season_id, squad_id)
);
create index season_squads_squad on public.season_squads (squad_id);

-- club_id copied from the season; squad must be the season's club; no squad in two overlapping plans
create or replace function app_private.season_squads_check() returns trigger
language plpgsql security definer set search_path = '' as $f$
declare s record; clash text;
begin
  select id, club_id, start_date, finish_date into s from public.seasons where id = new.season_id;
  if s.id is null then raise exception 'Unknown season'; end if;
  new.club_id := s.club_id;
  if (select q.club_id from public.squads q where q.id = new.squad_id) is distinct from s.club_id then
    raise exception 'That squad belongs to another club';
  end if;
  select o.title into clash from public.season_squads x join public.seasons o on o.id = x.season_id
   where x.squad_id = new.squad_id and o.id <> s.id and o.is_active
     and o.start_date <= s.finish_date and o.finish_date >= s.start_date limit 1;
  if clash is not null then
    raise exception 'This squad is already in the season plan "%" for overlapping dates', clash using errcode = 'P0001';
  end if;
  return new;
end $f$;
create trigger season_squads_check before insert or update on public.season_squads
  for each row execute function app_private.season_squads_check();

-- Changing a season's dates (or re-activating it) must not make a squad sit in two plans at once
create or replace function app_private.seasons_squad_overlap() returns trigger
language plpgsql security definer set search_path = '' as $f$
declare clash text;
begin
  if not new.is_active then return new; end if;
  select o.title into clash from public.season_squads mine
    join public.season_squads x on x.squad_id = mine.squad_id and x.season_id <> mine.season_id
    join public.seasons o on o.id = x.season_id
   where mine.season_id = new.id and o.is_active and o.start_date <= new.finish_date and o.finish_date >= new.start_date limit 1;
  if clash is not null then
    raise exception 'These dates would put a squad in two season plans at once (it is also in "%")', clash using errcode = 'P0001';
  end if;
  return new;
end $f$;
create trigger seasons_squad_overlap before update of start_date, finish_date, is_active on public.seasons
  for each row execute function app_private.seasons_squad_overlap();

alter table public.season_squads enable row level security;
create policy rbac_select on public.season_squads for select to authenticated
  using (app_private.can_c('season', false, club_id));
create policy rbac_insert on public.season_squads for insert to authenticated
  with check (app_private.can_c('season', true, app_private.season_club_id(season_id)));
create policy rbac_delete on public.season_squads for delete to authenticated
  using (app_private.can_c('season', true, club_id));
revoke all on public.season_squads from anon;
grant select, insert, delete on public.season_squads to authenticated;

-- Panels: like-for-like season now follows the squads
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
  -- Last season: the latest earlier plan sharing a squad with this one, else the club's latest earlier plan
  select id, title, start_date, finish_date into p from public.seasons o
    where o.club_id = s.club_id and o.is_active and o.start_date < s.start_date
    order by exists (select 1 from public.season_squads a join public.season_squads b on b.squad_id = a.squad_id
                      where a.season_id = o.id and b.season_id = s.id) desc, o.start_date desc
    limit 1;
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

commit;
