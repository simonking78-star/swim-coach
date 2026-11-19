-- Club & squad normalisation · Phase 6b: drop the club-name columns and the name-based functions
-- Spec: claude/specs/club-and-squad-normalisation.md (Phase 6)
-- Needs Phase 6a (20261119160000) and the app release that retires /classic/ and reads
-- user_roles.club_id (PR #36). Skills write club_id only (club-skills-status.md).
--
-- 1. Keep a copy of every club name being dropped in app_private.phase6_backup.
-- 2. Remove the two-way name/id fill: fill_club_both and fill_club_id_by_name triggers and functions.
--    swimmer_archive and app_events keep their club column as a snapshot, filled from club_id on insert.
-- 3. fill_club_id and test_result_fill stop reading or writing club names.
-- 4. Replace the indexes built on the name column with club_id versions.
-- 5. Drop the club column from 16 tables.
-- 6. Drop the name-based functions: the text versions of can, in_club, swimmer_row_visible,
--    squad_review_allowed, squad_month_review(_all), squad_month_figures, home_stats,
--    list_deactivated_swimmers, can_grant_role; eff_roles(); club_id_named; and the text helpers
--    macro_club, micro_club, season_club, season_comp_club, squad_club, swimmer_club,
--    test_session_club, timetable_club.
-- Written as one statement block so the SQL Editor runs it as a single transaction.

do $phase6b$
declare
  t   text;
  r   record;
  v_tables text[] := array['app_feedback','drills_library','role_test_mode','seasons','session_plans',
                           'squad_drill_weeks','squad_feedback','squad_month_snapshots','squads',
                           'stopwatch_times','swim_results','swimmers','test_results','test_sessions',
                           'test_set_templates','user_roles'];
  v_bad int;
begin
  -- 0. Data check: every named row has its club_id.
  foreach t in array v_tables loop
    execute format('select count(*) from public.%I where club is not null and club_id is null', t) into v_bad;
    if v_bad > 0 then
      raise exception 'Phase 6b stopped: % rows of public.% have a club name but no club_id', v_bad, t;
    end if;
  end loop;

  -- 1. Backup ---------------------------------------------------------------------------------
  create table if not exists app_private.phase6_backup (
    tbl text not null, col text not null, row_key jsonb not null, val text,
    saved_at timestamptz not null default now());
  revoke all on app_private.phase6_backup from public, anon, authenticated;

  foreach t in array v_tables loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = t and column_name = 'id') then
      execute format($q$insert into app_private.phase6_backup (tbl, col, row_key, val)
                       select %L, 'club', jsonb_build_object('id', id), club from public.%I where club is not null$q$, t, t);
    else
      execute format($q$insert into app_private.phase6_backup (tbl, col, row_key, val)
                       select %L, 'club', to_jsonb(x) - 'club', x.club from public.%I x where x.club is not null$q$, t, t);
    end if;
  end loop;

  -- 2. Name/id fill triggers -------------------------------------------------------------------
  for r in select tg.tgname, c.relname
             from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
             join pg_proc p on p.oid = tg.tgfoid join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'app_private' and p.proname in ('fill_club_both', 'fill_club_id_by_name')
              and not tg.tgisinternal loop
    execute format('drop trigger %I on public.%I', r.tgname, r.relname);
  end loop;
  drop function if exists app_private.fill_club_both();
  drop function if exists app_private.fill_club_id_by_name();

  -- Snapshot tables keep the name as it was when the row was written.
  create or replace function app_private.fill_club_name_snapshot() returns trigger
  language plpgsql security definer set search_path = '' as $f$
  begin
    if new.club is null and new.club_id is not null then
      select c.name into new.club from public.clubs c where c.id = new.club_id;
    end if;
    return new;
  end $f$;
  revoke all on function app_private.fill_club_name_snapshot() from public, anon;
  create trigger swimmer_archive_club_snapshot before insert on public.swimmer_archive
    for each row execute function app_private.fill_club_name_snapshot();
  create trigger app_events_club_snapshot before insert on public.app_events
    for each row execute function app_private.fill_club_name_snapshot();

  -- 3. Remaining fill functions read ids only -----------------------------------------------------
  create or replace function app_private.fill_club_id() returns trigger
  language plpgsql security definer set search_path = '' as $f$
  begin
    if new.club_id is not null then
      return new;
    end if;
    if tg_table_name in ('attendance_records', 'swimmer_feedback', 'stopwatch_times') then
      new.club_id := app_private.club_id_for_swimmer(new.swimmer_id, new.session_date);
    elsif tg_table_name = 'squad_memberships' then
      new.club_id := (select sq.club_id from public.squads sq where sq.id = new.squad_id);
    end if;
    return new;
  end $f$;

  create or replace function app_private.test_result_fill() returns trigger
  language plpgsql security definer set search_path = '' as $f$
  declare s public.test_sessions%rowtype;
  begin
    select * into s from public.test_sessions where id = new.session_id;
    new.template_id   := s.template_id;
    new.template_name := s.template_name;
    new.club_id       := s.club_id;
    new.session_date  := s.session_date;
    if new.year_of_birth is null then
      select year_of_birth into new.year_of_birth from public.swimmers where id = new.swimmer_id;
    end if;
    new.age := case when new.year_of_birth is null then null
                    else extract(year from s.session_date)::int - new.year_of_birth end;
    select coalesce(sum((v->>'done')::int), 0), coalesce(sum((v->>'reps')::int), 0)
      into new.reps_done, new.reps_total
      from jsonb_each(coalesce(new.rounds, '{}'::jsonb)) as e(k, v);
    new.score := case when new.age is null or new.level is null then null
                      else new.age * new.level * new.reps_done end;
    new.updated_at := now();
    return new;
  end $f$;

  create or replace function app_private.guard_anon_policies() returns event_trigger
  language plpgsql set search_path = '' as $f$
  declare r record;
  begin
    for r in
      select p.tablename, p.policyname, p.cmd from pg_policies p
      where p.schemaname = 'public' and p.roles && array['anon','public']::name[]
        and (p.cmd <> 'SELECT'
             or p.tablename not in (select relname from app_private.anon_read_allowlist))
    loop
      raise exception using
        message = format('Blocked: policy "%s" on public.%s gives signed-out (anon) users %s access.',
                         r.policyname, r.tablename, r.cmd),
        hint = 'Create policies "to authenticated" using app_private.can_c(...) — see supabase/templates/new_table_rls.sql. '
            || 'Read-only public data must first be added to app_private.anon_read_allowlist.';
    end loop;
  end $f$;

  -- 4. Indexes on club_id instead of the name --------------------------------------------------
  create unique index if not exists squads_club_id_name_key on public.squads (club_id, name);
  create unique index if not exists test_set_templates_club_id_name on public.test_set_templates (club_id, lower(name)) where active;
  create index if not exists test_sessions_club_id_date on public.test_sessions (club_id, session_date desc);

  -- 5. Drop the columns (their name-based indexes go with them) -----------------------------------
  foreach t in array v_tables loop
    execute format('alter table public.%I drop column if exists club', t);
  end loop;

  -- 6. Name-based functions ----------------------------------------------------------------------
  drop function if exists app_private.swimmer_row_visible(text, uuid, uuid);
  drop function if exists app_private.can(text, boolean, text, uuid, uuid);
  drop function if exists app_private.in_club(text);
  drop function if exists app_private.eff_roles();
  drop function if exists public.squad_review_allowed(text, uuid);
  drop function if exists public.squad_month_review(text, date, date);
  drop function if exists public.squad_month_figures(text, date, date);
  drop function if exists app_private.squad_month_review_all(text, date, date);
  drop function if exists public.home_stats(text);
  drop function if exists public.list_deactivated_swimmers(text);
  drop function if exists public.can_grant_role(text, text);
  drop function if exists app_private.club_id_named(text);
  drop function if exists app_private.micro_club(uuid);
  drop function if exists app_private.macro_club(uuid);
  drop function if exists app_private.season_comp_club(uuid);
  drop function if exists app_private.season_club(uuid);
  drop function if exists app_private.timetable_club(uuid);
  drop function if exists app_private.squad_club(uuid);
  drop function if exists app_private.swimmer_club(uuid);
  drop function if exists app_private.test_session_club(uuid);

  -- Checks ------------------------------------------------------------------------------------------
  select count(*) into v_bad from information_schema.columns
   where table_schema = 'public' and column_name in ('club', 'squad', 'squad_name')
     and table_name not in ('swimmer_archive', 'app_events');
  if v_bad > 0 then raise exception 'Phase 6b: % name columns still present', v_bad; end if;
  select count(*) into v_bad from app_private.anon_exposure();
  if v_bad > 0 then raise exception 'Phase 6b: anon_exposure() returned % rows', v_bad; end if;

  raise notice 'Phase 6b: club-name columns dropped from % tables (% values kept in app_private.phase6_backup).',
    array_length(v_tables, 1), (select count(*) from app_private.phase6_backup where col = 'club');
end
$phase6b$;
