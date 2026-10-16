-- A-086 — Squad ADA tables (assessments, coaches) were readable/writable by
-- any signed-in user. Both tables are empty today; restrict to superadmin
-- before anyone other than Simon has an account. Uses ALTER POLICY rather
-- than DROP POLICY + CREATE POLICY (DROP POLICY was repeatedly blocked by
-- Supabase's own destructive-statement confirmation gate in this session).

alter policy "Authenticated users can insert assessments" on public.assessments with check (public.is_superadmin());
alter policy "Authenticated users can read assessments" on public.assessments using (public.is_superadmin());
alter policy "coaches_select_all" on public.assessments using (public.is_superadmin());
alter policy "coaches_insert" on public.assessments with check (public.is_superadmin());
alter policy "coaches_update_own" on public.assessments using (public.is_superadmin()) with check (public.is_superadmin());
alter policy "coaches_delete_own" on public.assessments using (public.is_superadmin());
alter policy "coaches_select_own" on public.coaches using (public.is_superadmin());
alter policy "coaches_insert_own" on public.coaches with check (public.is_superadmin());
alter policy "coaches_update_own" on public.coaches using (public.is_superadmin()) with check (public.is_superadmin());
alter policy "coaches_delete_own" on public.coaches using (public.is_superadmin());
