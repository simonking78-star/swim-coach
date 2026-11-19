-- Club & squad normalisation · Phase 6a: drop the squad-name copies
-- Spec: claude/specs/club-and-squad-normalisation.md (Phase 6)
-- Needs Phase 5b (20261028120000). The React app, the standalone apps, the edge functions and the
-- skills read squad names through squad_id only. /classic/ is retired in the same release.
--
-- 1. Keep a copy of the values being dropped in app_private.phase6_backup (restore source).
-- 2. Drop the two sync triggers and their functions (swimmers.squad, squad rename cascade).
-- 3. Stop filling stopwatch_times.squad and test_sessions.squad_name.
-- 4. deactivate_swimmer / reactivate_swimmer no longer touch swimmers.squad.
--    swimmer_archive.squad stays: it is a frozen snapshot taken at deactivation.
-- 5. Drop swimmers.squad, stopwatch_times.squad, test_sessions.squad_name.
-- Written as one statement block so the SQL Editor runs it as a single transaction.

do $phase6a$
declare
  v_mismatch int;
begin
  -- Data check before dropping: the text copy must agree with squad_id.
  select count(*) into v_mismatch
    from public.swimmers s left join public.squads q on q.id = s.squad_id
   where s.squad is distinct from q.name and not (s.squad is null and s.squad_id is null);
  if v_mismatch > 0 then
    raise notice 'Phase 6a: % swimmers.squad values disagree with squad_id (squad_id wins; old text kept in backup).', v_mismatch;
  end if;

  -- 1. Backup -----------------------------------------------------------------
  create table if not exists app_private.phase6_backup (
    tbl      text        not null,
    col      text        not null,
    row_key  jsonb       not null,
    val      text,
    saved_at timestamptz not null default now()
  );
  revoke all on app_private.phase6_backup from public, anon, authenticated;

  insert into app_private.phase6_backup (tbl, col, row_key, val)
  select 'swimmers', 'squad', jsonb_build_object('id', id), squad from public.swimmers where squad is not null;
  insert into app_private.phase6_backup (tbl, col, row_key, val)
  select 'stopwatch_times', 'squad', jsonb_build_object('id', id), squad from public.stopwatch_times where squad is not null;
  insert into app_private.phase6_backup (tbl, col, row_key, val)
  select 'test_sessions', 'squad_name', jsonb_build_object('id', id), squad_name from public.test_sessions where squad_name is not null;

  -- 2. Sync triggers ----------------------------------------------------------
  drop trigger if exists trg_sync_swimmer_squad on public.swimmers;
  drop trigger if exists trg_sync_swimmer_squad_text on public.swimmers;
  drop trigger if exists trg_cascade_squad_rename on public.squads;
  drop function if exists public.sync_swimmer_squad_text();
  drop function if exists public.cascade_squad_rename();

  -- 3. Fill-in triggers ---------------------------------------------------------
  drop trigger if exists test_sessions_fill_squad on public.test_sessions;
  drop function if exists app_private.fill_test_session_squad();

  create or replace function app_private.fill_stopwatch_squad() returns trigger
  language plpgsql security definer set search_path = '' as $f$
  begin
    if new.squad_id is null then
      new.squad_id := coalesce(
        (select m.squad_id from public.squad_memberships m
          where m.swimmer_id = new.swimmer_id
            and new.session_date between m.joined_squad_on and coalesce(m.ended_on, 'infinity'::date)
          order by m.joined_squad_on desc limit 1),
        (select s.squad_id from public.swimmers s where s.id = new.swimmer_id));
    end if;
    return new;
  end $f$;
  revoke all on function app_private.fill_stopwatch_squad() from public, anon;

  -- 4. Deactivate / reactivate --------------------------------------------------
  create or replace function public.deactivate_swimmer(p_swimmer uuid, p_reason text default null)
  returns jsonb language plpgsql security definer set search_path = '' as $f$
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
      s.id, (select c.name from public.clubs c where c.id = s.club_id), s.club_id, s.full_name,
      s.date_of_birth, s.swim_england_id, s.joined_club_on,
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
      squad_id = null, updated_at = now()
    where id = s.id;
    return jsonb_build_object('swimmer_id', s.id, 'anon_name', v_anon);
  end;
  $f$;

  create or replace function public.reactivate_swimmer(p_swimmer uuid, p_squad uuid default null)
  returns jsonb language plpgsql security definer set search_path = '' as $f$
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
      squad_id = v_squad, updated_at = now()
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
  $f$;
  revoke all on function public.deactivate_swimmer(uuid, text) from public, anon;
  revoke all on function public.reactivate_swimmer(uuid, uuid) from public, anon;
  grant execute on function public.deactivate_swimmer(uuid, text) to authenticated;
  grant execute on function public.reactivate_swimmer(uuid, uuid) to authenticated;

  -- 5. Drop the columns ---------------------------------------------------------
  alter table public.swimmers        drop column if exists squad;
  alter table public.stopwatch_times drop column if exists squad;
  alter table public.test_sessions   drop column if exists squad_name;

  raise notice 'Phase 6a: squad-name copies dropped (% swimmers / % stopwatch / % test-session values kept in app_private.phase6_backup).',
    (select count(*) from app_private.phase6_backup where tbl = 'swimmers'),
    (select count(*) from app_private.phase6_backup where tbl = 'stopwatch_times'),
    (select count(*) from app_private.phase6_backup where tbl = 'test_sessions');
end
$phase6a$;
