-- A-012 — add club_id to the genuinely tenant-private (Tier 1) tables and
-- backfill. Scope deliberately excludes swimmers/swim_results: those span
-- ~39 clubs from the public competition-results archive and are not
-- single-tenant data (see claude/specs/multi-tenancy-and-statistics.md).
--
-- Backfill paths, all verified to resolve with zero nulls before this ran:
--   squads             <- existing club text column, direct name match
--   squad_memberships  <- via squads.club_id
--   attendance_records <- via date-ranged squad_memberships for the swimmer
--   swimmer_feedback   <- same, falling back to swimmers.club for 2 rows
--                          with no squad_memberships row
--   stopwatch_times     <- existing club text column, direct name match

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

insert into public.clubs (name)
select distinct club from public.squads where club is not null;

alter table public.squads add column club_id uuid references public.clubs(id);
update public.squads sq set club_id = c.id from public.clubs c where c.name = sq.club;

alter table public.squad_memberships add column club_id uuid references public.clubs(id);
update public.squad_memberships sm set club_id = sq.club_id
  from public.squads sq where sq.id = sm.squad_id;

alter table public.attendance_records add column club_id uuid references public.clubs(id);
update public.attendance_records a set club_id = sm.club_id
  from public.squad_memberships sm
  where sm.swimmer_id = a.swimmer_id
    and a.session_date between sm.joined_squad_on and coalesce(sm.ended_on, '9999-12-31');

alter table public.swimmer_feedback add column club_id uuid references public.clubs(id);
update public.swimmer_feedback f set club_id = sm.club_id
  from public.squad_memberships sm
  where sm.swimmer_id = f.swimmer_id
    and f.session_date between sm.joined_squad_on and coalesce(sm.ended_on, '9999-12-31');
update public.swimmer_feedback f set club_id = c.id
  from public.swimmers s join public.clubs c on c.name = s.club
  where f.swimmer_id = s.id and f.club_id is null;

alter table public.stopwatch_times add column club_id uuid references public.clubs(id);
update public.stopwatch_times st set club_id = c.id from public.clubs c where c.name = st.club;

alter table public.squad_memberships alter column club_id set not null;
alter table public.attendance_records alter column club_id set not null;
alter table public.stopwatch_times alter column club_id set not null;
-- squads and swimmer_feedback left nullable: squads for any future club-less
-- template row, swimmer_feedback as a safety margin.
