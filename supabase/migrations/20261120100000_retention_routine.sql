-- A-034: retention routine. Builds on 20261120090000_dsar_export_and_erasure.sql.
-- erase_swimmer's work moves into app_private.erase_swimmer_core so the routine can reuse it.
-- retention_due(club)              -> what the schedule says is due now (counts only).
-- apply_retention(club, dry_run)   -> does it; dry_run (the default) only reports.
-- Schedule (claude doc "Retention schedule: Coach Tools (RRSC)"):
--   medical + emergency contacts: deleted 30 days after the swimmer is deactivated
--   everything else about a swimmer: erased (anonymous archive kept) 1 year after deactivation
--   fees: deleted 6 years after the end of the calendar year of the fee date (club to confirm year end)
--   parent accounts: deleted 1 year after being marked resigned, once no children or fees remain
--   other clubs' swimmers with no swim in 3 years, and app accounts with no role: reported, superadmin acts.
-- Nothing is scheduled here: pg_cron is added only once the Club has approved the schedule.

-- 1. Core erasure (no permission or name check; callers do those) ------------------------

create or replace function app_private.erase_swimmer_core(p_swimmer uuid, p_reason text, p_requested_on date default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  s        public.swimmers%rowtype;
  v_anon   uuid := gen_random_uuid();
  v_joined date;
  c        jsonb := '{}'::jsonb;
  n        integer;
  v_other  integer;
begin
  select * into s from public.swimmers where id = p_swimmer for update;
  if not found then raise exception 'Swimmer not found'; end if;
  if s.club_id is null then raise exception 'Swimmer has no club; erasure must be done by the superadmin by hand'; end if;
  v_joined := coalesce(s.joined_club_on, (select a.joined_club_on from public.swimmer_archive a where a.swimmer_id = s.id));

  insert into public.anon_swimmers (anon_id, club_id, gender, archived_season, years_at_club)
  values (v_anon, s.club_id, s.gender, app_private.season_of(current_date),
          case when v_joined is null then null else floor(extract(epoch from age(current_date, v_joined)) / 31557600)::smallint end);

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
  update public.member_fees set swimmer_id = null where swimmer_id = s.id; get diagnostics n = row_count; c := c || jsonb_build_object('fees_unlinked', n);
  update public.mm_sessions    set swimmer_ids = array_remove(swimmer_ids, s.id) where s.id = any(swimmer_ids);
  update public.test_sessions  set swimmer_ids = array_remove(swimmer_ids, s.id) where s.id = any(swimmer_ids);
  update public.role_test_mode set swimmer_ids = array_remove(swimmer_ids, s.id) where s.id = any(swimmer_ids);

  select count(*) into v_other from public.swimmers x where s.account_id is not null and x.account_id = s.account_id and x.id <> s.id;
  delete from public.swimmers where id = s.id;

  insert into public.erasure_log (club_id, requested_on, completed_by, reason, counts)
  values (s.club_id, p_requested_on, auth.uid(), nullif(trim(p_reason), ''), c);

  return jsonb_build_object('done', true, 'counts', c,
    'account_id', s.account_id, 'account_has_other_swimmers', v_other > 0);
end; $$;
revoke all on function app_private.erase_swimmer_core(uuid, text, date) from public, anon, authenticated;

-- 2. erase_swimmer: same checks as before, now calls the core ---------------------------

create or replace function public.erase_swimmer(p_swimmer uuid, p_reason text, p_confirm_name text, p_requested_on date default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare s public.swimmers%rowtype; v_name text; v_mentions jsonb; r jsonb;
begin
  select * into s from public.swimmers where id = p_swimmer;
  if not found then raise exception 'Swimmer not found'; end if;
  if not app_private.can_c('admin', true, s.club_id) then
    raise exception 'Only a club administrator can erase a swimmer';
  end if;
  v_name := coalesce((select a.full_name from public.swimmer_archive a where a.swimmer_id = s.id), s.full_name);
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(v_name)) then
    raise exception 'Type the swimmer''s full name exactly to confirm the erasure';
  end if;
  v_mentions := public.dsar_text_mentions(s.id);
  r := app_private.erase_swimmer_core(s.id, p_reason, p_requested_on);
  return (r - 'account_id') || jsonb_build_object(
    'free_text_to_review', v_mentions,
    'note', case when s.account_id is not null and not (r->>'account_has_other_swimmers')::boolean
                 then 'The account holder''s own details (member_guardians) remain. Erase them only if the parent asked for their own data to go too.'
                 else null end);
end; $$;

-- 3. What is due -----------------------------------------------------------------------

create or replace function app_private.fee_due_for_deletion(f public.member_fees) returns boolean
language sql stable set search_path to '' as $$
  -- 6 years after the end of the calendar year of the fee (club to confirm its financial year end).
  select (make_date(extract(year from coalesce(f.period_end, f.due_on, f.paid_on, f.created_at::date))::int, 12, 31) + interval '6 years')::date < current_date;
$$;

create or replace function public.retention_due(p_club uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare is_super boolean;
begin
  if not app_private.can_c('admin', false, p_club) then
    raise exception 'Only a club administrator can see what is due under the retention schedule';
  end if;
  is_super := app_private.can_c('appdev', false, null);
  return jsonb_build_object(
    'checked_at', now(),
    'medical_to_delete', (select count(distinct x.swimmer_id) from (
        select m.swimmer_id from public.swimmer_medical m union all select e.swimmer_id from public.swimmer_emergency_contacts e) x
        join public.swimmers s on s.id = x.swimmer_id
        join public.swimmer_archive a on a.swimmer_id = s.id
       where s.club_id = p_club and s.active is false and a.deactivated_on <= current_date - 30),
    'swimmers_to_erase', (select count(*) from public.swimmers s join public.swimmer_archive a on a.swimmer_id = s.id
       where s.club_id = p_club and s.active is false and a.deactivated_on <= current_date - interval '1 year'),
    'deactivated_without_date', (select count(*) from public.swimmers s
       where s.club_id = p_club and s.active is false and not exists (select 1 from public.swimmer_archive a where a.swimmer_id = s.id)),
    'fees_to_delete', (select count(*) from public.member_fees f where f.club_id = p_club and app_private.fee_due_for_deletion(f)),
    'parent_accounts_to_delete', (select count(*) from public.member_accounts m where m.club_id = p_club
       and m.status = 'resigned' and coalesce(m.resigned_on, m.status_changed_on) <= current_date - interval '1 year'
       and not exists (select 1 from public.swimmers s where s.account_id = m.id)
       and not exists (select 1 from public.member_fees f where f.account_id = m.id)),
    -- superadmin only: data outside any one club's control
    'other_club_swimmers_no_swim_3y', case when is_super then (select count(*) from public.swimmers s
       where not exists (select 1 from public.user_roles r where r.club_id = s.club_id)
         and not exists (select 1 from public.swim_results x where x.swimmer_id = s.id and x.meet_date > current_date - interval '3 years')) end,
    'app_accounts_without_role_1y', case when is_super then (select count(*) from auth.users u
       where not exists (select 1 from public.user_roles r where r.user_id = u.id)
         and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '1 year') end
  );
end; $$;

-- 4. Apply ------------------------------------------------------------------------------

create or replace function public.apply_retention(p_club uuid, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  due jsonb; r record; n integer; erased integer := 0; med integer := 0; fees integer := 0; accts integer := 0;
begin
  if not app_private.can_c('admin', true, p_club) then
    raise exception 'Only a club administrator can apply the retention schedule';
  end if;
  due := public.retention_due(p_club);
  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'due', due);
  end if;

  -- medical and emergency contacts, 30 days after deactivation
  delete from public.swimmer_medical m using public.swimmers s, public.swimmer_archive a
   where m.swimmer_id = s.id and a.swimmer_id = s.id and s.club_id = p_club and s.active is false and a.deactivated_on <= current_date - 30;
  get diagnostics n = row_count; med := med + n;
  delete from public.swimmer_emergency_contacts m using public.swimmers s, public.swimmer_archive a
   where m.swimmer_id = s.id and a.swimmer_id = s.id and s.club_id = p_club and s.active is false and a.deactivated_on <= current_date - 30;
  get diagnostics n = row_count; med := med + n;

  -- full erasure, 1 year after deactivation (anonymous archive kept)
  for r in select s.id from public.swimmers s join public.swimmer_archive a on a.swimmer_id = s.id
            where s.club_id = p_club and s.active is false and a.deactivated_on <= current_date - interval '1 year' loop
    perform app_private.erase_swimmer_core(r.id, 'Retention schedule: 1 year after leaving', null);
    erased := erased + 1;
  end loop;

  -- fees older than 6 years after their year end
  delete from public.member_fees f where f.club_id = p_club and app_private.fee_due_for_deletion(f);
  get diagnostics fees = row_count;

  -- parent accounts marked resigned over a year ago, with no children and no fees left
  delete from public.member_guardians g using public.member_accounts m
   where g.account_id = m.id and m.club_id = p_club
     and m.status = 'resigned' and coalesce(m.resigned_on, m.status_changed_on) <= current_date - interval '1 year'
     and not exists (select 1 from public.swimmers s where s.account_id = m.id)
     and not exists (select 1 from public.member_fees f where f.account_id = m.id);
  delete from public.member_accounts m where m.club_id = p_club
     and m.status = 'resigned' and coalesce(m.resigned_on, m.status_changed_on) <= current_date - interval '1 year'
     and not exists (select 1 from public.swimmers s where s.account_id = m.id)
     and not exists (select 1 from public.member_fees f where f.account_id = m.id);
  get diagnostics accts = row_count;

  return jsonb_build_object('dry_run', false, 'due_before', due,
    'medical_rows_deleted', med, 'swimmers_erased', erased, 'fees_deleted', fees, 'parent_accounts_deleted', accts,
    'not_done_here', 'Other clubs'' swimmers and app accounts without a role are for the superadmin to review.');
end; $$;

revoke all on function public.retention_due(uuid), public.apply_retention(uuid, boolean) from public, anon;
grant execute on function public.retention_due(uuid), public.apply_retention(uuid, boolean) to authenticated;
