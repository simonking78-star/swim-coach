-- Swimmer deactivation / reactivation
-- --------------------------------------------------------------------------
-- Deactivating a swimmer:
--   * copies every identifying field into public.swimmer_archive (locked down:
--     no direct table access, only the admin RPCs below can read it)
--   * anonymises the swimmers row (name -> "Archived swimmer XXXXXX", DOB,
--     Swim England ID, parent contact, join date cleared, squad removed),
--     sets active = false so every app search skips it
--   * closes the open squad membership (dated today)
--   * detaches parent/swimmer account links (kept in the archive)
--   * blanks swim_results.source_document notes (which can hold the swimmer's
--     name, Swim England ID or DOB) after archiving them
--   Results, attendance and feedback stay attached to the same swimmer id, so
--   anonymised results still count in club / year-of-birth group statistics.
-- Reactivating reverses all of the above from the archive and deletes the
-- archive row.
-- Club and gender stay on the anonymised row (needed for group statistics).

create table if not exists public.swimmer_archive (
  swimmer_id       uuid primary key references public.swimmers(id) on delete cascade,
  club             text,
  full_name        text not null,
  date_of_birth    date,
  swim_england_id  text,
  joined_club_on   date,
  parent_name      text,
  parent_phone     text,
  parent_email     text,
  squad_id         uuid,
  squad            text,
  account_links    jsonb not null default '[]'::jsonb,
  result_sources   jsonb not null default '[]'::jsonb,
  reason           text,
  deactivated_on   date not null default current_date,
  deactivated_at   timestamptz not null default now(),
  deactivated_by   uuid
);

alter table public.swimmer_archive enable row level security;
-- No policies: nobody reads or writes this table directly.
revoke all on public.swimmer_archive from anon, authenticated;

-- --------------------------------------------------------------------------
create or replace function public.deactivate_swimmer(p_swimmer uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  s     public.swimmers%rowtype;
  v_anon text;
begin
  select * into s from public.swimmers where id = p_swimmer for update;
  if not found then raise exception 'Swimmer not found'; end if;
  if not app_private.can('admin', true, s.club) then
    raise exception 'Only an administrator can deactivate swimmers';
  end if;
  if s.active is false then raise exception 'Swimmer is already deactivated'; end if;

  v_anon := 'Archived swimmer ' || upper(left(replace(s.id::text, '-', ''), 6));

  insert into public.swimmer_archive (
    swimmer_id, club, full_name, date_of_birth, swim_england_id, joined_club_on,
    parent_name, parent_phone, parent_email, squad_id, squad,
    account_links, result_sources, reason, deactivated_by)
  values (
    s.id, s.club, s.full_name, s.date_of_birth, s.swim_england_id, s.joined_club_on,
    s.parent_name, s.parent_phone, s.parent_email, s.squad_id, s.squad,
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

-- --------------------------------------------------------------------------
create or replace function public.reactivate_swimmer(p_swimmer uuid, p_squad uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  a       public.swimmer_archive%rowtype;
  v_club  text;
  v_squad uuid;
begin
  select club into v_club from public.swimmers where id = p_swimmer for update;
  if not found then raise exception 'Swimmer not found'; end if;
  if not app_private.can('admin', true, v_club) then
    raise exception 'Only an administrator can reactivate swimmers';
  end if;
  select * into a from public.swimmer_archive where swimmer_id = p_swimmer;
  if not found then raise exception 'No archive record for this swimmer'; end if;

  -- chosen squad, else the squad they left if it still exists in their club
  v_squad := coalesce(p_squad,
    (select q.id from public.squads q where q.id = a.squad_id and q.club = v_club));
  if v_squad is not null and not exists (select 1 from public.squads q where q.id = v_squad and q.club = v_club) then
    raise exception 'That squad is not in this swimmer''s club';
  end if;

  update public.swimmers set
    active = true, full_name = a.full_name, date_of_birth = a.date_of_birth,
    swim_england_id = a.swim_england_id, joined_club_on = a.joined_club_on,
    parent_name = a.parent_name, parent_phone = a.parent_phone, parent_email = a.parent_email,
    squad_id = v_squad, squad = null, updated_at = now()   -- trigger refills squad name
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

-- --------------------------------------------------------------------------
-- The only way to search deactivated swimmers: the admin tool.
create or replace function public.list_deactivated_swimmers(p_club text)
returns table (swimmer_id uuid, full_name text, anon_name text, date_of_birth date,
               squad_id uuid, squad text, reason text, deactivated_on date, result_count bigint)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not app_private.can('admin', true, p_club) then
    raise exception 'Only an administrator can view deactivated swimmers';
  end if;
  return query
    select a.swimmer_id, a.full_name, s.full_name, a.date_of_birth, a.squad_id, a.squad,
           a.reason, a.deactivated_on,
           (select count(*) from public.swim_results r where r.swimmer_id = a.swimmer_id)
      from public.swimmer_archive a
      join public.swimmers s on s.id = a.swimmer_id
     where s.club = p_club
     order by a.full_name;
end;
$$;

revoke all on function public.deactivate_swimmer(uuid, text)   from public, anon;
revoke all on function public.reactivate_swimmer(uuid, uuid)   from public, anon;
revoke all on function public.list_deactivated_swimmers(text)  from public, anon;
grant execute on function public.deactivate_swimmer(uuid, text)  to authenticated;
grant execute on function public.reactivate_swimmer(uuid, uuid)  to authenticated;
grant execute on function public.list_deactivated_swimmers(text) to authenticated;
