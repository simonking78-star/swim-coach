-- A-096: series details on weekly sessions, and one-date overrides.
alter table public.timetable_sessions
  add column if not exists course   text check (course in ('LCM','SCM','SCY')),
  add column if not exists location text,
  add column if not exists coaches  text,
  add column if not exists note     text;

create table public.timetable_session_overrides (
  id                   uuid primary key default gen_random_uuid(),
  timetable_session_id uuid not null references public.timetable_sessions(id) on delete cascade,
  session_date         date not null,
  cancelled            boolean not null default false,
  start_time time, end_time time, pool_size text,
  course   text check (course in ('LCM','SCM','SCY')),
  location text, coaches text, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (timetable_session_id, session_date)
);
create index on public.timetable_session_overrides (timetable_session_id);

alter table public.timetable_session_overrides enable row level security;
revoke all on public.timetable_session_overrides from public, anon;
grant select, insert, update, delete on public.timetable_session_overrides to authenticated;

create policy rbac_select on public.timetable_session_overrides for select to authenticated
  using (app_private.can_c('timetables', false, app_private.timetable_club_id((select s.timetable_id from public.timetable_sessions s where s.id = timetable_session_id))));
create policy rbac_insert on public.timetable_session_overrides for insert to authenticated
  with check (app_private.can_c('timetables', true, app_private.timetable_club_id((select s.timetable_id from public.timetable_sessions s where s.id = timetable_session_id))));
create policy rbac_update on public.timetable_session_overrides for update to authenticated
  using (app_private.can_c('timetables', true, app_private.timetable_club_id((select s.timetable_id from public.timetable_sessions s where s.id = timetable_session_id))))
  with check (app_private.can_c('timetables', true, app_private.timetable_club_id((select s.timetable_id from public.timetable_sessions s where s.id = timetable_session_id))));
create policy rbac_delete on public.timetable_session_overrides for delete to authenticated
  using (app_private.can_c('timetables', true, app_private.timetable_club_id((select s.timetable_id from public.timetable_sessions s where s.id = timetable_session_id))));
