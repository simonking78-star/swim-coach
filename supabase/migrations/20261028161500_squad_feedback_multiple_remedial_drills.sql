-- Squad feedback can name several remedial drills/skills, each linked to the chosen season weeks.
alter table public.squad_feedback
  add column if not exists remedial_drill_ids uuid[] not null default '{}';
update public.squad_feedback set remedial_drill_ids = array[drill_id]
  where drill_id is not null and remedial_drill_ids = '{}';
create index if not exists squad_feedback_remedial_drill_ids_gin
  on public.squad_feedback using gin (remedial_drill_ids);
comment on column public.squad_feedback.remedial_drill_ids is
  'drills_library ids chosen as the remedial action. drill_id keeps the first for older readers.';

-- One link per entry, week AND drill (was one per entry and week).
alter table public.squad_drill_weeks drop constraint if exists squad_drill_weeks_squad_feedback_id_micro_id_key;
alter table public.squad_drill_weeks
  add constraint squad_drill_weeks_feedback_micro_drill_key unique (squad_feedback_id, micro_id, drill_id);
