-- =====================================================================
-- Anon-exposure guard (2026-10-16) — stops the A-013/A-014 creep returning
--
-- 1. app_private.anon_exposure()  — the pre-release check. Returns one row
--    per problem; ZERO rows = pass. Run it before every release:
--        select * from app_private.anon_exposure();
-- 2. Event trigger guard_anon_policies — refuses, at creation time, any
--    policy in public that is granted to anon/PUBLIC on a table outside
--    app_private.anon_read_allowlist, and any anon write policy at all.
--    New tables must use supabase/templates/new_table_rls.sql.
-- =====================================================================

create or replace function app_private.anon_exposure()
returns table (severity text, kind text, object text, detail text)
language sql stable
set search_path to ''
as $$
  -- anon/PUBLIC policies that allow writing (never allowed)
  select 'FAIL', 'anon write policy', p.tablename || '.' || p.policyname, p.cmd
  from pg_policies p
  where p.schemaname = 'public' and p.roles && array['anon','public']::name[]
    and p.cmd in ('INSERT','UPDATE','DELETE','ALL')
  union all
  -- anon/PUBLIC read policies on anything not allowlisted
  select 'FAIL', 'anon read policy (not allowlisted)', p.tablename || '.' || p.policyname, p.cmd
  from pg_policies p
  where p.schemaname = 'public' and p.roles && array['anon','public']::name[]
    and p.cmd = 'SELECT'
    and p.tablename not in (select relname from app_private.anon_read_allowlist)
  union all
  -- anon table/view privileges beyond SELECT on the allowlist
  select 'FAIL', 'anon privilege', c.relname, pr.priv
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) pr(priv)
  where n.nspname = 'public' and c.relkind in ('r','v','m','p')
    and has_table_privilege('anon', c.oid, pr.priv)
    and not (pr.priv = 'SELECT' and c.relname in (select relname from app_private.anon_read_allowlist))
  union all
  -- tables without RLS
  select 'FAIL', 'RLS disabled', c.relname, 'enable row level security'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
  union all
  -- views that bypass RLS
  select 'FAIL', 'security definer view', c.relname, 'set (security_invoker = true)'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce('security_invoker=true' = any(c.reloptions), false)
  union all
  -- SECURITY DEFINER functions callable signed-out
  select 'FAIL', 'definer function callable by anon', p.oid::regprocedure::text, 'revoke execute from public, anon'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
  union all
  -- storage: anon may only ever read allowlisted buckets
  select 'FAIL', 'storage anon policy', p.policyname, p.cmd
  from pg_policies p
  where p.schemaname = 'storage' and p.roles && array['anon','public']::name[]
    and not (p.cmd = 'SELECT' and p.qual like '%competition-files%')
  union all
  select 'FAIL', 'public storage bucket', b.id, 'set public = false'
  from storage.buckets b
  where b.public and b.id <> 'competition-files';
$$;
revoke all on function app_private.anon_exposure() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Creation-time guard
-- ---------------------------------------------------------------------
create or replace function app_private.guard_anon_policies()
returns event_trigger
language plpgsql
set search_path to ''
as $$
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
      hint = 'Create policies "to authenticated" using app_private.can(...) — see supabase/templates/new_table_rls.sql. '
          || 'Read-only public data must first be added to app_private.anon_read_allowlist.';
  end loop;
end $$;

drop event trigger if exists guard_anon_policies;
create event trigger guard_anon_policies on ddl_command_end
  when tag in ('CREATE POLICY', 'ALTER POLICY')
  execute function app_private.guard_anon_policies();
