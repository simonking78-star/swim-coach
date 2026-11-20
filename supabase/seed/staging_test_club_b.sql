-- STAGING ONLY (zefgaemhqgczyqwamfjs). Never run on production.
-- A-070: a second coaching club on staging so app_private.cross_club_check() has two clubs to
-- test against. Testley is club A; this is club B. Fictional names only.
-- Re-runnable: does nothing if "Test Club B" already exists.
do $$
declare
  v_club uuid; v_sq1 uuid; v_sq2 uuid; v_season uuid;
begin
  if exists (select 1 from public.clubs where name = 'Test Club B') then
    raise notice 'Test Club B already exists'; return;
  end if;
  if exists (select 1 from public.clubs where name = 'Crawley Swimming Club') then
    raise exception 'This looks like production. Test Club B is for staging only.';
  end if;

  insert into public.clubs (name, short_name, is_coaching) values ('Test Club B', 'TCB', true) returning id into v_club;
  insert into public.squads (name, club_id) values ('TCB Juniors', v_club) returning id into v_sq1;
  insert into public.squads (name, club_id) values ('TCB Seniors', v_club) returning id into v_sq2;

  insert into public.swimmers (full_name, club_id, squad_id, active, gender, date_of_birth)
  select 'TCB Swimmer ' || g, v_club, case when g <= 4 then v_sq1 else v_sq2 end, true,
         case when g % 2 = 0 then 'Female' else 'Male' end, make_date(2014 - g, 1 + g, 10)
  from generate_series(1, 8) g;

  insert into public.seasons (title, start_date, finish_date, club_id)
  values ('TCB 2026/27', '2026-09-01', '2027-08-31', v_club) returning id into v_season;
  insert into public.season_squads (season_id, squad_id, club_id) values (v_season, v_sq1, v_club), (v_season, v_sq2, v_club);
  insert into public.timetables (squad_id, season_start, season_end, season_id, season_title)
  values (v_sq1, '2026-09-01', '2027-08-31', v_season, 'TCB 2026/27');

  -- A little recorded activity, so club A's personas have club B rows to try to reach.
  insert into public.attendance_records (club_id, swimmer_id, session_date, session_time, pool_size, present)
  select v_club, w.id, current_date - 7, '18:00', '25m', true from public.swimmers w where w.club_id = v_club;
  insert into public.swimmer_feedback (club_id, swimmer_id, entry_type, session_date, category, thread_id, status)
  select v_club, w.id, 'status', current_date - 7, 'Free', gen_random_uuid(), 'Started'
  from public.swimmers w where w.club_id = v_club order by w.full_name limit 2;
end $$;
