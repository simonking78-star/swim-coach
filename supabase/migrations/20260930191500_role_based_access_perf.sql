-- Performance: resolve the set of swimmers a user may see once per query
-- (hashed subplan) instead of evaluating the matrix row by row.

create or replace function app_private.swimmer_ids(p_section text, p_write boolean) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with me as (
    select coalesce(array(select app_private.my_squads()), '{}') as squads,
           coalesce(array(select app_private.my_swimmers()), '{}') as kids
  )
  select distinct s.id
  from public.swimmers s
  join app_private.eff_roles() r on (r.club is null or r.club = s.club)
  cross join me
  cross join lateral (select app_private.level(p_section, r.role) as lv) l
  where case l.lv
          when 'E'  then true
          when 'R'  then not p_write
          when 'SE' then s.squad_id = any(me.squads)
          when 'SR' then not p_write and s.squad_id = any(me.squads)
          when 'CR' then not p_write and s.id = any(me.kids)
          else false
        end;
$$;

create or replace function app_private.visible_swimmer_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select app_private.swimmer_ids('roster', false)
  union select app_private.swimmer_ids('attendance', false)
  union select app_private.swimmer_ids('feedback', false)
  union select app_private.swimmer_ids('stopwatch', false)
  union select app_private.swimmer_ids('stats', false);
$$;

revoke all on function app_private.swimmer_ids(text, boolean), app_private.visible_swimmer_ids() from public, anon;
grant execute on function app_private.swimmer_ids(text, boolean), app_private.visible_swimmer_ids() to authenticated;

create or replace function pg_temp.swap(t text, r text, w text) returns void
language plpgsql as $$
begin
  execute format('drop policy if exists rbac_select on public.%I', t);
  execute format('drop policy if exists rbac_insert on public.%I', t);
  execute format('drop policy if exists rbac_update on public.%I', t);
  execute format('drop policy if exists rbac_delete on public.%I', t);
  execute format('create policy rbac_select on public.%I for select to authenticated using (%s)', t, r);
  execute format('create policy rbac_insert on public.%I for insert to authenticated with check (%s)', t, w);
  execute format('create policy rbac_update on public.%I for update to authenticated using (%s) with check (%s)', t, w, w);
  execute format('create policy rbac_delete on public.%I for delete to authenticated using (%s)', t, w);
end $$;

select pg_temp.swap('attendance_records',
  $x$swimmer_id in (select app_private.swimmer_ids('attendance', false))$x$,
  $x$swimmer_id in (select app_private.swimmer_ids('attendance', true))$x$);
select pg_temp.swap('swimmer_feedback',
  $x$swimmer_id in (select app_private.swimmer_ids('feedback', false))$x$,
  $x$swimmer_id in (select app_private.swimmer_ids('feedback', true))$x$);
select pg_temp.swap('stopwatch_times',
  $x$swimmer_id in (select app_private.swimmer_ids('stopwatch', false))$x$,
  $x$swimmer_id in (select app_private.swimmer_ids('stopwatch', true))$x$);
select pg_temp.swap('squad_memberships',
  $x$swimmer_id in (select app_private.visible_swimmer_ids())$x$,
  $x$swimmer_id in (select app_private.swimmer_ids('roster', true))$x$);
select pg_temp.swap('swim_results',
  $x$(select app_private.stats_any()) or swimmer_id in (select app_private.visible_swimmer_ids())$x$,
  $x$swimmer_id in (select app_private.swimmer_ids('stats', true))$x$);

-- swimmers: set-based read; writes stay per-row (a new swimmer has no id yet).
drop policy if exists rbac_select on public.swimmers;
create policy rbac_select on public.swimmers for select to authenticated
  using (id in (select app_private.visible_swimmer_ids()));
