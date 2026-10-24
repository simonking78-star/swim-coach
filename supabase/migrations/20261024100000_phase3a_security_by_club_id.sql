-- Club & squad normalisation · Phase 3a: security rules use club_id
-- Spec: claude/specs/club-and-squad-normalisation.md
-- Applied to production 24 Oct 2026 via a self-checking script (1,104 before/after
-- checks across 8 test roles, 0 differences). This file is the same change without the test harness.
--
-- * Fixes the Phase 2 fill-in trigger (a club-name change kept the old club_id), creates
--   unknown clubs automatically, and adds it to squads / stopwatch / test tables.
-- * Re-syncs any drifted club_id.
-- * Id-based core: app_private.eff_roles_c, can_c, in_club_c, swimmer_row_visible_c, *_club_id helpers.
-- * Text can() / in_club() become wrappers; swimmer_ids, can_swimmer, swimmer_visible, can_see_user use ids.
-- * Every row-level security rule that passed a club name now passes club_id.

do $p3a$
declare
  t text; n bigint; new_clubs int; pol record; e_using text; e_check text; rewritten int := 0; leftover int;
  both_tabs text[] := array['swimmers','swim_results','seasons','session_plans','drills_library','squad_feedback',
    'squad_drill_weeks','squad_month_snapshots','user_roles','role_test_mode','swimmer_archive','app_events',
    'app_feedback','squads','stopwatch_times','test_set_templates','test_sessions','test_results'];
begin
  set local lock_timeout = '5s';

  -- 1. Fill-in trigger: fixed for updates, creates unknown clubs, runs as owner
  create or replace function app_private.fill_club_both() returns trigger
  language plpgsql security definer set search_path = '' as $f$
  begin
    if tg_op = 'UPDATE' then
      if new.club is distinct from old.club and new.club_id is not distinct from old.club_id then
        new.club_id := null;                       -- name changed: recompute the id
      elsif new.club_id is distinct from old.club_id and new.club is not distinct from old.club then
        new.club := null;                          -- id changed: recompute the name
      end if;
    end if;
    if new.club_id is null and new.club is not null then
      select c.id into new.club_id from public.clubs c where c.name = new.club;
      if new.club_id is null then
        insert into public.clubs (name, is_coaching) values (new.club, false) returning id into new.club_id;
      end if;
    elsif new.club is null and new.club_id is not null then
      select c.name into new.club from public.clubs c where c.id = new.club_id;
    end if;
    return new;
  end $f$;

  foreach t in array array['squads','stopwatch_times','test_set_templates','test_sessions','test_results'] loop
    execute format('create trigger %I before insert or update of club, club_id on public.%I
                    for each row execute function app_private.fill_club_both()', t || '_fill_club_both', t);
  end loop;

  -- 2. Re-sync: every club name has a clubs row, every club_id matches its name
  insert into public.clubs (name, is_coaching)
  select distinct x.club, false from (
    select club from public.swimmers union select club from public.swim_results union select club from public.squads
    union select club from public.seasons union select club from public.session_plans union select club from public.user_roles) x
  where x.club is not null and not exists (select 1 from public.clubs c where c.name = x.club);
  get diagnostics new_clubs = row_count;

  foreach t in array both_tabs loop
    execute format('update public.%I x set club_id = c.id from public.clubs c
                    where c.name = x.club and x.club_id is distinct from c.id', t);
    get diagnostics n = row_count;
    if n > 0 then raise notice 'Re-synced club_id on % rows of %', n, t; end if;
  end loop;

  -- 3. Id-based core
  create or replace function app_private.eff_roles_c() returns table(role text, club_id uuid)
  language sql stable security definer set search_path = '' as $f$
    select t.role, t.club_id from app_private.test_row() t where t.role is not null
    union all
    select r.role, r.club_id from public.user_roles r
    where r.user_id = auth.uid() and (app_private.test_row()).role is null;
  $f$;

  create or replace function app_private.can_c(p_section text, p_write boolean, p_club uuid default null,
                                                p_squad uuid default null, p_swimmer uuid default null)
  returns boolean language sql stable security definer set search_path = '' as $f$
    select exists (
      select 1 from app_private.eff_roles_c() r
      cross join lateral (select app_private.level(p_section, r.role) as lv) l
      where (r.club_id is null or p_club is null or r.club_id = p_club)
        and case l.lv
              when 'E'  then true
              when 'R'  then not p_write
              when 'SE' then p_squad is not null and p_squad in (select app_private.my_squads())
              when 'SR' then not p_write and p_squad is not null and p_squad in (select app_private.my_squads())
              when 'CR' then not p_write and p_swimmer is not null and p_swimmer in (select app_private.my_swimmers())
              else false
            end);
  $f$;

  -- old text version: same answers, now via ids (an unknown club name matches no club)
  create or replace function app_private.can(p_section text, p_write boolean, p_club text default null,
                                              p_squad uuid default null, p_swimmer uuid default null)
  returns boolean language sql stable security definer set search_path = '' as $f$
    select app_private.can_c(p_section, p_write,
             case when p_club is null then null
                  else coalesce((select c.id from public.clubs c where c.name = p_club),
                                '00000000-0000-0000-0000-000000000000'::uuid) end,
             p_squad, p_swimmer);
  $f$;

  create or replace function app_private.in_club_c(p_club uuid) returns boolean
  language sql stable security definer set search_path = '' as $f$
    select exists (select 1 from app_private.eff_roles_c() r where r.club_id is null or r.club_id = p_club);
  $f$;

  create or replace function app_private.in_club(p_club text) returns boolean
  language sql stable security definer set search_path = '' as $f$
    select app_private.in_club_c(coalesce((select c.id from public.clubs c where c.name = p_club),
                                          '00000000-0000-0000-0000-000000000000'::uuid));
  $f$;

  create or replace function app_private.swimmer_ids(p_section text, p_write boolean) returns setof uuid
  language sql stable security definer set search_path = '' as $f$
    with me as (
      select coalesce(array(select app_private.my_squads()), '{}') as squads,
             coalesce(array(select app_private.my_swimmers()), '{}') as kids
    )
    select distinct s.id
    from public.swimmers s
    join app_private.eff_roles_c() r on (r.club_id is null or r.club_id = s.club_id)
    cross join me
    cross join lateral (select app_private.level(p_section, r.role) as lv) l
    where case l.lv
            when 'E'  then true
            when 'R'  then not p_write
            when 'SE' then s.squad_id = any(me.squads)
            when 'SR' then not p_write and s.squad_id = any(me.squads)
            when 'CR' then not p_write and s.id = any(me.kids)
            else false
          end;
  $f$;

  create or replace function app_private.can_swimmer(p_section text, p_write boolean, p_swimmer uuid) returns boolean
  language sql stable security definer set search_path = '' as $f$
    select coalesce((select app_private.can_c(p_section, p_write, s.club_id, s.squad_id, s.id)
                     from public.swimmers s where s.id = p_swimmer), false);
  $f$;

  create or replace function app_private.swimmer_row_visible_c(p_club uuid, p_squad uuid, p_swimmer uuid) returns boolean
  language sql stable security definer set search_path = '' as $f$
    select app_private.can_c('roster', false, p_club, p_squad, p_swimmer)
        or app_private.can_c('attendance', false, p_club, p_squad, p_swimmer)
        or app_private.can_c('feedback', false, p_club, p_squad, p_swimmer)
        or app_private.can_c('stopwatch', false, p_club, p_squad, p_swimmer)
        or app_private.can_c('stats', false, p_club, p_squad, p_swimmer);
  $f$;

  create or replace function app_private.swimmer_visible(p_swimmer uuid) returns boolean
  language sql stable security definer set search_path = '' as $f$
    select coalesce((select app_private.swimmer_row_visible_c(s.club_id, s.squad_id, s.id)
                     from public.swimmers s where s.id = p_swimmer), false);
  $f$;

  create or replace function app_private.can_see_user(p_user uuid) returns boolean
  language sql stable security definer set search_path = '' as $f$
    select p_user = auth.uid()
        or exists (select 1 from app_private.eff_roles_c() r where r.role = 'superadmin')
        or exists (select 1 from public.user_roles ur
                   where ur.user_id = p_user and ur.club_id is not null and app_private.can_c('admin', false, ur.club_id));
  $f$;

  -- club_id helpers for child tables
  create or replace function app_private.squad_club_id(p uuid) returns uuid language sql stable security definer set search_path = '' as
    $f$ select club_id from public.squads where id = p $f$;
  create or replace function app_private.swimmer_club_id(p uuid) returns uuid language sql stable security definer set search_path = '' as
    $f$ select club_id from public.swimmers where id = p $f$;
  create or replace function app_private.season_club_id(p uuid) returns uuid language sql stable security definer set search_path = '' as
    $f$ select club_id from public.seasons where id = p $f$;
  create or replace function app_private.season_comp_club_id(p uuid) returns uuid language sql stable security definer set search_path = '' as
    $f$ select app_private.season_club_id(season_id) from public.season_competitions where id = p $f$;
  create or replace function app_private.macro_club_id(p uuid) returns uuid language sql stable security definer set search_path = '' as
    $f$ select s.club_id from public.macros m join public.seasons s on s.id = m.season_id where m.id = p $f$;
  create or replace function app_private.micro_club_id(p uuid) returns uuid language sql stable security definer set search_path = '' as
    $f$ select app_private.macro_club_id(macro_id) from public.micros where id = p $f$;
  create or replace function app_private.timetable_club_id(p uuid) returns uuid language sql stable security definer set search_path = '' as
    $f$ select app_private.squad_club_id(squad_id) from public.timetables where id = p $f$;
  create or replace function app_private.test_session_club_id(p uuid) returns uuid language sql stable security definer set search_path = '' as
    $f$ select club_id from public.test_sessions where id = p $f$;

  -- same access as the existing app_private functions: signed-in users only
  revoke all on function app_private.eff_roles_c(), app_private.can_c(text, boolean, uuid, uuid, uuid),
    app_private.in_club_c(uuid), app_private.swimmer_row_visible_c(uuid, uuid, uuid),
    app_private.squad_club_id(uuid), app_private.swimmer_club_id(uuid), app_private.season_club_id(uuid),
    app_private.season_comp_club_id(uuid), app_private.macro_club_id(uuid), app_private.micro_club_id(uuid),
    app_private.timetable_club_id(uuid), app_private.test_session_club_id(uuid) from public;
  grant execute on function app_private.eff_roles_c(), app_private.can_c(text, boolean, uuid, uuid, uuid),
    app_private.in_club_c(uuid), app_private.swimmer_row_visible_c(uuid, uuid, uuid),
    app_private.squad_club_id(uuid), app_private.swimmer_club_id(uuid), app_private.season_club_id(uuid),
    app_private.season_comp_club_id(uuid), app_private.macro_club_id(uuid), app_private.micro_club_id(uuid),
    app_private.timetable_club_id(uuid), app_private.test_session_club_id(uuid) to authenticated;

  -- 4. Rewrite every security rule that passes a club name
  create or replace function app_private._p3_tx(e text) returns text language sql immutable as $f$
    select regexp_replace(regexp_replace(regexp_replace(regexp_replace(e,
      'app_private\.can\((''[a-z]+''::text, (true|false)), club\M',
        'app_private.can_c(\1, club_id', 'g'),
      'app_private\.can\((''[a-z]+''::text, (true|false)), app_private\.([a-z_]+)_club\(',
        'app_private.can_c(\1, app_private.\3_club_id(', 'g'),
      'app_private\.in_club\(club\)', 'app_private.in_club_c(club_id)', 'g'),
      '\(club IS NOT NULL\)', '(club_id IS NOT NULL)', 'g');
  $f$;

  for pol in
    select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public'
  loop
    e_using := app_private._p3_tx(pol.qual);
    e_check := app_private._p3_tx(pol.with_check);
    if e_using is distinct from pol.qual or e_check is distinct from pol.with_check then
      if pol.qual is not null and pol.with_check is not null then
        execute format('alter policy %I on public.%I using (%s) with check (%s)', pol.policyname, pol.tablename, e_using, e_check);
      elsif pol.qual is not null then
        execute format('alter policy %I on public.%I using (%s)', pol.policyname, pol.tablename, e_using);
      else
        execute format('alter policy %I on public.%I with check (%s)', pol.policyname, pol.tablename, e_check);
      end if;
      rewritten := rewritten + 1;
    end if;
  end loop;
  drop function app_private._p3_tx(text);

  select count(*) into leftover from pg_policies where schemaname = 'public'
    and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(app_private\.can\(''[a-z]+''::text, (true|false), )|app_private\.in_club\(';
  if leftover > 0 then
    raise exception 'Security rules still passing club names: %', leftover;
  end if;
  raise notice 'Phase 3a: % security rules now use club_id.', rewritten;
end $p3a$;
