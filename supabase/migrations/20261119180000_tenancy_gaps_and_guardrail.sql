-- Tenancy foundations · close the last cross-club gaps and add a guardrail
-- Spec: claude/specs/tenancy-scope.md · follows Phase 6 of the club & squad normalisation.
--
-- 1. drill_periodisation and drill_set_line_archive: rules now check the club of the parent drill /
--    session plan. Until now any coach in any club could read and edit every club's rows.
-- 2. assessments (Squad ADA): gains swimmer_id and club_id (table is empty), the same rules as
--    swimmer_feedback, and a fill trigger so the Squad ADA app's name-based inserts still work.
--    The two Squad ADA views carry swimmer_id and club_id and stay security invoker.
-- 3. app_private.tenancy_scope: the register of every public table without a club_id, saying why
--    (shared reference data, scoped through a parent, platform-only, or legacy).
-- 4. app_private.tenancy_exposure(): release check, like anon_exposure(). Must return no ERROR rows.
--    A table with RLS on and no policies is fine when no app role has a grant (swimmer_archive).
-- 5. guard_tenancy event trigger: a new public table must have club_id or be registered first.
-- Written as one statement block so the SQL Editor runs it as a single transaction.

do $tenancy$
declare
  v_def text;
  v_new text;
  v_bad int;
begin
  -- 1. Child tables of drills and session plans ---------------------------------------------------
  create or replace function app_private.drill_club_id(p uuid) returns uuid
  language sql stable security definer set search_path = '' as $f$
    select coalesce((select club_id from public.drills_library where id = p), '00000000-0000-0000-0000-000000000000'::uuid) $f$;
  create or replace function app_private.session_plan_club_id(p uuid) returns uuid
  language sql stable security definer set search_path = '' as $f$
    select coalesce((select club_id from public.session_plans where id = p), '00000000-0000-0000-0000-000000000000'::uuid) $f$;
  revoke all on function app_private.drill_club_id(uuid) from public, anon;
  revoke all on function app_private.session_plan_club_id(uuid) from public, anon;
  grant execute on function app_private.drill_club_id(uuid) to authenticated;
  grant execute on function app_private.session_plan_club_id(uuid) to authenticated;

  drop policy if exists rbac_select on public.drill_periodisation;
  drop policy if exists rbac_insert on public.drill_periodisation;
  drop policy if exists rbac_update on public.drill_periodisation;
  drop policy if exists rbac_delete on public.drill_periodisation;
  create policy rbac_select on public.drill_periodisation for select to authenticated
    using (app_private.can_c('plans', false, app_private.drill_club_id(drill_id)));
  create policy rbac_insert on public.drill_periodisation for insert to authenticated
    with check (app_private.can_c('plans', true, app_private.drill_club_id(drill_id)));
  create policy rbac_update on public.drill_periodisation for update to authenticated
    using (app_private.can_c('plans', true, app_private.drill_club_id(drill_id)))
    with check (app_private.can_c('plans', true, app_private.drill_club_id(drill_id)));
  create policy rbac_delete on public.drill_periodisation for delete to authenticated
    using (app_private.can_c('plans', true, app_private.drill_club_id(drill_id)));

  drop policy if exists rbac_select on public.drill_set_line_archive;
  drop policy if exists rbac_insert on public.drill_set_line_archive;
  drop policy if exists rbac_update on public.drill_set_line_archive;
  drop policy if exists rbac_delete on public.drill_set_line_archive;
  create policy rbac_select on public.drill_set_line_archive for select to authenticated
    using (app_private.can_c('plans', false, app_private.session_plan_club_id(session_plan_id)));
  create policy rbac_insert on public.drill_set_line_archive for insert to authenticated
    with check (app_private.can_c('plans', true, app_private.session_plan_club_id(session_plan_id)));
  create policy rbac_update on public.drill_set_line_archive for update to authenticated
    using (app_private.can_c('plans', true, app_private.session_plan_club_id(session_plan_id)))
    with check (app_private.can_c('plans', true, app_private.session_plan_club_id(session_plan_id)));
  create policy rbac_delete on public.drill_set_line_archive for delete to authenticated
    using (app_private.can_c('plans', true, app_private.session_plan_club_id(session_plan_id)));

  -- 2. assessments (Squad ADA) ----------------------------------------------------------------------
  select count(*) into v_bad from public.assessments;
  if v_bad > 0 then
    raise exception 'Tenancy: assessments has % rows; this step assumes it is empty', v_bad;
  end if;
  alter table public.assessments
    add column if not exists swimmer_id uuid not null references public.swimmers(id) on delete cascade,
    add column if not exists club_id    uuid not null references public.clubs(id);
  create index if not exists assessments_swimmer_assessed on public.assessments (swimmer_id, assessed_at desc);
  create index if not exists assessments_club on public.assessments (club_id);

  -- The Squad ADA app sends swimmer_name only: find the swimmer by name in the caller's clubs.
  -- The club always comes from the swimmer.
  create or replace function app_private.assessment_fill() returns trigger
  language plpgsql security definer set search_path = '' as $f$
  declare v_n int;
  begin
    if new.swimmer_id is null then
      select count(*), min(s.id::text)::uuid into v_n, new.swimmer_id
        from public.swimmers s
       where s.active and lower(btrim(s.full_name)) = lower(btrim(new.swimmer_name))
         and s.id in (select app_private.swimmer_ids('feedback', true));
      if v_n <> 1 then
        raise exception 'Choose the swimmer from the list: "%" matches % swimmers you can assess', new.swimmer_name, v_n;
      end if;
    end if;
    select s.club_id, coalesce(nullif(btrim(new.swimmer_name), ''), s.full_name)
      into new.club_id, new.swimmer_name
      from public.swimmers s where s.id = new.swimmer_id;
    return new;
  end $f$;
  revoke all on function app_private.assessment_fill() from public, anon;
  drop trigger if exists assessments_fill on public.assessments;
  create trigger assessments_fill before insert or update of swimmer_id, swimmer_name on public.assessments
    for each row execute function app_private.assessment_fill();

  drop policy if exists "Authenticated users can insert assessments" on public.assessments;
  drop policy if exists "Authenticated users can read assessments" on public.assessments;
  drop policy if exists coaches_insert on public.assessments;
  drop policy if exists coaches_select_all on public.assessments;
  drop policy if exists coaches_update_own on public.assessments;
  drop policy if exists coaches_delete_own on public.assessments;
  create policy rbac_select on public.assessments for select to authenticated
    using (swimmer_id in (select app_private.swimmer_ids('feedback', false)));
  create policy rbac_insert on public.assessments for insert to authenticated
    with check (swimmer_id in (select app_private.swimmer_ids('feedback', true)));
  create policy rbac_update on public.assessments for update to authenticated
    using (swimmer_id in (select app_private.swimmer_ids('feedback', true)))
    with check (swimmer_id in (select app_private.swimmer_ids('feedback', true)));
  create policy rbac_delete on public.assessments for delete to authenticated
    using (swimmer_id in (select app_private.swimmer_ids('feedback', true)));

  -- Views: one row per swimmer (not per name), with the swimmer and club ids.
  create or replace view public.latest_per_swimmer with (security_invoker = true) as
    select distinct on (swimmer_id) swimmer_name, "group", coach_email, scores, notes, assessed_at, swimmer_id, club_id
      from public.assessments
     order by swimmer_id, assessed_at desc;

  v_def := pg_get_viewdef('public.rolling_90day'::regclass);
  v_new := replace(v_def, E'AS avg_total_score\n   FROM assessments', E'AS avg_total_score,\n    swimmer_id,\n    club_id\n   FROM assessments');
  v_new := replace(v_new, E'GROUP BY swimmer_name, "group"', E'GROUP BY swimmer_name, "group", swimmer_id, club_id');
  if v_new = v_def or position('swimmer_id, club_id' in v_new) = 0 then
    raise exception 'Tenancy: rolling_90day view definition not in the expected shape';
  end if;
  execute 'create or replace view public.rolling_90day with (security_invoker = true) as ' || v_new;

  -- 3. Register of tables without club_id -----------------------------------------------------------
  create table if not exists app_private.tenancy_scope (
    relname text primary key,
    scope   text not null check (scope in ('shared', 'child', 'platform', 'legacy')),
    via     text,
    note    text
  );
  revoke all on app_private.tenancy_scope from public, anon, authenticated;
  insert into app_private.tenancy_scope (relname, scope, via, note) values
    ('club_codes',                'shared',   null, 'Swim England club code list'),
    ('clubs',                     'shared',   null, 'Club register; every club_id points here'),
    ('competitions',              'shared',   null, 'Licensed meets (public, anon-readable)'),
    ('competition_files',         'shared',   null, 'Meet documents (public, anon-readable)'),
    ('conversion_factors',        'shared',   null, 'SC/LC conversion factors'),
    ('development_targets',       'shared',   null, 'Shared across clubs (decided 19 Nov 2026)'),
    ('galas',                     'shared',   null, 'Meet calendar and county QTs. is_home_meet is Crawley-relative: fix when galas merge into competitions'),
    ('mm_determinants',           'shared',   null, 'Metrics & Measures reference'),
    ('qualifying_times',          'shared',   null, 'County qualifying times'),
    ('competition_events',        'child',    'season_competitions → seasons', null),
    ('drill_periodisation',       'child',    'drills_library', null),
    ('drill_set_line_archive',    'child',    'session_plans', null),
    ('macro_competitions',        'child',    'macros → seasons', null),
    ('macro_squads',              'child',    'macros → seasons', null),
    ('macros',                    'child',    'seasons', null),
    ('micro_sessions',            'child',    'micros → macros → seasons', null),
    ('micros',                    'child',    'macros → seasons', null),
    ('mm_trials',                 'child',    'swimmers', null),
    ('season_breaks',             'child',    'seasons', null),
    ('season_competitions',       'child',    'seasons', null),
    ('term_targets',              'child',    'vocabulary_terms', null),
    ('timetable_session_overrides','child',   'timetable_sessions → timetables → squads', null),
    ('timetable_sessions',        'child',    'timetables → squads', null),
    ('timetables',                'child',    'squads', null),
    ('user_squads',               'child',    'squads', null),
    ('user_swimmers',             'child',    'swimmers', null),
    ('app_dev_specs',             'platform', null, 'Superadmin only'),
    ('app_dev_tasks',             'platform', null, 'Superadmin only (appdev section)'),
    ('app_users',                 'platform', null, 'Per user, via can_see_user'),
    ('user_home_layout',          'platform', null, 'Own row only'),
    ('coaches',                   'legacy',   null, 'Squad ADA login list, superadmin only. Retire when Squad ADA uses user_roles')
  on conflict (relname) do update set scope = excluded.scope, via = excluded.via, note = excluded.note;

  -- 4. Release check ------------------------------------------------------------------------------------
  create or replace function app_private.tenancy_exposure()
  returns table(severity text, kind text, object text, detail text)
  language sql stable security definer set search_path = '' as $f$
    with t as (
      select c.oid, c.relname, c.relrowsecurity as rls,
             exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'club_id' and not a.attisdropped) as has_club,
             (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as npol,
             (select s.scope from app_private.tenancy_scope s where s.relname = c.relname) as scope
        from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p'))
    select 'ERROR', 'rls_off', relname::text, 'Row level security is off' from t where not rls
    union all
    select 'ERROR', 'no_policies', relname::text, 'RLS on, no policies, but app roles have grants' from t
     where rls and npol = 0 and (has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE')
                                 or has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE'))
    union all
    select 'ERROR', 'unscoped', relname::text, 'No club_id and not in app_private.tenancy_scope' from t where not has_club and scope is null
    union all
    select 'WARN', 'club_ignored', p.tablename::text, p.policyname || ': can_c with no club on a table that has club_id'
      from pg_policies p join t on t.relname = p.tablename
     where p.schemaname = 'public' and t.has_club
       and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') ~ 'can_c\(''[a-z]+''::text, (true|false)\)'
    union all
    select 'WARN', 'stale_register', s.relname, 'Registered but no such table' from app_private.tenancy_scope s
     where not exists (select 1 from t where t.relname = s.relname);
  $f$;
  revoke all on function app_private.tenancy_exposure() from public, anon, authenticated;

  -- 5. Guardrail for new tables ----------------------------------------------------------------------
  create or replace function app_private.guard_tenancy() returns event_trigger
  language plpgsql set search_path = '' as $f$
  declare r record;
  begin
    for r in select c.relname
               from pg_event_trigger_ddl_commands() d
               join pg_class c on c.oid = d.objid
              where d.schema_name = 'public' and d.object_type = 'table' and c.relkind in ('r', 'p')
                and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'club_id' and not a.attisdropped)
                and not exists (select 1 from app_private.tenancy_scope s where s.relname = c.relname)
    loop
      raise exception using
        message = format('Blocked: new table public.%s has no club_id and is not registered as shared, child, platform or legacy.', r.relname),
        hint = 'Add club_id uuid not null references public.clubs (see supabase/templates/new_table_rls.sql), '
            || 'or first insert it into app_private.tenancy_scope with the reason.';
    end loop;
  end $f$;
  drop event trigger if exists guard_tenancy;
  create event trigger guard_tenancy on ddl_command_end
    when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
    execute function app_private.guard_tenancy();

  -- Checks ----------------------------------------------------------------------------------------------
  select count(*) into v_bad from app_private.tenancy_exposure() where severity = 'ERROR';
  if v_bad > 0 then raise exception 'Tenancy: tenancy_exposure() reports % errors', v_bad; end if;
  select count(*) into v_bad from app_private.anon_exposure();
  if v_bad > 0 then raise exception 'Tenancy: anon_exposure() returned % rows', v_bad; end if;
end
$tenancy$;
