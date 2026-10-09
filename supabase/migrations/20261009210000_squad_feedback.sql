-- Squad feedback: same shape as swimmer_feedback, but aimed at a squad as a whole.
-- A squad entry can name a drill (drills_library) and the season weeks (micros)
-- it should be worked in; squad_drill_weeks holds one row per drill per week so
-- micro-cycles and the session-plan editor can show "drills to work this week".

create table if not exists public.squad_feedback (
  id uuid primary key default gen_random_uuid(),
  club text not null,
  squad_id uuid not null references public.squads(id) on delete cascade,
  entry_type text not null default 'status' check (entry_type in ('status','note')),
  category text not null,
  criterion text,
  status text check (status is null or status in ('Not discussed','Started','Developing','Embedded')),
  observation text not null,
  remedial_action text,
  note text,
  drill_id uuid references public.drills_library(id) on delete set null,
  session_plan_id uuid references public.session_plans(id) on delete set null,
  session_date date not null default current_date,
  thread_id uuid not null default gen_random_uuid(),
  coach text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists squad_feedback_squad_idx on public.squad_feedback (squad_id, session_date desc);
create index if not exists squad_feedback_thread_idx on public.squad_feedback (thread_id);
create index if not exists squad_feedback_drill_idx on public.squad_feedback (drill_id);
create index if not exists squad_feedback_plan_idx on public.squad_feedback (session_plan_id);

create table if not exists public.squad_drill_weeks (
  id uuid primary key default gen_random_uuid(),
  squad_feedback_id uuid not null references public.squad_feedback(id) on delete cascade,
  squad_id uuid not null references public.squads(id) on delete cascade,
  drill_id uuid not null references public.drills_library(id) on delete cascade,
  micro_id uuid not null references public.micros(id) on delete cascade,
  club text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (squad_feedback_id, micro_id)
);
create index if not exists squad_drill_weeks_micro_idx on public.squad_drill_weeks (micro_id, squad_id);
create index if not exists squad_drill_weeks_squad_idx on public.squad_drill_weeks (squad_id);
create index if not exists squad_drill_weeks_drill_idx on public.squad_drill_weeks (drill_id);

alter table public.squad_feedback enable row level security;
alter table public.squad_drill_weeks enable row level security;

-- Signed out: same open access as the rest of the app until the RBAC cut-over (A-013/A-014).
create policy "allow all for anon" on public.squad_feedback for all to anon using (true) with check (true);
create policy "allow all for anon" on public.squad_drill_weeks for all to anon using (true) with check (true);

-- Signed in: the Feedback row of the roles matrix, scoped to the squad
-- (coach = own squads; parents/swimmers see no squad feedback).
create policy rbac_select on public.squad_feedback for select to authenticated
  using (app_private.can('feedback', false, club, squad_id));
create policy rbac_insert on public.squad_feedback for insert to authenticated
  with check (app_private.can('feedback', true, club, squad_id));
create policy rbac_update on public.squad_feedback for update to authenticated
  using (app_private.can('feedback', true, club, squad_id))
  with check (app_private.can('feedback', true, club, squad_id));
create policy rbac_delete on public.squad_feedback for delete to authenticated
  using (app_private.can('feedback', true, club, squad_id));

-- Drill-week links are read by anyone who can read the season or plans, written by feedback editors.
create policy rbac_select on public.squad_drill_weeks for select to authenticated
  using (app_private.can('feedback', false, club, squad_id) or app_private.can('plans', false, club) or app_private.can('season', false, club));
create policy rbac_insert on public.squad_drill_weeks for insert to authenticated
  with check (app_private.can('feedback', true, club, squad_id));
create policy rbac_update on public.squad_drill_weeks for update to authenticated
  using (app_private.can('feedback', true, club, squad_id))
  with check (app_private.can('feedback', true, club, squad_id));
create policy rbac_delete on public.squad_drill_weeks for delete to authenticated
  using (app_private.can('feedback', true, club, squad_id));
