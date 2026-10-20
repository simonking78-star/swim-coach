-- Attendance measured against the timetable (Simon, 19 Oct 2026).
--
-- Every register is a session with a start, a finish and a length. A
-- timetabled session takes its times from the squad's weekly timetable; a
-- session that isn't timetabled has its date, start and finish confirmed by
-- the coach when the register is taken. Each mark stores the session length,
-- so two measures always agree:
--   1. hours trained   = In: whole session · Partial: minutes attended · Out: 0
--   2. sessions attended (fractions) = In 1 · Partial minutes ÷ length · Out 0
-- Excused is left out of both, and of the totals they are divided by.

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
alter table public.attendance_records
  add column if not exists session_end_time time,
  add column if not exists timetable_session_id uuid references public.timetable_sessions(id);

comment on column public.attendance_records.session_minutes is
  'Length of the session in minutes (finish − start). Stored on every mark; the base for hours trained and fractional attendance.';
comment on column public.attendance_records.session_end_time is 'Session finish time (from the timetable, or confirmed by the coach).';
comment on column public.attendance_records.timetable_session_id is 'The weekly timetable slot this register was taken for; null for a session that is not timetabled.';

create index if not exists attendance_records_timetable_session_idx on public.attendance_records (timetable_session_id);

-- ---------------------------------------------------------------------
-- 2. Minutes trained for one mark (the hours measure)
-- ---------------------------------------------------------------------
create or replace function public.attendance_minutes(p_status text, p_minutes_attended integer, p_session_minutes integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'in'      then coalesce(p_session_minutes, 60)::numeric
    when 'out'     then 0
    when 'partial' then least(coalesce(p_session_minutes, 60), greatest(0, coalesce(p_minutes_attended, 0)))::numeric
    else null  -- 'excused': left out
  end;
$$;
grant execute on function public.attendance_minutes(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Fill session times from the timetable when a client doesn't send them
--    (the current app). An explicit link or finish time is kept as sent.
-- ---------------------------------------------------------------------
create or replace function app_private.fill_attendance_session() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare slot record;
begin
  if new.timetable_session_id is null then
    select ts.id, ts.end_time into slot
      from public.swimmers s
      join public.squads sq on sq.club = s.club and sq.name = s.squad
      join public.timetables t on t.squad_id = sq.id and t.is_active
       and new.session_date between t.season_start and t.season_end
      join public.timetable_sessions ts on ts.timetable_id = t.id and ts.is_active is not false
       and ts.day_of_week = extract(isodow from new.session_date)
       and ts.start_time = new.session_time
     where s.id = new.swimmer_id
     limit 1;
    if found then new.timetable_session_id := slot.id; end if;
  end if;

  if new.session_end_time is null and new.timetable_session_id is not null then
    select ts.end_time into new.session_end_time from public.timetable_sessions ts where ts.id = new.timetable_session_id;
  end if;

  if new.session_minutes is null and new.session_end_time is not null and new.session_end_time > new.session_time then
    new.session_minutes := (extract(epoch from (new.session_end_time - new.session_time)) / 60)::int;
  end if;
  return new;
end $$;
revoke all on function app_private.fill_attendance_session() from public, anon, authenticated;

create trigger attendance_records_fill_session before insert or update on public.attendance_records
  for each row execute function app_private.fill_attendance_session();

-- ---------------------------------------------------------------------
-- 4. The 8 registers taken before this change, matched to County Junior's
--    timetable as confirmed by Simon (19 Oct 2026). Several had the time the
--    register was taken recorded as the start time.
-- ---------------------------------------------------------------------
with map(session_date, old_time, dow, slot_start) as (values
  (date '2026-08-26', time '06:00', 3, time '06:00'),  -- before the season start (31 Aug); same slot
  (date '2026-09-08', time '20:12', 2, time '20:00'),
  (date '2026-09-09', time '06:10', 3, time '06:00'),
  (date '2026-09-15', time '06:00', 2, time '06:00'),
  (date '2026-09-24', time '22:36', 4, time '19:45'),
  (date '2026-09-28', time '06:30', 1, time '06:00'),  -- includes the one Mid Sussex Marlins mark
  (date '2026-09-29', time '21:22', 2, time '20:00')
),
slot as (
  select m.session_date, m.old_time, ts.id, ts.start_time, ts.end_time
  from map m
  join public.squads sq on sq.club = 'Crawley Swimming Club' and sq.name = 'County Junior'
  join public.timetables t on t.squad_id = sq.id and t.is_active
  join public.timetable_sessions ts on ts.timetable_id = t.id and ts.is_active is not false
   and ts.day_of_week = m.dow and ts.start_time = m.slot_start
)
update public.attendance_records a
   set session_time = s.start_time,
       session_end_time = s.end_time,
       timetable_session_id = s.id,
       session_minutes = (extract(epoch from (s.end_time - s.start_time)) / 60)::int
  from slot s
 where a.session_date = s.session_date and a.session_time = s.old_time;

