-- Users & roles screen (A-083): people directory + grant check.

create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  last_link_at timestamptz
);
comment on table public.app_users is 'Name/email of app users so admins can see who has access. Written only by the invite-user edge function.';
alter table public.app_users enable row level security;

-- Can the current user see this person? Self, a superadmin, or an admin of a club the person has a role in.
create or replace function app_private.can_see_user(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid()
      or exists (select 1 from app_private.eff_roles() r where r.role = 'superadmin')
      or exists (select 1 from public.user_roles ur
                 where ur.user_id = p_user and ur.club is not null and app_private.can('admin', false, ur.club));
$$;
revoke all on function app_private.can_see_user(uuid) from public, anon;
grant execute on function app_private.can_see_user(uuid) to authenticated;

create policy rbac_select on public.app_users for select to authenticated
  using (app_private.can_see_user(user_id));
-- no client writes: the edge function uses the service role

-- May the current user grant this role in this club?
create or replace function public.can_grant_role(p_role text, p_club text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select case
    when p_role = 'superadmin' then app_private.real_super() and not exists (select 1 from app_private.test_row() t where t.role is not null)
    when p_club is null then false
    else app_private.can('admin', true, p_club)
  end;
$$;
revoke execute on function public.can_grant_role(text, text) from public, anon;
grant execute on function public.can_grant_role(text, text) to authenticated;

insert into public.app_users (user_id, email, full_name)
select id, email, 'Simon King' from auth.users where email = 'simonking78@hotmail.co.uk'
on conflict (user_id) do nothing;
