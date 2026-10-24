-- Club & squad normalisation · Phases 3b + 4
-- Spec: claude/specs/club-and-squad-normalisation.md
-- Needs Phases 1–3a (20261024090000, 20261024100000). Additive: the current app keeps working.
--
-- 3b  Server functions the React app calls get club-id versions (parameter p_club_id, so the API
--     can tell them apart from the name versions, which stay until Phase 6):
--       home_stats, squad_month_figures, list_deactivated_swimmers, can_grant_role.
--     my_access() returns club_id (and the club name) for every role.
--     squad_month_snapshots is keyed by club_id; the monthly job writes club_id.
-- 4   Database code stops reading squad names:
--       fill_attendance_session finds the timetable through swimmers.squad_id;
--       deactivate_swimmer / reactivate_swimmer check access and squads by id;
--       stopwatch_times gets squad_id (backfilled from the swimmer's squad on the day).

-- ---------------------------------------------------------------------------
-- Helper: club name for an id. An unknown id gives a name that matches nothing,
-- so a wrong id can never widen a query to "all clubs".
-- ---------------------------------------------------------------------------
create or replace function app_private.club_name_of(p uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when p is null then null
              else coalesce((select c.name from public.clubs c where c.id = p), '~no such club~') end;
$$;
revoke all on function app_private.club_name_of(uuid) from public;
grant execute on function app_private.club_name_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3b · club-id versions of the app's server functions
-- ---------------------------------------------------------------------------
create or replace function public.home_stats(p_club_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select public.home_stats(app_private.club_name_of(p_club_id));
$$;

create or replace function public.squad_month_figures(p_club_id uuid, p_from date, p_to date)
returns table(month date, squad_id uuid, squad_name text, members integer, sessions integer, marks integer,
  present numeric, attendance_pct numeric, swimmers_attending integer, swims integer, swimmers_raced integer,
  pbs integer, improved_swims integer, avg_improvement_pct numeric, median_improvement_pct numeric,
  status_entries integer, st_not_discussed integer, st_started integer, st_developing integer, st_embedded integer,
  skill_score numeric, skill_moves_up integer, skill_moves_down integer, feedback_entries integer,
  feedback_notes integer, positive_feedback_pct numeric, squad_entries integer, drills_worked integer,
  excused integer, hours_trained numeric, hours_per_swimmer numeric)
language sql stable set search_path = '' as $$
  select * from public.squad_month_figures(app_private.club_name_of(p_club_id), p_from, p_to);
$$;

create or replace function public.list_deactivated_swimmers(p_club_id uuid)
returns table(swimmer_id uuid, full_name text, anon_name text, date_of_birth date, squad_id uuid, squad text,
  reason text, deactivated_on date, result_count bigint)
language sql stable set search_path = '' as $$
  select * from public.list_deactivated_swimmers(app_private.club_name_of(p_club_id));
$$;

create or replace function public.can_grant_role(p_role text, p_club_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select public.can_grant_role(p_role, app_private.club_name_of(p_club_id));
$$;

revoke all on function public.home_stats(uuid), public.squad_month_figures(uuid, date, date),
  public.list_deactivated_swimmers(uuid), public.can_grant_role(text, uuid) from public, anon;
grant execute on function public.home_stats(uuid), public.squad_month_figures(uuid, date, date),
  public.list_deactivated_swimmers(uuid), public.can_grant_role(text, uuid) to authenticated;

-- my_access: every role now carries club_id as well as the club name
create or replace function public.my_access() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'real_superadmin', app_private.real_super(),
    'testing', (select to_jsonb(t) from public.role_test_mode t
                where t.user_id = auth.uid() and t.expires_at > now()),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('role', r.role, 'club', c.name, 'club_id', r.club_id))
                       from app_private.eff_roles_c() r left join public.clubs c on c.id = r.club_id), '[]'::jsonb),
    'squads', coalesce((select jsonb_agg(x) from app_private.my_squads() x), '[]'::jsonb),
    'swimmers', coalesce((select jsonb_agg(x) from app_private.my_swimmers() x), '[]'::jsonb)
  );
$$;

-- Monthly snapshots keyed by club_id
alter table public.squad_month_snapshots alter column club_id set not null;
alter table public.squad_month_snapshots drop constraint squad_month_snapshots_pkey;
alter table public.squad_month_snapshots add constraint squad_month_snapshots_pkey primary key (club_id, squad_id, month);

create or replace function public.snapshot_squad_month(p_month date default ((date_trunc('month', now()) - interval '1 month'))::date)
returns integer language plpgsql set search_path = '' as $$
declare n int := 0; k int; c record;
begin
  for c in select distinct cl.id, cl.name from public.squads s join public.clubs cl on cl.id = s.club_id loop
    insert into public.squad_month_snapshots (club, club_id, squad_id, month, metrics, generated_at)
    select c.name, c.id, r.squad_id, r.month, to_jsonb(r) - 'month' - 'squad_id', now()
    from app_private.squad_month_review_all(c.name, p_month, p_month) r
    on conflict (club_id, squad_id, month) do update
      set metrics = excluded.metrics, generated_at = excluded.generated_at, club = excluded.club;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4 · database code reads squads by id
-- ---------------------------------------------------------------------------
create or replace function app_private.fill_attendance_session() returns trigger
language plpgsql security definer set search_path = '' as $$
declare slot record;
begin
  if new.timetable_session_id is null then
    select ts.id, ts.end_time into slot
      from public.swimmers s
      join public.timetables t on t.squad_id = s.squad_id and t.is_active
       and new.session_date between t.season_start and t.season_end
      join public.timetable_sessions ts on ts.timetable_id = t.id and ts.is_active is not false
       and ts.day_of_week = extract(isodow from new.session_date)
       and ts.start_time = new.session_time
     where s.id = new.swimmer_id
     limit 1;
    if found then new.timetable_session_id := slot.id; end if;
  end if;
  if new.session_end_time is null and new.timetable_session_id is not null then
    select ts.end_time into new.session_end_time from public.timetable_sessions ts where ts.id = new.timetable_session_id;
  end if;
  if new.session_minutes is null and new.session_end_time is not null and new.session_end_time > new.session_time then
    new.session_minutes := (extract(epoch from (new.session_end_time - new.session_time)) / 60)::int;
  end if;
  return new;
end $$;

create or replace function public.deactivate_swimmer(p_swimmer uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s      public.swimmers%rowtype;
  v_anon text;
begin
  select * into s from public.swimmers where id = p_swimmer for update;
  if not found then raise exception 'Swimmer not found'; end if;
  if not app_private.can_c('admin', true, s.club_id) then
    raise exception 'Only an administrator can deactivate swimmers';
  end if;
  if s.active is false then raise exception 'Swimmer is already deactivated'; end if;
  v_anon := 'Archived swimmer ' || upper(left(replace(s.id::text, '-', ''), 6));
  insert into public.swimmer_archive (
    swimmer_id, club, club_id, full_name, date_of_birth, swim_england_id, joined_club_on,
    parent_name, parent_phone, parent_email, squad_id, squad,
    account_links, result_sources, reason, deactivated_by)
  values (
    s.id, s.club, s.club_id, s.full_name, s.date_of_birth, s.swim_england_id, s.joined_club_on,
    s.parent_name, s.parent_phone, s.parent_email, s.squad_id,
    (select q.name from public.squads q where q.id = s.squad_id),          -- frozen snapshot of the squad name
    coalesce((select jsonb_agg(jsonb_build_object('user_id', u.user_id, 'relationship', u.relationship, 'created_at', u.created_at))
                from public.user_swimmers u where u.swimmer_id = s.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'src', r.source_document))
                from public.swim_results r where r.swimmer_id = s.id and r.source_document is not null), '[]'::jsonb),
    nullif(trim(p_reason), ''), auth.uid());
  delete from public.user_swimmers where swimmer_id = s.id;
  update public.swim_results set source_document = 'Anonymised (swimmer deactivated)'
   where swimmer_id = s.id and source_document is not null;
  update public.squad_memberships set ended_on = current_date
   where swimmer_id = s.id and ended_on is null;
  update public.swimmers set
    active = false, full_name = v_anon, date_of_birth = null, swim_england_id = null,
    joined_club_on = null, parent_name = null, parent_phone = null, parent_email = null,
    squad_id = null, squad = null, updated_at = now()
  where id = s.id;
  return jsonb_build_object('swimmer_id', s.id, 'anon_name', v_anon);
end;
$$;

create or replace function public.reactivate_swimmer(p_swimmer uuid, p_squad uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a         public.swimmer_archive%rowtype;
  v_club_id uuid;
  v_squad   uuid;
begin
  select club_id into v_club_id from public.swimmers where id = p_swimmer for update;
  if not found then raise exception 'Swimmer not found'; end if;
  if not app_private.can_c('admin', true, v_club_id) then
    raise exception 'Only an administrator can reactivate swimmers';
  end if;
  select * into a from public.swimmer_archive where swimmer_id = p_swimmer;
  if not found then raise exception 'No archive record for this swimmer'; end if;
  v_squad := coalesce(p_squad,
    (select q.id from public.squads q where q.id = a.squad_id and q.club_id = v_club_id));
  if v_squad is not null and not exists (select 1 from public.squads q where q.id = v_squad and q.club_id = v_club_id) then
    raise exception 'That squad is not in this swimmer''s club';
  end if;
  update public.swimmers set
    active = true, full_name = a.full_name, date_of_birth = a.date_of_birth,
    swim_england_id = a.swim_england_id, joined_club_on = a.joined_club_on,
    parent_name = a.parent_name, parent_phone = a.parent_phone, parent_email = a.parent_email,
    squad_id = v_squad, squad = null, updated_at = now()
  where id = p_swimmer;
  if v_squad is not null then
    insert into public.squad_memberships (swimmer_id, squad_id, joined_squad_on)
    values (p_swimmer, v_squad, current_date);
  end if;
  update public.swim_results r set source_document = x.src
    from jsonb_to_recordset(a.result_sources) as x(id uuid, src text)
   where r.id = x.id and r.swimmer_id = p_swimmer;
  insert into public.user_swimmers (user_id, swimmer_id, relationship, created_at)
  select x.user_id, p_swimmer, x.relationship, coalesce(x.created_at, now())
    from jsonb_to_recordset(a.account_links) as x(user_id uuid, relationship text, created_at timestamptz)
   where exists (select 1 from auth.users u where u.id = x.user_id)
  on conflict do nothing;
  delete from public.swimmer_archive where swimmer_id = p_swimmer;
  return jsonb_build_object('swimmer_id', p_swimmer, 'full_name', a.full_name, 'squad_id', v_squad);
end;
$$;

-- stopwatch_times.squad_id: the swimmer's squad on the day the time was recorded
alter table public.stopwatch_times add column squad_id uuid references public.squads(id) on delete set null;
create index stopwatch_times_squad_id_idx on public.stopwatch_times (squad_id);

update public.stopwatch_times st set squad_id = coalesce(
  (select m.squad_id from public.squad_memberships m
    where m.swimmer_id = st.swimmer_id and st.session_date between m.joined_squad_on and coalesce(m.ended_on, 'infinity'::date)
    order by m.joined_squad_on desc limit 1),
  (select s.squad_id from public.swimmers s where s.id = st.swimmer_id));

create or replace function app_private.fill_stopwatch_squad() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.squad_id is null then
    new.squad_id := coalesce(
      (select m.squad_id from public.squad_memberships m
        where m.swimmer_id = new.swimmer_id and new.session_date between m.joined_squad_on and coalesce(m.ended_on, 'infinity'::date)
        order by m.joined_squad_on desc limit 1),
      (select s.squad_id from public.swimmers s where s.id = new.swimmer_id));
  end if;
  if new.squad is null and new.squad_id is not null then
    select q.name into new.squad from public.squads q where q.id = new.squad_id;   -- kept for the classic app until Phase 6
  end if;
  return new;
end $$;

create trigger stopwatch_times_fill_squad before insert on public.stopwatch_times
  for each row execute function app_private.fill_stopwatch_squad();
