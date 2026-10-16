-- Tracks the cross-club (Tier 2) statistical-view work defined in
-- claude/specs/multi-tenancy-and-statistics.md. Build is explicitly
-- deferred until the underlying statistical models exist; this just
-- logs the two actions so the design isn't lost.

insert into public.app_dev_tasks (id, title, area, milestone, priority, status, gate, notes)
values
('A-110', 'Build first Tier 2 (cross-club, aggregated, anonymised) statistical view(s) once enough statistical models exist to be worth cross-club benchmarking', 'Statistics', 'M6', 'Should', 'todo', false, 'Depends on claude/specs/multi-tenancy-and-statistics.md rules: min cohort n>=10, no identifying fields, no named club-vs-club by default, security invoker, recomputed not replicated. Depends on Simon building the underlying statistical models first.'),
('A-111', 'Add the cross-club Tier 2 processing purpose to the DPIA and privacy notice', 'GDPR', 'M6', 'Must', 'todo', true, 'Using one club''s data to inform another club''s insight is a distinct processing purpose even when aggregated. See claude/specs/multi-tenancy-and-statistics.md.');
