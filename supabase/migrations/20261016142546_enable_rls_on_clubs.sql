-- The clubs table (added in the prior migration) got RLS enabled with no
-- policy by default, which the Supabase security advisor flagged as an
-- ERROR immediately after it was created. Fix: any signed-in user with a
-- role can read the club list (needed for dropdowns); only a superadmin
-- can add/rename/remove a tenant.

alter table public.clubs enable row level security;

create policy rbac_select on public.clubs
  for select to authenticated
  using (app_private.has_any_role());

create policy rbac_write on public.clubs
  for all to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());
