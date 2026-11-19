-- Session writer (free-form planning inside Coach Tools), 19 Nov 2026.
-- The coach's session focus, picked from the same Stroke/Skills list as Feedback
-- (Free, Back, Breast, Fly, Dive, Transition, Touch turn, Tumble turn, Training mindset, Racing mindset).
-- The primary training focus stays in training_zone. stroke_skills is still filled (mapped) so lists and stats keep working.
alter table public.session_plans
  add column if not exists focus_categories text[] not null default '{}';

comment on column public.session_plans.focus_categories is
  'Session focus chosen by the coach, using the Feedback Stroke/Skills categories (swimmer_feedback.category values)';
