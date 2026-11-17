-- Test sets: the swimmer's comparison now lists EVERY squad that sat the same
-- protocol in the same month, with each squad's average. No squad is labelled
-- "above" or "below": the club has no defined squad ladder, so the squads are
-- given as information, in name order. Replaces the unapplied
-- 20261115190000_mm_compare_adjacent_squads migration (no squads.sort_order).
--   squads jsonb: [{ name, n, avg_ppa, avg_points, own }] — own = the swimmer's
--   squad, whose figures leave the swimmer out. Aggregates only; still SECURITY DEFINER.

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
           where h.swimmer_id = p_swimmer and h.protocol_id = m.protocol_id and h.status = 'recorded' and h.points_per_age is not null),
         (select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'n', g.n, 'avg_ppa', g.avg_ppa, 'avg_points', g.avg_points, 'own', g.own)
                                    order by g.name), '[]'::jsonb)
            from (select sq.name, count(*)::int n, round(avg(w.points_per_age), 2) avg_ppa, round(avg(w.points), 1) avg_points,
                         (w.squad_id is not distinct from m.squad_id) own
                    from win w join public.squads sq on sq.id = w.squad_id
                   where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer
                   group by sq.name, w.squad_id) g)
    from mine m
    join public.mm_protocols p on p.id = m.protocol_id
    join public.mm_protocol_versions v on v.id = m.version_id
    left join public.squads q on q.id = m.squad_id
   order by p.code;
end $$;
revoke all on function public.mm_swimmer_compare(uuid) from public, anon;
grant execute on function public.mm_swimmer_compare(uuid) to authenticated;
