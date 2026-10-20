-- Step 2 of the attendance-against-timetable change (see 20261019180000).
-- ---------------------------------------------------------------------
-- 5. Monthly Squad Review: one rule, two measures, and a working month-end
--    freeze. The calculation moves to app_private.squad_month_review_all (no
--    access check, used by the freeze job, which runs with no signed-in user);
--    the public function keeps the per-squad access check.
--      present        = sessions attended, fractional (1 dp)
--      marks          = marks that count (In/Out/Partial; Excused left out)
--      attendance_pct = present ÷ marks
--      hours_trained  = squad total hours trained (1 dp)
--      hours_per_swimmer = hours_trained ÷ swimmers attending that month
--      excused        = Excused marks
-- ---------------------------------------------------------------------
create or replace function app_private.squad_month_review_all(p_club text, p_from date, p_to date)
returns table(month date, squad_id uuid, squad_name text, members integer, sessions integer, marks integer, present numeric,
  attendance_pct numeric, swimmers_attending integer, swims integer, swimmers_raced integer, pbs integer, improved_swims integer,
  avg_improvement_pct numeric, median_improvement_pct numeric, status_entries integer, st_not_discussed integer, st_started integer,
  st_developing integer, st_embedded integer, skill_score numeric, skill_moves_up integer, skill_moves_down integer,
  feedback_entries integer, feedback_notes integer, positive_feedback_pct numeric, squad_entries integer, drills_worked integer,
  excused integer, hours_trained numeric, hours_per_swimmer numeric)
language sql
stable
set search_path = ''
as $$
with months as (
  select g::date as ms, (g + interval '1 month' - interval '1 day')::date as me
  from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') g
),
sq as (
  select s.id, s.name, s.club from public.squads s
  where s.club = p_club
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
att_w as (
  select mem.ms, mem.squad_id, a.swimmer_id, a.session_date, a.session_time,
         public.attendance_weight(a.status, a.minutes_attended, a.session_minutes) as w,
         public.attendance_minutes(a.status, a.minutes_attended, a.session_minutes) as mins
  from mem
  join public.attendance_records a
    on a.swimmer_id = mem.swimmer_id and a.session_date between mem.ms and mem.me
),
att as (
  select ms, squad_id,
         count(distinct (session_date, session_time)) as sessions,
         count(w) as marks,
         coalesce(sum(w), 0) as present,
         avg(w) as avg_weight,
         count(*) filter (where w is null) as excused,
         count(distinct swimmer_id) filter (where w > 0) as swimmers_attending,
         coalesce(sum(mins), 0) as minutes
  from att_w
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
  coalesce(a.sessions, 0)::int, coalesce(a.marks, 0)::int, round(coalesce(a.present, 0), 1),
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
  coalesce(q.squad_entries, 0)::int, coalesce(q.drills, 0)::int,
  coalesce(a.excused, 0)::int,
  round(coalesce(a.minutes, 0) / 60.0, 1),
  round(a.minutes / 60.0 / nullif(a.swimmers_attending, 0), 1)
from grid g
left join att a  on a.ms = g.ms and a.squad_id = g.squad_id
left join res r  on r.ms = g.ms and r.squad_id = g.squad_id
left join fb f   on f.ms = g.ms and f.squad_id = g.squad_id
left join moves mv on mv.ms = g.ms and mv.squad_id = g.squad_id
left join sqf q  on q.ms = g.ms and q.squad_id = g.squad_id
order by g.ms, g.name;
$$;
revoke all on function app_private.squad_month_review_all(text, date, date) from public, anon, authenticated;

-- A new public function rather than replacing squad_month_review (which the
-- current app still calls); squad_month_review is retired with the current app.
create or replace function public.squad_month_figures(p_club text, p_from date, p_to date)
returns table(month date, squad_id uuid, squad_name text, members integer, sessions integer, marks integer, present numeric,
  attendance_pct numeric, swimmers_attending integer, swims integer, swimmers_raced integer, pbs integer, improved_swims integer,
  avg_improvement_pct numeric, median_improvement_pct numeric, status_entries integer, st_not_discussed integer, st_started integer,
  st_developing integer, st_embedded integer, skill_score numeric, skill_moves_up integer, skill_moves_down integer,
  feedback_entries integer, feedback_notes integer, positive_feedback_pct numeric, squad_entries integer, drills_worked integer,
  excused integer, hours_trained numeric, hours_per_swimmer numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from app_private.squad_month_review_all(p_club, p_from, p_to) r
  where public.squad_review_allowed(p_club, r.squad_id);
$$;
revoke all on function public.squad_month_figures(text, date, date) from public, anon;
grant execute on function public.squad_month_figures(text, date, date) to authenticated, service_role;

create or replace function public.snapshot_squad_month(p_month date default ((date_trunc('month', now()) - interval '1 month'))::date)
returns integer
language plpgsql
set search_path = ''
as $$
declare n int := 0; k int; c text;
begin
  for c in select distinct club from public.squads where club is not null loop
    insert into public.squad_month_snapshots (club, squad_id, month, metrics, generated_at)
    select c, r.squad_id, r.month, to_jsonb(r) - 'month' - 'squad_id', now()
    from app_private.squad_month_review_all(c, p_month, p_month) r
    on conflict (club, squad_id, month) do update
      set metrics = excluded.metrics, generated_at = excluded.generated_at;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;
revoke all on function public.snapshot_squad_month(date) from public, anon, authenticated;

-- Re-freeze every closed month already on file under the one rule (Simon's choice).
do $$
declare m date;
begin
  for m in select distinct month from public.squad_month_snapshots order by 1 loop
    perform public.snapshot_squad_month(m);
  end loop;
end $$;
