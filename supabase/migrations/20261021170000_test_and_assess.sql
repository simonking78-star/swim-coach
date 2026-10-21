-- Test & Assess (claude/specs/test-and-assess.md)
--
-- 1. swimmers.year_of_birth — the age used by tests is the Swim England age
--    (age on 31 December of the test year), so only the year is needed.
--    Filled from date_of_birth wherever that is known, and kept in step.
--    Coaches running a test can supply a MISSING year through
--    set_swimmer_birth_year() without being given roster edit rights.
-- 2. test_set_templates — reusable test set models (rounds of distance /
--    interval / repetitions, optionally varying by age). Never deleted:
--    "active = false" hides a template, as elsewhere in the app.
-- 3. test_sessions — one run of a template on a date with a group of
--    swimmers (whole club, a squad or picked swimmers). Keeps its own copy
--    of the model, so later template edits never change archived scores.
-- 4. test_results — one row per swimmer per session; the score is worked
--    out here (age × test level × reps completed) so every screen agrees.
--
-- Access reuses the existing roles × sections matrix (no new section):
--   templates  read: plans R+ · write: plans E (head coach, coach, admins)
--   sessions   read/write: stopwatch (everyone who coaches poolside, incl. helpers)
--   results    write: stopwatch · read: stopwatch or stats (parents/swimmers
--              see only their own child / themselves, through swimmer_ids)

-- ---------------------------------------------------------------------
-- 1. Year of birth
-- ---------------------------------------------------------------------
alter table public.swimmers
  add column if not exists year_of_birth smallint
  check (year_of_birth between 1900 and 2100);

comment on column public.swimmers.year_of_birth is
  'Year of birth. Mirrors date_of_birth when that is known; otherwise entered on its own (e.g. by a coach at a Test & Assess session).';

update public.swimmers
   set year_of_birth = extract(year from date_of_birth)::smallint
 where date_of_birth is not null
   and year_of_birth is distinct from extract(year from date_of_birth)::smallint;

create or replace function app_private.sync_year_of_birth() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.date_of_birth is not null then
    new.year_of_birth := extract(year from new.date_of_birth)::smallint;
  end if;
  return new;
end $$;

create trigger swimmers_sync_year_of_birth
  before insert or update of date_of_birth, year_of_birth on public.swimmers
  for each row execute function app_private.sync_year_of_birth();

-- A coach who can record tests for this swimmer may fill in a missing year.
-- It never overwrites a year that is already known (that stays a roster edit).
create or replace function public.set_swimmer_birth_year(p_swimmer uuid, p_year int)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare v smallint;
begin
  if p_year is null or p_year < 1900 or p_year > extract(year from now())::int then
    raise exception 'Enter a year between 1900 and this year';
  end if;
  if p_swimmer not in (select app_private.swimmer_ids('stopwatch', true)) then
    raise exception 'You cannot record tests for this swimmer';
  end if;
  update public.swimmers
     set year_of_birth = p_year
   where id = p_swimmer and year_of_birth is null and date_of_birth is null
  returning year_of_birth into v;
  if v is null then
    select year_of_birth into v from public.swimmers where id = p_swimmer;
  end if;
  return v;
end $$;

revoke all on function public.set_swimmer_birth_year(uuid, int) from public, anon;
grant execute on function public.set_swimmer_birth_year(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Templates
-- ---------------------------------------------------------------------
create table public.test_set_templates (
  id          uuid primary key default gen_random_uuid(),
  club        text not null,
  club_id     uuid references public.clubs(id),
  name        text not null check (length(trim(name)) > 0),
  description text,
  model       jsonb not null,
  active      boolean not null default true,
  version     integer not null default 1,
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.test_set_templates is
  'Test & Assess templates. model = {"ageBanded":bool,"minAge":int,"maxAge":int,"fixedLevel":int,"rounds":[{"key","name","stroke","restAfterSec","values":{"<age>|all":{"reps","distance","interval"}}}]}';

create unique index test_set_templates_club_name on public.test_set_templates (club, lower(name)) where active;

-- ---------------------------------------------------------------------
-- 3. Sessions
-- ---------------------------------------------------------------------
create table public.test_sessions (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.test_set_templates(id),
  template_name text not null,
  model         jsonb not null,
  club          text not null,
  club_id       uuid references public.clubs(id),
  session_date  date not null default current_date,
  group_type    text not null check (group_type in ('club','squad','swimmers')),
  squad_id      uuid references public.squads(id),
  squad_name    text,
  swimmer_ids   uuid[] not null default '{}',  -- the swimmers on this test (set at start; swimmers can be added or taken off while live)
  status        text not null default 'live' check (status in ('live','closed')),
  clock_started_at timestamptz,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  closed_at     timestamptz,
  check (group_type <> 'squad' or squad_id is not null)
);
create index test_sessions_club_date on public.test_sessions (club, session_date desc);
create index test_sessions_template on public.test_sessions (template_id);

-- ---------------------------------------------------------------------
-- 4. Results
-- ---------------------------------------------------------------------
create table public.test_results (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.test_sessions(id),
  swimmer_id    uuid not null references public.swimmers(id),
  template_id   uuid not null references public.test_set_templates(id),
  template_name text not null,
  club          text not null,
  club_id       uuid references public.clubs(id),
  session_date  date not null,
  year_of_birth smallint,
  age           smallint,          -- Swim England age: test year − year of birth
  level         smallint,          -- the age set swum (or the template's fixed level)
  rounds        jsonb not null default '{}'::jsonb,  -- {"<round key>": {"done": int, "reps": int}}
  reps_done     integer,
  reps_total    integer,
  score         integer,           -- age × level × reps completed (null until age is known)
  note          text,
  recorded_by   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (session_id, swimmer_id)
);
create index test_results_swimmer on public.test_results (swimmer_id, session_date);
create index test_results_template on public.test_results (template_id, session_date);

create or replace function app_private.test_result_fill() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare s public.test_sessions%rowtype;
begin
  select * into s from public.test_sessions where id = new.session_id;
  new.template_id   := s.template_id;
  new.template_name := s.template_name;
  new.club          := s.club;
  new.club_id       := s.club_id;
  new.session_date  := s.session_date;
  if new.year_of_birth is null then
    select year_of_birth into new.year_of_birth from public.swimmers where id = new.swimmer_id;
  end if;
  new.age := case when new.year_of_birth is null then null
                  else extract(year from s.session_date)::int - new.year_of_birth end;
  select coalesce(sum((v->>'done')::int), 0), coalesce(sum((v->>'reps')::int), 0)
    into new.reps_done, new.reps_total
    from jsonb_each(coalesce(new.rounds, '{}'::jsonb)) as e(k, v);
  new.score := case when new.age is null or new.level is null then null
                    else new.age * new.level * new.reps_done end;
  new.updated_at := now();
  return new;
end $$;
revoke all on function app_private.test_result_fill() from public, anon, authenticated;

create trigger test_results_fill before insert or update on public.test_results
  for each row execute function app_private.test_result_fill();

-- Club id for templates and sessions, from the club name.
create or replace function app_private.fill_club_id_by_name() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.club_id is null then
    new.club_id := (select c.id from public.clubs c where c.name = new.club);
  end if;
  return new;
end $$;
revoke all on function app_private.fill_club_id_by_name() from public, anon, authenticated;

create trigger test_set_templates_club_id before insert on public.test_set_templates
  for each row execute function app_private.fill_club_id_by_name();
create trigger test_sessions_club_id before insert on public.test_sessions
  for each row execute function app_private.fill_club_id_by_name();

create trigger test_set_templates_touch before update on public.test_set_templates
  for each row execute function app_private.touch_updated_at();

-- A late year of birth fills in the age and score on that swimmer's existing results.
create or replace function app_private.test_results_after_yob() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.year_of_birth is distinct from old.year_of_birth and new.year_of_birth is not null then
    update public.test_results set year_of_birth = new.year_of_birth
     where swimmer_id = new.id and year_of_birth is null;
  end if;
  return null;
end $$;
revoke all on function app_private.test_results_after_yob() from public, anon, authenticated;

create trigger swimmers_yob_to_test_results after update of year_of_birth on public.swimmers
  for each row execute function app_private.test_results_after_yob();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.test_set_templates enable row level security;
alter table public.test_sessions      enable row level security;
alter table public.test_results       enable row level security;

create or replace function app_private.test_session_live(p uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.test_sessions where id = p and status = 'live');
$$;
create or replace function app_private.test_session_club(p uuid) returns text
  language sql stable security definer set search_path = '' as $$
  select club from public.test_sessions where id = p;
$$;
revoke all on function app_private.test_session_live(uuid), app_private.test_session_club(uuid) from public, anon;
grant execute on function app_private.test_session_live(uuid), app_private.test_session_club(uuid) to authenticated;

-- Templates
create policy rbac_select on public.test_set_templates for select to authenticated
  using (app_private.can('plans', false, club) or app_private.can('stopwatch', false, club));
create policy rbac_insert on public.test_set_templates for insert to authenticated
  with check (app_private.can('plans', true, club));
create policy rbac_update on public.test_set_templates for update to authenticated
  using (app_private.can('plans', true, club))
  with check (app_private.can('plans', true, club));
-- no delete policy: templates are switched off (active = false), never erased

-- Sessions
create policy rbac_select on public.test_sessions for select to authenticated
  using (app_private.can('stopwatch', false, club) or app_private.can('stats', false, club));
create policy rbac_insert on public.test_sessions for insert to authenticated
  with check (app_private.can('stopwatch', true, club));
create policy rbac_update on public.test_sessions for update to authenticated
  using (app_private.can('stopwatch', true, club))
  with check (app_private.can('stopwatch', true, club));

-- Results
create policy rbac_select on public.test_results for select to authenticated
  using (swimmer_id in (select app_private.swimmer_ids('stopwatch', false))
      or swimmer_id in (select app_private.swimmer_ids('stats', false)));
create policy rbac_insert on public.test_results for insert to authenticated
  with check (swimmer_id in (select app_private.swimmer_ids('stopwatch', true))
          and app_private.test_session_live(session_id));
create policy rbac_update on public.test_results for update to authenticated
  using (swimmer_id in (select app_private.swimmer_ids('stopwatch', true))
     and app_private.test_session_live(session_id))
  with check (swimmer_id in (select app_private.swimmer_ids('stopwatch', true))
          and app_private.test_session_live(session_id));
-- A swimmer can be taken off a test only while it is still live.
create policy rbac_delete on public.test_results for delete to authenticated
  using (swimmer_id in (select app_private.swimmer_ids('stopwatch', true))
     and app_private.test_session_live(session_id));

revoke all on public.test_set_templates, public.test_sessions, public.test_results from anon;
grant select, insert, update on public.test_set_templates, public.test_sessions to authenticated;
grant select, insert, update, delete on public.test_results to authenticated;

-- ---------------------------------------------------------------------
-- Starter template: the RRSC aerobic test set (from the test set PDF)
-- ---------------------------------------------------------------------
insert into public.test_set_templates (club, name, description, model, created_by, updated_by)
select 'Redhill and Reigate',
       'RRSC aerobic test set',
       'Repeat 100s Freestyle on the age time, 1 minute break, then repeat 100s IM on the age time. Each age adds 2 x 100 Free and 1 x 100 IM and takes 5 seconds off both times.',
       jsonb_build_object(
         'ageBanded', true, 'minAge', 8, 'maxAge', 18, 'fixedLevel', 1,
         'rounds', jsonb_build_array(
           jsonb_build_object('key','r1','name','Part A','stroke','Freestyle','restAfterSec',60,
             'values', (select jsonb_object_agg(a::text, jsonb_build_object('reps', 6 + 2*(a-8), 'distance', 100, 'interval', 130 - 5*(a-8))) from generate_series(8,18) a)),
           jsonb_build_object('key','r2','name','Part B','stroke','Individual Medley','restAfterSec',0,
             'values', (select jsonb_object_agg(a::text, jsonb_build_object('reps', 3 + 1*(a-8), 'distance', 100, 'interval', 140 - 5*(a-8))) from generate_series(8,18) a))
         )),
       null, null
where exists (select 1 from public.clubs where name = 'Redhill and Reigate')
  and not exists (select 1 from public.test_set_templates where club = 'Redhill and Reigate' and lower(name) = 'rrsc aerobic test set');
