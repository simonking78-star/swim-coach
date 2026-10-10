-- Season planning tool: periodisation model library, training blocks,
-- roll-forward links and club-integrity guards. Additive only.

-- ---------------------------------------------------------------
-- 1. Shared periodisation model library (reference data, all clubs)
-- ---------------------------------------------------------------
create table if not exists public.periodisation_models (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  summary     text,
  guidance    text,
  cycle_weeks smallint check (cycle_weeks is null or cycle_weeks between 2 and 26),
  phases      jsonb not null default '[]'::jsonb,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.periodisation_models is
  'Shared library of periodisation models (Traditional, Block, USRPT ...). Reference data readable by every club; only a superadmin edits it. Club plans (macros) point at a model and hold their own editable copy of the blocks in macro_blocks.';
comment on column public.periodisation_models.cycle_weeks is
  'Null = the phase sequence spans the whole macro once. A number = the sequence repeats in cycles of about this many weeks.';
comment on column public.periodisation_models.phases is
  'Ordered phase templates: [{name, share, min_weeks, tone, meso, qes, zone, aim}]. share is the fraction of a cycle.';

alter table public.periodisation_models enable row level security;
create policy "periodisation_models read" on public.periodisation_models
  for select to anon, authenticated using (true);
create policy rbac_insert on public.periodisation_models
  for insert to authenticated with check (app_private.real_super());
create policy rbac_update on public.periodisation_models
  for update to authenticated using (app_private.real_super()) with check (app_private.real_super());
grant select on public.periodisation_models to anon, authenticated;
grant insert, update on public.periodisation_models to authenticated;

insert into public.periodisation_models (key, name, summary, guidance, cycle_weeks, sort_order, phases) values
('traditional', 'Traditional (linear)',
 'One long build to a single peak: general preparation, specific preparation, competition, taper.',
 'Volume is highest early and falls as intensity and race specificity rise. Suits a macro aimed at one target meet with 12 or more weeks to build.',
 null, 1,
 '[{"name":"General preparation","share":0.40,"min_weeks":2,"tone":"endurance","meso":1,"qes":"endurance","zone":"A1-3","aim":"Aerobic base, technique and skills at volume"},
   {"name":"Specific preparation","share":0.30,"min_weeks":2,"tone":"quality","meso":2,"qes":"quality","zone":"Threshold","aim":"Threshold and VO2 work, race-specific skills"},
   {"name":"Competition","share":0.20,"min_weeks":1,"tone":"racepace","meso":3,"qes":"quality","zone":"LT/LP","aim":"Race-pace sets; starts, turns and finishes; meets as rehearsal"},
   {"name":"Taper","share":0.10,"min_weeks":1,"tone":"taper","meso":3,"qes":"sprint","zone":"Sprint","aim":"Volume down, speed and sharpness kept"}]'::jsonb),
('block', 'Block (ATR)',
 'Short concentrated blocks repeated through the macro: accumulation, transmutation, realisation.',
 'Each cycle concentrates on few qualities at a time and ends in a realisation block that can sit on a meet. Suits a calendar with several meets that matter.',
 8, 2,
 '[{"name":"Accumulation","share":0.45,"min_weeks":1,"tone":"endurance","meso":1,"qes":"endurance","zone":"A1-3","aim":"Aerobic capacity, strength and technique volume"},
   {"name":"Transmutation","share":0.35,"min_weeks":1,"tone":"quality","meso":2,"qes":"quality","zone":"V02m","aim":"Convert the base into event-specific intensity"},
   {"name":"Realisation","share":0.20,"min_weeks":1,"tone":"taper","meso":3,"qes":"sprint","zone":"Sprint","aim":"Recover, sharpen and race"}]'::jsonb),
('usrpt', 'USRPT',
 'Ultra-short race-pace training all macro: set the paces, build reps at pace, then peak.',
 'No separate endurance phase. Progress is measured by reps completed at race pace before failure, not by volume.',
 null, 3,
 '[{"name":"Pace establishment","share":0.15,"min_weeks":1,"tone":"quality","meso":1,"qes":"quality","zone":"LT/LP","aim":"Set target race paces per event; learn the set format and failure rules"},
   {"name":"Race-pace development","share":0.75,"min_weeks":1,"tone":"racepace","meso":2,"qes":"quality","zone":"LT/LP","aim":"Race-pace sets to failure; progress by reps completed"},
   {"name":"Peak","share":0.10,"min_weeks":1,"tone":"taper","meso":3,"qes":"sprint","zone":"Sprint","aim":"Fewer reps at race pace, full recovery"}]'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------
-- 2. Plan instances: model + start date on the macro, blocks, links
-- ---------------------------------------------------------------
alter table public.macros
  add column if not exists model_id uuid references public.periodisation_models(id),
  add column if not exists start_date date,
  add column if not exists copied_from_macro_id uuid references public.macros(id) on delete set null;
comment on column public.macros.model_id is 'Periodisation model this plan was built from (null = none chosen).';
comment on column public.macros.start_date is 'Monday that week 1 commences. Lets blocks be placed on the season calendar before the weeks are saved.';

update public.macros m
   set start_date = (select min(mi.week_commencing) from public.micros mi where mi.macro_id = m.id and mi.is_active)
 where m.start_date is null;

create table if not exists public.macro_blocks (
  id            uuid primary key default gen_random_uuid(),
  macro_id      uuid not null references public.macros(id) on delete cascade,
  seq           smallint not null check (seq >= 1),
  name          text not null,
  start_week    smallint not null check (start_week >= 1),
  weeks         smallint not null check (weeks between 1 and 52),
  tone          text not null default 'quality'
                check (tone in ('endurance','quality','sprint','racepace','taper','recovery')),
  meso          smallint check (meso between 1 and 3),
  qes_focus     text check (qes_focus in ('quality','endurance','sprint')),
  training_zone text check (training_zone is null or training_zone in ('A1-3','Threshold','V02m','LT/LP','Sprint')),
  aim           text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists macro_blocks_macro_idx on public.macro_blocks (macro_id);
comment on table public.macro_blocks is
  'Training blocks of one macro (a club''s plan for one or more squads). Blocks run back to back from week 1: start_week + weeks. Removed blocks are disabled, not erased.';

alter table public.macro_blocks enable row level security;
-- Same access pattern as macros/micros. The anon policies go when the app moves to sign-in only (A-013).
create policy "macro_blocks read"   on public.macro_blocks for select to anon using (true);
create policy "macro_blocks insert" on public.macro_blocks for insert to anon with check (true);
create policy "macro_blocks update" on public.macro_blocks for update to anon using (true) with check (true);
create policy rbac_select on public.macro_blocks for select to authenticated
  using (app_private.can('season', false, app_private.macro_club(macro_id)));
create policy rbac_insert on public.macro_blocks for insert to authenticated
  with check (app_private.can('season', true, app_private.macro_club(macro_id)));
create policy rbac_update on public.macro_blocks for update to authenticated
  using (app_private.can('season', true, app_private.macro_club(macro_id)))
  with check (app_private.can('season', true, app_private.macro_club(macro_id)));
create policy rbac_delete on public.macro_blocks for delete to authenticated
  using (app_private.can('season', true, app_private.macro_club(macro_id)));
grant select, insert, update on public.macro_blocks to anon, authenticated;
grant delete on public.macro_blocks to authenticated;

alter table public.micros
  add column if not exists block_id uuid references public.macro_blocks(id) on delete set null;
create index if not exists micros_block_idx on public.micros (block_id);

alter table public.seasons
  add column if not exists copied_from_season_id uuid references public.seasons(id) on delete set null;

alter table public.season_competitions
  add column if not exists is_provisional boolean not null default false,
  add column if not exists copied_from_id uuid references public.season_competitions(id) on delete set null;
comment on column public.season_competitions.is_provisional is
  'true = carried over by roll-forward with last season''s dates moved on a year; the date and meet link still need confirming.';

-- ---------------------------------------------------------------
-- 3. Club integrity: a plan can only reference its own club's rows
-- ---------------------------------------------------------------
create or replace function app_private.tg_same_club()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a text; b text;
begin
  if tg_table_name = 'macro_squads' then
    a := app_private.macro_club(new.macro_id);  b := app_private.squad_club(new.squad_id);
  elsif tg_table_name = 'macro_competitions' then
    a := app_private.macro_club(new.macro_id);  b := app_private.season_comp_club(new.season_competition_id);
  elsif tg_table_name = 'micro_sessions' then
    a := app_private.micro_club(new.micro_id);  b := app_private.squad_club(new.squad_id);
  elsif tg_table_name = 'timetables' then
    if new.season_id is null then return new; end if;
    a := app_private.season_club(new.season_id); b := app_private.squad_club(new.squad_id);
  elsif tg_table_name = 'session_plans' then
    if new.squad_id is not null and app_private.squad_club(new.squad_id) is distinct from new.club then
      raise exception 'That squad belongs to a different club' using errcode = '23514';
    end if;
    if new.micro_id is not null and app_private.micro_club(new.micro_id) is distinct from new.club then
      raise exception 'That training week belongs to a different club' using errcode = '23514';
    end if;
    return new;
  end if;
  if a is distinct from b then
    raise exception 'Those records belong to different clubs' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists same_club on public.macro_squads;
create trigger same_club before insert or update of macro_id, squad_id on public.macro_squads
  for each row execute function app_private.tg_same_club();
drop trigger if exists same_club on public.macro_competitions;
create trigger same_club before insert or update of macro_id, season_competition_id on public.macro_competitions
  for each row execute function app_private.tg_same_club();
drop trigger if exists same_club on public.micro_sessions;
create trigger same_club before insert or update of micro_id, squad_id on public.micro_sessions
  for each row execute function app_private.tg_same_club();
drop trigger if exists same_club on public.timetables;
create trigger same_club before insert or update of season_id, squad_id on public.timetables
  for each row execute function app_private.tg_same_club();
drop trigger if exists same_club on public.session_plans;
create trigger same_club before insert or update of club, squad_id, micro_id on public.session_plans
  for each row execute function app_private.tg_same_club();

-- ---------------------------------------------------------------
-- 4. Copy a macro (to other squads, or into another season of the same club)
--    Runs as the caller, so row-level security decides who may do it.
-- ---------------------------------------------------------------
create or replace function public.copy_macro(
  p_macro uuid,
  p_title text default null,
  p_squads uuid[] default null,          -- null = same squads; '{}' = none yet
  p_season uuid default null,            -- null = same season
  p_shift_days integer default 0,
  p_copy_sessions boolean default false)
returns uuid language plpgsql set search_path = '' as $$
declare
  m public.macros%rowtype;
  v_new uuid;
  v_season uuid;
begin
  select * into m from public.macros where id = p_macro;
  if not found then raise exception 'Macro not found'; end if;
  v_season := coalesce(p_season, m.season_id);
  if (select club from public.seasons where id = v_season)
     is distinct from (select club from public.seasons where id = m.season_id) then
    raise exception 'A macro can only be copied within its own club';
  end if;
  if p_shift_days % 7 <> 0 then raise exception 'The shift must be a whole number of weeks'; end if;

  insert into public.macros (season_id, title, head_coach_note, micro_count, model_id, start_date, copied_from_macro_id)
  values (v_season, coalesce(nullif(trim(p_title), ''), m.title), m.head_coach_note, m.micro_count,
          m.model_id, m.start_date + p_shift_days, m.id)
  returning id into v_new;

  insert into public.macro_squads (macro_id, squad_id)
  select v_new, z.squad_id from (
    select ms.squad_id from public.macro_squads ms where ms.macro_id = m.id and ms.is_active and p_squads is null
    union
    select unnest(p_squads)) z;

  insert into public.macro_competitions (macro_id, season_competition_id, designation)
  select v_new, case when v_season = m.season_id then mc.season_competition_id else nsc.id end, mc.designation
    from public.macro_competitions mc
    left join public.season_competitions nsc
           on nsc.season_id = v_season and nsc.copied_from_id = mc.season_competition_id and nsc.is_active
   where mc.macro_id = m.id and mc.is_active and (v_season = m.season_id or nsc.id is not null);

  insert into public.macro_blocks (macro_id, seq, name, start_week, weeks, tone, meso, qes_focus, training_zone, aim)
  select v_new, b.seq, b.name, b.start_week, b.weeks, b.tone, b.meso, b.qes_focus, b.training_zone, b.aim
    from public.macro_blocks b where b.macro_id = m.id and b.is_active;

  insert into public.micros (macro_id, week_no, week_commencing, meso, qes_focus, technical_focus, break_days, block_id)
  select v_new, mi.week_no, mi.week_commencing + p_shift_days, mi.meso, mi.qes_focus, mi.technical_focus,
         case when p_shift_days = 0 then mi.break_days else '{}'::smallint[] end,
         (select nb.id from public.macro_blocks nb
            join public.macro_blocks ob on ob.seq = nb.seq
           where nb.macro_id = v_new and nb.is_active and ob.id = mi.block_id limit 1)
    from public.micros mi
   where mi.macro_id = m.id and mi.is_active and mi.week_no <= m.micro_count;

  if p_copy_sessions and p_squads is null then
    insert into public.micro_sessions (micro_id, squad_id, session_date, start_time, end_time, stroke_focus, outline)
    select nm.id, s.squad_id, s.session_date + p_shift_days, s.start_time, s.end_time, s.stroke_focus, s.outline
      from public.micro_sessions s
      join public.micros om on om.id = s.micro_id
      join public.micros nm on nm.macro_id = v_new and nm.week_no = om.week_no
     where om.macro_id = m.id and om.is_active and s.is_active;
  end if;
  return v_new;
end $$;

-- ---------------------------------------------------------------
-- 5. Roll a season forward: new season for the same club with the
--    breaks, meets (provisional), macros, blocks, weeks and timetables
--    moved on by a whole number of weeks.
-- ---------------------------------------------------------------
create or replace function public.roll_forward_season(
  p_season uuid,
  p_title text,
  p_start date,
  p_finish date,
  p_copy_sessions boolean default true,
  p_copy_timetables boolean default true)
returns jsonb language plpgsql set search_path = '' as $$
declare
  s public.seasons%rowtype;
  r record;
  v_new uuid; v_sc uuid; v_tt uuid;
  v_shift integer;
  v_ns date; v_ne date;
  n_comps integer := 0; n_macros integer := 0; n_tt integer := 0; n_breaks integer := 0;
begin
  select * into s from public.seasons where id = p_season;
  if not found then raise exception 'Season not found'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Give the new season a title'; end if;
  if p_start is null or p_finish is null or p_finish < p_start then
    raise exception 'Set a start and finish date for the new season';
  end if;
  if exists (select 1 from public.seasons o
              where o.club = s.club and o.is_active
                and o.start_date <= p_finish and o.finish_date >= p_start) then
    raise exception 'Those dates overlap an existing season for this club';
  end if;
  v_shift := round((p_start - s.start_date) / 7.0)::integer * 7;

  insert into public.seasons (club, title, start_date, finish_date, copied_from_season_id)
  values (s.club, trim(p_title), p_start, p_finish, s.id)
  returning id into v_new;

  insert into public.season_breaks (season_id, break_start, break_end)
  select v_new, greatest(p_start, b.break_start + v_shift), least(p_finish, b.break_end + v_shift)
    from public.season_breaks b
   where b.season_id = s.id and b.is_active
     and b.break_start + v_shift <= p_finish and b.break_end + v_shift >= p_start;
  get diagnostics n_breaks = row_count;

  for r in select * from public.season_competitions where season_id = s.id and is_active order by date_from loop
    insert into public.season_competitions
      (season_id, competition_id, name, level, course, date_from, date_to, venue_name, venue_url, is_provisional, copied_from_id)
    values (v_new, null, r.name, r.level, r.course, r.date_from + v_shift, r.date_to + v_shift,
            r.venue_name, r.venue_url, true, r.id)
    returning id into v_sc;
    insert into public.competition_events (season_competition_id, event_no, course, event_name, session, programme_event_no)
    select v_sc, e.event_no, e.course, e.event_name, e.session, e.programme_event_no
      from public.competition_events e where e.season_competition_id = r.id and e.is_active;
    n_comps := n_comps + 1;
  end loop;

  for r in select id from public.macros where season_id = s.id and is_active order by created_at loop
    perform public.copy_macro(r.id, null, null, v_new, v_shift, p_copy_sessions);
    n_macros := n_macros + 1;
  end loop;

  if p_copy_timetables then
    for r in select * from public.timetables where season_id = s.id and is_active loop
      v_ns := case when r.season_start <= s.start_date then p_start else greatest(p_start, r.season_start + v_shift) end;
      v_ne := case when r.season_end >= s.finish_date then p_finish else least(p_finish, r.season_end + v_shift) end;
      continue when v_ne < v_ns;
      insert into public.timetables (squad_id, season_start, season_end, season_id)
      values (r.squad_id, v_ns, v_ne, v_new) returning id into v_tt;
      insert into public.timetable_sessions (timetable_id, day_of_week, start_time, end_time, pool_size)
      select v_tt, ts.day_of_week, ts.start_time, ts.end_time, ts.pool_size
        from public.timetable_sessions ts where ts.timetable_id = r.id and ts.is_active;
      n_tt := n_tt + 1;
    end loop;
  end if;

  return jsonb_build_object('season_id', v_new, 'shift_days', v_shift, 'breaks', n_breaks,
                            'competitions', n_comps, 'macros', n_macros, 'timetables', n_tt);
end $$;

grant execute on function public.copy_macro(uuid, text, uuid[], uuid, integer, boolean) to anon, authenticated;
grant execute on function public.roll_forward_season(uuid, text, date, date, boolean, boolean) to anon, authenticated;
