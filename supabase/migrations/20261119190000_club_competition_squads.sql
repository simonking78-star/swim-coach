-- Club competitions: the shared catalogue stays read-only for clubs; each club keeps its own copy
-- per season plan (season_competitions) and says which of its squads go, with notes per squad.
-- Spec: claude/specs/club-competitions.md
--
-- 1. Shared reference tables (competitions, competition_files, galas, qualifying_times,
--    conversion_factors, club_codes) are written by superadmin only. The app never writes them;
--    the scrape and results skills run through the database connector, which is not affected.
-- 2. season_competition_squads: (season competition, squad) with an optional note per squad.
--    club_id comes from the season plan; the squad must belong to that club and, when the plan
--    lists its squads, be one of them. Season-section rules, like season_competitions.
-- 3. Backfill: each existing season competition gets the squads of the macros it is linked to.
-- Written as one statement block so the SQL Editor runs it as a single transaction.

do $clubcomps$
declare
  t text;
  c text;
  v_bad int;
begin
  -- 1. Shared catalogue: superadmin writes only ------------------------------------------------------
  foreach t in array array['competitions','competition_files','galas','qualifying_times','conversion_factors','club_codes'] loop
    foreach c in array array['insert','update','delete'] loop
      execute format('drop policy if exists rbac_%s on public.%I', c, t);
    end loop;
    execute format('create policy rbac_insert on public.%I for insert to authenticated with check ((select public.is_superadmin()))', t);
    execute format('create policy rbac_update on public.%I for update to authenticated using ((select public.is_superadmin())) with check ((select public.is_superadmin()))', t);
    execute format('create policy rbac_delete on public.%I for delete to authenticated using ((select public.is_superadmin()))', t);
  end loop;

  -- 2. Squads going to each club competition ---------------------------------------------------------
  create table if not exists public.season_competition_squads (
    season_competition_id uuid not null references public.season_competitions(id) on delete cascade,
    squad_id              uuid not null references public.squads(id) on delete cascade,
    club_id               uuid not null references public.clubs(id),
    note                  text check (note is null or length(note) <= 2000),
    is_active             boolean not null default true,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    updated_by            uuid default auth.uid(),
    primary key (season_competition_id, squad_id)
  );
  create index if not exists season_competition_squads_squad on public.season_competition_squads (squad_id);
  create index if not exists season_competition_squads_club on public.season_competition_squads (club_id);
  alter table public.season_competition_squads enable row level security;
  revoke all on public.season_competition_squads from anon;
  grant select, insert, update, delete on public.season_competition_squads to authenticated;

  create or replace function app_private.season_comp_squad_check() returns trigger
  language plpgsql security definer set search_path = '' as $f$
  declare v_season uuid;
  begin
    select sc.season_id into v_season from public.season_competitions sc where sc.id = new.season_competition_id;
    new.club_id := app_private.season_club_id(v_season);
    if new.club_id is null then raise exception 'Unknown season competition'; end if;
    if not exists (select 1 from public.squads q where q.id = new.squad_id and q.club_id = new.club_id) then
      raise exception 'That squad belongs to another club';
    end if;
    if exists (select 1 from public.season_squads ss where ss.season_id = v_season)
       and not exists (select 1 from public.season_squads ss where ss.season_id = v_season and ss.squad_id = new.squad_id) then
      raise exception 'That squad is not in this season plan';
    end if;
    new.note := nullif(btrim(new.note), '');
    new.updated_at := now();
    new.updated_by := auth.uid();
    return new;
  end $f$;
  revoke all on function app_private.season_comp_squad_check() from public, anon;
  drop trigger if exists season_competition_squads_check on public.season_competition_squads;
  create trigger season_competition_squads_check before insert or update on public.season_competition_squads
    for each row execute function app_private.season_comp_squad_check();

  drop policy if exists rbac_select on public.season_competition_squads;
  drop policy if exists rbac_insert on public.season_competition_squads;
  drop policy if exists rbac_update on public.season_competition_squads;
  drop policy if exists rbac_delete on public.season_competition_squads;
  create policy rbac_select on public.season_competition_squads for select to authenticated
    using (app_private.can_c('season', false, club_id));
  create policy rbac_insert on public.season_competition_squads for insert to authenticated
    with check (app_private.can_c('season', true, app_private.season_comp_club_id(season_competition_id)));
  create policy rbac_update on public.season_competition_squads for update to authenticated
    using (app_private.can_c('season', true, club_id))
    with check (app_private.can_c('season', true, app_private.season_comp_club_id(season_competition_id)));
  create policy rbac_delete on public.season_competition_squads for delete to authenticated
    using (app_private.can_c('season', true, club_id));

  -- 3. Backfill from the macro links -------------------------------------------------------------------
  insert into public.season_competition_squads (season_competition_id, squad_id, club_id)
  select distinct mc.season_competition_id, ms.squad_id, app_private.season_club_id(m.season_id)
    from public.macro_competitions mc
    join public.macros m on m.id = mc.macro_id and m.is_active
    join public.macro_squads ms on ms.macro_id = m.id and ms.is_active
    join public.season_competitions sc on sc.id = mc.season_competition_id and sc.is_active
    join public.squads q on q.id = ms.squad_id and q.club_id = app_private.season_club_id(m.season_id)
   where mc.is_active
     and (not exists (select 1 from public.season_squads ss where ss.season_id = m.season_id)
          or exists (select 1 from public.season_squads ss where ss.season_id = m.season_id and ss.squad_id = ms.squad_id))
  on conflict do nothing;

  -- Checks ---------------------------------------------------------------------------------------------
  select count(*) into v_bad from app_private.tenancy_exposure() where severity = 'ERROR';
  if v_bad > 0 then raise exception 'Club competitions: tenancy_exposure() reports % errors', v_bad; end if;
  select count(*) into v_bad from app_private.anon_exposure();
  if v_bad > 0 then raise exception 'Club competitions: anon_exposure() returned % rows', v_bad; end if;
end
$clubcomps$;
