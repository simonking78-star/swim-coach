-- A-154: unified club-wide vocabulary, development targets, term tagging, plan usage log.
-- (Spec: "Unified vocabulary, drills and development analysis", agreed 16-17 Nov 2026.)
-- Additive only: drills_library, drill_periodisation and drill_set_line_archive are left untouched.

-- 1. Development targets (global reference list)
create table public.development_targets (
  id uuid primary key default gen_random_uuid(),
  target_group text not null check (target_group in ('technical','skills','physical','mindset')),
  name text not null,
  oadf_domain text check (oadf_domain in ('Person','Athlete','Performer')),
  oadf_levels text[],            -- for mindset rows: which OADF levels the attribute applies to
  sort_order int not null default 0,
  source text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (target_group, name)
);

insert into public.development_targets (target_group, name, sort_order, source) values
 ('technical','Streamline',1,'club'),('technical','Body alignment',2,'club'),('technical','Catch',3,'club'),
 ('technical','Power phase',4,'club'),('technical','Body roll',5,'club'),('technical','Breathing',6,'club'),
 ('technical','Kick',7,'club'),('technical','Timing',8,'club'),('technical','Recoveries',9,'club'),
 ('technical','End of stroke',10,'club'),
 ('skills','Dive starts',1,'club'),('skills','Backstroke starts',2,'club'),('skills','Relay takeovers',3,'club'),
 ('skills','Turns',4,'club'),('skills','Underwaters',5,'club'),('skills','Breakouts',6,'club'),('skills','Finishes',7,'club'),
 ('physical','Aerobic',1,'club'),('physical','Threshold',2,'club'),('physical','Lactate production',3,'club'),
 ('physical','Lactate tolerance',4,'club'),('physical','Sprint',5,'club'),('physical','Recovery',6,'club');

-- Mindset/race craft = OADF attributes (WNSC interpretation of British Swimming OADF; verify against official Aquatics GB OADF)
insert into public.development_targets (target_group, name, oadf_domain, oadf_levels, sort_order, source) values
 ('mindset','Enjoys the Journey','Person',array['Junior Competitive','Competitive Plus','Youth Performance','Senior Performance'],1,'OADF (WNSC) - verify'),
 ('mindset','Resilient & Robust','Person',array['Junior Competitive','Competitive Plus','Youth Performance','Senior Performance'],2,'OADF (WNSC) - verify'),
 ('mindset','Driven','Person',array['Junior Competitive','Competitive Plus','Youth Performance','Senior Performance'],3,'OADF (WNSC) - verify'),
 ('mindset','Good Learner','Person',array['Junior Competitive','Competitive Plus','Youth Performance','Senior Performance'],4,'OADF (WNSC) - verify'),
 ('mindset','Independent','Person',array['Junior Competitive','Competitive Plus','Youth Performance','Senior Performance'],5,'OADF (WNSC) - verify'),
 ('mindset','Performance Behaviours / Winning Habits','Athlete',array['Junior Competitive','Competitive Plus','Youth Performance','Senior Performance'],6,'OADF (WNSC) - verify'),
 ('mindset','Physically Suitable / Primed','Athlete',array['Junior Competitive','Competitive Plus','Youth Performance','Senior Performance'],7,'OADF (WNSC) - verify'),
 ('mindset','Coachable','Athlete',array['Junior Competitive','Competitive Plus','Youth Performance','Senior Performance'],8,'OADF (WNSC) - verify'),
 ('mindset','Technically Excellent','Athlete',array['Junior Competitive','Competitive Plus','Youth Performance','Senior Performance'],9,'OADF (WNSC) - verify'),
 ('mindset','Loves Race Day','Performer',array['Junior Competitive','Competitive Plus','Youth Performance'],10,'OADF (WNSC) - verify'),
 ('mindset','Execute your Race Plan','Performer',array['Junior Competitive','Competitive Plus','Youth Performance'],11,'OADF (WNSC) - verify'),
 ('mindset','Perform when it Matters','Performer',array['Junior Competitive','Competitive Plus','Youth Performance'],12,'OADF (WNSC) - verify'),
 ('mindset','Arena Skills','Performer',array['Senior Performance'],13,'OADF (WNSC) - verify'),
 ('mindset','Race Craft','Performer',array['Senior Performance'],14,'OADF (WNSC) - verify'),
 ('mindset','Psychologically Prepared','Performer',array['Senior Performance'],15,'OADF (WNSC) - verify');

alter table public.development_targets enable row level security;
create policy dt_select on public.development_targets for select to authenticated using (true);

-- 2. Unified vocabulary (club-wide)
create table public.vocabulary_terms (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id),
  term text not null,
  aliases text[] not null default '{}',
  full_form text,
  meaning text,
  term_type text not null check (term_type in ('drill','skill','stroke','equipment','intensity','set_type','other')),
  stroke text,
  details jsonb not null default '{}'::jsonb,   -- drill detail: purpose, biomechanical, blabt, equipment, regression, progression
  status text not null default 'pending' check (status in ('pending','approved','rejected','merged')),
  merged_into uuid references public.vocabulary_terms(id),
  auto_merged boolean not null default false,
  claude_verdict text check (claude_verdict in ('distinct','duplicate','conflict')),
  claude_reason text,
  claude_match_id uuid references public.vocabulary_terms(id),
  claude_checked_at timestamptz,
  created_by uuid default auth.uid(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  legacy_drill_id uuid unique references public.drills_library(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vocabulary_terms_approved_unique on public.vocabulary_terms (club_id, lower(term)) where status = 'approved';
create index vocabulary_terms_club_status on public.vocabulary_terms (club_id, status);
create index vocabulary_terms_aliases on public.vocabulary_terms using gin (aliases);

alter table public.vocabulary_terms enable row level security;
create policy rbac_select on public.vocabulary_terms for select to authenticated using (app_private.can_c('plans', false, club_id));
create policy rbac_insert on public.vocabulary_terms for insert to authenticated with check (app_private.can_c('plans', true, club_id));
create policy rbac_update on public.vocabulary_terms for update to authenticated using (app_private.can_c('plans', true, club_id)) with check (app_private.can_c('plans', true, club_id));

-- 3. Term -> development target tags (the coach's intention)
create table public.term_targets (
  term_id uuid not null references public.vocabulary_terms(id),
  target_id uuid not null references public.development_targets(id),
  weight text not null default 'primary' check (weight in ('primary','secondary')),
  suggested_by text not null default 'coach' check (suggested_by in ('coach','claude','migration')),
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (term_id, target_id)
);
alter table public.term_targets enable row level security;
create policy rbac_select on public.term_targets for select to authenticated
  using (exists (select 1 from public.vocabulary_terms v where v.id = term_id and app_private.can_c('plans', false, v.club_id)));
create policy rbac_insert on public.term_targets for insert to authenticated
  with check (exists (select 1 from public.vocabulary_terms v where v.id = term_id and app_private.can_c('plans', true, v.club_id)));
create policy rbac_update on public.term_targets for update to authenticated
  using (exists (select 1 from public.vocabulary_terms v where v.id = term_id and app_private.can_c('plans', true, v.club_id)));
create policy rbac_delete on public.term_targets for delete to authenticated
  using (exists (select 1 from public.vocabulary_terms v where v.id = term_id and app_private.can_c('plans', true, v.club_id)));

-- 4. Usage log taken from dated session plans
create table public.plan_line_usage (
  id uuid primary key default gen_random_uuid(),
  session_plan_id uuid references public.session_plans(id),
  club_id uuid not null references public.clubs(id),
  squad_id uuid references public.squads(id),
  plan_date date,
  line_no int,
  line_text text,
  term_id uuid references public.vocabulary_terms(id),
  matched_text text,
  reps int,
  distance_m int,
  total_m int generated always as (coalesce(reps,1) * distance_m) stored,
  interval_text text,
  intensity text,
  source text not null default 'parser' check (source in ('parser','migration')),
  created_at timestamptz not null default now()
);
create index plan_line_usage_club_date on public.plan_line_usage (club_id, plan_date);
create index plan_line_usage_term on public.plan_line_usage (term_id);
create index plan_line_usage_plan on public.plan_line_usage (session_plan_id);
alter table public.plan_line_usage enable row level security;
create policy rbac_select on public.plan_line_usage for select to authenticated using (app_private.can_c('plans', false, club_id));
create policy rbac_insert on public.plan_line_usage for insert to authenticated with check (app_private.can_c('plans', true, club_id));
create policy rbac_delete on public.plan_line_usage for delete to authenticated using (app_private.can_c('plans', true, club_id));

-- 5. Copy existing drills into the vocabulary (originals untouched)
insert into public.vocabulary_terms (club_id, term, aliases, meaning, term_type, stroke, details, status, legacy_drill_id, created_by, created_at)
select d.club_id, d.drill_name, coalesce(d.pseudonyms, '{}'), d.primary_purpose, 'drill', d.stroke,
       jsonb_strip_nulls(jsonb_build_object('purpose', d.primary_purpose, 'biomechanical', d.biomechanical, 'blabt', d.blabt,
         'equipment', d.equipment, 'regression', d.regression, 'progression', d.progression, 'coach', d.coach)),
       'approved', d.id, null, d.created_at
from public.drills_library d
where d.club_id is not null
on conflict do nothing;

-- 6. Copy the set-line archive into the usage log
insert into public.plan_line_usage (session_plan_id, club_id, squad_id, plan_date, line_text, term_id, matched_text, source, created_at)
select a.session_plan_id, v.club_id, sp.squad_id, sp.intended_date, a.set_line_text, v.id, v.term, 'migration', a.created_at
from public.drill_set_line_archive a
join public.vocabulary_terms v on v.legacy_drill_id = a.drill_id
left join public.session_plans sp on sp.id = a.session_plan_id;

-- 7. Retire predefined periodisation (read-only, kept)
comment on table public.drill_periodisation is 'Retired by A-154 (Nov 2026): drill usage now comes from plan_line_usage. Kept read-only for history.';
comment on table public.drill_set_line_archive is 'Superseded by plan_line_usage (A-154). Kept for history.';
