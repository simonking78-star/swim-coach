-- Coaches: session plans for their own squads only (decided 21 Nov 2026).
-- Spec: claude/specs/role-based-access.md ("Session plans by squad")
--
-- New section "squad_plans" in the role matrix: superadmin / club_admin / head_coach E, coach SE,
-- helper R (unchanged from "plans"). It applies to session plans and the rows hanging off them:
-- session_plans, session_plan_sets, plan_line_usage, drill_set_line_archive.
-- A plan with no squad (club-wide template) keeps the club-wide "plans" level, so coaches can still
-- read and write those. Shared libraries (drills, glossary, shorthand, test-set templates) keep
-- "plans" and stay club-wide.
-- Attendance, stopwatch and statistics are unchanged (coaches still see every swimmer in the club).

-- 1. Role matrix --------------------------------------------------------------------------------
create or replace function app_private.level(p_section text, p_role text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select coalesce(('{
    "attendance":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"SE"},
    "feedback":  {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"SE","parent":"CR","swimmer":"CR"},
    "plans":     {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"R"},
    "squad_plans":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"SE","helper":"R"},
    "timetables":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"R","helper":"R","parent":"R","swimmer":"R"},
    "season":    {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"R"},
    "roster":    {"superadmin":"E","club_admin":"E","head_coach":"R","coach":"SR","helper":"SR","parent":"CR"},
    "stats":     {"superadmin":"E","club_admin":"R","head_coach":"R","coach":"R","parent":"CR","swimmer":"CR"},
    "stopwatch": {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"SE"},
    "admin":     {"superadmin":"E","club_admin":"E"},
    "appdev":    {"superadmin":"E"},
    "membership":{"superadmin":"E","club_admin":"E","head_coach":"R"},
    "medical":   {"superadmin":"E","club_admin":"E","head_coach":"R","coach":"SR"},
    "registrations":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"SE"}
  }'::jsonb -> p_section ->> p_role), 'N');
$function$;

-- 2. One rule for a plan: by squad if it has one, club-wide if it doesn't -------------------
create or replace function app_private.plan_ok(p_club uuid, p_squad uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select case when p_squad is null then app_private.can_c('plans', p_write, coalesce(p_club, '00000000-0000-0000-0000-000000000000'::uuid))
              else app_private.can_c('squad_plans', p_write, coalesce(p_club, '00000000-0000-0000-0000-000000000000'::uuid), p_squad) end;
$fn$;
revoke all on function app_private.plan_ok(uuid, uuid, boolean) from public, anon;
grant execute on function app_private.plan_ok(uuid, uuid, boolean) to authenticated;

-- Same rule for rows that point at a plan. No plan found = no access.
create or replace function app_private.plan_ok_id(p_plan uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce((select app_private.plan_ok(p.club_id, p.squad_id, p_write) from public.session_plans p where p.id = p_plan), false);
$fn$;
revoke all on function app_private.plan_ok_id(uuid, boolean) from public, anon;
grant execute on function app_private.plan_ok_id(uuid, boolean) to authenticated;

-- Squads the caller may write plans for at a club (for the apps' squad lists).
create or replace function public.my_plan_squads(p_club uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.id from public.squads s where s.club_id = p_club and app_private.plan_ok(p_club, s.id, true);
$fn$;
revoke all on function public.my_plan_squads(uuid) from public, anon;
grant execute on function public.my_plan_squads(uuid) to authenticated;

-- 3. Rules ----------------------------------------------------------------------------------------
-- session_plans
alter policy rbac_select on public.session_plans using (app_private.plan_ok(club_id, squad_id, false));
alter policy rbac_insert on public.session_plans with check (app_private.plan_ok(club_id, squad_id, true));
alter policy rbac_update on public.session_plans using (app_private.plan_ok(club_id, squad_id, true))
  with check (app_private.plan_ok(club_id, squad_id, true));
alter policy rbac_delete on public.session_plans using (app_private.plan_ok(club_id, squad_id, true));

-- session_plan_sets (rows of a plan; their club must be the plan's club)
alter policy rbac_select on public.session_plan_sets using (app_private.plan_ok_id(session_plan_id, false)
  and club_id = app_private.session_plan_club_id(session_plan_id));
alter policy rbac_insert on public.session_plan_sets with check (app_private.plan_ok_id(session_plan_id, true)
  and club_id = app_private.session_plan_club_id(session_plan_id));
alter policy rbac_update on public.session_plan_sets using (app_private.plan_ok_id(session_plan_id, true)
  and club_id = app_private.session_plan_club_id(session_plan_id))
  with check (app_private.plan_ok_id(session_plan_id, true) and club_id = app_private.session_plan_club_id(session_plan_id));
alter policy rbac_delete on public.session_plan_sets using (app_private.plan_ok_id(session_plan_id, true)
  and club_id = app_private.session_plan_club_id(session_plan_id));

-- plan_line_usage (has its own club and squad; may have no plan)
alter policy rbac_select on public.plan_line_usage using (app_private.plan_ok(club_id, squad_id, false));
alter policy rbac_insert on public.plan_line_usage with check (app_private.plan_ok(club_id, squad_id, true));
alter policy rbac_delete on public.plan_line_usage using (app_private.plan_ok(club_id, squad_id, true));

-- drill_set_line_archive (drill lines taken from a plan)
alter policy rbac_select on public.drill_set_line_archive using (app_private.plan_ok_id(session_plan_id, false));
alter policy rbac_insert on public.drill_set_line_archive with check (app_private.plan_ok_id(session_plan_id, true));
alter policy rbac_update on public.drill_set_line_archive using (app_private.plan_ok_id(session_plan_id, true))
  with check (app_private.plan_ok_id(session_plan_id, true));
alter policy rbac_delete on public.drill_set_line_archive using (app_private.plan_ok_id(session_plan_id, true));
