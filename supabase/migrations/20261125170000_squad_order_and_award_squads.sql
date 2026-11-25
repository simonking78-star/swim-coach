-- Squad order + which squads use the Club Awards scheme (25 Nov 2026).
-- Spec: claude/specs/club-awards.md ("Squads in the scheme") and claude/specs/squad-order.md.
--
-- * squads.sort_order: the club's own order of squads (1 = first). Every squad list in the app
--   reads it (sort_order, then name). New squads go to the end. Replaces the earlier "no defined
--   squad order" decision; test-set comparisons still list squads as information only.
-- * squads.club_awards: true when the squad is in the Swim England Club Awards scheme. Default true,
--   so nothing disappears from Club Awards until a head coach switches a squad off. Switching a squad
--   off hides it from Club Awards screens; its swimmers' marks are kept.
-- * Both are set only through two functions, for head coach, club admin or development admin at the
--   squad's club. The squads table's own write rule (roster edit: club admin and above) is unchanged,
--   so a head coach still can't rename, add or remove squads.

alter table public.squads
  add column if not exists sort_order integer,
  add column if not exists club_awards boolean not null default true;

-- Start from today's order (by name) so nothing moves until a head coach changes it.
update public.squads s set sort_order = x.rn
  from (select id, row_number() over (partition by club_id order by name) as rn from public.squads) x
 where x.id = s.id and s.sort_order is null;

-- New squads go to the end of their club's list.
create or replace function app_private.squad_sort_fill() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sort_order is null then
    select coalesce(max(sort_order), 0) + 1 into new.sort_order from public.squads where club_id = new.club_id;
  end if;
  return new;
end $$;
drop trigger if exists squads_sort_fill on public.squads;
create trigger squads_sort_fill before insert on public.squads
  for each row execute function app_private.squad_sort_fill();

-- Head coach or above at this club (honours role test mode through eff_roles_c).
create or replace function app_private.head_coach_up(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app_private.eff_roles_c() r
                  where r.role in ('superadmin', 'club_admin', 'head_coach')
                    and (r.club_id is null or r.club_id = p_club));
$$;

-- p_ids: every squad of the club, first to last. Squads left out keep their place after the listed ones.
create or replace function public.set_squad_order(p_club uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_club is null or not app_private.head_coach_up(p_club) then
    raise exception 'Only a head coach or club admin can change the squad order' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(p_ids) i where not exists (select 1 from public.squads s where s.id = i and s.club_id = p_club)) then
    raise exception 'That squad list includes a squad from another club';
  end if;
  n := coalesce(array_length(p_ids, 1), 0);
  update public.squads s set sort_order = o.ord, updated_at = now()
    from unnest(p_ids) with ordinality as o(id, ord)
   where s.id = o.id and s.club_id = p_club and s.sort_order is distinct from o.ord::int;
  -- anything not listed (e.g. added meanwhile) follows, in its old order
  update public.squads s set sort_order = n + x.rn, updated_at = now()
    from (select id, row_number() over (order by sort_order nulls last, name) as rn
            from public.squads where club_id = p_club and not (id = any(p_ids))) x
   where s.id = x.id and s.sort_order is distinct from (n + x.rn)::int;
end $$;

-- p_ids: the squads that use Club Awards; every other squad at the club is switched off.
create or replace function public.set_award_squads(p_club uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_club is null or not app_private.head_coach_up(p_club) then
    raise exception 'Only a head coach or club admin can choose the Club Awards squads' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(p_ids) i where not exists (select 1 from public.squads s where s.id = i and s.club_id = p_club)) then
    raise exception 'That squad list includes a squad from another club';
  end if;
  update public.squads s set club_awards = (s.id = any(coalesce(p_ids, '{}'))), updated_at = now()
   where s.club_id = p_club and s.club_awards is distinct from (s.id = any(coalesce(p_ids, '{}')));
end $$;

revoke all on function public.set_squad_order(uuid, uuid[]) from public, anon;
revoke all on function public.set_award_squads(uuid, uuid[]) from public, anon;
revoke all on function app_private.head_coach_up(uuid) from public, anon;
revoke all on function app_private.squad_sort_fill() from public, anon;
grant execute on function public.set_squad_order(uuid, uuid[]) to authenticated;
grant execute on function public.set_award_squads(uuid, uuid[]) to authenticated;
grant execute on function app_private.head_coach_up(uuid) to authenticated;
