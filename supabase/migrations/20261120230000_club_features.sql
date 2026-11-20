-- Feature gate (roadmap step 3) ahead of entitlements (step 2).
-- Spec: claude/specs/feature-gate.md
--
-- One question, asked in one place: does this club have this feature?
--   app_private.has_feature(club_id, feature)  -> boolean
--   public.my_features()                        -> the caller's clubs and their switched-on features
-- Today the answer comes from a hand-kept switch list (club_features). When entitlements arrive,
-- plans fill the same list (or has_feature() reads plans as well); the apps' gates don't change.
--
-- This gates who gets an app. It is not a security boundary: club data is protected by RLS.
-- When a feature is paid for, add has_feature() to that feature's own write rules too.

-- 0. "Acting superadmin": a real superadmin who is not testing as another role. Used for the
--    write rules below so the cross-club check (which runs in test mode) tests them properly.
create or replace function app_private.acting_super()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select app_private.real_super() and (select t.user_id from app_private.test_row() t) is null;
$fn$;
revoke all on function app_private.acting_super() from public, anon;
grant execute on function app_private.acting_super() to authenticated;

-- 1. The feature catalogue (shared reference data) --------------------------------------------
insert into app_private.tenancy_scope (relname, scope, via, note)
values ('app_features', 'shared', null, 'Feature catalogue: keys the apps gate on. Read by any signed-in role; superadmin writes.')
on conflict (relname) do nothing;

create table if not exists public.app_features (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name        text not null,
  description text,
  tier        text check (tier in ('poolside','coach','performance','club_network','addon')),
  created_at  timestamptz not null default now()
);
alter table public.app_features enable row level security;
create policy rbac_select on public.app_features for select to authenticated using (true);
create policy rbac_insert on public.app_features for insert to authenticated with check ((select app_private.acting_super()));
create policy rbac_update on public.app_features for update to authenticated using ((select app_private.acting_super())) with check ((select app_private.acting_super()));
create policy rbac_delete on public.app_features for delete to authenticated using ((select app_private.acting_super()));
grant select, insert, update, delete on public.app_features to authenticated;

insert into public.app_features (key, name, description, tier) values
  ('session_planner', 'Session Planner app', 'The free-text Session Planner app (apps/session-planner): write, archive, shorthand.', 'coach')
on conflict (key) do nothing;

-- 2. Which club has which feature -----------------------------------------------------------
create table if not exists public.club_features (
  club_id    uuid not null references public.clubs(id) on delete cascade,
  feature    text not null references public.app_features(key) on update cascade on delete cascade,
  enabled    boolean not null default true,
  starts_on  date,
  ends_on    date,
  source     text not null default 'manual' check (source in ('manual','pilot','plan')),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (club_id, feature),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
comment on table public.club_features is
  'Feature switches per club. source: manual / pilot today; plan once entitlements fill it. Read through has_feature() / my_features().';
alter table public.club_features enable row level security;
create policy rbac_select on public.club_features for select to authenticated
  using (club_id in (select app_private.my_club_ids()));
create policy rbac_insert on public.club_features for insert to authenticated with check ((select app_private.acting_super()));
create policy rbac_update on public.club_features for update to authenticated using ((select app_private.acting_super())) with check ((select app_private.acting_super()));
create policy rbac_delete on public.club_features for delete to authenticated using ((select app_private.acting_super()));
grant select, insert, update, delete on public.club_features to authenticated;

create or replace function app_private.touch_club_features() returns trigger
language plpgsql set search_path = '' as $fn$
begin new.updated_at := now(); new.updated_by := coalesce(auth.uid(), new.updated_by); return new; end $fn$;
drop trigger if exists club_features_touch on public.club_features;
create trigger club_features_touch before update on public.club_features
  for each row execute function app_private.touch_club_features();

-- 3. The one question ---------------------------------------------------------------------------
create or replace function app_private.has_feature(p_club uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.club_features f
    where f.club_id = p_club and f.feature = p_feature and f.enabled
      and (f.starts_on is null or f.starts_on <= current_date)
      and (f.ends_on   is null or f.ends_on   >= current_date)
  );
$fn$;
revoke all on function app_private.has_feature(uuid, text) from public, anon;
grant execute on function app_private.has_feature(uuid, text) to authenticated;

-- What the signed-in user's clubs have switched on. The apps call this once after sign-in.
-- A platform superadmin (not in test mode) gets every club with every switched-on feature,
-- plus all_features = true so the apps can let them in to test anywhere.
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
    and (app_private.has_feature(c.id, f.key) or app_private.acting_super());
$fn$;
revoke all on function public.my_features() from public, anon;
grant execute on function public.my_features() to authenticated;
comment on function public.my_features() is 'Feature gate for the apps: (club, feature) pairs the caller may use. RLS still protects the data.';
