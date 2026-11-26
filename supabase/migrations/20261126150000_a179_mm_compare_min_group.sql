-- A-179: test-set comparison hides any average built from fewer than 3 other swimmers,
-- so one swimmer's score can't be read off (or worked out from) a "squad average".
-- Applies to the rest-of-squad, age-group and per-squad averages. The counts (n) are
-- still returned so the screen can say why an average isn't shown.
-- Supersedes 20261116150000_mm_compare_all_squads (never applied to production);
-- same columns, so the app needs no change beyond the "fewer than 3" wording.

drop function if exists public.mm_swimmer_compare(uuid);
create function public.mm_swimmer_compare(p_swimmer uuid)
returns table (
  protocol_id uuid, code text, name text, month date, session_date date, level_label text, age int,
  value numeric, max_reps numeric, points numeric, points_per_age numeric, vs_age text, set_completed boolean,
  benchmark numeric, squad_name text,
  squad_n int, squad_avg_ppa numeric, squad_avg_points numeric,
  age_n int, age_avg_ppa numeric, age_avg_points numeric,
  history jsonb,
  squads jsonb
) language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare min_n constant int := 3;
begin
  if not (p_swimmer in (select app_private.swimmer_ids('stats', false))
          or p_swimmer in (select app_private.swimmer_ids('stopwatch', false))) then
    raise exception 'You cannot see this swimmer''s results';
  end if;
  return query
  with mine as (
    select distinct on (r.protocol_id) r.*
      from public.mm_results r
     where r.swimmer_id = p_swimmer and r.status = 'recorded' and r.points_per_age is not null
     order by r.protocol_id, r.session_date desc, r.created_at desc
  ), win as (
    select distinct on (r.protocol_id, r.swimmer_id) r.*
      from public.mm_results r
      join mine m on m.protocol_id = r.protocol_id
                 and date_trunc('month', r.session_date) = date_trunc('month', m.session_date)
     where r.status = 'recorded' and r.points_per_age is not null and r.club_id = m.club_id
     order by r.protocol_id, r.swimmer_id, r.session_date desc, r.created_at desc
  ), sq as (       -- rest of the swimmer's own squad
    select m.protocol_id, count(w.*)::int n, avg(w.points_per_age) ppa, avg(w.points) pts
      from mine m left join win w on w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.squad_id = m.squad_id
     group by m.protocol_id
  ), ag as (       -- others of the same scored age, all squads
    select m.protocol_id, count(w.*)::int n, avg(w.points_per_age) ppa, avg(w.points) pts
      from mine m left join win w on w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.scored_age = m.scored_age
     group by m.protocol_id
  )
  select m.protocol_id, p.code, p.name, date_trunc('month', m.session_date)::date, m.session_date,
         (select l->>'label' from jsonb_array_elements(v.levels) l where l->>'key' = m.level_key limit 1),
         m.scored_age::int, m.value, app_private.mm_level_reps(v.levels, m.level_key),
         m.points, m.points_per_age, m.vs_age, m.set_completed,
         app_private.mm_benchmark(v.levels, m.age_level, m.scored_age), q.name,
         sq.n, case when sq.n >= min_n then round(sq.ppa, 2) end, case when sq.n >= min_n then round(sq.pts, 1) end,
         ag.n, case when ag.n >= min_n then round(ag.ppa, 2) end, case when ag.n >= min_n then round(ag.pts, 1) end,
         (select coalesce(jsonb_agg(jsonb_build_object(
                    'date', h.session_date, 'level', (select l->>'label' from jsonb_array_elements(hv.levels) l where l->>'key' = h.level_key limit 1),
                    'age', h.scored_age, 'value', h.value, 'max_reps', app_private.mm_level_reps(hv.levels, h.level_key),
                    'points', h.points, 'ppa', h.points_per_age, 'vs_age', h.vs_age, 'completed', h.set_completed)
                  order by h.session_date, h.created_at), '[]'::jsonb)
            from public.mm_results h join public.mm_protocol_versions hv on hv.id = h.version_id
           where h.swimmer_id = p_swimmer and h.protocol_id = m.protocol_id and h.status = 'recorded' and h.points_per_age is not null),
         (select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'n', g.n,
                    'avg_ppa', case when g.n >= min_n then g.avg_ppa end,
                    'avg_points', case when g.n >= min_n then g.avg_points end, 'own', g.own)
                  order by g.name), '[]'::jsonb)
            from (select s.name, count(*)::int n, round(avg(w.points_per_age), 2) avg_ppa, round(avg(w.points), 1) avg_points,
                         (w.squad_id is not distinct from m.squad_id) own
                    from win w join public.squads s on s.id = w.squad_id
                   where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer
                   group by s.name, w.squad_id) g)
    from mine m
    join sq on sq.protocol_id = m.protocol_id
    join ag on ag.protocol_id = m.protocol_id
    join public.mm_protocols p on p.id = m.protocol_id
    join public.mm_protocol_versions v on v.id = m.version_id
    left join public.squads q on q.id = m.squad_id
   order by p.code;
end $$;
revoke all on function public.mm_swimmer_compare(uuid) from public, anon;
grant execute on function public.mm_swimmer_compare(uuid) to authenticated;
