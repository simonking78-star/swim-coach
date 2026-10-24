-- Helpers limited to their own squads (Stopwatch and Test & Assess)
-- Applied to production 24 Oct 2026 via a self-checking script (only the helper role changed).
-- * Access matrix: stopwatch → helper goes from E (whole club) to SE (own squads).
-- * test_sessions rules pass the session's squad, so helpers can run tests for their own squad only.
-- The app's copy of the matrix (web/src/lib/access.ts) has the same change.

create or replace function app_private.level(p_section text, p_role text) returns text
language sql immutable set search_path = '' as $f$
  select coalesce(('{
    "attendance":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"SE"},
    "feedback":  {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"SE","parent":"CR","swimmer":"CR"},
    "plans":     {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"R"},
    "timetables":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"R","helper":"R","parent":"R","swimmer":"R"},
    "season":    {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"R"},
    "roster":    {"superadmin":"E","club_admin":"E","head_coach":"R","coach":"SR","helper":"SR","parent":"CR"},
    "stats":     {"superadmin":"E","club_admin":"R","head_coach":"R","coach":"R","parent":"CR","swimmer":"CR"},
    "stopwatch": {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"SE"},
    "admin":     {"superadmin":"E","club_admin":"E"},
    "appdev":    {"superadmin":"E"}
  }'::jsonb -> p_section ->> p_role), 'N');
$f$;

alter policy rbac_insert on public.test_sessions
  with check (app_private.can_c('stopwatch', true, club_id, squad_id));
alter policy rbac_update on public.test_sessions
  using (app_private.can_c('stopwatch', true, club_id, squad_id))
  with check (app_private.can_c('stopwatch', true, club_id, squad_id));
alter policy rbac_select on public.test_sessions
  using (app_private.can_c('stopwatch', false, club_id, squad_id) or app_private.can_c('stats', false, club_id));
