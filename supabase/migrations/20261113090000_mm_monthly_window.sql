-- Metrics & Measures: monthly testing window and swimmer comparisons
-- (RRSC Test Set Timings workbook, Nov 2026).
--
-- 1. Scoring columns on mm_results (also applied on 11 Nov 2026 as
--    mm_test_set_workbook_scoring): age level, below/at/above, points
--    (reps × 1/2/3) and points per age year (level × reps ÷ age), worked out by
--    mm_result_fill() when the version's measure has a "points" rule.
-- 2. mm_window_rows(): every swimmer's latest result on a protocol in a date
--    window (a calendar month in the app), with the at-age benchmark — the
--    data for the monthly bar + line chart. SECURITY INVOKER, so it returns
--    only the results the caller can already see.
-- 3. mm_swimmer_compare(): one swimmer's latest result on each scored protocol,
--    set against the average of the REST of their squad and of their age group
--    in the same month. SECURITY DEFINER so a parent sees the averages without
--    seeing anyone else's result; it checks the caller can see the swimmer.

alter table public.mm_results
  add column if not exists scored_age     smallint,
  add column if not exists age_level      smallint,
  add column if not exists vs_age         text check (vs_age in ('below','at','above')),
  add column if not exists points         numeric,
  add column if not exists points_per_age numeric,
  add column if not exists set_completed  boolean;

create or replace function app_private.mm_result_fill() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare s public.mm_sessions%rowtype; v public.mm_protocol_versions%rowtype; p public.mm_protocols%rowtype;
        rule text; times numeric[]; lvl_no int; max_reps numeric;
begin
  select * into s from public.mm_sessions where id = new.session_id;
  select * into v from public.mm_protocol_versions where id = s.version_id;
  select * into p from public.mm_protocols where id = s.protocol_id;
  if not exists (select 1 from jsonb_array_elements(v.levels) l where l->>'key' = new.level_key) then
    raise exception 'Level % is not part of % v%.%', new.level_key, p.code, v.major, v.minor;
  end if;
  new.club_id := s.club_id; new.protocol_id := s.protocol_id; new.version_id := s.version_id;
  new.major := v.major; new.session_date := s.session_date;
  if tg_op = 'INSERT' then
    select squad_id, year_of_birth into new.squad_id, new.year_of_birth from public.swimmers where id = new.swimmer_id;
  elsif new.year_of_birth is null then
    select year_of_birth into new.year_of_birth from public.swimmers where id = new.swimmer_id;
  end if;
  new.age := case when new.year_of_birth is null then null else extract(year from s.session_date)::int - new.year_of_birth end;

  if new.status = 'not_tested' then
    new.value := null; new.legal := null;
  elsif p.kind = 'reps' then
    select sum((e.v->>'done')::numeric) into new.value
      from jsonb_each(new.raw) e(k, v) where e.v ? 'done' and jsonb_typeof(e.v->'done') = 'number';
    new.legal := true;
  elsif p.kind = 'checklist' then
    select sum((e.v #>> '{}')::numeric) into new.value
      from jsonb_each(new.raw) e(k, v) where jsonb_typeof(e.v) = 'number';
    new.legal := true;
  else
    rule := coalesce(v.measure->>'counts', 'best');
    select array_agg(t.time_s order by t.time_s) into times
      from public.mm_trials t where t.result_id = new.id and t.legal and t.time_s is not null and t.variant = '';
    new.legal := exists (select 1 from public.mm_trials t where t.result_id = new.id and t.legal and t.time_s is not null);
    new.value := case
      when times is null then null
      when rule = 'best' then times[1]
      when rule = 'mean_best_two' then case when array_length(times, 1) >= 2 then round((times[1] + times[2]) / 2, 3) else null end
      when rule = 'mean' then (select round(avg(x), 3) from unnest(times) x)
      when rule = 'single' then times[1]
      else times[1] end;
    if p.better = 'higher' and times is not null and rule = 'best' then new.value := times[array_length(times, 1)]; end if;
  end if;

  -- Graded repeat-set scoring (RRSC Test Set Timings workbook), when the version defines it.
  new.scored_age := null; new.age_level := null; new.vs_age := null;
  new.points := null; new.points_per_age := null; new.set_completed := null;
  if p.kind = 'reps' and new.status = 'recorded' and new.value is not null and v.measure ? 'points' then
    select (l->>'level_no')::int, (select sum((r->>'reps')::numeric) from jsonb_array_elements(l->'rounds') r)
      into lvl_no, max_reps
      from jsonb_array_elements(v.levels) l where l->>'key' = new.level_key;
    new.set_completed := new.value >= max_reps;
    new.scored_age := coalesce(nullif(new.raw #>> '{meta,age_at_test}', '')::int, new.age);
    if new.scored_age is not null and lvl_no is not null then
      select coalesce(max((l->>'level_no')::int), 0) into new.age_level
        from jsonb_array_elements(v.levels) l where (l->>'age')::int <= new.scored_age;
      new.vs_age := case when lvl_no < new.age_level then 'below' when lvl_no = new.age_level then 'at' else 'above' end;
      new.points := least(new.value, max_reps) * coalesce((v.measure #>> array['points','per_rep',new.vs_age])::numeric, 1);
      new.points_per_age := round(lvl_no * new.value / new.scored_age, 4);
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function app_private.mm_result_fill() from public, anon, authenticated;

-- Level helpers ------------------------------------------------------------
-- Total reps of a level, and the at-age benchmark: completing every rep of the
-- swimmer's own age level, as points per age year.
create or replace function app_private.mm_level_reps(p_levels jsonb, p_key text) returns numeric
  language sql immutable set search_path = '' as $$
  select sum((r->>'reps')::numeric)
    from jsonb_array_elements(p_levels) l, jsonb_array_elements(l->'rounds') r
   where l->>'key' = p_key;
$$;

create or replace function app_private.mm_benchmark(p_levels jsonb, p_age_level int, p_age int) returns numeric
  language sql immutable set search_path = '' as $$
  select case when p_age_level is null or p_age_level < 1 or coalesce(p_age, 0) < 1 then null else
    round(p_age_level * (select sum((r->>'reps')::numeric)
                           from jsonb_array_elements(p_levels) l, jsonb_array_elements(l->'rounds') r
                          where (l->>'level_no')::int = p_age_level) / p_age, 4) end;
$$;
grant execute on function app_private.mm_level_reps(jsonb, text), app_private.mm_benchmark(jsonb, int, int) to authenticated;

-- Window rows (chart data) --------------------------------------------------
create or replace function public.mm_window_rows(p_protocol uuid, p_from date, p_to date)
returns table (
  result_id uuid, swimmer_id uuid, full_name text, squad_id uuid, squad_name text, session_date date,
  level_key text, level_no int, level_label text, age int, value numeric, max_reps numeric,
  points numeric, points_per_age numeric, vs_age text, set_completed boolean, benchmark numeric
) language sql stable security invoker set search_path = '' as $$
  with latest as (
    select distinct on (r.swimmer_id) r.*
      from public.mm_results r
     where r.protocol_id = p_protocol and r.status = 'recorded' and r.value is not null
       and r.session_date between p_from and p_to
     order by r.swimmer_id, r.session_date desc, r.created_at desc
  )
  select x.id, x.swimmer_id, s.full_name, x.squad_id, q.name, x.session_date,
         x.level_key,
         (select (l->>'level_no')::int from jsonb_array_elements(v.levels) l where l->>'key' = x.level_key limit 1),
         (select l->>'label' from jsonb_array_elements(v.levels) l where l->>'key' = x.level_key limit 1),
         x.scored_age::int, x.value,
         app_private.mm_level_reps(v.levels, x.level_key),
         x.points, x.points_per_age, x.vs_age, x.set_completed,
         app_private.mm_benchmark(v.levels, x.age_level, x.scored_age)
    from latest x
    join public.swimmers s on s.id = x.swimmer_id
    left join public.squads q on q.id = x.squad_id
    join public.mm_protocol_versions v on v.id = x.version_id
   order by x.scored_age nulls last, s.full_name;
$$;
revoke all on function public.mm_window_rows(uuid, date, date) from public, anon;
grant execute on function public.mm_window_rows(uuid, date, date) to authenticated;

-- Months that have results, for the month picker --------------------------
create or replace function public.mm_window_months(p_protocol uuid)
returns table (month date, swimmers bigint)
language sql stable security invoker set search_path = '' as $$
  select date_trunc('month', r.session_date)::date, count(distinct r.swimmer_id)
    from public.mm_results r
   where r.protocol_id = p_protocol and r.status = 'recorded' and r.value is not null
   group by 1 order by 1 desc;
$$;
revoke all on function public.mm_window_months(uuid) from public, anon;
grant execute on function public.mm_window_months(uuid) to authenticated;

-- One swimmer against their squad and age group ----------------------------
create or replace function public.mm_swimmer_compare(p_swimmer uuid)
returns table (
  protocol_id uuid, code text, name text, month date, session_date date, level_label text, age int,
  value numeric, max_reps numeric, points numeric, points_per_age numeric, vs_age text, set_completed boolean,
  benchmark numeric, squad_name text,
  squad_n int, squad_avg_ppa numeric, squad_avg_points numeric,
  age_n int, age_avg_ppa numeric, age_avg_points numeric,
  history jsonb
) language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (p_swimmer in (select app_private.swimmer_ids('stats', false))
          or p_swimmer in (select app_private.swimmer_ids('stopwatch', false))) then
    raise exception 'You cannot see this swimmer''s results';
  end if;
  return query
  with mine as (   -- the swimmer's latest scored result on each protocol
    select distinct on (r.protocol_id) r.*
      from public.mm_results r
     where r.swimmer_id = p_swimmer and r.status = 'recorded' and r.points_per_age is not null
     order by r.protocol_id, r.session_date desc, r.created_at desc
  ), win as (      -- everyone's latest scored result on that protocol in the same calendar month
    select distinct on (r.protocol_id, r.swimmer_id) r.*
      from public.mm_results r
      join mine m on m.protocol_id = r.protocol_id
                 and date_trunc('month', r.session_date) = date_trunc('month', m.session_date)
     where r.status = 'recorded' and r.points_per_age is not null and r.club_id = m.club_id
     order by r.protocol_id, r.swimmer_id, r.session_date desc, r.created_at desc
  )
  select m.protocol_id, p.code, p.name, date_trunc('month', m.session_date)::date, m.session_date,
         (select l->>'label' from jsonb_array_elements(v.levels) l where l->>'key' = m.level_key limit 1),
         m.scored_age::int, m.value, app_private.mm_level_reps(v.levels, m.level_key),
         m.points, m.points_per_age, m.vs_age, m.set_completed,
         app_private.mm_benchmark(v.levels, m.age_level, m.scored_age), q.name,
         (select count(*)::int from win w where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.squad_id = m.squad_id),
         (select round(avg(w.points_per_age), 2) from win w where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.squad_id = m.squad_id),
         (select round(avg(w.points), 1) from win w where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.squad_id = m.squad_id),
         (select count(*)::int from win w where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.scored_age = m.scored_age),
         (select round(avg(w.points_per_age), 2) from win w where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.scored_age = m.scored_age),
         (select round(avg(w.points), 1) from win w where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.scored_age = m.scored_age),
         (select coalesce(jsonb_agg(jsonb_build_object(
                    'date', h.session_date, 'level', (select l->>'label' from jsonb_array_elements(hv.levels) l where l->>'key' = h.level_key limit 1),
                    'age', h.scored_age, 'value', h.value, 'max_reps', app_private.mm_level_reps(hv.levels, h.level_key),
                    'points', h.points, 'ppa', h.points_per_age, 'vs_age', h.vs_age, 'completed', h.set_completed)
                  order by h.session_date, h.created_at), '[]'::jsonb)
            from public.mm_results h join public.mm_protocol_versions hv on hv.id = h.version_id
           where h.swimmer_id = p_swimmer and h.protocol_id = m.protocol_id and h.status = 'recorded' and h.points_per_age is not null)
    from mine m
    join public.mm_protocols p on p.id = m.protocol_id
    join public.mm_protocol_versions v on v.id = m.version_id
    left join public.squads q on q.id = m.squad_id
   order by p.code;
end $$;
revoke all on function public.mm_swimmer_compare(uuid) from public, anon;
grant execute on function public.mm_swimmer_compare(uuid) to authenticated;
