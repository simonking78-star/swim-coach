-- Test sets: compare a swimmer with the squads directly above and below their own.
--   * squads.sort_order: the club's squad ladder (low = younger/entry squads).
--     Squads off the ladder (Masters, pre-academy groups) stay null and are never
--     treated as "above" or "below".
--   * mm_swimmer_compare(): adds the next squad up and down the ladder, with the
--     average points per age year of the swimmers in each who were tested on the
--     same protocol in the same month. Still SECURITY DEFINER and aggregates only.

alter table public.squads add column if not exists sort_order smallint;
comment on column public.squads.sort_order is 'Position on the club''s squad ladder (ascending = entry to performance). Null = not on the ladder.';

update public.squads q
   set sort_order = v.ord
  from public.clubs c,
       (values ('Academy', 10), ('Bronze', 20), ('Silver', 30), ('Gold', 40), ('Platinum', 50), ('Platinum Plus', 60)) v(name, ord)
 where c.id = q.club_id and c.name = 'Redhill and Reigate' and q.name = v.name and q.sort_order is null;

drop function if exists public.mm_swimmer_compare(uuid);
create function public.mm_swimmer_compare(p_swimmer uuid)
returns table (
  protocol_id uuid, code text, name text, month date, session_date date, level_label text, age int,
  value numeric, max_reps numeric, points numeric, points_per_age numeric, vs_age text, set_completed boolean,
  benchmark numeric, squad_name text,
  squad_n int, squad_avg_ppa numeric, squad_avg_points numeric,
  age_n int, age_avg_ppa numeric, age_avg_points numeric,
  history jsonb,
  above_name text, above_n int, above_avg_ppa numeric, above_avg_points numeric,
  below_name text, below_n int, below_avg_ppa numeric, below_avg_points numeric
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
         up.name,
         (select count(*)::int from win w where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.squad_id = up.id),
         (select round(avg(w.points_per_age), 2) from win w where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.squad_id = up.id),
         (select round(avg(w.points), 1) from win w where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.squad_id = up.id),
         dn.name,
         (select count(*)::int from win w where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.squad_id = dn.id),
         (select round(avg(w.points_per_age), 2) from win w where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.squad_id = dn.id),
         (select round(avg(w.points), 1) from win w where w.protocol_id = m.protocol_id and w.swimmer_id <> p_swimmer and w.squad_id = dn.id)
    from mine m
    join public.mm_protocols p on p.id = m.protocol_id
    join public.mm_protocol_versions v on v.id = m.version_id
    left join public.squads q on q.id = m.squad_id
    left join lateral (select s.id, s.name from public.squads s
                        where s.club_id = q.club_id and s.sort_order > q.sort_order
                        order by s.sort_order limit 1) up on true
    left join lateral (select s.id, s.name from public.squads s
                        where s.club_id = q.club_id and s.sort_order < q.sort_order
                        order by s.sort_order desc limit 1) dn on true
   order by p.code;
end $$;
revoke all on function public.mm_swimmer_compare(uuid) from public, anon;
grant execute on function public.mm_swimmer_compare(uuid) to authenticated;
