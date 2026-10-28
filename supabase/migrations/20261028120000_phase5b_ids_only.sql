-- Club & squad normalisation · Phase 5b: the database stops depending on club and squad names
-- Spec: claude/specs/club-and-squad-normalisation.md (readiness check, 28 Oct 2026)
-- Needs Phases 1–4 (20261024090000 … 20261024120000). Additive for the app: the old name-based
-- functions keep the same signatures (now thin wrappers), so /classic/ keeps working until Phase 6.
--
-- 1. Writes may send only club_id. On insert, a given club_id now always decides the club name,
--    so a column default ('Crawley Swimming Club') can no longer disagree with the id.
--    The four club-name defaults are dropped.
-- 2. test_sessions.squad_name is filled from squad_id (the app no longer sends it).
--    test_results takes the club name from the club id.
-- 3. The id versions of the server functions become the real ones; the name versions wrap them:
--    home_stats, squad_month_review_all, squad_review_allowed, squad_month_figures,
--    list_deactivated_swimmers, can_grant_role. snapshot_squad_month uses the id version.
-- 4. Role helpers read club_id: eff_roles (name from clubs), stats_any, has_any_role, club_id_for_swimmer.
-- 5. Security rules: squad_snap_select checks club_id; rules calling can(section, write) with no club
--    now call can_c(section, write).
-- Still name-based after this, dropped in Phase 6: public.squad_month_review(text) (old report, not
-- used by the app) and the unused text helpers squad_club, swimmer_club, season_club, season_comp_club,
-- macro_club, micro_club, timetable_club, test_session_club, swimmer_row_visible, in_club, can.

-- ---------------------------------------------------------------------------
-- Helper: id for a club name. An unknown name gives an id that matches no club,
-- so a wrong name can never widen a query to "all clubs". Null stays null.
-- ---------------------------------------------------------------------------
create or replace function app_private.club_id_named(p text) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when p is null then null
              else coalesce((select c.id from public.clubs c where c.name = p),
                            '00000000-0000-0000-0000-000000000000'::uuid) end;
$$;
revoke all on function app_private.club_id_named(text) from public, anon;
grant execute on function app_private.club_id_named(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. club_id decides the name on insert; drop the club-name defaults
-- ---------------------------------------------------------------------------
create or replace function app_private.fill_club_both() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
  if tg_op = 'INSERT' and new.club_id is not null then
    -- The id is the source of truth: overwrite any name (including a column default).
    select c.name into new.club from public.clubs c where c.id = new.club_id;
    return new;
  end if;
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

alter table public.swimmers       alter column club drop default;
alter table public.squads         alter column club drop default;
alter table public.session_plans  alter column club drop default;
alter table public.drills_library alter column club drop default;

-- ---------------------------------------------------------------------------
-- 2. Test & Assess copies
-- ---------------------------------------------------------------------------
create or replace function app_private.fill_test_session_squad() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
  -- Kept for the classic app until Phase 6 drops test_sessions.squad_name.
  if new.squad_id is null then
    new.squad_name := null;
  elsif tg_op = 'INSERT' or new.squad_id is distinct from old.squad_id or new.squad_name is null then
    select q.name into new.squad_name from public.squads q where q.id = new.squad_id;
  end if;
  return new;
end $f$;
revoke all on function app_private.fill_test_session_squad() from public, anon, authenticated;

create trigger test_sessions_fill_squad before insert or update of squad_id, squad_name on public.test_sessions
  for each row execute function app_private.fill_test_session_squad();

create or replace function app_private.test_result_fill() returns trigger
language plpgsql security definer set search_path = '' as $f$
declare s public.test_sessions%rowtype;
begin
  select * into s from public.test_sessions where id = new.session_id;
  new.template_id   := s.template_id;
  new.template_name := s.template_name;
  new.club_id       := s.club_id;
  new.club          := (select c.name from public.clubs c where c.id = s.club_id);  -- copy dropped in Phase 6
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

-- ---------------------------------------------------------------------------
-- 4. Role helpers read club_id
-- ---------------------------------------------------------------------------
create or replace function app_private.eff_roles() returns table(role text, club text)
language sql stable security definer set search_path = '' as $$
  select r.role, c.name from app_private.eff_roles_c() r left join public.clubs c on c.id = r.club_id;
$$;

create or replace function app_private.stats_any() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app_private.eff_roles_c() r where app_private.level('stats', r.role) in ('E','R'));
$$;

create or replace function app_private.club_id_for_swimmer(p_swimmer uuid, p_on date) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select sm.club_id
       from public.squad_memberships sm
      where sm.swimmer_id = p_swimmer
        and coalesce(p_on, current_date) between sm.joined_squad_on and coalesce(sm.ended_on, 'infinity'::date)
      order by sm.joined_squad_on desc
      limit 1),
    (select s.club_id from public.swimmers s where s.id = p_swimmer)
  );
$$;

-- has_any_role: same answer, read from the id-based roles
do $har$
declare d text;
begin
  d := pg_get_functiondef('app_private.has_any_role()'::regprocedure);
  if position('app_private.eff_roles()' in d) > 0 then
    execute replace(d, 'app_private.eff_roles()', 'app_private.eff_roles_c()');
  end if;
end $har$;

-- ---------------------------------------------------------------------------
-- 3. Server functions: id versions are the real ones, name versions wrap them
-- ---------------------------------------------------------------------------

-- home_stats (counts run under the caller's security rules)
create or replace function public.home_stats(p_club_id uuid) returns jsonb
language sql stable set search_path = '' as $function$
  with sq as (
    select s.id, s.name
    from public.squads s
    where p_club_id is null or s.club_id = p_club_id
  ),
  members as (
    select m.squad_id, count(distinct m.swimmer_id) as n
    from public.squad_memberships m
    join public.swimmers sw on sw.id = m.swimmer_id and coalesce(sw.active, true)
    where m.ended_on is null and m.squad_id in (select id from sq)
    group by m.squad_id
  ),
  swimmer_fb as (
    select m.squad_id,
           count(f.id) as total,
           count(f.id) filter (where f.created_at >= now() - interval '30 days') as last_30
    from public.squad_memberships m
    join public.swimmer_feedback f on f.swimmer_id = m.swimmer_id
    where m.ended_on is null and m.squad_id in (select id from sq)
    group by m.squad_id
  ),
  squad_fb as (
    select f.squad_id,
           count(*) as total,
           count(*) filter (where f.created_at >= now() - interval '30 days') as last_30
    from public.squad_feedback f
    where f.is_active and f.squad_id in (select id from sq)
    group by f.squad_id
  )
  select jsonb_build_object(
    'clubs',            (select count(distinct club_id) from public.squads),
    'swimmers',         (select count(*) from public.swimmers where coalesce(active, true)),
    'pbs',              (select count(*) from public.swim_results where is_pb),
    'feedback',         (select count(*) from public.swimmer_feedback)
                      + (select count(*) from public.squad_feedback where is_active),
    'feedback_30d',     (select count(*) from public.swimmer_feedback where created_at >= now() - interval '30 days')
                      + (select count(*) from public.squad_feedback where is_active and created_at >= now() - interval '30 days'),
    'squads', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sq.id,
               'name', sq.name,
               'swimmers', coalesce(members.n, 0),
               'swimmer_feedback', coalesce(swimmer_fb.total, 0),
               'swimmer_feedback_30d', coalesce(swimmer_fb.last_30, 0),
               'squad_feedback', coalesce(squad_fb.total, 0),
               'squad_feedback_30d', coalesce(squad_fb.last_30, 0)
             ) order by sq.name)
      from sq
      left join members    on members.squad_id = sq.id
      left join swimmer_fb on swimmer_fb.squad_id = sq.id
      left join squad_fb   on squad_fb.squad_id = sq.id
    ), '[]'::jsonb)
  );
$function$;

create or replace function public.home_stats(p_club text default null) returns jsonb
language sql stable set search_path = '' as $$
  select public.home_stats(app_private.club_id_named(p_club));
$$;

-- squad_month_review_all: the id version is derived from the live name version, which
-- only uses the club in its squad list. Each replacement must match exactly once.
do $smr$
declare d text; n int;
begin
  d := pg_get_functiondef('app_private.squad_month_review_all(text,date,date)'::regprocedure);
  foreach n in array array[
    (length(d) - length(replace(d, 'p_club text', ''))) / length('p_club text'),
    (length(d) - length(replace(d, 'select s.id, s.name, s.club from public.squads s', ''))) / length('select s.id, s.name, s.club from public.squads s'),
    (length(d) - length(replace(d, 'where s.club = p_club', ''))) / length('where s.club = p_club')] loop
    if n <> 1 then raise exception 'squad_month_review_all has changed shape; update this migration (match count %)', n; end if;
  end loop;
  d := replace(d, 'p_club text', 'p_club_id uuid');
  d := replace(d, 'select s.id, s.name, s.club from public.squads s', 'select s.id, s.name, s.club_id from public.squads s');
  d := replace(d, 'where s.club = p_club', 'where s.club_id = p_club_id');
  if d ~ '\mp_club\M' or d ~ '\ms\.club\M' then raise exception 'squad_month_review_all still mentions the club name'; end if;
  execute d;
end $smr$;
revoke all on function app_private.squad_month_review_all(uuid, date, date) from public, anon, authenticated;

create or replace function app_private.squad_month_review_all(p_club text, p_from date, p_to date)
returns table(month date, squad_id uuid, squad_name text, members integer, sessions integer, marks integer,
  present numeric, attendance_pct numeric, swimmers_attending integer, swims integer, swimmers_raced integer,
  pbs integer, improved_swims integer, avg_improvement_pct numeric, median_improvement_pct numeric,
  status_entries integer, st_not_discussed integer, st_started integer, st_developing integer, st_embedded integer,
  skill_score numeric, skill_moves_up integer, skill_moves_down integer, feedback_entries integer,
  feedback_notes integer, positive_feedback_pct numeric, squad_entries integer, drills_worked integer,
  excused integer, hours_trained numeric, hours_per_swimmer numeric)
language sql stable set search_path = '' as $$
  select * from app_private.squad_month_review_all(app_private.club_id_named(p_club), p_from, p_to);
$$;

-- squad_review_allowed
create or replace function public.squad_review_allowed(p_club_id uuid, p_squad uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then false
    else app_private.can_c('stats', false, p_club_id) and app_private.can_c('feedback', false, p_club_id, p_squad)
  end;
$$;
revoke all on function public.squad_review_allowed(uuid, uuid) from public, anon;
grant execute on function public.squad_review_allowed(uuid, uuid) to authenticated;

create or replace function public.squad_review_allowed(p_club text, p_squad uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.squad_review_allowed(app_private.club_id_named(p_club), p_squad);
$$;

-- squad_month_figures (runs as owner; squad_review_allowed decides what the caller sees)
create or replace function public.squad_month_figures(p_club_id uuid, p_from date, p_to date)
returns table(month date, squad_id uuid, squad_name text, members integer, sessions integer, marks integer,
  present numeric, attendance_pct numeric, swimmers_attending integer, swims integer, swimmers_raced integer,
  pbs integer, improved_swims integer, avg_improvement_pct numeric, median_improvement_pct numeric,
  status_entries integer, st_not_discussed integer, st_started integer, st_developing integer, st_embedded integer,
  skill_score numeric, skill_moves_up integer, skill_moves_down integer, feedback_entries integer,
  feedback_notes integer, positive_feedback_pct numeric, squad_entries integer, drills_worked integer,
  excused integer, hours_trained numeric, hours_per_swimmer numeric)
language sql stable security definer set search_path = '' as $$
  select r.* from app_private.squad_month_review_all(p_club_id, p_from, p_to) r
  where public.squad_review_allowed(p_club_id, r.squad_id);
$$;

create or replace function public.squad_month_figures(p_club text, p_from date, p_to date)
returns table(month date, squad_id uuid, squad_name text, members integer, sessions integer, marks integer,
  present numeric, attendance_pct numeric, swimmers_attending integer, swims integer, swimmers_raced integer,
  pbs integer, improved_swims integer, avg_improvement_pct numeric, median_improvement_pct numeric,
  status_entries integer, st_not_discussed integer, st_started integer, st_developing integer, st_embedded integer,
  skill_score numeric, skill_moves_up integer, skill_moves_down integer, feedback_entries integer,
  feedback_notes integer, positive_feedback_pct numeric, squad_entries integer, drills_worked integer,
  excused integer, hours_trained numeric, hours_per_swimmer numeric)
language sql stable security definer set search_path = '' as $$
  select * from public.squad_month_figures(app_private.club_id_named(p_club), p_from, p_to);
$$;

-- Monthly snapshot job: by club id
create or replace function public.snapshot_squad_month(p_month date default ((date_trunc('month', now()) - interval '1 month'))::date)
returns integer language plpgsql set search_path = '' as $$
declare n int := 0; k int; c record;
begin
  for c in select distinct cl.id from public.squads s join public.clubs cl on cl.id = s.club_id loop
    insert into public.squad_month_snapshots (club_id, squad_id, month, metrics, generated_at)
    select c.id, r.squad_id, r.month, to_jsonb(r) - 'month' - 'squad_id', now()
    from app_private.squad_month_review_all(c.id, p_month, p_month) r
    on conflict (club_id, squad_id, month) do update
      set metrics = excluded.metrics, generated_at = excluded.generated_at;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;

-- list_deactivated_swimmers (admin only)
create or replace function public.list_deactivated_swimmers(p_club_id uuid)
returns table(swimmer_id uuid, full_name text, anon_name text, date_of_birth date, squad_id uuid, squad text,
  reason text, deactivated_on date, result_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_club_id is null or not app_private.can_c('admin', true, p_club_id) then
    raise exception 'Only an administrator can view deactivated swimmers';
  end if;
  return query
    select a.swimmer_id, a.full_name, s.full_name, a.date_of_birth, a.squad_id, a.squad,   -- a.squad: frozen snapshot
           a.reason, a.deactivated_on,
           (select count(*) from public.swim_results r where r.swimmer_id = a.swimmer_id)
      from public.swimmer_archive a
      join public.swimmers s on s.id = a.swimmer_id
     where s.club_id = p_club_id
     order by a.full_name;
end;
$$;

create or replace function public.list_deactivated_swimmers(p_club text)
returns table(swimmer_id uuid, full_name text, anon_name text, date_of_birth date, squad_id uuid, squad text,
  reason text, deactivated_on date, result_count bigint)
language sql stable security definer set search_path = '' as $$
  select * from public.list_deactivated_swimmers(app_private.club_id_named(p_club));
$$;

-- can_grant_role
create or replace function public.can_grant_role(p_role text, p_club_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select case
    when p_role = 'superadmin' then app_private.real_super() and not exists (select 1 from app_private.test_row() t where t.role is not null)
    when p_club_id is null then false
    else app_private.can_c('admin', true, p_club_id)
  end;
$$;

create or replace function public.can_grant_role(p_role text, p_club text) returns boolean
language sql stable set search_path = '' as $$
  select public.can_grant_role(p_role, app_private.club_id_named(p_club));
$$;

-- Same access as before for every function this file creates or replaces
revoke all on function public.home_stats(uuid), public.home_stats(text),
  public.squad_month_figures(uuid, date, date), public.squad_month_figures(text, date, date),
  public.list_deactivated_swimmers(uuid), public.list_deactivated_swimmers(text),
  public.can_grant_role(text, uuid), public.can_grant_role(text, text),
  public.squad_review_allowed(text, uuid) from public, anon;
grant execute on function public.home_stats(uuid), public.home_stats(text),
  public.squad_month_figures(uuid, date, date), public.squad_month_figures(text, date, date),
  public.list_deactivated_swimmers(uuid), public.list_deactivated_swimmers(text),
  public.can_grant_role(text, uuid), public.can_grant_role(text, text),
  public.squad_review_allowed(text, uuid) to authenticated;
revoke all on function public.snapshot_squad_month(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Security rules
-- ---------------------------------------------------------------------------
alter policy squad_snap_select on public.squad_month_snapshots
  using (public.squad_review_allowed(club_id, squad_id));

-- Rules that call can(section, write) with no club: same check through can_c
do $pol$
declare p record; u text; w text;
begin
  for p in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public'
           and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'app_private\.can\(''[a-z]+''::text, (true|false)\)'
  loop
    u := regexp_replace(p.qual,       'app_private\.can\((''[a-z]+''::text, (true|false))\)', 'app_private.can_c(\1)', 'g');
    w := regexp_replace(p.with_check, 'app_private\.can\((''[a-z]+''::text, (true|false))\)', 'app_private.can_c(\1)', 'g');
    if p.qual is not null and p.with_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', p.policyname, p.tablename, u, w);
    elsif p.qual is not null then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, u);
    else
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, w);
    end if;
  end loop;
end $pol$;

notify pgrst, 'reload schema';
