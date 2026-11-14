-- Competitions page: add a competition to a macro, with a website link, notes and documents.
-- Requested by Simon, 14 Nov 2026.
--
-- The club's copy of a meet is public.season_competitions (one per season plan). The macro
-- link stays public.macro_competitions (with its type). This adds:
--   1. season_competitions.notes             — the club's own notes about the meet
--      (the website link already lives in season_competitions.venue_url)
--   2. public.season_competition_docs        — documents attached to the club's copy of a meet
--   3. private storage bucket "season-comp-docs", path <club_id>/<season_competition_id>/<file>
-- Access follows the "season" section: read = R, add/remove = E. No anon access.

begin;
set local lock_timeout = '5s';

-- 1. Notes ----------------------------------------------------------------------------------
alter table public.season_competitions add column if not exists notes text;

-- 2. Documents ------------------------------------------------------------------------------
create table if not exists public.season_competition_docs (
  id                     uuid primary key default gen_random_uuid(),
  season_competition_id  uuid not null references public.season_competitions(id) on delete cascade,
  club_id                uuid not null references public.clubs(id),
  file_name              text not null,
  storage_path           text not null unique,
  mime_type              text,
  size_bytes             bigint,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  created_by             uuid default auth.uid(),
  updated_at             timestamptz not null default now(),
  updated_by             uuid
);
create index if not exists season_competition_docs_comp on public.season_competition_docs (season_competition_id) where is_active;

-- club_id is copied from the competition's season, so it cannot point at another club
create or replace function app_private.season_child_club() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
  if tg_table_name in ('competition_registrations', 'season_competition_docs') then
    new.club_id := app_private.season_comp_club_id(new.season_competition_id);
  else
    new.club_id := app_private.season_club_id(new.season_id);
  end if;
  if new.club_id is null then raise exception 'Unknown season or competition'; end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $f$;

drop trigger if exists season_competition_docs_club on public.season_competition_docs;
create trigger season_competition_docs_club before insert or update on public.season_competition_docs
  for each row execute function app_private.season_child_club();

alter table public.season_competition_docs enable row level security;
drop policy if exists rbac_select on public.season_competition_docs;
drop policy if exists rbac_insert on public.season_competition_docs;
drop policy if exists rbac_update on public.season_competition_docs;
drop policy if exists rbac_delete on public.season_competition_docs;
create policy rbac_select on public.season_competition_docs for select to authenticated
  using (app_private.can_c('season', false, club_id));
create policy rbac_insert on public.season_competition_docs for insert to authenticated
  with check (app_private.can_c('season', true, app_private.season_comp_club_id(season_competition_id)));
create policy rbac_update on public.season_competition_docs for update to authenticated
  using (app_private.can_c('season', true, club_id))
  with check (app_private.can_c('season', true, app_private.season_comp_club_id(season_competition_id)));
create policy rbac_delete on public.season_competition_docs for delete to authenticated
  using (app_private.can_c('season', true, club_id));

revoke all on public.season_competition_docs from anon;
grant select, insert, update, delete on public.season_competition_docs to authenticated;

-- 3. Private bucket ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('season-comp-docs', 'season-comp-docs', false, 26214400, array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv', 'text/plain', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- First folder is the club id. CASE keeps a malformed folder name from reaching the uuid cast.
create or replace function app_private.season_doc_ok(p_name text, p_write boolean) returns boolean
language sql stable security definer set search_path = '' as $f$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then app_private.can_c('season', p_write, ((storage.foldername(p_name))[1])::uuid)
              else false end
$f$;
revoke all on function app_private.season_doc_ok(text, boolean) from public;
grant execute on function app_private.season_doc_ok(text, boolean) to authenticated;

drop policy if exists "season-comp-docs read" on storage.objects;
drop policy if exists "season-comp-docs upload" on storage.objects;
drop policy if exists "season-comp-docs delete" on storage.objects;
create policy "season-comp-docs read" on storage.objects for select to authenticated
  using (bucket_id = 'season-comp-docs' and app_private.season_doc_ok(name, false));
create policy "season-comp-docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'season-comp-docs' and app_private.season_doc_ok(name, true));
create policy "season-comp-docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'season-comp-docs' and app_private.season_doc_ok(name, true));

commit;
