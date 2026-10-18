-- Split out of the baseline migration (20260603000000) -- these 10
-- policies are gated on public.is_superadmin(), which is only created a
-- moment ago by 20260930170000_app_dev_tasks.sql. RLS itself was already
-- enabled on assessments/coaches by the baseline; this just adds the
-- policies, in their current (superadmin-only) form. The later
-- restrict_squad_ada_tables_via_alter_policy.sql migration re-applies
-- the same clauses via ALTER POLICY, which is harmless against an
-- already-correct policy.

create policy "Authenticated users can insert assessments" on public.assessments
  for insert to authenticated with check (public.is_superadmin());
create policy "Authenticated users can read assessments" on public.assessments
  for select to authenticated using (public.is_superadmin());
create policy coaches_select_all on public.assessments
  for select to authenticated using (public.is_superadmin());
create policy coaches_insert on public.assessments
  for insert to authenticated with check (public.is_superadmin());
create policy coaches_update_own on public.assessments
  for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy coaches_delete_own on public.assessments
  for delete to authenticated using (public.is_superadmin());

create policy coaches_select_own on public.coaches
  for select to authenticated using (public.is_superadmin());
create policy coaches_insert_own on public.coaches
  for insert to authenticated with check (public.is_superadmin());
create policy coaches_update_own on public.coaches
  for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy coaches_delete_own on public.coaches
  for delete to authenticated using (public.is_superadmin());
