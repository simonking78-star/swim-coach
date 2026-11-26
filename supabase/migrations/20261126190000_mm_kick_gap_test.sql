-- Metrics & Measures: paired timed tests ("gap" rule) and the 50m Kick test.
--
-- A timed protocol can now name two or more variants in its measure, e.g.
--   {"counts":"gap","variants":[{"key":"fins","label":"With fins"},{"key":"no_fins","label":"Without fins"}],
--    "target_gap_s":10, "precision":0, ...}
-- Each variant is one trial (mm_trials.variant = the variant key). The result
-- keeps every variant's time in mm_results.variant_times, and its value is the
-- gap: last variant − first variant (e.g. no fins − fins). Lower gap = better,
-- so the protocol is better = 'lower' and the usual baseline / change / flag
-- logic (mm_relink) works on the gap unchanged.
--
-- mm_variant_window_rows() is the monthly-window chart data for these tests:
-- every swimmer's latest result in a date range, with each variant's time.
-- SECURITY INVOKER, so a caller sees only results they can already see.

alter table public.mm_results add column if not exists variant_times jsonb;
comment on column public.mm_results.variant_times is
  'Paired timed tests (measure.variants): {variant_key: seconds}. value = last variant − first variant.';

create or replace function app_private.mm_result_fill() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare s public.mm_sessions%rowtype; v public.mm_protocol_versions%rowtype; p public.mm_protocols%rowtype;
        rule text; times numeric[]; lvl_no int; max_reps numeric; vt jsonb; k_first text; k_last text;
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
  new.variant_times := null;

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
    if rule = 'gap' and jsonb_typeof(v.measure->'variants') = 'array' and jsonb_array_length(v.measure->'variants') >= 2 then
      -- One legal time per variant (the best, if more than one trial was entered).
      select jsonb_object_agg(t.variant, t.best) into vt
        from (select variant, min(time_s) best from public.mm_trials
               where result_id = new.id and legal and time_s is not null and variant <> ''
               group by variant) t;
      new.variant_times := vt;
      k_first := v.measure->'variants'->0->>'key';
      k_last  := v.measure->'variants'->(jsonb_array_length(v.measure->'variants') - 1)->>'key';
      new.value := case when vt ? k_first and vt ? k_last
                        then round((vt->>k_last)::numeric - (vt->>k_first)::numeric, 3) end;
      new.legal := new.value is not null;
    else
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

-- Monthly window rows for paired timed tests ---------------------------------
create or replace function public.mm_variant_window_rows(p_protocol uuid, p_from date, p_to date)
returns table (
  result_id uuid, swimmer_id uuid, full_name text, squad_id uuid, squad_name text, session_date date,
  age int, variant_times jsonb, gap numeric, change_prev numeric, flag text
) language sql stable security invoker set search_path = '' as $$
  with latest as (
    select distinct on (r.swimmer_id) r.*
      from public.mm_results r
     where r.protocol_id = p_protocol and r.status = 'recorded' and r.variant_times is not null
       and r.session_date between p_from and p_to
     order by r.swimmer_id, r.session_date desc, r.created_at desc
  )
  select x.id, x.swimmer_id, s.full_name, x.squad_id, q.name, x.session_date,
         x.age::int, x.variant_times, x.value, x.change_prev, x.flag
    from latest x
    join public.swimmers s on s.id = x.swimmer_id
    left join public.squads q on q.id = x.squad_id
   order by x.age nulls last, s.full_name;
$$;
revoke all on function public.mm_variant_window_rows(uuid, date, date) from public, anon;
grant execute on function public.mm_variant_window_rows(uuid, date, date) to authenticated;

-- Months that have results now also count paired tests with only one time in.
create or replace function public.mm_window_months(p_protocol uuid)
returns table (month date, swimmers bigint)
language sql stable security invoker set search_path = '' as $$
  select date_trunc('month', r.session_date)::date, count(distinct r.swimmer_id)
    from public.mm_results r
   where r.protocol_id = p_protocol and r.status = 'recorded' and (r.value is not null or r.variant_times is not null)
   group by 1 order by 1 desc;
$$;
revoke all on function public.mm_window_months(uuid) from public, anon;
grant execute on function public.mm_window_months(uuid) to authenticated;
