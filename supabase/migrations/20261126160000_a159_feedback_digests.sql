-- A-159: parent updates drafted by AI from a swimmer's feedback, edited and approved by a coach.
-- Only roles that can WRITE feedback for the swimmer (coaches of the squad, head coach, admins)
-- can see or touch these rows. Parents see nothing here: release to the parent's archive and
-- email is A-160/A-161 and will read approved rows only.
-- Nothing is deleted: a coach withdraws a draft or an approved update instead.

create table if not exists public.feedback_digests (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubs(id),
  swimmer_id      uuid not null references public.swimmers(id) on delete cascade,  -- erased with the swimmer (erase_swimmer_core deletes the swimmer row)
  period_from     date not null,
  period_to       date not null check (period_to >= period_from),
  source_ids      uuid[] not null default '{}',      -- swimmer_feedback rows the draft was built from
  ai_run_id       uuid references public.ai_runs(id) on delete set null,
  prompt_version  integer,
  draft           jsonb not null,                     -- the AI's draft as returned (going_well, working_on, help_at_home, coach_checks)
  text            text not null,                      -- the coach's working text (starts as the draft)
  status          text not null default 'draft' check (status in ('draft','approved','withdrawn')),
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  approved_by     uuid,
  approved_at     timestamptz,
  withdrawn_at    timestamptz
);
create index if not exists feedback_digests_swimmer on public.feedback_digests (swimmer_id, created_at desc);

-- Stamps who/when; an approved update's wording is frozen (withdraw it and draft again to change it).
create or replace function app_private.feedback_digests_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.status := 'draft'; new.approved_by := null; new.approved_at := null; new.withdrawn_at := null;
    return new;
  end if;
  if old.status = 'withdrawn' then raise exception 'This update was withdrawn and can''t be changed'; end if;
  if old.status = 'approved' and (new.text is distinct from old.text or new.status = 'draft') then
    raise exception 'An approved update can''t be edited; withdraw it and draft a new one';
  end if;
  new.id := old.id; new.club_id := old.club_id; new.swimmer_id := old.swimmer_id; new.draft := old.draft;
  new.source_ids := old.source_ids; new.created_by := old.created_by; new.created_at := old.created_at;
  new.updated_by := auth.uid(); new.updated_at := now();
  if new.status = 'approved' and old.status = 'draft' then
    if length(trim(new.text)) < 20 then raise exception 'The update is too short to approve'; end if;
    new.approved_by := auth.uid(); new.approved_at := now();
  else
    new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  end if;
  if new.status = 'withdrawn' then new.withdrawn_at := now(); end if;
  return new;
end $$;
drop trigger if exists feedback_digests_stamp on public.feedback_digests;
create trigger feedback_digests_stamp before insert or update on public.feedback_digests
  for each row execute function app_private.feedback_digests_stamp();

alter table public.feedback_digests enable row level security;
-- Write-level feedback access for SELECT too: drafts are coach-only.
create policy rbac_select on public.feedback_digests for select to authenticated
  using (swimmer_id in (select app_private.swimmer_ids('feedback', true)) and club_id in (select app_private.my_club_ids()));
create policy rbac_insert on public.feedback_digests for insert to authenticated
  with check (swimmer_id in (select app_private.swimmer_ids('feedback', true)) and club_id in (select app_private.my_club_ids()));
create policy rbac_update on public.feedback_digests for update to authenticated
  using (swimmer_id in (select app_private.swimmer_ids('feedback', true)) and club_id in (select app_private.my_club_ids()))
  with check (swimmer_id in (select app_private.swimmer_ids('feedback', true)) and club_id in (select app_private.my_club_ids()));
-- No delete policy: rows are withdrawn, never deleted (retention is handled by erase_swimmer / apply_retention).
revoke all on public.feedback_digests from anon;

-- Subject access export includes parent updates (drafts, approved and withdrawn).
create or replace function public.dsar_export(p_swimmer uuid)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
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
  ) || jsonb_build_object(
    'parent_updates', coalesce((select jsonb_agg(to_jsonb(d) - 'created_by' - 'updated_by' - 'approved_by' order by d.created_at) from public.feedback_digests d where d.swimmer_id = s.id), '[]')
  );
end; $function$;
revoke all on function public.dsar_export(uuid) from public, anon;
grant execute on function public.dsar_export(uuid) to authenticated;

-- Feature switch: the Parent update tab shows only for clubs with this feature
-- (superadmin sees it once this catalogue row exists). Switch on per club in club_features
-- after A-157 (DPIA/privacy notice for AI drafting).
insert into public.app_features (key, name, description, tier) values
  ('ai_parent_updates', 'AI parent updates', 'Feedback → Parent update: AI drafts a parent update from a swimmer''s feedback; the coach edits and approves (A-159).', 'addon')
on conflict (key) do nothing;
