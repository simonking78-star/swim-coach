-- Metrics & Measures ↔ Season Planner link (spec: claude/specs/metrics-season-link.md, A-145–A-153)
--
-- 1. One window table: season_windows (kind test_set) now carries the test
--    kind, the protocols in the window and the squads it covers. mm_sessions
--    point at it. mm_windows (empty) and season_windows.test_set_template_id
--    are left in place until the new app is deployed, then dropped by
--    20261114210000_metrics_season_link_cleanup.sql.
-- 2. mm_cycle_week() finds a squad's week through season_squads as well as
--    macro_squads, so squads on a plan but not on a macro get a cycle week.
-- 3. A test session is linked to the test window that covers it automatically.
-- 4. season_plan_panels() gains mm_tests (results by test set title, protocol,
--    level and squad, all sizes shown) and mm_coverage (per window and squad:
--    tested / not yet tested / no baseline). The legacy 'tests' key is kept
--    until the cleanup migration.
-- 5. Data: squads with a test record but on no plan are linked to the plan
--    running on the test date; Test Set 1–3 are linked to THR-01 as
--    baseline / mid / end; existing sessions get their cycle week and window.
-- No new personal data. RLS on season_windows unchanged (season R/E).

-- ---------------------------------------------------------------------
-- 1. season_windows: test window fields
-- ---------------------------------------------------------------------
alter table public.season_windows
  add column if not exists test_kind    text check (test_kind in ('baseline','mid','end','novelty','t_day','pilot','other')),
  add column if not exists protocol_ids uuid[] not null default '{}',
  add column if not exists squad_ids    uuid[];

comment on column public.season_windows.test_kind    is 'Test windows only: baseline / mid / end / novelty / t_day / pilot / other';
comment on column public.season_windows.protocol_ids is 'Test windows only: mm_protocols in this window (empty = any test)';
comment on column public.season_windows.squad_ids    is 'Test windows only: squads covered (null = every squad on the plan)';

update public.season_windows set squad_ids = array[squad_id]
 where kind = 'test_set' and squad_id is not null and squad_ids is null;

create or replace function app_private.season_window_test_check() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare bad text;
begin
  if new.kind <> 'test_set' then
    new.test_kind := null; new.protocol_ids := '{}'; new.squad_ids := null;
    return new;
  end if;
  if new.squad_ids is not null and cardinality(new.squad_ids) = 0 then new.squad_ids := null; end if;
  select p into bad from unnest(new.protocol_ids) p
   where not exists (select 1 from public.mm_protocols m where m.id = p and m.club_id = new.club_id) limit 1;
  if bad is not null then raise exception 'A test in this window belongs to another club.'; end if;
  select q.name into bad from unnest(coalesce(new.squad_ids, '{}')) x join public.squads q on q.id = x
   where not exists (select 1 from public.season_squads ss where ss.season_id = new.season_id and ss.squad_id = x) limit 1;
  if bad is not null then raise exception '% is not on this season plan. Link it to the plan first.', bad; end if;
  if exists (select 1 from unnest(coalesce(new.squad_ids, '{}')) x where not exists (select 1 from public.squads q where q.id = x)) then
    raise exception 'Unknown squad in this window.';
  end if;
  return new;
end $$;
revoke all on function app_private.season_window_test_check() from public, anon, authenticated;
drop trigger if exists season_windows_test on public.season_windows;
-- fires after season_windows_club (alphabetical), so club_id is already set
create trigger season_windows_test before insert or update on public.season_windows
  for each row execute function app_private.season_window_test_check();

-- ---------------------------------------------------------------------
-- 2. Cycle week via season_squads
-- ---------------------------------------------------------------------
create or replace function public.mm_cycle_week(p_club uuid, p_squad uuid, p_date date)
returns table(focus text, week_no smallint)
language sql stable security definer set search_path = '' as $$
  select mi.qes_focus, mi.week_no::smallint
    from public.micros mi
    join public.macros ma on ma.id = mi.macro_id and ma.is_active
    join public.seasons se on se.id = ma.season_id and se.club_id = p_club and se.is_active
   where mi.is_active and mi.week_commencing is not null
     and p_date between mi.week_commencing and mi.week_commencing + 6
     and (p_squad is null
          or exists (select 1 from public.macro_squads ms where ms.macro_id = ma.id and ms.squad_id = p_squad and ms.is_active)
          or exists (select 1 from public.season_squads ss where ss.season_id = se.id and ss.squad_id = p_squad))
   order by (p_squad is not null and exists (select 1 from public.macro_squads ms
               where ms.macro_id = ma.id and ms.squad_id = p_squad and ms.is_active)) desc,
            (mi.qes_focus is null), mi.week_commencing desc
   limit 1;
$$;
revoke all on function public.mm_cycle_week(uuid, uuid, date) from public, anon;
grant execute on function public.mm_cycle_week(uuid, uuid, date) to authenticated;

-- The test window (if any) that covers a run: same club, date inside, the
-- protocol listed (or none listed), and the squad covered by the window.
create or replace function public.mm_find_window(p_club uuid, p_protocol uuid, p_squad uuid, p_date date)
returns uuid language sql stable security definer set search_path = '' as $$
  select w.id from public.season_windows w
    join public.seasons se on se.id = w.season_id and se.is_active
   where w.club_id = p_club and w.kind = 'test_set' and w.is_active
     and p_date between w.starts_on and w.ends_on
     and (cardinality(w.protocol_ids) = 0 or p_protocol = any(w.protocol_ids))
     and (p_squad is null
          or (w.squad_ids is not null and p_squad = any(w.squad_ids))
          or (w.squad_ids is null and exists (select 1 from public.season_squads ss where ss.season_id = w.season_id and ss.squad_id = p_squad)))
   order by (cardinality(w.protocol_ids) > 0) desc, w.starts_on desc
   limit 1;
$$;
-- Used only inside the database (mm_session_fill, as owner); not exposed to the app.
revoke all on function public.mm_find_window(uuid, uuid, uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Sessions point at season_windows
-- ---------------------------------------------------------------------
alter table public.mm_sessions drop constraint if exists mm_sessions_window_id_fkey;
update public.mm_sessions set window_id = null
 where window_id is not null and not exists (select 1 from public.season_windows w where w.id = window_id);
alter table public.mm_sessions add constraint mm_sessions_window_id_fkey
  foreign key (window_id) references public.season_windows(id);

create or replace function app_private.mm_session_fill() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare v public.mm_protocol_versions%rowtype; p public.mm_protocols%rowtype; w public.season_windows%rowtype; cf text; wk smallint;
begin
  select * into v from public.mm_protocol_versions where id = new.version_id;
  select * into p from public.mm_protocols where id = v.protocol_id;
  if tg_op = 'INSERT' then
    if v.published_at is null then raise exception 'This version of % is not published yet.', p.code; end if;
    if p.status not in ('pilot','live') then raise exception '% is % and cannot be run.', p.code, p.status; end if;
  end if;
  new.protocol_id := p.id;
  new.club_id     := p.club_id;
  if new.window_id is null then
    new.window_id := public.mm_find_window(new.club_id, p.id, new.squad_id, new.session_date);
  end if;
  if new.window_id is not null then
    select * into w from public.season_windows where id = new.window_id;
    if w.id is null or w.kind <> 'test_set' or not w.is_active or w.club_id <> new.club_id then
      if tg_op = 'INSERT' then raise exception 'That testing window is not available.'; end if;
      -- window removed since: relink to whatever covers the run now
      w := null;
      new.window_id := public.mm_find_window(new.club_id, p.id, new.squad_id, new.session_date);
      if new.window_id is not null then select * into w from public.season_windows where id = new.window_id; end if;
    end if;
  end if;
  if p.fixed_date_only then
    if w.id is null or new.session_date not between w.starts_on and w.ends_on then
      raise exception '% is run on its fixed date only. Choose its testing window in the season plan.', p.code;
    end if;
  end if;
  select c.focus, c.week_no into cf, wk from public.mm_cycle_week(new.club_id, new.squad_id, new.session_date) c;
  new.cycle_focus   := cf;
  new.cycle_week_no := wk;
  new.on_cycle := case when v.intended_cycle is null or cf is null then null else cf = v.intended_cycle end;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 4. Season plan panels: Metrics & Measures results and coverage
-- ---------------------------------------------------------------------
create or replace function public.season_plan_mm(p_season uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare s record; v_today date; out jsonb;
begin
  select id, club_id, start_date, finish_date into s from public.seasons where id = p_season;
  if s.id is null then return null; end if;
  v_today := least(current_date, s.finish_date);

  with res as (
    select r.*, p.code, p.name as test_name, p.better, v.measure ->> 'unit' as unit,
           (select l ->> 'label' from jsonb_array_elements(v.levels) l where l ->> 'key' = r.level_key) as level_label,
           coalesce((select l ->> 'level_no' from jsonb_array_elements(v.levels) l where l ->> 'key' = r.level_key)::int,
                    nullif(regexp_replace(r.level_key, '\D', '', 'g'), '')::int) as level_no,
           w.id as win_id, w.title as win_title, w.starts_on as win_from
      from public.mm_results r
      join public.mm_sessions se on se.id = r.session_id
      join public.mm_protocols p on p.id = r.protocol_id
      join public.mm_protocol_versions v on v.id = r.version_id
      left join public.season_windows w on w.id = se.window_id and w.season_id = s.id
     where r.club_id = s.club_id and r.session_date between s.start_date and v_today
       and r.status = 'recorded' and p.code <> 'THR-00'
       and r.squad_id in (select ss.squad_id from public.season_squads ss where ss.season_id = s.id)
  )
  select jsonb_build_object('mm_tests', coalesce((select jsonb_agg(x order by x.win_from nulls last, x.code, x.level_no, x.squad_id) from (
      select win_id, win_title, win_from, protocol_id, code, test_name, unit, better, major, level_key, level_label, level_no,
             squad_id, count(*) as n, count(distinct swimmer_id) as swimmers,
             count(*) filter (where is_baseline) as baselines,
             percentile_cont(0.5) within group (order by value) as median, min(value) as min, max(value) as max,
             count(*) filter (where flag = 'improved') as improved,
             count(*) filter (where flag = 'noise') as noise,
             count(*) filter (where flag = 'declined') as declined,
             count(*) filter (where flag in ('caution','no_reliability')) as caution,
             count(*) filter (where coalesce(cardinality(caution), 0) > 0) as with_caution
        from res group by win_id, win_title, win_from, protocol_id, code, test_name, unit, better, major, level_key, level_label, level_no, squad_id) x), '[]'::jsonb))
  into out;

  with win as (
    select w.id, w.title, w.starts_on, w.ends_on, w.protocol_ids, w.test_kind,
           unnest(coalesce(w.squad_ids, (select array_agg(ss.squad_id) from public.season_squads ss where ss.season_id = s.id))) as squad_id
      from public.season_windows w
     where w.season_id = s.id and w.kind = 'test_set' and w.is_active
  ), pool as (
    select win.*, sw.id as swimmer_id from win
      join public.swimmers sw on sw.squad_id = win.squad_id and sw.club_id = s.club_id and sw.active
  )
  select out || jsonb_build_object('mm_coverage', coalesce((select jsonb_agg(x order by x.starts_on, x.squad_id) from (
      select id as window_id, title, starts_on, ends_on, test_kind, squad_id, count(*) as swimmers,
             count(*) filter (where exists (select 1 from public.mm_results r where r.swimmer_id = pool.swimmer_id and r.status = 'recorded'
                and r.session_date between pool.starts_on and pool.ends_on
                and (cardinality(pool.protocol_ids) = 0 or r.protocol_id = any(pool.protocol_ids)))) as tested,
             count(*) filter (where not exists (select 1 from public.mm_results r where r.swimmer_id = pool.swimmer_id and r.is_baseline
                and r.session_date <= least(pool.ends_on, current_date)
                and (cardinality(pool.protocol_ids) = 0 or r.protocol_id = any(pool.protocol_ids)))) as no_baseline
        from pool group by id, title, starts_on, ends_on, test_kind, squad_id) x), '[]'::jsonb))
  into out;
  return out;
end $$;
revoke all on function public.season_plan_mm(uuid) from public, anon;
grant execute on function public.season_plan_mm(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Data
-- ---------------------------------------------------------------------
-- 5a. Squads with a test record but on no season plan → the plan running on
--     the test date (the one that already has squads, else the latest).
insert into public.season_squads (season_id, squad_id)
select distinct on (x.squad_id) se.id, x.squad_id
  from (select distinct squad_id, club_id, session_date from public.mm_sessions where squad_id is not null) x
  join public.seasons se on se.club_id = x.club_id and se.is_active and x.session_date between se.start_date and se.finish_date
 where not exists (select 1 from public.season_squads ss join public.seasons o on o.id = ss.season_id and o.is_active
                    where ss.squad_id = x.squad_id and x.session_date between o.start_date and o.finish_date)
 order by x.squad_id, exists (select 1 from public.season_squads z where z.season_id = se.id) desc, se.start_date desc
on conflict do nothing;

-- 5b. Test Set 1–3 → THR-01, baseline / mid / end
update public.season_windows w
   set protocol_ids = array[p.id],
       test_kind = case w.title when 'Test Set 1' then 'baseline' when 'Test Set 2' then 'mid' else 'end' end
  from public.mm_protocols p
 where p.club_id = w.club_id and p.code = 'THR-01'
   and w.kind = 'test_set' and w.title in ('Test Set 1', 'Test Set 2', 'Test Set 3')
   and cardinality(w.protocol_ids) = 0;

-- 5c. Existing sessions: refill cycle week and window, then re-flag results
update public.mm_sessions set session_date = session_date;
do $$
declare r record;
begin
  for r in select distinct swimmer_id, protocol_id, major, level_key from public.mm_results loop
    perform app_private.mm_relink_snap(r.swimmer_id, r.protocol_id, r.major, r.level_key);
  end loop;
end $$;
