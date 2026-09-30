-- Role-based access (roles × sections matrix agreed 2026-09-30, roadmap §4).
-- Signed-in users get role policies below. Anonymous (signed-out) access is left
-- exactly as before so the live app keeps working during testing; removing it is
-- the separate cut-over step (A-013 / A-014).

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

-- ---------- link tables ----------
create table if not exists public.user_squads (
  user_id uuid not null references auth.users(id) on delete cascade,
  squad_id uuid not null references public.squads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, squad_id)
);
comment on table public.user_squads is 'Squads a coach/helper covers ("own squads" in the permission matrix).';

create table if not exists public.user_swimmers (
  user_id uuid not null references auth.users(id) on delete cascade,
  swimmer_id uuid not null references public.swimmers(id) on delete cascade,
  relationship text not null check (relationship in ('parent','swimmer')),
  created_at timestamptz not null default now(),
  primary key (user_id, swimmer_id)
);
comment on table public.user_swimmers is 'Links a parent account to their child, or a swimmer account to their own record.';

create table if not exists public.role_test_mode (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('superadmin','club_admin','head_coach','coach','helper','parent','swimmer')),
  club text,
  squad_ids uuid[] not null default '{}',
  swimmer_ids uuid[] not null default '{}',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '8 hours'
);
comment on table public.role_test_mode is 'Superadmin-only: while a row is active, the database treats this user as the chosen role (for testing the permission matrix).';

alter table public.user_squads enable row level security;
alter table public.user_swimmers enable row level security;
alter table public.role_test_mode enable row level security;

-- ---------- helper functions (not exposed through the API) ----------
create or replace function app_private.real_super() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'superadmin');
$$;

create or replace function app_private.test_row() returns public.role_test_mode
language sql stable security definer set search_path = '' as $$
  select t.* from public.role_test_mode t
  where t.user_id = auth.uid() and t.expires_at > now() and app_private.real_super();
$$;

create or replace function app_private.eff_roles() returns table(role text, club text)
language sql stable security definer set search_path = '' as $$
  select t.role, t.club from app_private.test_row() t where t.role is not null
  union all
  select r.role, r.club from public.user_roles r
  where r.user_id = auth.uid() and (app_private.test_row()).role is null;
$$;

create or replace function app_private.my_squads() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select unnest((app_private.test_row()).squad_ids) where (app_private.test_row()).role is not null
  union
  select s.squad_id from public.user_squads s
  where s.user_id = auth.uid() and (app_private.test_row()).role is null;
$$;

create or replace function app_private.my_swimmers() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select unnest((app_private.test_row()).swimmer_ids) where (app_private.test_row()).role is not null
  union
  select s.swimmer_id from public.user_swimmers s
  where s.user_id = auth.uid() and (app_private.test_row()).role is null;
$$;

-- The matrix. E = edit, R = read, SE/SR = edit/read own squads, CR = read own child / own record, N = none.
create or replace function app_private.level(p_section text, p_role text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(('{
    "attendance":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"SE"},
    "feedback":  {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"SE","parent":"CR","swimmer":"CR"},
    "plans":     {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"R"},
    "timetables":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"R","helper":"R","parent":"R","swimmer":"R"},
    "season":    {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"R"},
    "roster":    {"superadmin":"E","club_admin":"E","head_coach":"R","coach":"SR","helper":"SR","parent":"CR"},
    "stats":     {"superadmin":"E","club_admin":"R","head_coach":"R","coach":"R","parent":"CR","swimmer":"CR"},
    "stopwatch": {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"E"},
    "admin":     {"superadmin":"E","club_admin":"E"},
    "appdev":    {"superadmin":"E"}
  }'::jsonb -> p_section ->> p_role), 'N');
$$;

create or replace function app_private.can(p_section text, p_write boolean, p_club text default null,
                                           p_squad uuid default null, p_swimmer uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app_private.eff_roles() r
    cross join lateral (select app_private.level(p_section, r.role) as lv) l
    where (r.club is null or p_club is null or r.club = p_club)
      and case l.lv
            when 'E'  then true
            when 'R'  then not p_write
            when 'SE' then p_squad is not null and p_squad in (select app_private.my_squads())
            when 'SR' then not p_write and p_squad is not null and p_squad in (select app_private.my_squads())
            when 'CR' then not p_write and p_swimmer is not null and p_swimmer in (select app_private.my_swimmers())
            else false
          end);
$$;

create or replace function app_private.can_swimmer(p_section text, p_write boolean, p_swimmer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select app_private.can(p_section, p_write, s.club, s.squad_id, s.id)
                   from public.swimmers s where s.id = p_swimmer), false);
$$;

-- A swimmer record is visible if any section that shows swimmers lets this user read it.
create or replace function app_private.swimmer_row_visible(p_club text, p_squad uuid, p_swimmer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.can('roster', false, p_club, p_squad, p_swimmer)
      or app_private.can('attendance', false, p_club, p_squad, p_swimmer)
      or app_private.can('feedback', false, p_club, p_squad, p_swimmer)
      or app_private.can('stopwatch', false, p_club, p_squad, p_swimmer)
      or app_private.can('stats', false, p_club, p_squad, p_swimmer);
$$;
create or replace function app_private.swimmer_visible(p_swimmer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select app_private.swimmer_row_visible(s.club, s.squad_id, s.id)
                   from public.swimmers s where s.id = p_swimmer), false);
$$;

-- Staff with Statistics read can see results from every club (public meet results) for comparisons.
create or replace function app_private.stats_any() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app_private.eff_roles() r where app_private.level('stats', r.role) in ('E','R'));
$$;
create or replace function app_private.has_any_role() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app_private.eff_roles());
$$;
create or replace function app_private.in_club(p_club text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app_private.eff_roles() r where r.club is null or r.club = p_club);
$$;

create or replace function app_private.squad_club(p uuid) returns text
language sql stable security definer set search_path = '' as $$ select club from public.squads where id = p $$;
create or replace function app_private.season_club(p uuid) returns text
language sql stable security definer set search_path = '' as $$ select club from public.seasons where id = p $$;
create or replace function app_private.macro_club(p uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.club from public.macros m join public.seasons s on s.id = m.season_id where m.id = p $$;
create or replace function app_private.micro_club(p uuid) returns text
language sql stable security definer set search_path = '' as $$
  select app_private.macro_club(macro_id) from public.micros where id = p $$;
create or replace function app_private.timetable_club(p uuid) returns text
language sql stable security definer set search_path = '' as $$
  select app_private.squad_club(squad_id) from public.timetables where id = p $$;
create or replace function app_private.season_comp_club(p uuid) returns text
language sql stable security definer set search_path = '' as $$
  select app_private.season_club(season_id) from public.season_competitions where id = p $$;
create or replace function app_private.swimmer_club(p uuid) returns text
language sql stable security definer set search_path = '' as $$ select club from public.swimmers where id = p $$;

revoke all on all functions in schema app_private from public, anon;
grant execute on all functions in schema app_private to authenticated;

-- ---------- existing open policies: anonymous only from now on ----------
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename not in ('assessments','coaches','user_roles','app_dev_tasks')
             and (roles && array['public','authenticated']::name[])
  loop
    execute format('alter policy %I on public.%I to anon', p.policyname, p.tablename);
  end loop;
end $$;

drop policy if exists app_dev_select on public.app_dev_tasks;
drop policy if exists app_dev_insert on public.app_dev_tasks;
drop policy if exists app_dev_update on public.app_dev_tasks;
drop policy if exists user_roles_read_own on public.user_roles;

-- ---------- role policies for signed-in users ----------
create or replace function pg_temp.rbac(t text, r text, w text, with_delete boolean default true) returns void
language plpgsql as $$
begin
  execute format('create policy rbac_select on public.%I for select to authenticated using (%s)', t, r);
  execute format('create policy rbac_insert on public.%I for insert to authenticated with check (%s)', t, w);
  execute format('create policy rbac_update on public.%I for update to authenticated using (%s) with check (%s)', t, w, w);
  if with_delete then
    execute format('create policy rbac_delete on public.%I for delete to authenticated using (%s)', t, w);
  end if;
end $$;

select pg_temp.rbac('attendance_records',
  $x$app_private.can_swimmer('attendance', false, swimmer_id)$x$,
  $x$app_private.can_swimmer('attendance', true, swimmer_id)$x$);
select pg_temp.rbac('swimmer_feedback',
  $x$app_private.can_swimmer('feedback', false, swimmer_id)$x$,
  $x$app_private.can_swimmer('feedback', true, swimmer_id)$x$);
select pg_temp.rbac('stopwatch_times',
  $x$app_private.can_swimmer('stopwatch', false, swimmer_id)$x$,
  $x$app_private.can_swimmer('stopwatch', true, swimmer_id)$x$);
select pg_temp.rbac('swimmers',
  $x$app_private.swimmer_row_visible(club, squad_id, id)$x$,
  $x$app_private.can('roster', true, club, squad_id, id)$x$);
select pg_temp.rbac('squad_memberships',
  $x$app_private.swimmer_visible(swimmer_id)$x$,
  $x$app_private.can_swimmer('roster', true, swimmer_id)$x$);
select pg_temp.rbac('swim_results',
  $x$(select app_private.stats_any()) or app_private.swimmer_visible(swimmer_id)$x$,
  $x$app_private.can_swimmer('stats', true, swimmer_id)$x$);
select pg_temp.rbac('squads',
  $x$app_private.in_club(club)$x$,
  $x$app_private.can('roster', true, club)$x$);
select pg_temp.rbac('session_plans',
  $x$app_private.can('plans', false, club)$x$,
  $x$app_private.can('plans', true, club)$x$);
select pg_temp.rbac('drills_library',
  $x$app_private.can('plans', false, club)$x$,
  $x$app_private.can('plans', true, club)$x$);
select pg_temp.rbac('drill_periodisation',
  $x$(select app_private.can('plans', false))$x$, $x$(select app_private.can('plans', true))$x$);
select pg_temp.rbac('drill_set_line_archive',
  $x$(select app_private.can('plans', false))$x$, $x$(select app_private.can('plans', true))$x$);
select pg_temp.rbac('timetables',
  $x$app_private.can('timetables', false, app_private.squad_club(squad_id))$x$,
  $x$app_private.can('timetables', true, app_private.squad_club(squad_id))$x$);
select pg_temp.rbac('timetable_sessions',
  $x$app_private.can('timetables', false, app_private.timetable_club(timetable_id))$x$,
  $x$app_private.can('timetables', true, app_private.timetable_club(timetable_id))$x$);
select pg_temp.rbac('seasons',
  $x$app_private.can('season', false, club)$x$, $x$app_private.can('season', true, club)$x$);
select pg_temp.rbac('season_breaks',
  $x$app_private.can('season', false, app_private.season_club(season_id))$x$,
  $x$app_private.can('season', true, app_private.season_club(season_id))$x$);
select pg_temp.rbac('season_competitions',
  $x$app_private.can('season', false, app_private.season_club(season_id))$x$,
  $x$app_private.can('season', true, app_private.season_club(season_id))$x$);
select pg_temp.rbac('macros',
  $x$app_private.can('season', false, app_private.season_club(season_id))$x$,
  $x$app_private.can('season', true, app_private.season_club(season_id))$x$);
select pg_temp.rbac('macro_squads',
  $x$app_private.can('season', false, app_private.macro_club(macro_id))$x$,
  $x$app_private.can('season', true, app_private.macro_club(macro_id))$x$);
select pg_temp.rbac('macro_competitions',
  $x$app_private.can('season', false, app_private.macro_club(macro_id))$x$,
  $x$app_private.can('season', true, app_private.macro_club(macro_id))$x$);
select pg_temp.rbac('micros',
  $x$app_private.can('season', false, app_private.macro_club(macro_id))$x$,
  $x$app_private.can('season', true, app_private.macro_club(macro_id))$x$);
select pg_temp.rbac('micro_sessions',
  $x$app_private.can('season', false, app_private.micro_club(micro_id))$x$,
  $x$app_private.can('season', true, app_private.micro_club(micro_id))$x$);
select pg_temp.rbac('competition_events',
  $x$app_private.can('season', false, app_private.season_comp_club(season_competition_id))$x$,
  $x$app_private.can('season', true, app_private.season_comp_club(season_competition_id))$x$);
select pg_temp.rbac('competitions',
  $x$(select app_private.has_any_role())$x$, $x$(select app_private.can('timetables', true))$x$);
select pg_temp.rbac('competition_files',
  $x$(select app_private.has_any_role())$x$, $x$(select app_private.can('timetables', true))$x$);
select pg_temp.rbac('galas',
  $x$(select app_private.has_any_role())$x$, $x$(select app_private.can('timetables', true))$x$);
select pg_temp.rbac('qualifying_times',
  $x$(select app_private.has_any_role())$x$, $x$(select app_private.can('stats', true))$x$);
select pg_temp.rbac('conversion_factors',
  $x$(select app_private.has_any_role())$x$, $x$(select app_private.can('stats', true))$x$);
select pg_temp.rbac('club_codes',
  $x$(select app_private.has_any_role())$x$, $x$(select app_private.can('stats', true))$x$);
select pg_temp.rbac('app_dev_tasks',
  $x$(select app_private.can('appdev', false))$x$, $x$(select app_private.can('appdev', true))$x$, false);

-- Admin: users & roles (club admins manage their own club; only a real superadmin grants superadmin)
select pg_temp.rbac('user_roles',
  $x$user_id = (select auth.uid()) or app_private.can('admin', false, club)$x$,
  $x$app_private.can('admin', true, club) and (role <> 'superadmin' or (select app_private.real_super()))$x$);
select pg_temp.rbac('user_squads',
  $x$user_id = (select auth.uid()) or app_private.can('admin', false, app_private.squad_club(squad_id))$x$,
  $x$app_private.can('admin', true, app_private.squad_club(squad_id))$x$);
select pg_temp.rbac('user_swimmers',
  $x$user_id = (select auth.uid()) or app_private.can('admin', false, app_private.swimmer_club(swimmer_id))$x$,
  $x$app_private.can('admin', true, app_private.swimmer_club(swimmer_id))$x$);

-- Test mode: a real superadmin manages only their own row.
create policy rbac_own on public.role_test_mode for all to authenticated
  using (user_id = (select auth.uid()) and (select app_private.real_super()))
  with check (user_id = (select auth.uid()) and (select app_private.real_super()));

-- What the app needs to know about the signed-in user.
create or replace function public.my_access() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'real_superadmin', app_private.real_super(),
    'testing', (select to_jsonb(t) from public.role_test_mode t
                where t.user_id = auth.uid() and t.expires_at > now()),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('role', r.role, 'club', r.club)) from app_private.eff_roles() r), '[]'::jsonb),
    'squads', coalesce((select jsonb_agg(x) from app_private.my_squads() x), '[]'::jsonb),
    'swimmers', coalesce((select jsonb_agg(x) from app_private.my_swimmers() x), '[]'::jsonb)
  );
$$;
revoke execute on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- Keep the old helper meaningful (real superadmin), used by earlier App dev code.
create or replace function public.is_superadmin() returns boolean
language sql stable security invoker set search_path = '' as $$ select app_private.real_super(); $$;
