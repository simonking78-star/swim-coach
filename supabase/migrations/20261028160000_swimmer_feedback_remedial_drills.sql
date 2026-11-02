-- Remedial action on swimmer feedback can name drills/skills from drills_library.
-- remedial_action keeps the readable text (drill names + any cue) so reports,
-- PDFs and skills that read it carry on unchanged.
alter table public.swimmer_feedback
  add column if not exists remedial_drill_ids uuid[] not null default '{}';
create index if not exists swimmer_feedback_remedial_drill_ids_gin
  on public.swimmer_feedback using gin (remedial_drill_ids);
comment on column public.swimmer_feedback.remedial_drill_ids is
  'drills_library ids chosen as the remedial action (drills and skills).';
