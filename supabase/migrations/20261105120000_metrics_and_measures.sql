-- Metrics & Measures, step 1 (claude/specs/metrics-and-measures.md)
--
-- Replaces the flexible Test & Assess templates with fixed, versioned test
-- protocols graded by level. The old test_* tables stay as the legacy
-- record (THR-00) and are not changed here.
--
--   mm_determinants        lookup: what a test measures (starts, turns, kick…)
--   mm_questions           the club's agreed coaching questions (≤ 8)
--   mm_protocols           a test: code, kind (reps / timed / checklist), status
--   mm_protocol_versions   the locked definition; levels can't change once published
--   mm_reliability         TE, CV%, ICC, SWC per version and level (from the pilot)
--   mm_windows             optional planned testing dates (reminders only)
--   mm_sessions            one run of a published version on ANY date
--   mm_results             one swimmer's result in a session, linked to their
--                          own baseline and previous result
--   mm_trials              trial-by-trial data for timed tests
--   swimmer_feedback       + measure_code / measure_value / measure_context
--
-- Baselines are per swimmer × protocol × major version × level, set
-- automatically from the first valid result whatever its date (ad hoc
-- baselines). A coach can start a new baseline with a reason.
--
-- Access reuses the roles × sections matrix:
--   protocols, versions, reliability, questions, windows
--       read:  plans / stopwatch / stats (read)    write: season (edit) = head coach, club admin, superadmin
--   sessions, results, trials
--       as test_sessions / test_results: stopwatch to run, stats to read

-- ---------------------------------------------------------------------
-- Lookups
-- ---------------------------------------------------------------------
create table public.mm_determinants (
  code  text primary key,
  name  text not null,
  sort  smallint not null default 0
);
insert into public.mm_determinants (code, name, sort) values
  ('start',      'Starts',                    1),
  ('clean',      'Clean (free) swimming',     2),
  ('efficiency', 'Stroke efficiency',         3),
  ('turn',       'Turns',                     4),
  ('finish',     'Finish',                    5),
  ('aerobic',    'Threshold / aerobic',       6),
  ('speed',      'Speed',                     7),
  ('kick',       'Kick strength',             8),
  ('skill',      'Skills (Academy)',          9),
  ('land',       'Land / context',           10);

create table public.mm_questions (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id),
  text       text not null check (length(trim(text)) > 0),
  sort       smallint not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Protocols and versions
-- ---------------------------------------------------------------------
create table public.mm_protocols (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubs(id),
  code            text not null check (code ~ '^[A-Z0-9]{2,6}(-[A-Z0-9]{1,6})?$'),
  name            text not null check (length(trim(name)) > 0),
  determinant     text not null references public.mm_determinants(code),
  kind            text not null check (kind in ('reps','timed','checklist')),
  better          text not null check (better in ('higher','lower')),
  question_ids    uuid[] not null default '{}',
  status          text not null default 'draft' check (status in ('draft','pilot','live','retired')),
  fixed_date_only boolean not null default false,  -- e.g. the T15–T30 day: only inside its window
  description     text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (club_id, code)
);
comment on table public.mm_protocols is
  'Metrics & Measures test protocols. status: draft (being written) → pilot (can be run; results kept but not analysed) → live (in the battery) → retired.';

create table public.mm_protocol_versions (
  id              uuid primary key default gen_random_uuid(),
  protocol_id     uuid not null references public.mm_protocols(id),
  club_id         uuid not null references public.clubs(id),
  major           smallint not null default 1 check (major >= 0),
  minor           smallint not null default 0 check (minor >= 0),
  sheet           jsonb not null default '{}'::jsonb,  -- Appendix A fields (equipment, warm-up, procedure, script, safety…)
  levels          jsonb not null default '[]'::jsonb,  -- [{key,label,streams[],…kind-specific}]
  measure         jsonb not null default '{}'::jsonb,  -- {trials, counts, unit, rest_s, splits[]}
  intended_cycle  text check (intended_cycle in ('quality','endurance','sprint')),
  min_gap_days    smallint not null default 14 check (min_gap_days >= 0),
  notes           text,
  published_at    timestamptz,
  published_by    uuid,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (protocol_id, major, minor),
  check (jsonb_typeof(levels) = 'array')
);
comment on column public.mm_protocol_versions.levels is
  'reps: [{key,label,streams,rounds:[{key,name,stroke,reps,distance,interval,restAfterSec}]}] · timed: [{key,label,streams,stroke,distance_m,start,setup}] · checklist: [{key,label,streams,criteria:[{key,label}]}]';
comment on column public.mm_protocol_versions.measure is
  '{trials:int, counts:"best"|"mean_best_two"|"mean"|"single", unit:"s"|"reps"|"points", rest_s:int, splits:["approach","wall","out"]}';

-- A published version is locked: nothing that defines the test can change.
create or replace function app_private.mm_version_lock() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if old.published_at is not null then
    if new.levels is distinct from old.levels or new.measure is distinct from old.measure
       or new.sheet is distinct from old.sheet or new.major <> old.major or new.minor <> old.minor
       or new.intended_cycle is distinct from old.intended_cycle or new.min_gap_days <> old.min_gap_days
       or new.protocol_id <> old.protocol_id or new.published_at is distinct from old.published_at then
      raise exception 'This version is published and locked. Make a new version to change it.';
    end if;
  end if;
  if new.published_at is not null and old.published_at is null then
    if jsonb_array_length(new.levels) = 0 then
      raise exception 'A version needs at least one level before it can be published.';
    end if;
    new.published_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function app_private.mm_version_lock() from public, anon, authenticated;
create trigger mm_protocol_versions_lock before update on public.mm_protocol_versions
  for each row execute function app_private.mm_version_lock();

create or replace function app_private.mm_version_fill() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  new.club_id := (select club_id from public.mm_protocols where id = new.protocol_id);
  new.published_at := null;   -- versions are published by an update, never created published
  return new;
end $$;
revoke all on function app_private.mm_version_fill() from public, anon, authenticated;
create trigger mm_protocol_versions_fill before insert on public.mm_protocol_versions
  for each row execute function app_private.mm_version_fill();

create trigger mm_protocols_touch before update on public.mm_protocols
  for each row execute function app_private.touch_updated_at();
create trigger mm_questions_touch before update on public.mm_questions
  for each row execute function app_private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Reliability and windows
-- ---------------------------------------------------------------------
create table public.mm_reliability (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.mm_protocol_versions(id),
  club_id     uuid not null references public.clubs(id),
  level_key   text not null,
  te          numeric not null check (te >= 0),   -- typical error, in the test's unit
  cv_pct      numeric,
  icc         numeric check (icc is null or icc between -1 and 1),
  swc         numeric,                            -- smallest worthwhile change
  n           integer,
  studied_on  date,
  decision    text check (decision in ('good','caution','revise','unreliable')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (version_id, level_key)
);

create or replace function app_private.mm_reliability_fill() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  new.club_id := (select club_id from public.mm_protocol_versions where id = new.version_id);
  new.updated_at := now();
  return new;
end $$;
revoke all on function app_private.mm_reliability_fill() from public, anon, authenticated;
create trigger mm_reliability_fill before insert or update on public.mm_reliability
  for each row execute function app_private.mm_reliability_fill();

create table public.mm_windows (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id),
  name         text not null,
  kind         text not null check (kind in ('baseline','mid','end','novelty','t_day','pilot','other')),
  starts_on    date not null,
  ends_on      date not null,
  protocol_ids uuid[] not null default '{}',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- ---------------------------------------------------------------------
-- Sessions (a run, on any date)
-- ---------------------------------------------------------------------
create table public.mm_sessions (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid references public.clubs(id),
  protocol_id     uuid references public.mm_protocols(id),
  version_id      uuid not null references public.mm_protocol_versions(id),
  window_id       uuid references public.mm_windows(id),
  session_date    date not null default current_date,
  pool            text,
  course          text check (course in ('SC','LC')),
  cycle_focus     text,          -- quality / endurance / sprint, from the Season Planner
  cycle_week_no   smallint,
  on_cycle        boolean,       -- null when the planner has no week, or the protocol states no cycle week
  as_protocol     boolean not null default true,  -- coach confirms warm-up and position in session were as written
  group_type      text not null check (group_type in ('club','squad','swimmers')),
  squad_id        uuid references public.squads(id),
  swimmer_ids     uuid[] not null default '{}',
  status          text not null default 'live' check (status in ('live','closed')),
  clock_started_at timestamptz,
  tester          text,
  notes           text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  closed_at       timestamptz,
  check (group_type <> 'squad' or squad_id is not null)
);
create index mm_sessions_club_date on public.mm_sessions (club_id, session_date desc);

-- The cycle week (Q/E/S) on a date, from the Season Planner: the squad's
-- macro when a squad is given, otherwise any active macro in the club.
create or replace function public.mm_cycle_week(p_club uuid, p_squad uuid, p_date date)
returns table (focus text, week_no smallint)
language sql stable security definer set search_path = '' as $$
  select mi.qes_focus, mi.week_no::smallint
    from public.micros mi
    join public.macros ma on ma.id = mi.macro_id and ma.is_active
    join public.seasons se on se.id = ma.season_id and se.club_id = p_club
   where mi.is_active and mi.week_commencing is not null
     and p_date between mi.week_commencing and mi.week_commencing + 6
     and (p_squad is null or exists (select 1 from public.macro_squads ms
                                      where ms.macro_id = ma.id and ms.squad_id = p_squad and ms.is_active))
   order by (mi.qes_focus is null), mi.week_commencing desc
   limit 1;
$$;
revoke all on function public.mm_cycle_week(uuid, uuid, date) from public, anon;
grant execute on function public.mm_cycle_week(uuid, uuid, date) to authenticated;

create or replace function app_private.mm_session_fill() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare v public.mm_protocol_versions%rowtype; p public.mm_protocols%rowtype; w public.mm_windows%rowtype; cf text; wk smallint;
begin
  select * into v from public.mm_protocol_versions where id = new.version_id;
  select * into p from public.mm_protocols where id = v.protocol_id;
  if tg_op = 'INSERT' then
    if v.published_at is null then raise exception 'This version of % is not published yet.', p.code; end if;
    if p.status not in ('pilot','live') then raise exception '% is % and cannot be run.', p.code, p.status; end if;
  end if;
  new.protocol_id := p.id;
  new.club_id     := p.club_id;
  if p.fixed_date_only then
    select * into w from public.mm_windows where id = new.window_id;
    if w.id is null or new.session_date not between w.starts_on and w.ends_on then
      raise exception '% is run on its fixed date only. Choose its testing window.', p.code;
    end if;
  end if;
  select c.focus, c.week_no into cf, wk from public.mm_cycle_week(new.club_id, new.squad_id, new.session_date) c;
  new.cycle_focus   := cf;
  new.cycle_week_no := wk;
  new.on_cycle := case when v.intended_cycle is null or cf is null then null else cf = v.intended_cycle end;
  return new;
end $$;
revoke all on function app_private.mm_session_fill() from public, anon, authenticated;
create trigger mm_sessions_fill before insert or update of version_id, session_date, squad_id, window_id on public.mm_sessions
  for each row execute function app_private.mm_session_fill();

-- ---------------------------------------------------------------------
-- Results and trials
-- ---------------------------------------------------------------------
create table public.mm_results (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.mm_sessions(id),
  swimmer_id         uuid not null references public.swimmers(id),
  club_id            uuid references public.clubs(id),
  protocol_id        uuid references public.mm_protocols(id),
  version_id         uuid references public.mm_protocol_versions(id),
  major              smallint,
  level_key          text not null,
  session_date       date,
  squad_id           uuid references public.squads(id),  -- squad at the time of the test
  year_of_birth      smallint,
  age                smallint,                           -- Swim England age
  status             text not null default 'recorded' check (status in ('recorded','not_tested')),
  not_tested_reason  text,                               -- unwell / injured / returning from a break / other
  raw                jsonb not null default '{}'::jsonb, -- reps: {round:{done,reps}} · checklist: {criterion:1..3}
  value              numeric,                            -- the result, in the version's unit (worked out here)
  legal              boolean,
  conditions         jsonb not null default '{}'::jsonb, -- {timing:"video"|"hand2"|"hand1"|"pad", illness:bool, missed_training:bool}
  note               text,
  recorded_by        text,
  rebaseline_reason  text,                               -- set by mm_set_rebaseline()
  -- set when the session is closed (mm_relink)
  is_baseline        boolean not null default false,
  baseline_id        uuid references public.mm_results(id),
  previous_id        uuid references public.mm_results(id),
  days_since_prev    integer,
  days_since_base    integer,
  change_prev        numeric,   -- signed so that positive = better
  change_base        numeric,
  caution            text[] not null default '{}',  -- off_cycle / not_as_protocol / short_gap / pilot
  flag               text check (flag in ('baseline','improved','noise','declined','caution','no_reliability')),
  exposure           jsonb,     -- training since previous / baseline / 90 days (A-127, filled later)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (session_id, swimmer_id)
);
create index mm_results_series on public.mm_results (swimmer_id, protocol_id, major, level_key, session_date);

create table public.mm_trials (
  id             uuid primary key default gen_random_uuid(),
  result_id      uuid not null references public.mm_results(id) on delete cascade,
  session_id     uuid not null references public.mm_sessions(id),
  swimmer_id     uuid not null references public.swimmers(id),
  trial_no       smallint not null check (trial_no between 1 and 20),
  variant        text not null default '',   -- e.g. turn type in the back-to-breast comparison
  order_no       smallint,
  time_s         numeric check (time_s is null or time_s > 0),
  splits         jsonb not null default '{}'::jsonb,  -- {approach, wall, out}
  stroke_count   smallint,
  distance_m     numeric,
  legal          boolean not null default true,
  illegal_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (result_id, variant, trial_no)
);

-- The result's value, worked out from its raw data or its trials.
create or replace function app_private.mm_result_fill() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare s public.mm_sessions%rowtype; v public.mm_protocol_versions%rowtype; p public.mm_protocols%rowtype;
        rule text; times numeric[];
begin
  select * into s from public.mm_sessions where id = new.session_id;
  select * into v from public.mm_protocol_versions where id = s.version_id;
  select * into p from public.mm_protocols where id = s.protocol_id;
  if not exists (select 1 from jsonb_array_elements(v.levels) l where l->>'key' = new.level_key) then
    raise exception 'Level % is not part of % v%.%', new.level_key, p.code, v.major, v.minor;
  end if;
  new.club_id := s.club_id; new.protocol_id := s.protocol_id; new.version_id := s.version_id;
  new.major := v.major; new.session_date := s.session_date;
  if tg_op = 'INSERT' then
    select squad_id, year_of_birth into new.squad_id, new.year_of_birth from public.swimmers where id = new.swimmer_id;
  elsif new.year_of_birth is null then
    select year_of_birth into new.year_of_birth from public.swimmers where id = new.swimmer_id;
  end if;
  new.age := case when new.year_of_birth is null then null else extract(year from s.session_date)::int - new.year_of_birth end;

  if new.status = 'not_tested' then
    new.value := null; new.legal := null;
  elsif p.kind = 'reps' then
    select sum((e.v->>'done')::numeric) into new.value
      from jsonb_each(new.raw) e(k, v) where e.v ? 'done' and jsonb_typeof(e.v->'done') = 'number';
    new.legal := true;
  elsif p.kind = 'checklist' then
    select sum((e.v #>> '{}')::numeric) into new.value
      from jsonb_each(new.raw) e(k, v) where jsonb_typeof(e.v) = 'number';
    new.legal := true;
  else
    rule := coalesce(v.measure->>'counts', 'best');
    select array_agg(t.time_s order by t.time_s) into times
      from public.mm_trials t where t.result_id = new.id and t.legal and t.time_s is not null and t.variant = '';
    new.legal := exists (select 1 from public.mm_trials t where t.result_id = new.id and t.legal and t.time_s is not null);
    new.value := case
      when times is null then null
      when rule = 'best' then times[1]
      when rule = 'mean_best_two' then case when array_length(times, 1) >= 2 then round((times[1] + times[2]) / 2, 3) else null end
      when rule = 'mean' then (select round(avg(x), 3) from unnest(times) x)
      when rule = 'single' then times[1]
      else times[1] end;
    if p.better = 'higher' and times is not null and rule = 'best' then new.value := times[array_length(times, 1)]; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function app_private.mm_result_fill() from public, anon, authenticated;
create trigger mm_results_fill before insert or update on public.mm_results
  for each row execute function app_private.mm_result_fill();

-- A change to any trial re-works the result's value.
create or replace function app_private.mm_trial_touch() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  update public.mm_results set updated_at = now() where id = coalesce(new.result_id, old.result_id);
  return null;
end $$;
revoke all on function app_private.mm_trial_touch() from public, anon, authenticated;
create trigger mm_trials_touch after insert or update or delete on public.mm_trials
  for each row execute function app_private.mm_trial_touch();

create or replace function app_private.mm_trial_fill() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  select session_id, swimmer_id into new.session_id, new.swimmer_id from public.mm_results where id = new.result_id;
  new.updated_at := now();
  return new;
end $$;
revoke all on function app_private.mm_trial_fill() from public, anon, authenticated;
create trigger mm_trials_fill before insert or update on public.mm_trials
  for each row execute function app_private.mm_trial_fill();

-- ---------------------------------------------------------------------
-- Baselines, previous results and change flags
-- ---------------------------------------------------------------------
-- Recomputes one series: a swimmer × protocol × major version × level, in
-- date order, over results in CLOSED sessions that have a value. The first
-- result is the baseline; a result with a re-baseline reason starts a new one.
-- Change is signed so that positive = better. A change is "real" past 2 × TE.
create or replace function app_private.mm_relink(p_swimmer uuid, p_protocol uuid, p_major smallint, p_level text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record; better text; te numeric; sgn int; cau text[]; d_prev int;
  base_id uuid; base_date date; base_val numeric;
  prev_id uuid; prev_date date; prev_val numeric;
begin
  select pr.better into better from public.mm_protocols pr where pr.id = p_protocol;
  sgn := case when better = 'lower' then -1 else 1 end;
  -- clear rows that are no longer part of the series (reopened / not tested / no value)
  update public.mm_results x set is_baseline = false, baseline_id = null, previous_id = null, days_since_prev = null,
         days_since_base = null, change_prev = null, change_base = null, caution = '{}', flag = null
   where x.swimmer_id = p_swimmer and x.protocol_id = p_protocol and x.major = p_major and x.level_key = p_level
     and (x.value is null or x.status <> 'recorded'
          or exists (select 1 from public.mm_sessions s where s.id = x.session_id and s.status <> 'closed'));
  for r in
    select x.id, x.session_date, x.value, x.version_id, x.rebaseline_reason,
           s.on_cycle, s.as_protocol, v.min_gap_days, pr.status as pstatus
      from public.mm_results x
      join public.mm_sessions s on s.id = x.session_id and s.status = 'closed'
      join public.mm_protocol_versions v on v.id = x.version_id
      join public.mm_protocols pr on pr.id = x.protocol_id
     where x.swimmer_id = p_swimmer and x.protocol_id = p_protocol and x.major = p_major and x.level_key = p_level
       and x.status = 'recorded' and x.value is not null
     order by x.session_date, x.created_at
  loop
    if base_id is null or r.rebaseline_reason is not null then
      update public.mm_results set is_baseline = true, baseline_id = null, previous_id = prev_id,
             days_since_prev = case when prev_id is null then null else r.session_date - prev_date end,
             days_since_base = 0, change_prev = null, change_base = null, caution = '{}', flag = 'baseline'
       where id = r.id;
      base_id := r.id; base_date := r.session_date; base_val := r.value;
      prev_id := r.id; prev_date := r.session_date; prev_val := r.value;
      continue;
    end if;
    d_prev := r.session_date - prev_date;
    cau := '{}';
    if r.on_cycle = false then cau := cau || 'off_cycle'::text; end if;
    if not r.as_protocol then cau := cau || 'not_as_protocol'::text; end if;
    if d_prev < r.min_gap_days then cau := cau || 'short_gap'::text; end if;
    if r.pstatus = 'pilot' then cau := cau || 'pilot'::text; end if;
    te := null;
    select rl.te into te from public.mm_reliability rl where rl.version_id = r.version_id and rl.level_key = p_level;
    update public.mm_results set
           is_baseline = false, baseline_id = base_id, previous_id = prev_id,
           days_since_prev = d_prev, days_since_base = r.session_date - base_date,
           change_prev = sgn * (r.value - prev_val), change_base = sgn * (r.value - base_val),
           caution = cau,
           flag = case
             when coalesce(array_length(cau, 1), 0) > 0 then 'caution'
             when te is null then 'no_reliability'
             when sgn * (r.value - prev_val) >  2 * te then 'improved'
             when sgn * (r.value - prev_val) < -2 * te then 'declined'
             else 'noise' end
     where id = r.id;
    prev_id := r.id; prev_date := r.session_date; prev_val := r.value;
  end loop;
end $$;
revoke all on function app_private.mm_relink(uuid, uuid, smallint, text) from public, anon, authenticated;

-- Closing (or reopening) a session relinks every series it touches.
create or replace function app_private.mm_session_relink() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.status is distinct from old.status then
    for r in select distinct swimmer_id, protocol_id, major, level_key from public.mm_results where session_id = new.id loop
      perform app_private.mm_relink(r.swimmer_id, r.protocol_id, r.major, r.level_key);
    end loop;
  end if;
  return null;
end $$;
revoke all on function app_private.mm_session_relink() from public, anon, authenticated;
create trigger mm_sessions_relink after update of status on public.mm_sessions
  for each row execute function app_private.mm_session_relink();

-- Start a new baseline from this result (or undo that with a null reason).
create or replace function public.mm_set_rebaseline(p_result uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare x public.mm_results%rowtype;
begin
  select * into x from public.mm_results where id = p_result;
  if x.id is null or x.swimmer_id not in (select app_private.swimmer_ids('stopwatch', true)) then
    raise exception 'You cannot change this result';
  end if;
  update public.mm_results set rebaseline_reason = nullif(trim(p_reason), '') where id = p_result;
  perform app_private.mm_relink(x.swimmer_id, x.protocol_id, x.major, x.level_key);
end $$;
revoke all on function public.mm_set_rebaseline(uuid, text) from public, anon;
grant execute on function public.mm_set_rebaseline(uuid, text) to authenticated;

-- Reliability values arriving later re-flag the affected series.
create or replace function app_private.mm_reliability_relink() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare r record; vid uuid := coalesce(new.version_id, old.version_id); lk text := coalesce(new.level_key, old.level_key);
begin
  for r in select distinct swimmer_id, protocol_id, major, level_key from public.mm_results
            where version_id = vid and level_key = lk loop
    perform app_private.mm_relink(r.swimmer_id, r.protocol_id, r.major, r.level_key);
  end loop;
  return null;
end $$;
revoke all on function app_private.mm_reliability_relink() from public, anon, authenticated;
create trigger mm_reliability_relink after insert or update or delete on public.mm_reliability
  for each row execute function app_private.mm_reliability_relink();

-- ---------------------------------------------------------------------
-- Quick measures on feedback
-- ---------------------------------------------------------------------
alter table public.swimmer_feedback
  add column if not exists measure_code    text,
  add column if not exists measure_value   numeric,
  add column if not exists measure_context text check (measure_context in ('quick','formal'));
comment on column public.swimmer_feedback.measure_code is
  'Metrics & Measures protocol code a quick measure lines up with (e.g. EFF-FR stroke count). Lower reliability than a formal test; trends only.';

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.mm_determinants      enable row level security;
alter table public.mm_questions         enable row level security;
alter table public.mm_protocols         enable row level security;
alter table public.mm_protocol_versions enable row level security;
alter table public.mm_reliability       enable row level security;
alter table public.mm_windows           enable row level security;
alter table public.mm_sessions          enable row level security;
alter table public.mm_results           enable row level security;
alter table public.mm_trials            enable row level security;

create policy read_all on public.mm_determinants for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['mm_questions','mm_protocols','mm_protocol_versions','mm_reliability','mm_windows'] loop
    execute format($p$create policy rbac_select on public.%I for select to authenticated
      using (app_private.can_c('plans', false, club_id) or app_private.can_c('stopwatch', false, club_id)
          or app_private.can_c('stats', false, club_id))$p$, t);
    execute format($p$create policy rbac_insert on public.%I for insert to authenticated
      with check (app_private.can_c('season', true, club_id))$p$, t);
    execute format($p$create policy rbac_update on public.%I for update to authenticated
      using (app_private.can_c('season', true, club_id)) with check (app_private.can_c('season', true, club_id))$p$, t);
  end loop;
end $$;
-- versions and reliability rows take their club from the parent before the check runs
-- (the insert policies are evaluated after the BEFORE triggers that set club_id).
create policy rbac_delete on public.mm_reliability for delete to authenticated
  using (app_private.can_c('season', true, club_id));

create or replace function app_private.mm_session_live(p uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mm_sessions where id = p and status = 'live');
$$;
revoke all on function app_private.mm_session_live(uuid) from public, anon;
grant execute on function app_private.mm_session_live(uuid) to authenticated;

create policy rbac_select on public.mm_sessions for select to authenticated
  using (app_private.can_c('stopwatch', false, club_id, squad_id) or app_private.can_c('stats', false, club_id));
create policy rbac_insert on public.mm_sessions for insert to authenticated
  with check (app_private.can_c('stopwatch', true, club_id, squad_id));
create policy rbac_update on public.mm_sessions for update to authenticated
  using (app_private.can_c('stopwatch', true, club_id, squad_id))
  with check (app_private.can_c('stopwatch', true, club_id, squad_id));

create policy rbac_select on public.mm_results for select to authenticated
  using (swimmer_id in (select app_private.swimmer_ids('stopwatch', false))
      or swimmer_id in (select app_private.swimmer_ids('stats', false)));
create policy rbac_insert on public.mm_results for insert to authenticated
  with check (swimmer_id in (select app_private.swimmer_ids('stopwatch', true)) and app_private.mm_session_live(session_id));
create policy rbac_update on public.mm_results for update to authenticated
  using (swimmer_id in (select app_private.swimmer_ids('stopwatch', true)) and app_private.mm_session_live(session_id))
  with check (swimmer_id in (select app_private.swimmer_ids('stopwatch', true)) and app_private.mm_session_live(session_id));
create policy rbac_delete on public.mm_results for delete to authenticated
  using (swimmer_id in (select app_private.swimmer_ids('stopwatch', true)) and app_private.mm_session_live(session_id));

create policy rbac_select on public.mm_trials for select to authenticated
  using (swimmer_id in (select app_private.swimmer_ids('stopwatch', false))
      or swimmer_id in (select app_private.swimmer_ids('stats', false)));
create policy rbac_write on public.mm_trials for all to authenticated
  using (swimmer_id in (select app_private.swimmer_ids('stopwatch', true)) and app_private.mm_session_live(session_id))
  with check (app_private.mm_session_live((select r.session_id from public.mm_results r where r.id = result_id))
          and (select r.swimmer_id from public.mm_results r where r.id = result_id) in (select app_private.swimmer_ids('stopwatch', true)));

revoke all on public.mm_determinants, public.mm_questions, public.mm_protocols, public.mm_protocol_versions,
  public.mm_reliability, public.mm_windows, public.mm_sessions, public.mm_results, public.mm_trials from anon;
grant select on public.mm_determinants to authenticated;
grant select, insert, update on public.mm_questions, public.mm_protocols, public.mm_protocol_versions,
  public.mm_windows, public.mm_sessions to authenticated;
grant select, insert, update, delete on public.mm_reliability, public.mm_results, public.mm_trials to authenticated;

-- ---------------------------------------------------------------------
-- Starter drafts for RRSC (starting hypotheses for the testing project —
-- status draft, so they can't be run until reviewed and published)
-- ---------------------------------------------------------------------
do $$
declare c uuid; p uuid;
begin
  select id into c from public.clubs where name = 'Redhill and Reigate';
  if c is null then return; end if;

  insert into public.mm_protocols (club_id, code, name, determinant, kind, better, status, description, created_by)
  values (c, 'THR-01', 'Threshold repeat set', 'aerobic', 'reps', 'higher', 'draft',
          'Fixed-interval repeat 100s Freestyle then 100s IM. Starting point: the RRSC aerobic set, reduced to three stream levels. Levels and send-offs to be confirmed in protocol design.', null)
  on conflict (club_id, code) do nothing returning id into p;
  if p is not null then
    insert into public.mm_protocol_versions (protocol_id, major, minor, levels, measure, intended_cycle, min_gap_days, sheet, notes, created_by)
    values (p, 0, 1,
      jsonb_build_array(
        jsonb_build_object('key','L1','label','Level 1','streams',jsonb_build_array('Bronze'),'rounds',jsonb_build_array(
          jsonb_build_object('key','r1','name','Part A','stroke','Freestyle','reps',8,'distance',100,'interval',125,'restAfterSec',60),
          jsonb_build_object('key','r2','name','Part B','stroke','Individual Medley','reps',4,'distance',100,'interval',135,'restAfterSec',0))),
        jsonb_build_object('key','L2','label','Level 2','streams',jsonb_build_array('Silver'),'rounds',jsonb_build_array(
          jsonb_build_object('key','r1','name','Part A','stroke','Freestyle','reps',14,'distance',100,'interval',110,'restAfterSec',60),
          jsonb_build_object('key','r2','name','Part B','stroke','Individual Medley','reps',7,'distance',100,'interval',120,'restAfterSec',0))),
        jsonb_build_object('key','L3','label','Level 3','streams',jsonb_build_array('Gold','Platinum'),'rounds',jsonb_build_array(
          jsonb_build_object('key','r1','name','Part A','stroke','Freestyle','reps',20,'distance',100,'interval',95,'restAfterSec',60),
          jsonb_build_object('key','r2','name','Part B','stroke','Individual Medley','reps',10,'distance',100,'interval',105,'restAfterSec',0)))),
      jsonb_build_object('unit','reps','counts','single','trials',1),
      'sprint', 28,
      jsonb_build_object('equipment','Pace clock','warm_up','To be written','procedure','To be written','script','To be written','safety','No maximal test for a swimmer who is unwell, injured or returning from a break.'),
      'Draft from the RRSC aerobic set (ages 9, 12 and 15 sets). Replace with the agreed protocol.', null);
  end if;

  p := null;
  insert into public.mm_protocols (club_id, code, name, determinant, kind, better, status, description, created_by)
  values (c, 'TRN-FR', 'Freestyle tumble turn, in–out', 'turn', 'timed', 'lower', 'draft',
          'Round-trip time from a mark before the wall to the same mark out, video timed, with approach / wall / out-phase splits and a legality check.', null)
  on conflict (club_id, code) do nothing returning id into p;
  if p is not null then
    insert into public.mm_protocol_versions (protocol_id, major, minor, levels, measure, intended_cycle, min_gap_days, sheet, notes, created_by)
    values (p, 0, 1,
      jsonb_build_array(
        jsonb_build_object('key','L1','label','5 m in – 5 m out','streams',jsonb_build_array('Bronze','Silver'),'stroke','Freestyle','distance_m',10,'start','push','setup','Markers at 5 m; camera side-on at the wall'),
        jsonb_build_object('key','L2','label','7.5 m in – 7.5 m out','streams',jsonb_build_array('Gold','Platinum'),'stroke','Freestyle','distance_m',15,'start','push','setup','Markers at 7.5 m; camera side-on at the wall')),
      jsonb_build_object('unit','s','counts','mean_best_two','trials',3,'rest_s',75,'splits',jsonb_build_array('approach','wall','out')),
      'sprint', 14,
      jsonb_build_object('equipment','Camera, markers','warm_up','To be written','procedure','Approach at race pace from the in-marker; three trials, full recovery','script','To be written','safety','A fast but illegal turn is recorded as illegal, not as a result.'),
      'Draft from the testing guidance (section 4, turns). Confirm in protocol design.', null);
  end if;
end $$;
