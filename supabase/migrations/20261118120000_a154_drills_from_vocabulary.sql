-- A-154 phase 3: the vocabulary becomes the master list for Drills & Skills.
--
-- 1. Work tags (Metrics & Measures, A-126) map onto development targets, so there is one list of
--    "what training develops". Work tags with no clear target stay unmapped until the head coach decides.
-- 2. Every active drill or skill in vocabulary_terms is mirrored into drills_library, which keeps its ids.
--    Feedback remedial drills, the season planner's drill weeks, plan drill links and the classic app all
--    still point at drills_library ids, so nothing else has to change. The app edits the vocabulary; the
--    database keeps drills_library in step. A drill added straight to drills_library (classic app) is
--    copied into the vocabulary.
-- 3. vocab_can_review(club): whether the signed-in user sees the head-coach review list.

-- 1 ---------------------------------------------------------------------------
alter table public.development_targets add column work_tag text;
comment on column public.development_targets.work_tag is
  'Metrics & Measures work tag (app_private.mm_auto_tags) that counts towards this target.';

update public.development_targets set work_tag = m.tag
from (values ('Kick','kick'), ('Turns','turns'), ('Dive starts','starts'), ('Underwaters','underwater'),
             ('Sprint','speed'), ('Aerobic','aerobic'), ('Recovery','recovery')) m(name, tag)
where development_targets.name = m.name;
-- Not mapped yet: pull, drill, race_pace, efficiency, warm_up.

-- 2 ---------------------------------------------------------------------------
create or replace function app_private.vocab_mirror_drill()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;  -- called from the drills_library → vocabulary copy
  if new.term_type not in ('drill','skill') or new.status not in ('approved','pending') or not new.active then
    return new;
  end if;
  if new.legacy_drill_id is null then
    insert into public.drills_library (club_id, drill_name, stroke, pseudonyms, primary_purpose, blabt, biomechanical,
                                       equipment, regression, progression, coach)
    values (new.club_id, new.term, new.stroke, nullif(new.aliases, '{}'), coalesce(new.details->>'purpose', new.meaning),
            new.details->>'blabt', new.details->>'biomechanical', new.details->>'equipment',
            new.details->>'regression', new.details->>'progression', new.details->>'coach')
    returning id into new.legacy_drill_id;
  else
    update public.drills_library
       set drill_name = new.term, stroke = new.stroke, pseudonyms = nullif(new.aliases, '{}'),
           primary_purpose = coalesce(new.details->>'purpose', new.meaning),
           blabt = new.details->>'blabt', biomechanical = new.details->>'biomechanical',
           equipment = new.details->>'equipment', regression = new.details->>'regression',
           progression = new.details->>'progression', updated_at = now()
     where id = new.legacy_drill_id;
  end if;
  return new;
end; $$;

create trigger vocabulary_terms_mirror_drill
  before insert or update on public.vocabulary_terms
  for each row execute function app_private.vocab_mirror_drill();

create or replace function app_private.drill_to_vocab()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 or new.club_id is null then return new; end if;  -- the mirror above made this row
  insert into public.vocabulary_terms (club_id, term, aliases, meaning, term_type, stroke, details, status, legacy_drill_id, created_by)
  values (new.club_id, new.drill_name, coalesce(new.pseudonyms, '{}'), new.primary_purpose, 'drill', new.stroke,
          jsonb_strip_nulls(jsonb_build_object('purpose', new.primary_purpose, 'biomechanical', new.biomechanical, 'blabt', new.blabt,
            'equipment', new.equipment, 'regression', new.regression, 'progression', new.progression, 'coach', new.coach,
            'source', 'drills_library')),
          'approved', new.id, auth.uid())
  on conflict do nothing;
  return new;
end; $$;

create trigger drills_library_to_vocabulary
  after insert on public.drills_library
  for each row execute function app_private.drill_to_vocab();

-- Backfill: give every active vocabulary drill/skill a drills_library row (e.g. the drills copied to RRSC).
update public.vocabulary_terms set active = active
 where term_type in ('drill','skill') and status in ('approved','pending') and active and legacy_drill_id is null;

-- 3 ---------------------------------------------------------------------------
create or replace function public.vocab_can_review(p_club uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.is_vocab_reviewer(p_club);
$$;
revoke all on function public.vocab_can_review(uuid) from public, anon;
grant execute on function public.vocab_can_review(uuid) to authenticated;
