-- Fix: since 20261016142142 made club_id NOT NULL on attendance_records,
-- stopwatch_times and squad_memberships, no client sends it and nothing
-- filled it, so every new attendance mark, stopwatch time and squad
-- membership failed. swimmer_feedback.club_id (nullable) was left blank.
--
-- These BEFORE INSERT triggers fill club_id when the client leaves it out,
-- using the same rules as the original backfill. A club_id the client does
-- send is kept as-is.
--
-- SECURITY DEFINER so the lookup isn't hidden by the caller's RLS on
-- clubs / squads / memberships; it only ever reads, and RLS on the target
-- table still decides whether the row may be written at all.

create or replace function app_private.club_id_for_swimmer(p_swimmer uuid, p_on date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    -- the squad the swimmer was in on that date (latest join wins)
    (select sm.club_id
       from public.squad_memberships sm
      where sm.swimmer_id = p_swimmer
        and coalesce(p_on, current_date) between sm.joined_squad_on and coalesce(sm.ended_on, 'infinity'::date)
      order by sm.joined_squad_on desc
      limit 1),
    -- otherwise the club named on the swimmer
    (select c.id from public.swimmers s join public.clubs c on c.name = s.club
      where s.id = p_swimmer)
  );
$$;

create or replace function app_private.fill_club_id() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.club_id is not null then
    return new;
  end if;

  if tg_table_name = 'attendance_records' then
    new.club_id := app_private.club_id_for_swimmer(new.swimmer_id, new.session_date);
  elsif tg_table_name = 'swimmer_feedback' then
    new.club_id := app_private.club_id_for_swimmer(new.swimmer_id, new.session_date);
  elsif tg_table_name = 'stopwatch_times' then
    new.club_id := coalesce(
      (select c.id from public.clubs c where c.name = new.club),
      app_private.club_id_for_swimmer(new.swimmer_id, new.session_date));
  elsif tg_table_name = 'squad_memberships' then
    new.club_id := (select sq.club_id from public.squads sq where sq.id = new.squad_id);
  end if;

  return new;
end $$;

revoke all on function app_private.club_id_for_swimmer(uuid, date) from public, anon, authenticated;
revoke all on function app_private.fill_club_id() from public, anon, authenticated;

create trigger attendance_records_fill_club_id before insert on public.attendance_records
  for each row execute function app_private.fill_club_id();
create trigger swimmer_feedback_fill_club_id before insert on public.swimmer_feedback
  for each row execute function app_private.fill_club_id();
create trigger stopwatch_times_fill_club_id before insert on public.stopwatch_times
  for each row execute function app_private.fill_club_id();
create trigger squad_memberships_fill_club_id before insert on public.squad_memberships
  for each row execute function app_private.fill_club_id();

-- Feedback written since 16 Oct without a club.
update public.swimmer_feedback f
   set club_id = app_private.club_id_for_swimmer(f.swimmer_id, f.session_date)
 where f.club_id is null;
