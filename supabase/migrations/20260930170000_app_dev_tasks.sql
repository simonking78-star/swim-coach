-- App dev section: development action list + first roles table.
-- Spec: claude/specs/app-dev-section.md (Coach Mobile App project)

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  club text,                         -- null = all clubs
  role text not null check (role in ('superadmin','club_admin','head_coach','coach','helper','parent','swimmer')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is 'Application roles per signed-in user. Granted by SQL/admin only; clients can read their own rows. First step of the M1 roles model (custom JWT claim + authorize() still to come).';
alter table public.user_roles enable row level security;
create policy user_roles_read_own on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.user_roles r
                 where r.user_id = auth.uid() and r.role = 'superadmin');
$$;
revoke execute on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;

create table if not exists public.app_dev_tasks (
  id text primary key check (id ~ '^A-[0-9]{3,}$'),
  title text not null,
  area text not null,
  milestone text not null check (milestone in ('M0','M1','M2','M3','M4','M5','M6','Later')),
  priority text not null default 'Should' check (priority in ('Must','Should','Could','Won''t-now')),
  status text not null default 'todo' check (status in ('todo','doing','blocked','done','dropped')),
  gate boolean not null default false,
  owner_role text,
  due_on date,
  evidence text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
comment on table public.app_dev_tasks is 'Coach Tools development action list (App dev section + /coach-app skill). Source of truth over the project doc claude/coach-app-actions.md. Never hard-delete: status dropped.';
alter table public.app_dev_tasks enable row level security;
create policy app_dev_select on public.app_dev_tasks for select to authenticated using ((select public.is_superadmin()));
create policy app_dev_insert on public.app_dev_tasks for insert to authenticated with check ((select public.is_superadmin()));
create policy app_dev_update on public.app_dev_tasks for update to authenticated using ((select public.is_superadmin())) with check ((select public.is_superadmin()));
-- no delete policy by design

create or replace function public.app_dev_touch()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger app_dev_touch before update on public.app_dev_tasks
  for each row execute function public.app_dev_touch();

-- Simon (existing auth account) is the first superadmin.
insert into public.user_roles (user_id, club, role)
select id, null, 'superadmin' from auth.users where email = 'simonking@crawleysc.co.uk'
on conflict do nothing;
