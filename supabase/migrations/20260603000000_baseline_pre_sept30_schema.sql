-- =====================================================================
-- Baseline schema — everything that existed before migration tracking
-- started (A-019, 30 Sep 2026).
--
-- Reconstructed 18 Oct 2026 directly from the live production database
-- (nxlgeykipnvswyeshrbl) via pg_catalog/information_schema introspection,
-- since no migration files were kept for this period. This is NOT a
-- change to production -- every object below already exists there. Its
-- purpose is to make the full migration history replayable from empty,
-- so a staging project (A-018) can be built with schema parity.
--
-- Deliberately excluded (added by later, already-committed migrations,
-- which must keep adding them on top of this baseline rather than here):
--   - public.clubs table and every club_id column/FK on squads,
--     squad_memberships, attendance_records, swimmer_feedback,
--     stopwatch_times (20261016142142_add_clubs_table_and_tenant_club_id.sql)
--   - app_private schema, is_superadmin(), all rbac_* policies on these
--     30 tables, and the anon-read/anon-cutover storage policies
--     (20260930190000_role_based_access.sql, 20261016120000_anon_cutover.sql,
--     20261016120100_anon_guard.sql) -- replay those migrations straight
--     after this file and the live result matches production.
--   - assessments/coaches policies' current USING/WITH CHECK clauses are
--     baked in directly below as their current (superadmin-only) form,
--     rather than their original permissive form, since the original
--     form was never captured and the end state is what matters for a
--     fresh environment. The later restrict_squad_ada_tables_via_alter_policy
--     migration will re-apply the same clauses harmlessly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('competition-files', 'competition-files', true, 26214400,
   array['application/pdf','application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'text/csv','text/plain']),
  ('feedback-media', 'feedback-media', false, 104857600, null)
on conflict (id) do nothing;

create policy "competition-files anon select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'competition-files');

-- ---------------------------------------------------------------------
-- Tables, in dependency order
-- ---------------------------------------------------------------------

create table public.assessments (
  id uuid not null default gen_random_uuid(),
  swimmer_name text not null,
  "group" text not null,
  coach_email text not null,
  scores jsonb not null default '{}'::jsonb,
  notes text,
  assessed_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now());

create table public.club_codes (
  club_code text not null,
  club_name text not null,
  district_code text not null,
  county_code text not null,
  meet_name text,
  source text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

create table public.coaches (
  id uuid not null default gen_random_uuid(),
  email text not null,
  name text,
  created_at timestamp with time zone not null default now());

create table public.conversion_factors (
  event text not null,
  lc_to_sc_ratio_median numeric,
  sc_to_lc_factor numeric,
  lc_to_sc_factor numeric,
  matched_swimmer_pairs_n integer not null default 0,
  ratio_min numeric,
  ratio_max numeric,
  confidence text,
  method text,
  source text,
  computed_on date);

create table public.drills_library (
  id uuid not null default gen_random_uuid(),
  stroke text,
  drill_name text not null,
  pseudonyms text[],
  primary_purpose text,
  blabt text,
  biomechanical text,
  equipment text,
  regression text,
  progression text,
  coach text default 'Simon'::text,
  club text default 'Crawley Swimming Club'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

create table public.seasons (
  id uuid not null default gen_random_uuid(),
  club text not null,
  title text not null,
  start_date date not null,
  finish_date date not null,
  is_active boolean not null default true,
  disabled_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

create table public.squads (
  id uuid not null default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  club text not null default 'Crawley Swimming Club'::text);
  -- club_id added later by 20261016142142_add_clubs_table_and_tenant_club_id.sql

create table public.galas (
  id uuid not null default gen_random_uuid(),
  gala_code text not null,
  name text not null,
  season text,
  date_start date,
  date_end date,
  venue text,
  pool_course text,
  pool_length text,
  level text,
  license_number text,
  promoter text,
  is_home_meet boolean,
  age_date_rule text,
  qt_type text,
  format text,
  entries_open date,
  entries_close date,
  min_age_rules text,
  status text,
  source_document text,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

create table public.swimmers (
  id uuid not null default gen_random_uuid(),
  full_name text not null,
  date_of_birth date,
  squad text,
  club text default 'Crawley Swimming Club'::text,
  active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  squad_id uuid,
  swim_england_id text,
  joined_club_on date,
  parent_name text,
  parent_phone text,
  parent_email text,
  gender text);

create table public.macros (
  id uuid not null default gen_random_uuid(),
  season_id uuid not null,
  title text not null,
  head_coach_note text,
  micro_count integer not null default 0,
  is_active boolean not null default true,
  disabled_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

create table public.season_breaks (
  id uuid not null default gen_random_uuid(),
  season_id uuid not null,
  break_start date not null,
  break_end date not null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

create table public.timetables (
  id uuid not null default gen_random_uuid(),
  squad_id uuid not null,
  season_start date not null,
  season_end date not null,
  season_title text,
  weekly_focus text,
  is_active boolean not null default true,
  disabled_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  season_id uuid);

create table public.drill_periodisation (
  id uuid not null default gen_random_uuid(),
  drill_id uuid not null,
  meso text not null,
  phase_type text not null,
  session_plan_placement text,
  distance_m integer,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

create table public.competitions (
  id uuid not null default gen_random_uuid(),
  meet_id integer not null,
  license_number text,
  name text not null,
  date_start date not null,
  date_end date,
  year smallint default (EXTRACT(year FROM date_start))::smallint,
  level smallint not null,
  course text not null,
  pool_length_m smallint,
  meet_type text,
  region text not null default 'SE'::text,
  town_city text,
  website_url text,
  website_confidence text,
  link_status text not null default 'pending'::text,
  link_candidates jsonb,
  link_searched_at timestamp with time zone,
  files_scanned_at timestamp with time zone,
  source_url text,
  gala_id uuid,
  scraped_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

create table public.season_competitions (
  id uuid not null default gen_random_uuid(),
  season_id uuid not null,
  competition_id uuid,
  name text not null,
  level smallint,
  course text not null,
  date_from date not null,
  date_to date not null,
  total_days integer default ((date_to - date_from) + 1),
  venue_name text,
  venue_url text,
  is_active boolean not null default true,
  disabled_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

create table public.competition_events (
  id uuid not null default gen_random_uuid(),
  season_competition_id uuid not null,
  event_no smallint not null,
  course text not null,
  event_name text not null,
  session text,
  programme_event_no text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

create table public.competition_files (
  id uuid not null default gen_random_uuid(),
  competition_id uuid not null,
  file_name text not null,
  file_kind text not null default 'other'::text,
  file_ext text,
  mime_type text,
  size_bytes bigint,
  source_url text not null,
  storage_path text,
  public_url text,
  sha256 text,
  status text not null default 'linked'::text,
  status_note text,
  discovered_at timestamp with time zone not null default now(),
  mirrored_at timestamp with time zone);

create table public.macro_competitions (
  id uuid not null default gen_random_uuid(),
  macro_id uuid not null,
  season_competition_id uuid not null,
  designation text not null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

create table public.macro_squads (
  macro_id uuid not null,
  squad_id uuid not null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now());

create table public.micros (
  id uuid not null default gen_random_uuid(),
  macro_id uuid not null,
  week_no integer not null,
  week_commencing date,
  meso smallint,
  qes_focus text,
  technical_focus smallint,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  break_days smallint[] not null default '{}'::smallint[]);

create table public.timetable_sessions (
  id uuid not null default gen_random_uuid(),
  timetable_id uuid not null,
  day_of_week smallint not null,
  start_time time without time zone not null,
  pool_size text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  end_time time without time zone);

create table public.micro_sessions (
  id uuid not null default gen_random_uuid(),
  micro_id uuid not null,
  squad_id uuid not null,
  timetable_session_id uuid,
  session_date date not null,
  start_time time without time zone,
  end_time time without time zone,
  stroke_focus text,
  outline text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

create table public.session_plans (
  id uuid not null default gen_random_uuid(),
  title text not null,
  content jsonb not null default '[]'::jsonb,
  total_distance_m integer,
  squad_scope text,
  pool_size text,
  intended_date date,
  macro text,
  meso text,
  block_model text,
  notes text,
  coach text default 'Simon'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  club text not null default 'Crawley Swimming Club'::text,
  squad_id uuid,
  micro_id uuid,
  micro_session_id uuid,
  stroke_skills text[] not null default '{}'::text[],
  training_zone text);

create table public.squad_memberships (
  id uuid not null default gen_random_uuid(),
  swimmer_id uuid not null,
  squad_id uuid not null,
  joined_squad_on date not null default CURRENT_DATE,
  ended_on date,
  created_at timestamp with time zone not null default now(),
  coach text default 'Simon'::text);
  -- club_id added later by 20261016142142_add_clubs_table_and_tenant_club_id.sql

create table public.attendance_records (
  id uuid not null default gen_random_uuid(),
  swimmer_id uuid not null,
  session_date date not null,
  session_time time without time zone not null,
  pool_size text not null,
  present boolean not null default false,
  marked_at timestamp with time zone not null default now(),
  coach text default 'Simon'::text,
  session_plan_id uuid);
  -- club_id added later by 20261016142142_add_clubs_table_and_tenant_club_id.sql

create table public.swim_results (
  id uuid not null default gen_random_uuid(),
  swimmer_id uuid not null,
  event text not null,
  course text not null,
  swim_time interval not null,
  swim_time_display text,
  converted_time interval,
  converted_time_display text,
  meet_name text,
  meet_date date not null,
  age_at_swim integer,
  is_pb boolean default false,
  source_document text,
  created_at timestamp with time zone default now(),
  venue text,
  level integer,
  fina_points integer,
  ranked_as text,
  club text);

create table public.swimmer_feedback (
  id uuid not null default gen_random_uuid(),
  swimmer_id uuid not null,
  entry_type text not null,
  criterion text,
  status text,
  note text,
  session_date date not null,
  coach text default 'Simon'::text,
  created_at timestamp with time zone not null default now(),
  category text not null,
  observation text,
  remedial_action text,
  media jsonb not null default '[]'::jsonb,
  session_plan_id uuid,
  thread_id uuid not null);
  -- club_id added later by 20261016142142_add_clubs_table_and_tenant_club_id.sql

create table public.stopwatch_times (
  id uuid not null default gen_random_uuid(),
  swimmer_id uuid not null,
  club text,
  squad text,
  stroke text not null,
  distance_m integer not null,
  course text,
  time_ms integer not null,
  time_display text not null,
  time_type text not null default 'lap'::text,
  rep_number integer,
  rep_count integer,
  note text,
  session_date date not null default CURRENT_DATE,
  recorded_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now());
  -- club_id added later by 20261016142142_add_clubs_table_and_tenant_club_id.sql

create table public.qualifying_times (
  id uuid not null default gen_random_uuid(),
  gala_id uuid not null,
  course text not null,
  course_variant text,
  event text not null,
  gender text not null,
  age_group text not null,
  reference_age_type text,
  time_type text not null,
  has_standard boolean not null default true,
  swim_time interval,
  swim_time_display text,
  converted_time interval,
  converted_time_display text,
  converted_time_course text,
  conversion_source text,
  source_document text,
  notes text,
  created_at timestamp with time zone not null default now());

create table public.drill_set_line_archive (
  id uuid not null default gen_random_uuid(),
  drill_id uuid not null,
  meso text,
  phase_type text,
  variation_label text,
  set_line_text text not null,
  session_plan_id uuid,
  coach text default 'Simon'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now());

-- ---------------------------------------------------------------------
-- Constraints (primary keys, foreign keys, unique, check)
-- club_id FKs on squads/attendance_records/squad_memberships/
-- stopwatch_times/swimmer_feedback are deliberately omitted -- see header.
-- ---------------------------------------------------------------------

alter table public.assessments add constraint assessments_pkey PRIMARY KEY (id);

alter table public.club_codes add constraint club_codes_pkey PRIMARY KEY (club_code);

alter table public.coaches add constraint coaches_pkey PRIMARY KEY (id);
alter table public.coaches add constraint coaches_email_key UNIQUE (email);

alter table public.conversion_factors add constraint conversion_factors_pkey PRIMARY KEY (event);

alter table public.drills_library add constraint drills_library_pkey PRIMARY KEY (id);

alter table public.seasons add constraint seasons_dates CHECK ((finish_date >= start_date));
alter table public.seasons add constraint seasons_pkey PRIMARY KEY (id);

alter table public.squads add constraint squads_pkey PRIMARY KEY (id);
alter table public.squads add constraint squads_club_name_key UNIQUE (club, name);

alter table public.galas add constraint galas_pool_course_check CHECK (((pool_course IS NULL) OR (pool_course = ANY (ARRAY['SC'::text, 'LC'::text]))));
alter table public.galas add constraint galas_pkey PRIMARY KEY (id);
alter table public.galas add constraint galas_gala_code_key UNIQUE (gala_code);

alter table public.swimmers add constraint swimmers_gender_check CHECK ((gender = ANY (ARRAY['Male'::text, 'Female'::text])));
alter table public.swimmers add constraint swimmers_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES squads(id);
alter table public.swimmers add constraint swimmers_pkey PRIMARY KEY (id);

alter table public.macros add constraint macros_micro_count_check CHECK (((micro_count >= 0) AND (micro_count <= 52)));
alter table public.macros add constraint macros_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;
alter table public.macros add constraint macros_pkey PRIMARY KEY (id);

alter table public.season_breaks add constraint season_breaks_dates CHECK ((break_end >= break_start));
alter table public.season_breaks add constraint season_breaks_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;
alter table public.season_breaks add constraint season_breaks_pkey PRIMARY KEY (id);

alter table public.timetables add constraint timetables_disabled_chk CHECK (((is_active AND (disabled_at IS NULL)) OR ((NOT is_active) AND (disabled_at IS NOT NULL))));
alter table public.timetables add constraint timetables_season_dates_chk CHECK ((season_end >= season_start));
alter table public.timetables add constraint timetables_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES squads(id);
alter table public.timetables add constraint timetables_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(id);
alter table public.timetables add constraint timetables_pkey PRIMARY KEY (id);

alter table public.drill_periodisation add constraint drill_periodisation_phase_type_check CHECK ((phase_type = ANY (ARRAY['Quality'::text, 'Endurance'::text, 'Sprint'::text])));
alter table public.drill_periodisation add constraint drill_periodisation_meso_check CHECK ((meso = ANY (ARRAY['Meso 1'::text, 'Meso 2'::text, 'Meso 3'::text])));
alter table public.drill_periodisation add constraint drill_periodisation_drill_id_fkey FOREIGN KEY (drill_id) REFERENCES drills_library(id) ON DELETE CASCADE;
alter table public.drill_periodisation add constraint drill_periodisation_pkey PRIMARY KEY (id);
alter table public.drill_periodisation add constraint drill_periodisation_drill_id_meso_phase_type_key UNIQUE (drill_id, meso, phase_type);

alter table public.competitions add constraint competitions_level_check CHECK (((level >= 1) AND (level <= 4)));
alter table public.competitions add constraint competitions_link_status_check CHECK ((link_status = ANY (ARRAY['pending'::text, 'found'::text, 'not_found'::text, 'needs_review'::text])));
alter table public.competitions add constraint competitions_course_check CHECK ((course = ANY (ARRAY['SC'::text, 'LC'::text])));
alter table public.competitions add constraint competitions_pool_length_m_check CHECK ((pool_length_m > 0));
alter table public.competitions add constraint competitions_website_confidence_check CHECK ((website_confidence = ANY (ARRAY['confirmed'::text, 'probable'::text])));
alter table public.competitions add constraint competitions_gala_id_fkey FOREIGN KEY (gala_id) REFERENCES galas(id) ON DELETE SET NULL;
alter table public.competitions add constraint competitions_pkey PRIMARY KEY (id);
alter table public.competitions add constraint competitions_meet_id_key UNIQUE (meet_id);

alter table public.season_competitions add constraint season_competitions_dates CHECK ((date_to >= date_from));
alter table public.season_competitions add constraint season_competitions_course_check CHECK ((course = ANY (ARRAY['LC'::text, 'SC'::text])));
alter table public.season_competitions add constraint season_competitions_level_check CHECK (((level >= 1) AND (level <= 4)));
alter table public.season_competitions add constraint season_competitions_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES competitions(id);
alter table public.season_competitions add constraint season_competitions_season_id_fkey FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;
alter table public.season_competitions add constraint season_competitions_pkey PRIMARY KEY (id);

alter table public.competition_events add constraint competition_events_course_check CHECK ((course = ANY (ARRAY['LC'::text, 'SC'::text])));
alter table public.competition_events add constraint competition_events_event_no_check CHECK (((event_no >= 1) AND (event_no <= 18)));
alter table public.competition_events add constraint competition_events_season_competition_id_fkey FOREIGN KEY (season_competition_id) REFERENCES season_competitions(id) ON DELETE CASCADE;
alter table public.competition_events add constraint competition_events_pkey PRIMARY KEY (id);

alter table public.competition_files add constraint competition_files_status_check CHECK ((status = ANY (ARRAY['linked'::text, 'mirrored'::text, 'skipped'::text, 'dead'::text])));
alter table public.competition_files add constraint competition_files_file_kind_check CHECK ((file_kind = ANY (ARRAY['conditions'::text, 'entry_form'::text, 'timetable'::text, 'programme'::text, 'psych_sheet'::text, 'results'::text, 'other'::text])));
alter table public.competition_files add constraint competition_files_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE;
alter table public.competition_files add constraint competition_files_pkey PRIMARY KEY (id);
alter table public.competition_files add constraint competition_files_competition_id_source_url_key UNIQUE (competition_id, source_url);

alter table public.macro_competitions add constraint macro_competitions_designation_check CHECK ((designation = ANY (ARRAY['target'::text, 'qualifying'::text, 'train_through'::text, 'team'::text])));
alter table public.macro_competitions add constraint macro_competitions_season_competition_id_fkey FOREIGN KEY (season_competition_id) REFERENCES season_competitions(id);
alter table public.macro_competitions add constraint macro_competitions_macro_id_fkey FOREIGN KEY (macro_id) REFERENCES macros(id) ON DELETE CASCADE;
alter table public.macro_competitions add constraint macro_competitions_pkey PRIMARY KEY (id);
alter table public.macro_competitions add constraint macro_competitions_macro_id_season_competition_id_key UNIQUE (macro_id, season_competition_id);

alter table public.macro_squads add constraint macro_squads_macro_id_fkey FOREIGN KEY (macro_id) REFERENCES macros(id) ON DELETE CASCADE;
alter table public.macro_squads add constraint macro_squads_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES squads(id);
alter table public.macro_squads add constraint macro_squads_pkey PRIMARY KEY (macro_id, squad_id);

alter table public.micros add constraint micros_meso_check CHECK (((meso >= 1) AND (meso <= 3)));
alter table public.micros add constraint micros_technical_focus_check CHECK (((technical_focus >= 1) AND (technical_focus <= 8)));
alter table public.micros add constraint micros_qes_focus_check CHECK ((qes_focus = ANY (ARRAY['quality'::text, 'endurance'::text, 'sprint'::text])));
alter table public.micros add constraint micros_macro_id_fkey FOREIGN KEY (macro_id) REFERENCES macros(id) ON DELETE CASCADE;
alter table public.micros add constraint micros_pkey PRIMARY KEY (id);
alter table public.micros add constraint micros_macro_id_week_no_key UNIQUE (macro_id, week_no);

alter table public.timetable_sessions add constraint timetable_sessions_day_of_week_check CHECK (((day_of_week >= 1) AND (day_of_week <= 7)));
alter table public.timetable_sessions add constraint timetable_sessions_end_after_start_chk CHECK (((end_time IS NULL) OR (end_time > start_time)));
alter table public.timetable_sessions add constraint timetable_sessions_pool_size_check CHECK (((pool_size IS NULL) OR (pool_size = ANY (ARRAY['17m'::text, '25m'::text, '50m'::text]))));
alter table public.timetable_sessions add constraint timetable_sessions_timetable_id_fkey FOREIGN KEY (timetable_id) REFERENCES timetables(id);
alter table public.timetable_sessions add constraint timetable_sessions_pkey PRIMARY KEY (id);

alter table public.micro_sessions add constraint micro_sessions_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES squads(id);
alter table public.micro_sessions add constraint micro_sessions_micro_id_fkey FOREIGN KEY (micro_id) REFERENCES micros(id) ON DELETE CASCADE;
alter table public.micro_sessions add constraint micro_sessions_timetable_session_id_fkey FOREIGN KEY (timetable_session_id) REFERENCES timetable_sessions(id);
alter table public.micro_sessions add constraint micro_sessions_pkey PRIMARY KEY (id);

alter table public.session_plans add constraint session_plans_pool_size_check CHECK ((pool_size = ANY (ARRAY['17m'::text, '25m'::text, '50m'::text])));
alter table public.session_plans add constraint session_plans_training_zone_chk CHECK (((training_zone IS NULL) OR (training_zone = ANY (ARRAY['A1-3'::text, 'Threshold'::text, 'V02m'::text, 'LT/LP'::text, 'Sprint'::text]))));
alter table public.session_plans add constraint session_plans_micro_id_fkey FOREIGN KEY (micro_id) REFERENCES micros(id);
alter table public.session_plans add constraint session_plans_micro_session_id_fkey FOREIGN KEY (micro_session_id) REFERENCES micro_sessions(id);
alter table public.session_plans add constraint session_plans_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES squads(id);
alter table public.session_plans add constraint session_plans_pkey PRIMARY KEY (id);

alter table public.squad_memberships add constraint squad_memberships_squad_id_fkey FOREIGN KEY (squad_id) REFERENCES squads(id);
alter table public.squad_memberships add constraint squad_memberships_swimmer_id_fkey FOREIGN KEY (swimmer_id) REFERENCES swimmers(id);
alter table public.squad_memberships add constraint squad_memberships_pkey PRIMARY KEY (id);

alter table public.attendance_records add constraint attendance_records_pool_size_check CHECK ((pool_size = ANY (ARRAY['17m'::text, '25m'::text, '50m'::text])));
alter table public.attendance_records add constraint attendance_records_session_plan_id_fkey FOREIGN KEY (session_plan_id) REFERENCES session_plans(id);
alter table public.attendance_records add constraint attendance_records_swimmer_id_fkey FOREIGN KEY (swimmer_id) REFERENCES swimmers(id);
alter table public.attendance_records add constraint attendance_records_pkey PRIMARY KEY (id);
alter table public.attendance_records add constraint attendance_records_swimmer_id_session_date_session_time_poo_key UNIQUE (swimmer_id, session_date, session_time, pool_size);

alter table public.swim_results add constraint swim_results_course_check CHECK ((course = ANY (ARRAY['SC'::text, 'LC'::text])));
alter table public.swim_results add constraint swim_results_swimmer_id_fkey FOREIGN KEY (swimmer_id) REFERENCES swimmers(id) ON DELETE CASCADE;
alter table public.swim_results add constraint swim_results_pkey PRIMARY KEY (id);
alter table public.swim_results add constraint swim_results_no_dupe UNIQUE (swimmer_id, event, course, meet_date, swim_time);

alter table public.swimmer_feedback add constraint swimmer_feedback_entry_type_check CHECK ((entry_type = ANY (ARRAY['status'::text, 'note'::text])));
alter table public.swimmer_feedback add constraint swimmer_feedback_category_check CHECK ((category = ANY (ARRAY['Free'::text, 'Back'::text, 'Breast'::text, 'Fly'::text, 'Dive'::text, 'Transition'::text, 'Touch turn'::text, 'Tumble turn'::text, 'Training mindset'::text, 'Racing mindset'::text])));
alter table public.swimmer_feedback add constraint swimmer_feedback_status_check CHECK ((status = ANY (ARRAY['Not discussed'::text, 'Started'::text, 'Developing'::text, 'Embedded'::text])));
alter table public.swimmer_feedback add constraint swimmer_feedback_session_plan_id_fkey FOREIGN KEY (session_plan_id) REFERENCES session_plans(id);
alter table public.swimmer_feedback add constraint swimmer_feedback_swimmer_id_fkey FOREIGN KEY (swimmer_id) REFERENCES swimmers(id);
alter table public.swimmer_feedback add constraint swimmer_feedback_pkey PRIMARY KEY (id);

alter table public.stopwatch_times add constraint stopwatch_times_distance_m_check CHECK ((distance_m > 0));
alter table public.stopwatch_times add constraint stopwatch_times_course_check CHECK ((course = ANY (ARRAY['SC'::text, 'LC'::text])));
alter table public.stopwatch_times add constraint stopwatch_times_time_ms_check CHECK ((time_ms > 0));
alter table public.stopwatch_times add constraint stopwatch_times_time_type_check CHECK ((time_type = ANY (ARRAY['lap'::text, 'elapsed'::text, 'total'::text])));
alter table public.stopwatch_times add constraint stopwatch_times_swimmer_id_fkey FOREIGN KEY (swimmer_id) REFERENCES swimmers(id) ON DELETE CASCADE;
alter table public.stopwatch_times add constraint stopwatch_times_pkey PRIMARY KEY (id);

alter table public.qualifying_times add constraint qualifying_times_converted_time_course_check CHECK (((converted_time_course IS NULL) OR (converted_time_course = ANY (ARRAY['SC'::text, 'LC'::text]))));
alter table public.qualifying_times add constraint qualifying_times_course_check CHECK ((course = ANY (ARRAY['SC'::text, 'LC'::text])));
alter table public.qualifying_times add constraint qualifying_times_course_variant_check CHECK (((course_variant IS NULL) OR (course_variant = ANY (ARRAY['converted'::text, 'native'::text]))));
alter table public.qualifying_times add constraint qualifying_times_gender_check CHECK ((gender = ANY (ARRAY['Male'::text, 'Female'::text])));
alter table public.qualifying_times add constraint qualifying_times_time_type_check CHECK ((time_type = ANY (ARRAY['Qualifying'::text, 'UQT'::text, 'LQT'::text, 'Consideration'::text, 'Automatic'::text])));
alter table public.qualifying_times add constraint qualifying_times_gala_id_fkey FOREIGN KEY (gala_id) REFERENCES galas(id) ON DELETE CASCADE;
alter table public.qualifying_times add constraint qualifying_times_pkey PRIMARY KEY (id);
alter table public.qualifying_times add constraint qualifying_times_gala_id_course_event_gender_age_group_time_key UNIQUE (gala_id, course, event, gender, age_group, time_type);

alter table public.drill_set_line_archive add constraint drill_set_line_archive_phase_type_check CHECK ((phase_type = ANY (ARRAY['Quality'::text, 'Endurance'::text, 'Sprint'::text])));
alter table public.drill_set_line_archive add constraint drill_set_line_archive_meso_check CHECK ((meso = ANY (ARRAY['Meso 1'::text, 'Meso 2'::text, 'Meso 3'::text])));
alter table public.drill_set_line_archive add constraint drill_set_line_archive_drill_id_fkey FOREIGN KEY (drill_id) REFERENCES drills_library(id) ON DELETE CASCADE;
alter table public.drill_set_line_archive add constraint drill_set_line_archive_session_plan_id_fkey FOREIGN KEY (session_plan_id) REFERENCES session_plans(id) ON DELETE SET NULL;
alter table public.drill_set_line_archive add constraint drill_set_line_archive_pkey PRIMARY KEY (id);

-- ---------------------------------------------------------------------
-- Indexes (non-constraint)
-- ---------------------------------------------------------------------

create index idx_assessments_assessed_at on public.assessments using btree (assessed_at desc);
create index idx_assessments_coach on public.assessments using btree (coach_email);
create index idx_assessments_date on public.assessments using btree (assessed_at desc);
create index idx_assessments_swimmer on public.assessments using btree (swimmer_name);
create index idx_assessments_swimmer_name on public.assessments using btree (swimmer_name);

create index attendance_records_plan_idx on public.attendance_records using btree (session_plan_id);
create index attendance_records_session_date_session_time_pool_size_idx on public.attendance_records using btree (session_date, session_time, pool_size);
create index attendance_records_swimmer_id_session_date_idx on public.attendance_records using btree (swimmer_id, session_date desc);

create unique index club_codes_club_name_lower_key on public.club_codes using btree (lower(club_name));
create index club_codes_county_code_idx on public.club_codes using btree (county_code);

create index competition_events_sc_idx on public.competition_events using btree (season_competition_id);
create index competition_files_competition_idx on public.competition_files using btree (competition_id);

create index competitions_license_idx on public.competitions using btree (license_number);
create index competitions_link_todo_idx on public.competitions using btree (link_status, date_start) where (website_url is null);
create index competitions_year_level_course_idx on public.competitions using btree (year, level, course, date_start);

create index idx_drill_periodisation_drill on public.drill_periodisation using btree (drill_id);
create index idx_drill_set_line_archive_drill on public.drill_set_line_archive using btree (drill_id);
create index idx_drill_set_line_archive_session_plan on public.drill_set_line_archive using btree (session_plan_id);

create index macros_season_idx on public.macros using btree (season_id);
create index micro_sessions_micro_idx on public.micro_sessions using btree (micro_id);
create index micros_macro_idx on public.micros using btree (macro_id);

create index qualifying_times_event_idx on public.qualifying_times using btree (event, gender, age_group);
create index qualifying_times_gala_id_idx on public.qualifying_times using btree (gala_id);

create index season_competitions_season_idx on public.season_competitions using btree (season_id);

create index session_plans_created_at_idx on public.session_plans using btree (created_at desc);
create index session_plans_intended_date_idx on public.session_plans using btree (intended_date desc);
create index session_plans_micro_idx on public.session_plans using btree (micro_id);
create index session_plans_squad_date_idx on public.session_plans using btree (squad_id, intended_date);

create index squad_memberships_squad_id_idx on public.squad_memberships using btree (squad_id);
create index squad_memberships_swimmer_id_joined_squad_on_idx on public.squad_memberships using btree (swimmer_id, joined_squad_on desc);

create index stopwatch_times_swimmer_idx on public.stopwatch_times using btree (swimmer_id, session_date desc);

create index idx_swim_results_event on public.swim_results using btree (event);
create index idx_swim_results_meet_date on public.swim_results using btree (meet_date);
create index idx_swim_results_swimmer_id on public.swim_results using btree (swimmer_id);

create index swimmer_feedback_category_idx on public.swimmer_feedback using btree (category);
create index swimmer_feedback_plan_idx on public.swimmer_feedback using btree (session_plan_id);
create index swimmer_feedback_swimmer_date_idx on public.swimmer_feedback using btree (swimmer_id, session_date desc);
create index swimmer_feedback_swimmer_thread_idx on public.swimmer_feedback using btree (swimmer_id, thread_id);
create index swimmer_feedback_thread_idx on public.swimmer_feedback using btree (thread_id, session_date desc, created_at desc);

create index timetable_sessions_timetable_idx on public.timetable_sessions using btree (timetable_id) where is_active;
create index timetables_season_id_idx on public.timetables using btree (season_id);
create index timetables_squad_idx on public.timetables using btree (squad_id) where is_active;

-- ---------------------------------------------------------------------
-- Row level security -- enable on all 30 tables. Policies for 28 of
-- them (everything except assessments/coaches) are created by the
-- already-committed 20260930190000_role_based_access.sql, which must
-- run immediately after this file. assessments/coaches get their
-- (superadmin-only) policies here directly -- see header note.
-- ---------------------------------------------------------------------

alter table public.assessments enable row level security;
alter table public.attendance_records enable row level security;
alter table public.club_codes enable row level security;
alter table public.coaches enable row level security;
alter table public.competition_events enable row level security;
alter table public.competition_files enable row level security;
alter table public.competitions enable row level security;
alter table public.conversion_factors enable row level security;
alter table public.drill_periodisation enable row level security;
alter table public.drill_set_line_archive enable row level security;
alter table public.drills_library enable row level security;
alter table public.galas enable row level security;
alter table public.macro_competitions enable row level security;
alter table public.macro_squads enable row level security;
alter table public.macros enable row level security;
alter table public.micro_sessions enable row level security;
alter table public.micros enable row level security;
alter table public.qualifying_times enable row level security;
alter table public.season_breaks enable row level security;
alter table public.season_competitions enable row level security;
alter table public.seasons enable row level security;
alter table public.session_plans enable row level security;
alter table public.squad_memberships enable row level security;
alter table public.squads enable row level security;
alter table public.stopwatch_times enable row level security;
alter table public.swim_results enable row level security;
alter table public.swimmer_feedback enable row level security;
alter table public.swimmers enable row level security;
alter table public.timetable_sessions enable row level security;
alter table public.timetables enable row level security;

create policy "Authenticated users can insert assessments" on public.assessments
  for insert to authenticated with check (public.is_superadmin());
create policy "Authenticated users can read assessments" on public.assessments
  for select to authenticated using (public.is_superadmin());
create policy coaches_select_all on public.assessments
  for select to authenticated using (public.is_superadmin());
create policy coaches_insert on public.assessments
  for insert to authenticated with check (public.is_superadmin());
create policy coaches_update_own on public.assessments
  for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy coaches_delete_own on public.assessments
  for delete to authenticated using (public.is_superadmin());

create policy coaches_select_own on public.coaches
  for select to authenticated using (public.is_superadmin());
create policy coaches_insert_own on public.coaches
  for insert to authenticated with check (public.is_superadmin());
create policy coaches_update_own on public.coaches
  for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy coaches_delete_own on public.coaches
  for delete to authenticated using (public.is_superadmin());

-- ---------------------------------------------------------------------
-- Views (security_invoker, matching their current production state)
-- ---------------------------------------------------------------------

create view public.dashboard_counts
  with (security_invoker = true) as
 SELECT ( SELECT count(*) AS count
           FROM swimmers) AS total_swimmers,
    ( SELECT count(*) AS count
           FROM swim_results) AS total_swim_records;

create view public.latest_per_swimmer
  with (security_invoker = true) as
 SELECT DISTINCT ON (swimmer_name) swimmer_name,
    "group",
    coach_email,
    scores,
    notes,
    assessed_at
   FROM assessments
  ORDER BY swimmer_name, assessed_at DESC;

create view public.rolling_90day
  with (security_invoker = true) as
 SELECT swimmer_name,
    "group",
    count(*) AS assessment_count,
    max(assessed_at) AS last_assessed,
    round(avg(COALESCE((scores ->> 'aquatic_skills_streamline'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'aquatic_skills_kick'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'aquatic_skills_turn'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'aquatic_skills_underwater'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'competitive_skill_race_awareness'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'competitive_skill_start'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'competitive_skill_pacing'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'competitive_skill_consistency'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'coachability_listens'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'coachability_drills'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'coachability_concentration'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'coachability_resilience'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'effort_attendance'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'effort_intensity'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'effort_work_ethic'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'effort_outside'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'stroke_technique_freestyle'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'stroke_technique_backstroke'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'stroke_technique_breaststroke'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'stroke_technique_butterfly'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'self_awareness_goal_awareness'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'self_awareness_self_monitoring'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'self_awareness_communication'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'self_awareness_review'::text)::numeric, 0::numeric)), 1) AS avg_total_score
   FROM assessments
  WHERE assessed_at >= (now() - '90 days'::interval)
  GROUP BY swimmer_name, "group"
  ORDER BY (round(avg(COALESCE((scores ->> 'aquatic_skills_streamline'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'aquatic_skills_kick'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'aquatic_skills_turn'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'aquatic_skills_underwater'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'competitive_skill_race_awareness'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'competitive_skill_start'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'competitive_skill_pacing'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'competitive_skill_consistency'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'coachability_listens'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'coachability_drills'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'coachability_concentration'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'coachability_resilience'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'effort_attendance'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'effort_intensity'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'effort_work_ethic'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'effort_outside'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'stroke_technique_freestyle'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'stroke_technique_backstroke'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'stroke_technique_breaststroke'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'stroke_technique_butterfly'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'self_awareness_goal_awareness'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'self_awareness_self_monitoring'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'self_awareness_communication'::text)::numeric, 0::numeric) + COALESCE((scores ->> 'self_awareness_review'::text)::numeric, 0::numeric)), 1)) DESC NULLS LAST;

create view public.competitions_with_files
  with (security_invoker = true) as
 SELECT c.id,
    c.meet_id,
    c.license_number,
    c.name,
    c.date_start,
    c.date_end,
    c.year,
    c.level,
    c.course,
    c.pool_length_m,
    c.meet_type,
    c.region,
    c.town_city,
    c.website_url,
    c.website_confidence,
    c.link_status,
    c.link_candidates,
    c.link_searched_at,
    c.files_scanned_at,
    c.source_url,
    c.gala_id,
    c.scraped_at,
    c.created_at,
    c.updated_at,
    COALESCE(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.file_name, 'kind', f.file_kind, 'ext', f.file_ext, 'href', COALESCE(f.public_url, f.source_url), 'mirrored', f.status = 'mirrored'::text) ORDER BY f.file_kind, f.file_name) FILTER (WHERE f.id IS NOT NULL), '[]'::jsonb) AS files
   FROM competitions c
     LEFT JOIN competition_files f ON f.competition_id = c.id AND f.status <> 'dead'::text
  GROUP BY c.id;

-- ---------------------------------------------------------------------
-- Functions (not already covered by committed migrations)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cascade_squad_rename()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.name is distinct from old.name then
    update swimmers set squad = new.name, updated_at = now() where squad_id = new.id;
    new.updated_at = now();
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.competitions_link_galas()
 RETURNS integer
 LANGUAGE sql
AS $function$
  with linked as (
    update public.competitions c
       set gala_id = g.id
      from public.galas g
     where c.gala_id is null
       and c.license_number is not null
       and upper(trim(g.license_number)) = upper(c.license_number)
    returning c.id
  )
  select count(*)::integer from linked;
$function$;

CREATE OR REPLACE FUNCTION public.competitions_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.recompute_is_pb()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_swimmer uuid; v_event text; v_course text;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_swimmer := old.swimmer_id; v_event := old.event; v_course := old.course;
  else
    v_swimmer := new.swimmer_id; v_event := new.event; v_course := new.course;
  end if;

  with ranked as (
    select id, (row_number() over (order by swim_time asc, id asc) = 1) as should_be_pb
    from public.swim_results
    where swimmer_id = v_swimmer and event = v_event and course = v_course
      and swim_time is not null
  )
  update public.swim_results sr
  set is_pb = coalesce(r.should_be_pb, false)
  from ranked r
  where sr.id = r.id
    and sr.is_pb is distinct from coalesce(r.should_be_pb, false);

  update public.swim_results
  set is_pb = false
  where swimmer_id = v_swimmer and event = v_event and course = v_course
    and swim_time is null and is_pb = true;

  if tg_op = 'UPDATE' and (
       old.swimmer_id is distinct from new.swimmer_id
    or old.event is distinct from new.event
    or old.course is distinct from new.course
  ) then
    with ranked as (
      select id, (row_number() over (order by swim_time asc, id asc) = 1) as should_be_pb
      from public.swim_results
      where swimmer_id = old.swimmer_id and event = old.event and course = old.course
        and swim_time is not null
    )
    update public.swim_results sr
    set is_pb = coalesce(r.should_be_pb, false)
    from ranked r
    where sr.id = r.id
      and sr.is_pb is distinct from coalesce(r.should_be_pb, false);

    update public.swim_results
    set is_pb = false
    where swimmer_id = old.swimmer_id and event = old.event and course = old.course
      and swim_time is null and is_pb = true;
  end if;

  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_swimmer_squad_text()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.squad_id is not null then
    select name into new.squad from public.squads where id = new.squad_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tt_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

CREATE TRIGGER competitions_touch_updated_at BEFORE UPDATE ON public.competitions FOR EACH ROW EXECUTE FUNCTION competitions_touch_updated_at();
CREATE TRIGGER trg_cascade_squad_rename BEFORE UPDATE ON public.squads FOR EACH ROW EXECUTE FUNCTION cascade_squad_rename();
CREATE TRIGGER trg_recompute_is_pb AFTER INSERT OR DELETE OR UPDATE OF swim_time, swimmer_id, event, course ON public.swim_results FOR EACH ROW EXECUTE FUNCTION recompute_is_pb();
CREATE TRIGGER trg_sync_swimmer_squad BEFORE INSERT OR UPDATE OF squad_id ON public.swimmers FOR EACH ROW EXECUTE FUNCTION sync_swimmer_squad_text();
CREATE TRIGGER timetable_sessions_touch_updated_at BEFORE UPDATE ON public.timetable_sessions FOR EACH ROW EXECUTE FUNCTION tt_touch_updated_at();
CREATE TRIGGER timetables_touch_updated_at BEFORE UPDATE ON public.timetables FOR EACH ROW EXECUTE FUNCTION tt_touch_updated_at();
