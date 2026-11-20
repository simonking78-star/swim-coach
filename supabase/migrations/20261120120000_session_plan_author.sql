-- Session plan author, 20 Nov 2026.
-- Every plan is labelled with the coach user who wrote it, so the plan archives
-- (Coach Tools and the Session Planner app) can filter by author.
--   created_by  the auth user who first saved the plan (never changes on edit)
--   coach       the author's display name, taken from app_users.full_name on insert
--               (so the same person shows under one name in both apps)

alter table public.session_plans
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();

comment on column public.session_plans.created_by is
  'Author: the user who first saved the plan. Set on insert, kept on edit. Archive "Author" filter.';

create index if not exists session_plans_created_by_idx on public.session_plans (created_by);

-- Backfill older plans from the coach name they were saved with:
-- exact full name first, then first name; a superadmin wins a tie.
with cand as (
  select a.user_id, a.full_name,
         exists (select 1 from public.user_roles r where r.user_id = a.user_id and r.role = 'superadmin') as su
  from public.app_users a
  where coalesce(trim(a.full_name), '') <> ''
)
update public.session_plans p
set created_by = (
  select c.user_id from cand c
  where lower(c.full_name) = lower(trim(p.coach))
     or lower(split_part(c.full_name, ' ', 1)) = lower(trim(p.coach))
  order by (lower(c.full_name) = lower(trim(p.coach))) desc, c.su desc
  limit 1)
where p.created_by is null and coalesce(trim(p.coach), '') <> '';

-- One display name per author.
update public.session_plans p
set coach = a.full_name
from public.app_users a
where a.user_id = p.created_by and coalesce(trim(a.full_name), '') <> '' and p.coach is distinct from a.full_name;

-- Keep the author honest: insert stamps the signed-in user and their name;
-- an edit (by anyone) never changes who wrote it.
create or replace function public.session_plans_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n text;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if new.created_by is not null then
      select nullif(trim(full_name), '') into n from public.app_users where user_id = new.created_by;
      new.coach := coalesce(n, new.coach);
    end if;
  else
    new.created_by := coalesce(old.created_by, new.created_by);
    if old.created_by is not null then
      new.coach := old.coach;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists session_plans_author on public.session_plans;
create trigger session_plans_author
  before insert or update on public.session_plans
  for each row execute function public.session_plans_author();
