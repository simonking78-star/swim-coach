-- Split access between the main Coach Tools app and the Session Planner app.
-- Spec: claude/specs/feature-gate.md ("Apps and people")
--
-- 1. coach_tools becomes a feature like session_planner. Every coaching club that uses the app
--    today is switched on, so nobody loses access.
-- 2. user_app_limits: optionally narrow one person at one club to a list of features
--    (e.g. a pilot coach who gets the Session Planner only). No row = everything the club has.
-- 3. my_features() = what the club has, narrowed by the person's limit (if any).
--
-- As before, this decides which app someone can open. What data they see is still set by their
-- role, squads and club (RLS).

-- 1. coach_tools ------------------------------------------------------------------------------
insert into public.app_features (key, name, description, tier) values
  ('coach_tools', 'Coach Tools app', 'The main Coach Tools app (web/): attendance, feedback, plans, swimmers, season, stats, admin.', null)
on conflict (key) do nothing;

insert into public.club_features (club_id, feature, source, note)
select c.id, 'coach_tools', 'manual', 'Already using Coach Tools when the app switch was added (21 Nov 2026)'
from public.clubs c
where c.is_coaching
   or exists (select 1 from public.user_roles r where r.club_id = c.id)
on conflict (club_id, feature) do nothing;

-- 2. Per-person limits --------------------------------------------------------------------------
create table if not exists public.user_app_limits (
  user_id    uuid not null references auth.users(id) on delete cascade,
  club_id    uuid not null references public.clubs(id) on delete cascade,
  features   text[] not null check (cardinality(features) >= 1),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (user_id, club_id)
);
comment on table public.user_app_limits is
  'Narrows one person at one club to these features (app_features keys). No row = everything the club has switched on.';

create or replace function app_private.check_user_app_limits() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare v_bad text;
begin
  select string_agg(f, ', ') into v_bad
  from unnest(new.features) f
  where not exists (select 1 from public.app_features a where a.key = f);
  if v_bad is not null then raise exception 'Unknown feature: %', v_bad; end if;
  if not exists (select 1 from public.user_roles r where r.user_id = new.user_id and r.club_id = new.club_id) then
    raise exception 'That person has no role at this club';
  end if;
  new.features := array(select distinct f from unnest(new.features) f order by 1);
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $fn$;
drop trigger if exists user_app_limits_check on public.user_app_limits;
create trigger user_app_limits_check before insert or update on public.user_app_limits
  for each row execute function app_private.check_user_app_limits();

alter table public.user_app_limits enable row level security;
-- A person can see their own limits; the club's admins can see and set limits for their club.
create policy rbac_select on public.user_app_limits for select to authenticated
  using (user_id = (select auth.uid()) or app_private.can_c('admin', false, club_id));
create policy rbac_insert on public.user_app_limits for insert to authenticated
  with check (app_private.can_c('admin', true, club_id) and user_id <> (select auth.uid()));
create policy rbac_update on public.user_app_limits for update to authenticated
  using (app_private.can_c('admin', true, club_id))
  with check (app_private.can_c('admin', true, club_id) and user_id <> (select auth.uid()));
create policy rbac_delete on public.user_app_limits for delete to authenticated
  using (app_private.can_c('admin', true, club_id));
grant select, insert, update, delete on public.user_app_limits to authenticated;

-- 3. The question, now per person -----------------------------------------------------------
create or replace function app_private.user_has_feature(p_user uuid, p_club uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select app_private.has_feature(p_club, p_feature)
     and not exists (select 1 from public.user_app_limits l
                     where l.user_id = p_user and l.club_id = p_club and not (p_feature = any (l.features)));
$fn$;
revoke all on function app_private.user_has_feature(uuid, uuid, text) from public, anon;
grant execute on function app_private.user_has_feature(uuid, uuid, text) to authenticated;

create or replace function public.my_features()
returns table(club_id uuid, feature text, all_features boolean)
language sql
stable
security definer
set search_path = ''
as $fn$
  select c.id, f.key, app_private.acting_super()
  from public.clubs c
  cross join public.app_features f
  where c.id in (select app_private.my_club_ids())
    and (app_private.user_has_feature(auth.uid(), c.id, f.key) or app_private.acting_super());
$fn$;
revoke all on function public.my_features() from public, anon;
grant execute on function public.my_features() to authenticated;
comment on function public.my_features() is
  'Feature gate for the apps: (club, feature) pairs the caller may use = club switches narrowed by user_app_limits. RLS still protects the data.';
