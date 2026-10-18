-- A-093 step 2 — attendance_weight() + switch squad_month_review's
-- attendance_pct to the weighted formula. "present"/"marks" counts are
-- unchanged (present := status = 'in', identical to the old boolean today).

create or replace function public.attendance_weight(p_status text)
returns numeric
language sql
immutable
set search_path = ''
as $function$
  select case p_status
    when 'in'  then 1
    when 'q3'  then 0.75
    when 'q2'  then 0.5
    when 'q1'  then 0.25
    when 'out' then 0
    else null  -- 'excused' (and anything unrecognised): left out of both sides
  end;
$function$;

create or replace function public.squad_month_review(p_club text, p_from date, p_to date)
 RETURNS TABLE(month date, squad_id uuid, squad_name text, members integer, sessions integer, marks integer, present integer, attendance_pct numeric, swimmers_attending integer, swims integer, swimmers_raced integer, pbs integer, improved_swims integer, avg_improvement_pct numeric, median_improvement_pct numeric, status_entries integer, st_not_discussed integer, st_started integer, st_developing integer, st_embedded integer, skill_score numeric, skill_moves_up integer, skill_moves_down integer, feedback_entries integer, feedback_notes integer, positive_feedback_pct numeric, squad_entries integer, drills_worked integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with months as (
  select g::date as ms, (g + interval '1 month' - interval '1 day')::date as me
  from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') g
),
sq as (
  select s.id, s.name, s.club from public.squads s
  where s.club = p_club and public.squad_review_allowed(s.club, s.id)
),
mem as (
  select m.ms, m.me, sm.squad_id, sm.swimmer_id
  from months m
  join public.squad_memberships sm
    on coalesce(sm.joined_squad_on, '1900-01-01') <= m.me
   and (sm.ended_on is null or sm.ended_on >= m.ms)
  join sq on sq.id = sm.squad_id
  union
  select m.ms, m.me, s.squad_id, s.id
  from months m
  join public.swimmers s on s.squad_id is not null
   and coalesce(s.joined_club_on, '1900-01-01') <= m.me
  join sq on sq.id = s.squad_id
  where not exists (select 1 from public.squad_memberships x where x.swimmer_id = s.id)
),
att as (
  select mem.ms, mem.squad_id,
         count(distinct (a.session_date, a.session_time)) as sessions,
         count(*) as marks,
         count(*) filter (where a.status = 'in') as present,
         avg(public.attendance_weight(a.status)) as avg_weight,
         count(distinct a.swimmer_id) filter (where a.status = 'in') as swimmers_attending
  from mem
  join public.attendance_records a
    on a.swimmer_id = mem.swimmer_id and a.session_date between mem.ms and mem.me
  group by 1, 2
),
hist as (
  select r.swimmer_id, r.meet_date, r.is_pb, r.swim_time,
         min(r.swim_time) over (partition by r.swimmer_id, r.event, r.course order by r.meet_date
                                range between unbounded preceding and '1 day' preceding) as prev_best
  from public.swim_results r
  where r.swimmer_id in (select swimmer_id from mem) and r.swim_time is not null
),
res as (
  select mem.ms, mem.squad_id,
         count(*) as swims,
         count(distinct h.swimmer_id) as swimmers_raced,
         count(*) filter (where h.is_pb or (h.prev_best is not null and h.swim_time < h.prev_best)) as pbs,
         count(*) filter (where h.prev_best is not null and h.swim_time < h.prev_best) as improved_swims,
         avg(100 * extract(epoch from h.prev_best - h.swim_time) / nullif(extract(epoch from h.prev_best), 0))
           filter (where h.prev_best is not null) as avg_imp,
         percentile_cont(0.5) within group (order by
           100 * extract(epoch from h.prev_best - h.swim_time) / nullif(extract(epoch from h.prev_best), 0))
           filter (where h.prev_best is not null) as med_imp
  from mem join hist h on h.swimmer_id = mem.swimmer_id and h.meet_date between mem.ms and mem.me
  group by 1, 2
),
fb as (
  select mem.ms, mem.squad_id,
         count(*) as feedback_entries,
         count(*) filter (where f.entry_type = 'note') as notes,
         count(*) filter (where f.entry_type = 'status' and f.status is not null) as status_entries,
         count(*) filter (where f.status = 'Not discussed') as nd,
         count(*) filter (where f.status = 'Started') as st,
         count(*) filter (where f.status = 'Developing') as dv,
         count(*) filter (where f.status = 'Embedded') as em
  from mem join public.swimmer_feedback f
    on f.swimmer_id = mem.swimmer_id and f.session_date between mem.ms and mem.me
  group by 1, 2
),
score as (
  select f.swimmer_id, f.criterion, f.session_date, f.created_at,
         case f.status when 'Not discussed' then 0 when 'Started' then 1
                       when 'Developing' then 2 when 'Embedded' then 3 end as sc
  from public.swimmer_feedback f
  where f.entry_type = 'status' and f.status is not null and f.criterion is not null
    and f.swimmer_id in (select swimmer_id from mem)
),
moves as (
  select mem.ms, mem.squad_id,
         count(*) filter (where e.sc > b.sc) as up,
         count(*) filter (where e.sc < b.sc) as down
  from mem
  join lateral (
    select distinct on (s.criterion) s.criterion, s.sc from score s
    where s.swimmer_id = mem.swimmer_id and s.session_date between mem.ms and mem.me
    order by s.criterion, s.session_date desc, s.created_at desc) e on true
  join lateral (
    select s.sc from score s
    where s.swimmer_id = mem.swimmer_id and s.criterion = e.criterion and s.session_date < mem.ms
    order by s.session_date desc, s.created_at desc limit 1) b on true
  group by 1, 2
),
sqf as (
  select m.ms, q.squad_id,
         count(*) as squad_entries,
         count(*) filter (where q.status is not null) as sq_status,
         count(*) filter (where q.status = 'Not discussed') as nd,
         count(*) filter (where q.status = 'Started') as st,
         count(*) filter (where q.status = 'Developing') as dv,
         count(*) filter (where q.status = 'Embedded') as em,
         count(distinct q.drill_id) as drills
  from months m join public.squad_feedback q
    on q.session_date between m.ms and m.me and q.is_active
  join sq on sq.id = q.squad_id
  group by 1, 2
),
grid as (
  select m.ms, sq.id as squad_id, sq.name from months m cross join sq
)
select g.ms, g.squad_id, g.name,
  (select count(distinct swimmer_id) from mem where mem.ms = g.ms and mem.squad_id = g.squad_id)::int,
  coalesce(a.sessions, 0)::int, coalesce(a.marks, 0)::int, coalesce(a.present, 0)::int,
  round(100.0 * a.avg_weight, 1),
  coalesce(a.swimmers_attending, 0)::int,
  coalesce(r.swims, 0)::int, coalesce(r.swimmers_raced, 0)::int, coalesce(r.pbs, 0)::int,
  coalesce(r.improved_swims, 0)::int,
  round(r.avg_imp::numeric, 2), round(r.med_imp::numeric, 2),
  (coalesce(f.status_entries, 0) + coalesce(q.sq_status, 0))::int,
  (coalesce(f.nd, 0) + coalesce(q.nd, 0))::int, (coalesce(f.st, 0) + coalesce(q.st, 0))::int,
  (coalesce(f.dv, 0) + coalesce(q.dv, 0))::int, (coalesce(f.em, 0) + coalesce(q.em, 0))::int,
  round((coalesce(f.st,0) + coalesce(q.st,0) + 2.0*(coalesce(f.dv,0) + coalesce(q.dv,0)) + 3.0*(coalesce(f.em,0) + coalesce(q.em,0)))
        / nullif(coalesce(f.status_entries,0) + coalesce(q.sq_status,0), 0), 2),
  coalesce(mv.up, 0)::int, coalesce(mv.down, 0)::int,
  (coalesce(f.feedback_entries, 0) + coalesce(q.squad_entries, 0))::int,
  coalesce(f.notes, 0)::int,
  round(100.0 * (coalesce(f.dv,0) + coalesce(f.em,0) + coalesce(q.dv,0) + coalesce(q.em,0))
        / nullif(coalesce(f.status_entries,0) + coalesce(q.sq_status,0), 0), 1),
  coalesce(q.squad_entries, 0)::int, coalesce(q.drills, 0)::int
from grid g
left join att a  on a.ms = g.ms and a.squad_id = g.squad_id
left join res r  on r.ms = g.ms and r.squad_id = g.squad_id
left join fb f   on f.ms = g.ms and f.squad_id = g.squad_id
left join moves mv on mv.ms = g.ms and mv.squad_id = g.squad_id
left join sqf q  on q.ms = g.ms and q.squad_id = g.squad_id
order by g.ms, g.name;
$function$;
