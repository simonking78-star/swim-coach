-- A-035: subject access export and erasure with an anonymised statistical archive.
-- dsar_export(swimmer)        -> everything the app holds on one swimmer, as one JSON document.
-- dsar_text_mentions(swimmer) -> free-text places where the swimmer's name appears (for manual review).
-- erase_swimmer(swimmer, reason, confirm_name)
--   -> copies statistical data (race times, test results, structured development data) into
--      anon_* tables under a fresh random id with NO link back, then deletes the swimmer and
--      every personal record about them. Free-text notes are never archived.
-- Club admins and superadmins only. Nothing here is callable by anon.

-- 1. Anonymised archive -----------------------------------------------------------------

create table if not exists public.anon_swimmers (
  anon_id         uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubs(id),
  gender          text,
  archived_season text not null,          -- e.g. '2026/27'; no exact date
  years_at_club   smallint,               -- whole years, rounded down
  created_at      date not null default current_date
);
comment on table public.anon_swimmers is
  'A-035: one row per erased swimmer. Random id, no link to the original swimmer, no name, date of birth or year of birth.';

create table if not exists public.anon_swim_results (
  id              uuid primary key default gen_random_uuid(),
  anon_id         uuid not null references public.anon_swimmers(anon_id) on delete cascade,
  club_id         uuid not null,
  event           text not null,
  course          text,
  swim_time       interval,
  converted_time  interval,
  age_at_swim     smallint,
  season          text,                   -- meet name, venue and exact date are dropped
  level           integer,
  is_pb           boolean
);

create table if not exists public.anon_test_results (
  id              uuid primary key default gen_random_uuid(),
  anon_id         uuid not null references public.anon_swimmers(anon_id) on delete cascade,
  club_id         uuid not null,
  source          text not null check (source in ('test_set', 'metrics')),
  test_name       text,                   -- test set template name (test_set)
  protocol_id     uuid,                   -- Metrics & Measures protocol (metrics)
  level           smallint,
  level_key       text,
  age             smallint,
  test_month      date,                   -- first day of the month only
  season          text,
  score           numeric,
  reps_done       integer,
  reps_total      integer,
  value           numeric,
  points          numeric,
  age_level       smallint,
  set_completed   boolean
);

create table if not exists public.anon_development (
  id              uuid primary key default gen_random_uuid(),
  anon_id         uuid not null references public.anon_swimmers(anon_id) on delete cascade,
  club_id         uuid not null,
  source          text not null check (source in ('feedback', 'assessment')),
  season          text,
  category        text,
  criterion       text,
  status          text,
  measure_code    text,
  measure_value   numeric,
  scores          jsonb                   -- Squad ADA scores only; notes are dropped
);

create table if not exists public.erasure_log (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null,
  requested_on    date,
  completed_at    timestamptz not null default now(),
  completed_by    uuid,
  reason          text,
  counts          jsonb not null           -- rows archived and deleted; no swimmer id or name
);
comment on table public.erasure_log is 'A-035: record that an erasure was done. Holds no swimmer id, name or archive id.';

alter table public.anon_swimmers     enable row level security;
alter table public.anon_swim_results enable row level security;
alter table public.anon_test_results enable row level security;
alter table public.anon_development  enable row level security;
alter table public.erasure_log       enable row level security;

revoke all on public.anon_swimmers, public.anon_swim_results, public.anon_test_results,
              public.anon_development, public.erasure_log from anon;

-- Staff who can read club statistics can read the archive rows. Writes only through erase_swimmer().
create policy anon_swimmers_read     on public.anon_swimmers     for select to authenticated using (app_private.can_c('stats', false, club_id));
create policy anon_swim_results_read on public.anon_swim_results for select to authenticated using (app_private.can_c('stats', false, club_id));
create policy anon_test_results_read on public.anon_test_results for select to authenticated using (app_private.can_c('stats', false, club_id));
create policy anon_development_read  on public.anon_development  for select to authenticated using (app_private.can_c('stats', false, club_id));
create policy erasure_log_read       on public.erasure_log       for select to authenticated using (app_private.can_c('admin', false, club_id));

-- Season label for a date: seasons run September to August.
create or replace function app_private.season_of(d date) returns text
language sql immutable set search_path to '' as $$
  select case when d is null then null
              when extract(month from d) >= 9 then extract(year from d)::int || '/' || right((extract(year from d)::int + 1)::text, 2)
              else (extract(year from d)::int - 1) || '/' || right(extract(year from d)::int::text, 2) end;
$$;

-- 2. Subject access export --------------------------------------------------------------

create or replace function public.dsar_export(p_swimmer uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare s public.swimmers%rowtype;
begin
  select * into s from public.swimmers where id = p_swimmer;
  if not found then raise exception 'Swimmer not found'; end if;
  if not app_private.can_c('admin', false, s.club_id) then
    raise exception 'Only a club administrator can export a swimmer''s data';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'swimmer', to_jsonb(s),
    'club', (select c.name from public.clubs c where c.id = s.club_id),
    'squad', (select q.name from public.squads q where q.id = s.squad_id),
    'archived_details', (select to_jsonb(a) from public.swimmer_archive a where a.swimmer_id = s.id),
    'account', (select to_jsonb(a) - 'created_by' - 'updated_by' from public.member_accounts a where s.account_id is not null and a.id = s.account_id),
    'account_holders', coalesce((select jsonb_agg(to_jsonb(g) - 'updated_by') from public.member_guardians g where s.account_id is not null and g.account_id = s.account_id), '[]'),
    'linked_app_users', coalesce((select jsonb_agg(jsonb_build_object('relationship', u.relationship, 'linked_on', u.created_at)) from public.user_swimmers u where u.swimmer_id = s.id), '[]'),
    'squad_memberships', coalesce((select jsonb_agg(to_jsonb(m) || jsonb_build_object('squad_name', (select q.name from public.squads q where q.id = m.squad_id)) order by m.joined_squad_on) from public.squad_memberships m where m.swimmer_id = s.id), '[]'),
    'attendance', coalesce((select jsonb_agg(to_jsonb(r) order by r.session_date) from public.attendance_records r where r.swimmer_id = s.id), '[]'),
    'swim_results', coalesce((select jsonb_agg(to_jsonb(r) order by r.meet_date) from public.swim_results r where r.swimmer_id = s.id), '[]'),
    'feedback', coalesce((select jsonb_agg(to_jsonb(f) order by f.session_date) from public.swimmer_feedback f where f.swimmer_id = s.id), '[]'),
    'assessments', coalesce((select jsonb_agg(to_jsonb(a) order by a.assessed_at) from public.assessments a where a.swimmer_id = s.id), '[]'),
    'test_results', coalesce((select jsonb_agg(to_jsonb(t) order by t.session_date) from public.test_results t where t.swimmer_id = s.id), '[]'),
    'metrics_results', coalesce((select jsonb_agg(to_jsonb(t) order by t.session_date) from public.mm_results t where t.swimmer_id = s.id), '[]'),
    'metrics_trials', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.mm_trials t where t.swimmer_id = s.id), '[]'),
    'stopwatch_times', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.stopwatch_times t where t.swimmer_id = s.id), '[]'),
    'medical', coalesce((select jsonb_agg(to_jsonb(t)) from public.swimmer_medical t where t.swimmer_id = s.id), '[]'),
    'emergency_contacts', coalesce((select jsonb_agg(to_jsonb(t)) from public.swimmer_emergency_contacts t where t.swimmer_id = s.id), '[]'),
    'fees', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.member_fees t where t.swimmer_id = s.id), '[]'),
    'swim_england_registrations', coalesce((select jsonb_agg(to_jsonb(t)) from public.swim_england_registrations t where t.swimmer_id = s.id), '[]'),
    'competition_registrations', coalesce((select jsonb_agg(to_jsonb(t)) from public.competition_registrations t where t.swimmer_id = s.id), '[]'),
    'test_sessions_included_in', (select count(*) from public.test_sessions t where s.id = any(t.swimmer_ids))
                                 + (select count(*) from public.mm_sessions t where s.id = any(t.swimmer_ids)),
    'free_text_mentions', public.dsar_text_mentions(s.id)
  );
end; $$;

-- Free text that names the swimmer (full name, or first name as a whole word) in the swimmer's club.
-- Returns where it is, not the text, so the admin can review each one by hand.
create or replace function public.dsar_text_mentions(p_swimmer uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare s public.swimmers%rowtype; full_re text; first_re text;
begin
  select * into s from public.swimmers where id = p_swimmer;
  if not found then raise exception 'Swimmer not found'; end if;
  if not app_private.can_c('admin', false, s.club_id) then
    raise exception 'Only a club administrator can search for a swimmer''s name';
  end if;
  full_re  := '\m' || regexp_replace(trim(s.full_name), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M';
  first_re := '\m' || regexp_replace(split_part(trim(s.full_name), ' ', 1), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M';
  return coalesce((select jsonb_agg(x) from (
      select 'session_plans' as "table", p.id, p.intended_date::text as dated,
             case when concat_ws(' ', p.raw_text, p.content::text, p.notes, p.title) ~* full_re then 'full name' else 'first name' end as matched
        from public.session_plans p
       where p.club_id = s.club_id and concat_ws(' ', p.raw_text, p.content::text, p.notes, p.title) ~* first_re
      union all
      select 'squad_feedback', f.id, f.session_date::text,
             case when concat_ws(' ', f.observation, f.remedial_action, f.note) ~* full_re then 'full name' else 'first name' end
        from public.squad_feedback f
       where f.club_id = s.club_id and concat_ws(' ', f.observation, f.remedial_action, f.note) ~* first_re
      union all
      select 'swimmer_feedback (another swimmer)', f.id, f.session_date::text,
             case when concat_ws(' ', f.observation, f.remedial_action, f.note) ~* full_re then 'full name' else 'first name' end
        from public.swimmer_feedback f
       where f.club_id = s.club_id and f.swimmer_id <> s.id and concat_ws(' ', f.observation, f.remedial_action, f.note) ~* first_re
    ) x), '[]'::jsonb);
end; $$;

-- 3. Erasure ----------------------------------------------------------------------------

create or replace function public.erase_swimmer(p_swimmer uuid, p_reason text, p_confirm_name text, p_requested_on date default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  s        public.swimmers%rowtype;
  v_name   text;
  v_anon   uuid := gen_random_uuid();
  c        jsonb := '{}'::jsonb;
  n        integer;
  v_other  integer;
  v_mentions jsonb;
begin
  select * into s from public.swimmers where id = p_swimmer for update;
  if not found then raise exception 'Swimmer not found'; end if;
  if s.club_id is null then raise exception 'Swimmer has no club; erasure must be done by the superadmin by hand'; end if;
  if not app_private.can_c('admin', true, s.club_id) then
    raise exception 'Only a club administrator can erase a swimmer';
  end if;
  -- A deactivated swimmer's real name sits in swimmer_archive.
  v_name := coalesce((select a.full_name from public.swimmer_archive a where a.swimmer_id = s.id), s.full_name);
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(v_name)) then
    raise exception 'Type the swimmer''s full name exactly to confirm the erasure';
  end if;

  v_mentions := public.dsar_text_mentions(s.id);

  -- 3a. Anonymised copy. Fresh random id; nothing links it to the swimmer.
  insert into public.anon_swimmers (anon_id, club_id, gender, archived_season, years_at_club)
  values (v_anon, s.club_id, s.gender, app_private.season_of(current_date),
          case when coalesce(s.joined_club_on, (select a.joined_club_on from public.swimmer_archive a where a.swimmer_id = s.id)) is null then null
               else floor(extract(epoch from age(current_date, coalesce(s.joined_club_on, (select a.joined_club_on from public.swimmer_archive a where a.swimmer_id = s.id)))) / 31557600)::smallint end);

  insert into public.anon_swim_results (anon_id, club_id, event, course, swim_time, converted_time, age_at_swim, season, level, is_pb)
  select v_anon, s.club_id, r.event, r.course, r.swim_time, r.converted_time, r.age_at_swim, app_private.season_of(r.meet_date), r.level, r.is_pb
    from public.swim_results r where r.swimmer_id = s.id;
  get diagnostics n = row_count; c := c || jsonb_build_object('archived_swim_results', n);

  insert into public.anon_test_results (anon_id, club_id, source, test_name, level, age, test_month, season, score, reps_done, reps_total)
  select v_anon, s.club_id, 'test_set', t.template_name, t.level, t.age, date_trunc('month', t.session_date)::date, app_private.season_of(t.session_date), t.score, t.reps_done, t.reps_total
    from public.test_results t where t.swimmer_id = s.id;
  get diagnostics n = row_count; c := c || jsonb_build_object('archived_test_results', n);

  insert into public.anon_test_results (anon_id, club_id, source, protocol_id, level_key, age, test_month, season, value, points, age_level, set_completed)
  select v_anon, s.club_id, 'metrics', t.protocol_id, t.level_key, coalesce(t.scored_age, t.age), date_trunc('month', t.session_date)::date, app_private.season_of(t.session_date), t.value, t.points, t.age_level, t.set_completed
    from public.mm_results t where t.swimmer_id = s.id and coalesce(t.status, '') <> 'not_tested';
  get diagnostics n = row_count; c := c || jsonb_build_object('archived_metrics_results', n);

  insert into public.anon_development (anon_id, club_id, source, season, category, criterion, status, measure_code, measure_value)
  select v_anon, s.club_id, 'feedback', app_private.season_of(f.session_date), f.category, f.criterion, f.status, f.measure_code, f.measure_value
    from public.swimmer_feedback f
   where f.swimmer_id = s.id and (f.status is not null or f.measure_code is not null);
  get diagnostics n = row_count; c := c || jsonb_build_object('archived_feedback_items', n);

  insert into public.anon_development (anon_id, club_id, source, season, category, scores)
  select v_anon, s.club_id, 'assessment', app_private.season_of(a.assessed_at::date), a."group", a.scores
    from public.assessments a where a.swimmer_id = s.id and a.scores is not null;
  get diagnostics n = row_count; c := c || jsonb_build_object('archived_assessments', n);

  -- 3b. Delete everything personal. Explicit deletes, so nothing depends on cascade settings.
  delete from public.mm_trials                  where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_metrics_trials', n);
  delete from public.mm_results                 where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_metrics_results', n);
  delete from public.test_results               where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_test_results', n);
  delete from public.stopwatch_times            where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_stopwatch_times', n);
  delete from public.swimmer_feedback           where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_feedback', n);
  delete from public.assessments                where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_assessments', n);
  delete from public.attendance_records         where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_attendance', n);
  delete from public.squad_memberships          where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_squad_memberships', n);
  delete from public.swim_results               where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_swim_results', n);
  delete from public.swimmer_medical            where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_medical', n);
  delete from public.swimmer_emergency_contacts where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_emergency_contacts', n);
  delete from public.swim_england_registrations where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_se_registrations', n);
  delete from public.competition_registrations  where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_competition_registrations', n);
  delete from public.user_swimmers              where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_app_user_links', n);
  delete from public.swimmer_archive            where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('deleted_deactivation_archive', n);
  -- Fee records belong to the account holder's accounts: keep the amounts, drop the link to the child.
  update public.member_fees set swimmer_id = null where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('fees_unlinked', n);
  update public.mm_sessions   set swimmer_ids = array_remove(swimmer_ids, s.id) where s.id = any(swimmer_ids);
  update public.test_sessions set swimmer_ids = array_remove(swimmer_ids, s.id) where s.id = any(swimmer_ids);
  update public.role_test_mode set swimmer_ids = array_remove(swimmer_ids, s.id) where s.id = any(swimmer_ids);

  select count(*) into v_other from public.swimmers x where s.account_id is not null and x.account_id = s.account_id and x.id <> s.id;
  delete from public.swimmers where id = s.id;

  insert into public.erasure_log (club_id, requested_on, completed_by, reason, counts)
  values (s.club_id, p_requested_on, auth.uid(), nullif(trim(p_reason), ''), c);

  return jsonb_build_object(
    'done', true,
    'counts', c,
    'free_text_to_review', v_mentions,
    'account_has_other_swimmers', v_other > 0,
    'note', case when s.account_id is not null and v_other = 0
                 then 'The account holder''s own details (member_guardians) remain. Erase them only if the parent asked for their own data to go too.'
                 else null end);
end; $$;

revoke all on function public.dsar_export(uuid), public.dsar_text_mentions(uuid),
                       public.erase_swimmer(uuid, text, text, date) from public, anon;
grant execute on function public.dsar_export(uuid), public.dsar_text_mentions(uuid),
                          public.erase_swimmer(uuid, text, text, date) to authenticated;
