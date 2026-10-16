-- =====================================================================
-- A-013 / A-014 — blanket anon cut-over (2026-10-16)
--
-- Every table already has role-based policies for `authenticated`
-- (20260930190000_role_based_access.sql). The old "allow all for anon"
-- policies ran in parallel and were copied onto every new table, so the
-- anon surface kept growing (22 -> 29 write policies, 6 -> 8 personal-data
-- tables readable signed-out). This migration removes anon access in one go
-- and stops it coming back.
--
-- PREREQUISITE: the app's sign-in gate is live (PR security/sign-in-cutover)
-- and everyone who uses the app has an invited account. After this runs,
-- signed-out requests get nothing except the published competition calendar.
--
-- The only thing anon may still do (the allowlist, also used by the guard):
--   SELECT on public.competitions, public.competition_files,
--   public.competitions_with_files, and read the competition-files bucket.
-- No personal data is in any of them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. The allowlist, in one place
-- ---------------------------------------------------------------------
create table if not exists app_private.anon_read_allowlist (
  relname text primary key,
  reason  text not null
);
insert into app_private.anon_read_allowlist (relname, reason) values
  ('competitions',            'Published licensed-meet calendar; no personal data'),
  ('competition_files',       'Meet conditions/timetables/results links; no personal data'),
  ('competitions_with_files', 'View over the two tables above (security_invoker)')
on conflict (relname) do nothing;

-- ---------------------------------------------------------------------
-- 1. Drop every policy in public that applies to anon or PUBLIC
--    (squad_month_snapshots' policy covers anon AND authenticated; it is
--    recreated for authenticated only below).
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and roles && array['anon','public']::name[]
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy squad_snap_select on public.squad_month_snapshots
  for select to authenticated
  using (public.squad_review_allowed(club, squad_id));

-- Read-only public calendar (the allowlist)
create policy anon_read on public.competitions      for select to anon using (true);
create policy anon_read on public.competition_files for select to anon using (true);

-- ---------------------------------------------------------------------
-- 2. squad_review_allowed() said "yes" to every signed-out caller
-- ---------------------------------------------------------------------
create or replace function public.squad_review_allowed(p_club text, p_squad uuid)
returns boolean
language sql stable security definer
set search_path to ''
as $function$
  select case
    when auth.uid() is null then false
    else app_private.can('stats', false, p_club) and app_private.can('feedback', false, p_club, p_squad)
  end;
$function$;
revoke execute on function public.squad_review_allowed(text, uuid) from public, anon;
grant  execute on function public.squad_review_allowed(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Views that ran as their owner (bypassing RLS) now run as the caller
-- ---------------------------------------------------------------------
alter view public.latest_per_swimmer set (security_invoker = true);
alter view public.rolling_90day      set (security_invoker = true);
alter view public.dashboard_counts   set (security_invoker = true);

-- ---------------------------------------------------------------------
-- 4. Table / view / sequence / function privileges for anon
--    RLS is the main lock; removing the grants is the second lock.
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.competitions, public.competition_files, public.competitions_with_files to anon;

-- Functions: EXECUTE comes via PUBLIC as well as anon. Take it from both,
-- then give it back explicitly to authenticated wherever they had it.
do $$
declare r record; had_auth boolean;
begin
  for r in
    select p.oid, p.oid::regprocedure as sig from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')  -- skip extension functions
  loop
    had_auth := has_function_privilege('authenticated', r.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', r.sig);
    if had_auth then execute format('grant execute on function %s to authenticated', r.sig); end if;
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- New objects created by postgres in public no longer grant anon anything.
-- (Supabase's default grants every new table to anon — this is where the
-- creep came from, together with copy-pasted "for anon" policies.)
alter default privileges for role postgres in schema public revoke all     on tables    from anon;
alter default privileges for role postgres in schema public revoke all     on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- ---------------------------------------------------------------------
-- 5. Storage
--    feedback-media held swimmers' photos/videos in a PUBLIC bucket with
--    anon upload and no signed-in policies. Make it private; the app now
--    shows media through short-lived signed links. Access follows the
--    feedback role rules via the swimmer id at the start of each path.
-- ---------------------------------------------------------------------
drop policy if exists "feedback-media anon insert" on storage.objects;
drop policy if exists "feedback-media anon select" on storage.objects;
update storage.buckets set public = false where id = 'feedback-media';

create policy "feedback-media read" on storage.objects for select to authenticated
  using (bucket_id = 'feedback-media'
         and (storage.foldername(name))[1] in (select app_private.swimmer_ids('feedback', false)::text));
create policy "feedback-media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback-media'
         and (storage.foldername(name))[1] in (select app_private.swimmer_ids('feedback', true)::text));
create policy "feedback-media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'feedback-media'
         and (storage.foldername(name))[1] in (select app_private.swimmer_ids('feedback', true)::text));
-- competition-files stays publicly readable (allowlisted calendar files).
