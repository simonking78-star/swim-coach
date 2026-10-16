-- =====================================================================
-- TEMPLATE — every new table in public starts from this.
-- Replace <table> and <section>. Sections (the roles × sections matrix):
--   attendance, feedback, plans, timetables, season, roster, stats,
--   stopwatch, admin, appdev
-- app_private.can(section, write?, club, squad_id, swimmer_id) applies the
-- role rules; pass whatever scoping columns the table has.
--
-- NEVER write "to anon" or leave out "to authenticated" (no "to" = PUBLIC,
-- which includes anon). The guard_anon_policies event trigger will refuse
-- it, and app_private.anon_exposure() will fail the release check.
-- =====================================================================

alter table public.<table> enable row level security;

create policy rbac_select on public.<table> for select to authenticated
  using (app_private.can('<section>', false, club));
create policy rbac_insert on public.<table> for insert to authenticated
  with check (app_private.can('<section>', true, club));
create policy rbac_update on public.<table> for update to authenticated
  using (app_private.can('<section>', true, club))
  with check (app_private.can('<section>', true, club));
create policy rbac_delete on public.<table> for delete to authenticated
  using (app_private.can('<section>', true, club));

-- Child tables without a club column: resolve it through the parent, as
-- the season tables do, e.g. app_private.can('season', true, app_private.season_club(season_id)).

-- Belt and braces: no table-level grant for anon (default privileges already
-- withhold it since 20261016120000_anon_cutover.sql).
revoke all on public.<table> from anon;

-- Before release:  select * from app_private.anon_exposure();   -- must return 0 rows
