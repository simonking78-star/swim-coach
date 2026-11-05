-- Metrics & Measures, step 2: training exposure (A-126, A-127)
-- (claude/specs/metrics-and-measures.md §6)
--
-- 1. Work-type tags for session-plan set lines. Worked out from the line's
--    text and the heading it sits under (e.g. "Post set - turns"); a coach can
--    confirm or change them, stored as "work": [...] on the set block, which
--    then wins. Distances use the same rule as the app: "N x D" lines only,
--    multiplied by any repeat group.
-- 2. mm_plan_lines(plan): one row per set line with metres, tags and strokes.
-- 3. mm_exposure(swimmer, from, to): what the swimmer actually did between
--    two dates, from attendance (fraction attended) × the attached plans.
-- 4. Closing a test stores three exposure snapshots on each result — since the
--    previous result, since the baseline and the past 90 days — plus club
--    tenure and time in squad, so later plan edits never rewrite history.

-- ---------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------
create or replace function app_private.mm_auto_tags(p_text text, p_heading text, p_has_drill boolean)
returns text[] language sql immutable set search_path = '' as $$
  with t as (select lower(coalesce(p_text, '')) as l, lower(coalesce(p_heading, '')) as h)
  select coalesce(array_agg(tag order by tag), '{}') from (
    select distinct tag from t, lateral (values
      ('kick',       l ~ '\mkick|\mdlk\M|\msfk\M|flutter|\mfk\M'),
      ('pull',       l ~ '\mpull|paddle'),
      ('drill',      p_has_drill or l ~ 'drill|scull|single arm|catch.?up|\mfist|6:3:6|golf|shoulder (pop|drive)|swordfish|tombstone|skids|vcup|freast|fleast|crackover|duck paddle|\mrnr\M' or h ~ 'drill|scull'),
      ('turns',      l ~ 'turn|in.?(and.?)?out|into and out of (the )?wall|transition|tumble|crackover|touch on back|\mwall\M' or h ~ 'turn|transition'),
      ('starts',     l ~ '\mdive|\mstarts?\M|\mblocks?\M|from block' or h ~ 'dive|start'),
      ('underwater', l ~ 'underwater|\muw\M|streamline|\mdlk\M|\msfk\M|breakout'),
      ('speed',      l ~ 'sprint|\mfast|\mmax\M|all out|\m(25|50) all' or h ~ 'sprint|speed'),
      ('race_pace',  l ~ 'race pace|\mrp\M|\d+ pace\M|at pace|\mpace\M'),
      ('aerobic',    l ~ 'aerobic|threshold|\ma[1-3]\M|\mcss\M|desc(end)?\M|negative split|\mbuild|pyramid|broken swim' or h ~ 'aerobic|threshold|pyramid'),
      ('efficiency', l ~ 'stroke count|count strokes|\mdps\M|distance per stroke|\mcount\M'),
      ('recovery',   l ~ '\measy|recovery|loosen|swim down|warm ?down|cool ?down' or h ~ 'cool ?down|swim down|recovery'),
      ('warm_up',    h ~ 'warm ?up')
    ) v(tag, hit) where hit
  ) x;
$$;

create or replace function app_private.mm_line_strokes(p_text text, p_heading text)
returns text[] language sql immutable set search_path = '' as $$
  with t as (select lower(coalesce(p_text, '') || ' ' || coalesce(p_heading, '')) as l)
  select coalesce(array_agg(s order by s), '{}') from (
    select distinct s from t, lateral (values
      ('Fr', l ~ '\mfr(ee)?\M|freestyle|front crawl'),
      ('Bk', l ~ '\mbk\M|\mback'),
      ('Brs', l ~ '\mbrs?\M|breast'),
      ('Fly', l ~ '\mfly\M|butterfly'),
      ('IM', l ~ '\mim\M|\mimo\M|medley')
    ) v(s, hit) where hit
  ) x;
$$;

revoke all on function app_private.mm_auto_tags(text, text, boolean), app_private.mm_line_strokes(text, text) from public, anon;
grant execute on function app_private.mm_auto_tags(text, text, boolean), app_private.mm_line_strokes(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Plan lines
-- ---------------------------------------------------------------------
-- line_path: [top index] or [top index, child index], to write "work" back.
create or replace function public.mm_plan_lines(p_plan uuid)
returns table (line_no int, line_path int[], heading text, text text, mult int, metres int, tags text[], auto_tags text[],
               confirmed boolean, strokes text[], drill_ids uuid[])
language plpgsql stable security invoker set search_path = '' as $$
declare
  content jsonb; b jsonb; c jsonb; i int; j int; head text := null; n int := 0; reps int;
  m text[]; d int; work jsonb; auto text[]; ids uuid[];
begin
  select sp.content into content from public.session_plans sp where sp.id = p_plan;
  if content is null or jsonb_typeof(content) <> 'array' then return; end if;
  for i in 0 .. jsonb_array_length(content) - 1 loop
    b := content -> i;
    if b->>'type' = 'heading' then head := b->>'text'; continue; end if;
    if b->>'type' not in ('set', 'repeat_group') then continue; end if;
    reps := case when b->>'type' = 'repeat_group' then greatest(coalesce((b->>'reps')::int, 1), 0) else 1 end;
    for j in 0 .. case when b->>'type' = 'repeat_group' then jsonb_array_length(coalesce(b->'children', '[]')) - 1 else 0 end loop
      c := case when b->>'type' = 'repeat_group' then b->'children'->j else b end;
      if coalesce(trim(c->>'text'), '') = '' then continue; end if;
      n := n + 1;
      m := regexp_match(c->>'text', '^\s*(\d+)\s*[xX×]\s*(\d+)\M');
      d := case when m is null then 0 else m[1]::int * m[2]::int * reps end;
      ids := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(c->'drill_ids', '[]')) x where x ~ '^[0-9a-f-]{36}$'), '{}');
      auto := app_private.mm_auto_tags(c->>'text', head, cardinality(ids) > 0);
      work := c->'work';
      line_no := n;
      line_path := case when b->>'type' = 'repeat_group' then array[i, j] else array[i] end;
      heading := head; text := c->>'text'; mult := reps; metres := d; auto_tags := auto;
      confirmed := work is not null and jsonb_typeof(work) = 'array';
      tags := case when confirmed then coalesce((select array_agg(x order by x) from jsonb_array_elements_text(work) x), '{}') else auto end;
      strokes := app_private.mm_line_strokes(c->>'text', head);
      drill_ids := ids;
      return next;
    end loop;
  end loop;
end $$;
revoke all on function public.mm_plan_lines(uuid) from public, anon;
grant execute on function public.mm_plan_lines(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Exposure between two dates (both exclusive: the test days themselves don't count)
-- ---------------------------------------------------------------------
create or replace function app_private.mm_exposure(p_swimmer uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  days int := greatest(p_to - p_from - 1, 0);
  out jsonb;
begin
  with att as (
    select a.session_plan_id,
           public.attendance_weight(a.status, a.minutes_attended, a.session_minutes) as w,
           public.attendance_minutes(a.status, a.minutes_attended, a.session_minutes) as mins
      from public.attendance_records a
     where a.swimmer_id = p_swimmer and a.session_date > p_from and a.session_date < p_to
  ), done as (
    select * from att where w is not null and w > 0
  ), lines as (
    select d.w, l.* from done d cross join lateral public.mm_plan_lines(d.session_plan_id) l where d.session_plan_id is not null
  ), tags as (
    select t, sum(w * metres) m, sum(w) n from lines, unnest(case when cardinality(tags) = 0 then array['swim'] else tags end) t group by t
  ), strokes as (
    select s, sum(w * metres) m from lines, unnest(strokes) s group by s
  ), drills as (
    select dr::text dr, sum(w) n from lines, unnest(drill_ids) dr group by dr
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'days', days,
    'sessions', round(coalesce((select sum(w) from done), 0), 2),
    'sessions_offered', (select count(*) from att where w is not null),
    'hours', round(coalesce((select sum(mins) from done), 0) / 60.0, 1),
    'with_plan', round(coalesce((select sum(w) from done where session_plan_id is not null), 0), 2),
    'metres', round(coalesce((select sum(w * metres) from lines), 0)),
    'by_tag', coalesce((select jsonb_object_agg(t, round(m)) from tags), '{}'),
    'lines_by_tag', coalesce((select jsonb_object_agg(t, round(n, 2)) from tags), '{}'),
    'by_stroke', coalesce((select jsonb_object_agg(s, round(m)) from strokes), '{}'),
    'drills', coalesce((select jsonb_object_agg(dr, round(n, 2)) from drills), '{}')
  ) into out;
  return out || jsonb_build_object(
    'per_week', case when days >= 7 then jsonb_build_object(
      'sessions', round((out->>'sessions')::numeric * 7 / days, 2),
      'hours', round((out->>'hours')::numeric * 7 / days, 1),
      'metres', round((out->>'metres')::numeric * 7 / days)) else null end,
    'plan_known_pct', case when (out->>'sessions')::numeric > 0
      then round(100 * (out->>'with_plan')::numeric / (out->>'sessions')::numeric) else null end);
end $$;
revoke all on function app_private.mm_exposure(uuid, date, date) from public, anon, authenticated;

-- For the app: exposure for a swimmer the user can see (e.g. a live preview).
create or replace function public.mm_swimmer_exposure(p_swimmer uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_swimmer not in (select app_private.swimmer_ids('stopwatch', false))
     and p_swimmer not in (select app_private.swimmer_ids('stats', false)) then
    raise exception 'You cannot see this swimmer';
  end if;
  return app_private.mm_exposure(p_swimmer, p_from, p_to);
end $$;
revoke all on function public.mm_swimmer_exposure(uuid, date, date) from public, anon;
grant execute on function public.mm_swimmer_exposure(uuid, date, date) to authenticated;

-- Snapshot for one result: since previous, since baseline, past 90 days, tenure.
create or replace function app_private.mm_snapshot(p_result uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare x public.mm_results%rowtype; prev_d date; base_d date; joined date; squad_from date;
begin
  select * into x from public.mm_results where id = p_result;
  if x.id is null then return; end if;
  select session_date into prev_d from public.mm_results where id = x.previous_id;
  select session_date into base_d from public.mm_results where id = x.baseline_id;
  select s.joined_club_on into joined from public.swimmers s where s.id = x.swimmer_id;
  select max(m.joined_squad_on) into squad_from from public.squad_memberships m
   where m.swimmer_id = x.swimmer_id and m.squad_id = x.squad_id and m.joined_squad_on <= x.session_date
     and (m.ended_on is null or m.ended_on >= x.session_date);
  update public.mm_results set exposure = jsonb_build_object(
      'since_prev', case when prev_d is null then null else app_private.mm_exposure(x.swimmer_id, prev_d, x.session_date) end,
      'since_base', case when base_d is null or base_d = prev_d then null else app_private.mm_exposure(x.swimmer_id, base_d, x.session_date) end,
      'd90', app_private.mm_exposure(x.swimmer_id, x.session_date - 91, x.session_date),
      'tenure_days', case when joined is null then null else x.session_date - joined end,
      'squad_days', case when squad_from is null then null else x.session_date - squad_from end,
      'taken_at', now())
   where id = p_result;
end $$;
revoke all on function app_private.mm_snapshot(uuid) from public, anon, authenticated;

-- Relinking a series now also refreshes the snapshot of every result in it.
create or replace function app_private.mm_relink_snap(p_swimmer uuid, p_protocol uuid, p_major smallint, p_level text)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  perform app_private.mm_relink(p_swimmer, p_protocol, p_major, p_level);
  for r in select id, flag from public.mm_results
            where swimmer_id = p_swimmer and protocol_id = p_protocol and major = p_major and level_key = p_level loop
    if r.flag is null then update public.mm_results set exposure = null where id = r.id;
    else perform app_private.mm_snapshot(r.id); end if;
  end loop;
end $$;
revoke all on function app_private.mm_relink_snap(uuid, uuid, smallint, text) from public, anon, authenticated;

create or replace function app_private.mm_session_relink() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.status is distinct from old.status then
    for r in select distinct swimmer_id, protocol_id, major, level_key from public.mm_results where session_id = new.id loop
      perform app_private.mm_relink_snap(r.swimmer_id, r.protocol_id, r.major, r.level_key);
    end loop;
  end if;
  return null;
end $$;

create or replace function public.mm_set_rebaseline(p_result uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare x public.mm_results%rowtype;
begin
  select * into x from public.mm_results where id = p_result;
  if x.id is null or x.swimmer_id not in (select app_private.swimmer_ids('stopwatch', true)) then
    raise exception 'You cannot change this result';
  end if;
  update public.mm_results set rebaseline_reason = nullif(trim(p_reason), '') where id = p_result;
  perform app_private.mm_relink_snap(x.swimmer_id, x.protocol_id, x.major, x.level_key);
end $$;

-- Recompute every snapshot (e.g. after work tags on old plans are confirmed).
create or replace function public.mm_refresh_exposure(p_club uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  if not app_private.can_c('season', true, p_club) then raise exception 'Head coach or admin only'; end if;
  for r in select id from public.mm_results where club_id = p_club and flag is not null loop
    perform app_private.mm_snapshot(r.id); n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.mm_refresh_exposure(uuid) from public, anon;
grant execute on function public.mm_refresh_exposure(uuid) to authenticated;
