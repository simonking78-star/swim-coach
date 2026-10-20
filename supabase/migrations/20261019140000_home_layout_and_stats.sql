-- React rewrite Phase 1: configurable home screen (claude/specs/react-rewrite-scope.md §4)
--
-- 1. user_home_layout — each user's own choice and order of home panels and
--    buttons. One row per user; only that user can read or change it.
-- 2. home_stats(club) — the numbers for the home panels. SECURITY INVOKER,
--    so every count runs under the caller's own RLS: a coach only counts
--    the squads and swimmers they can already see.

-- ---------------------------------------------------------------------
-- 1. Per-user home layout
-- ---------------------------------------------------------------------
create table public.user_home_layout (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  layout     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.user_home_layout is
  'Home screen layout per user: {"panels":[{"id","visible"}...],"buttons":[{"id","visible"}...]}. Written by the React app (/v2).';

alter table public.user_home_layout enable row level security;

-- Own row only. Not section-scoped: everyone who can sign in owns their own home screen.
create policy own_select on public.user_home_layout for select to authenticated
  using (user_id = (select auth.uid()));
create policy own_insert on public.user_home_layout for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy own_update on public.user_home_layout for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy own_delete on public.user_home_layout for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.user_home_layout from anon;
grant select, insert, update, delete on public.user_home_layout to authenticated;

create or replace function app_private.touch_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger user_home_layout_touch before update on public.user_home_layout
  for each row execute function app_private.touch_updated_at();

-- ---------------------------------------------------------------------
-- 2. Home statistics
-- ---------------------------------------------------------------------
-- Totals cover everything the caller can see (a superadmin sees the whole
-- system). "squads" lists the squads of p_club the caller can see, with
-- swimmers and feedback counts per squad.
create or replace function public.home_stats(p_club text default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with sq as (
    select s.id, s.name
    from public.squads s
    where p_club is null or s.club = p_club
  ),
  members as (
    select m.squad_id, count(distinct m.swimmer_id) as n
    from public.squad_memberships m
    join public.swimmers sw on sw.id = m.swimmer_id and coalesce(sw.active, true)
    where m.ended_on is null and m.squad_id in (select id from sq)
    group by m.squad_id
  ),
  swimmer_fb as (
    select m.squad_id,
           count(f.id) as total,
           count(f.id) filter (where f.created_at >= now() - interval '30 days') as last_30
    from public.squad_memberships m
    join public.swimmer_feedback f on f.swimmer_id = m.swimmer_id
    where m.ended_on is null and m.squad_id in (select id from sq)
    group by m.squad_id
  ),
  squad_fb as (
    select f.squad_id,
           count(*) as total,
           count(*) filter (where f.created_at >= now() - interval '30 days') as last_30
    from public.squad_feedback f
    where f.is_active and f.squad_id in (select id from sq)
    group by f.squad_id
  )
  select jsonb_build_object(
    'clubs',            (select count(distinct club) from public.squads),
    'swimmers',         (select count(*) from public.swimmers where coalesce(active, true)),
    'pbs',              (select count(*) from public.swim_results where is_pb),
    'feedback',         (select count(*) from public.swimmer_feedback)
                      + (select count(*) from public.squad_feedback where is_active),
    'feedback_30d',     (select count(*) from public.swimmer_feedback where created_at >= now() - interval '30 days')
                      + (select count(*) from public.squad_feedback where is_active and created_at >= now() - interval '30 days'),
    'squads', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sq.id,
               'name', sq.name,
               'swimmers', coalesce(members.n, 0),
               'swimmer_feedback', coalesce(swimmer_fb.total, 0),
               'swimmer_feedback_30d', coalesce(swimmer_fb.last_30, 0),
               'squad_feedback', coalesce(squad_fb.total, 0),
               'squad_feedback_30d', coalesce(squad_fb.last_30, 0)
             ) order by sq.name)
      from sq
      left join members    on members.squad_id = sq.id
      left join swimmer_fb on swimmer_fb.squad_id = sq.id
      left join squad_fb   on squad_fb.squad_id = sq.id
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.home_stats(text) from public, anon;
grant execute on function public.home_stats(text) to authenticated;
