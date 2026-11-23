-- Swim England Swimming Club Awards 1-6 (decided 23 Nov 2026).
-- Spec: claude/specs/club-awards.md. Source wording: swimming.org "Coaching the Swimming Club Awards"
-- (read 22 Nov 2026); built from Simon's club_awards_migration.sql / club_awards_outcomes.json, reworked
-- to fit the app's tenancy and role rules:
--   * The outcome list is shared reference data (same for every club) and registered as 'shared'.
--   * Each criterion is marked on a 5-point scale (score 1-5 = 20%-100%). No row = not started.
--     score 0 is allowed so a coach can record "tried, not yet" (shows red at 0%).
--   * Swimmer rows carry club_id and stay with the club where they were recorded (tenancy decision
--     20 Nov 2026), so a transferred swimmer starts afresh at the new club.
--   * An award is "activated" per swimmer by a coach; marking a criterion activates its award.
--     When every criterion of an award reaches 100% the award is achieved automatically (token on
--     the profile); dropping a mark below 100% clears it again.
--   * New section 'awards' in the role matrix: head coach and above edit any squad, coaches edit
--     their own squads, helpers read their own squads, parents / swimmers read their own child / self.
--   * New app feature 'club_awards' for the standalone Club-Awards-app, switched on wherever
--     Coach Tools is.

-- 1. Role matrix: add 'awards' ------------------------------------------------------------------
create or replace function app_private.level(p_section text, p_role text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select coalesce(('{
    "attendance":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"SE"},
    "feedback":  {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"SE","parent":"CR","swimmer":"CR"},
    "plans":     {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"R"},
    "squad_plans":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"SE","helper":"R"},
    "timetables":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"R","helper":"R","parent":"R","swimmer":"R"},
    "season":    {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"R"},
    "roster":    {"superadmin":"E","club_admin":"E","head_coach":"R","coach":"SR","helper":"SR","parent":"CR"},
    "stats":     {"superadmin":"E","club_admin":"R","head_coach":"R","coach":"R","parent":"CR","swimmer":"CR"},
    "stopwatch": {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"SE"},
    "admin":     {"superadmin":"E","club_admin":"E"},
    "appdev":    {"superadmin":"E"},
    "membership":{"superadmin":"E","club_admin":"E","head_coach":"R"},
    "medical":   {"superadmin":"E","club_admin":"E","head_coach":"R","coach":"SR"},
    "registrations":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"SE"},
    "awards":    {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"SE","helper":"SR","parent":"CR","swimmer":"CR"}
  }'::jsonb -> p_section ->> p_role), 'N');
$function$;

-- 2. Shared reference: the six awards and their outcomes -----------------------------------------
insert into app_private.tenancy_scope (relname, scope, via, note) values
  ('club_award_levels',   'shared', null, 'Swim England Swimming Club Awards 1-6: title, colour, icon. Superadmin writes.'),
  ('club_award_outcomes', 'shared', null, 'Swim England Swimming Club Award outcomes (criteria). Superadmin writes.')
on conflict (relname) do update set scope = excluded.scope, note = excluded.note;

create table if not exists public.club_award_levels (
  award  smallint primary key check (award between 1 and 6),
  title  text not null,
  colour text not null check (colour ~ '^#[0-9A-Fa-f]{6}$'),
  icon   text not null default '🏅'
);

create table if not exists public.club_award_outcomes (
  outcome_id text primary key check (outcome_id ~ '^SCA[1-6]-[0-9]{2}$'),
  award      smallint not null references public.club_award_levels(award),
  outcome_no smallint not null check (outcome_no > 0),
  area       text not null,          -- RRSC grouping, not Swim England wording
  outcome    text not null,          -- Swim England wording
  unique (award, outcome_no)
);

do $do$
declare t text;
begin
  foreach t in array array['club_award_levels','club_award_outcomes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists rbac_select on public.%I', t);
    execute format('drop policy if exists rbac_insert on public.%I', t);
    execute format('drop policy if exists rbac_update on public.%I', t);
    execute format('drop policy if exists rbac_delete on public.%I', t);
    execute format('create policy rbac_select on public.%I for select to authenticated using (true)', t);
    execute format('create policy rbac_insert on public.%I for insert to authenticated with check ((select app_private.acting_super()))', t);
    execute format('create policy rbac_update on public.%I for update to authenticated using ((select app_private.acting_super())) with check ((select app_private.acting_super()))', t);
    execute format('create policy rbac_delete on public.%I for delete to authenticated using ((select app_private.acting_super()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$do$;

-- Colours avoid red / amber / green, which the app uses for criterion status.
insert into public.club_award_levels (award, title, colour, icon) values
  (1, 'Swimming Club Award 1', '#2F80ED', '🏅'),
  (2, 'Swimming Club Award 2', '#7B4FD6', '🏅'),
  (3, 'Swimming Club Award 3', '#0E9FA8', '🏅'),
  (4, 'Swimming Club Award 4', '#D63D96', '🏅'),
  (5, 'Swimming Club Award 5', '#2B3A8C', '🏅'),
  (6, 'Swimming Club Award 6', '#B8860B', '🏆')
on conflict (award) do nothing;

insert into public.club_award_outcomes (outcome_id, award, outcome_no, area, outcome) values
  ('SCA1-01', 1, 1, 'Training skills', 'Use a pace clock to set off at a set interval agreed by the coach (e.g. every 5 or 10 seconds apart).'),
  ('SCA1-02', 1, 2, 'Body position', 'Perform a front float using the X, Y, and I (streamlined) positions. Hold each position for 5 seconds.'),
  ('SCA1-03', 1, 3, 'Body position', 'Perform a back float using the X, Y, and I (streamlined) positions. Hold each position for 5 seconds.'),
  ('SCA1-04', 1, 4, 'Body position', 'Demonstrate a streamlined position standing on dry land. Describe the position using the ''top to toe'' checklist.'),
  ('SCA1-05', 1, 5, 'Underwater skills', 'Push from a wall into a front streamlined position underwater.'),
  ('SCA1-06', 1, 6, 'Underwater skills', 'Push from a wall into a back streamlined position underwater.'),
  ('SCA1-07', 1, 7, 'Knowledge', 'Give four examples of items of swimming equipment and describe their use in training.'),
  ('SCA1-08', 1, 8, 'Knowledge', 'Demonstrate how to use each of the items of equipment above.'),
  ('SCA1-09', 1, 9, 'Drills & kicking', 'Kick 25 metres front crawl with arms at side.'),
  ('SCA1-10', 1, 10, 'Drills & kicking', 'Kick 25 metres backstroke with arms at side.'),
  ('SCA1-11', 1, 11, 'Drills & kicking', 'Kick 25 metres butterfly with arms at side.'),
  ('SCA1-12', 1, 12, 'Drills & kicking', 'Kick 25 metres breaststroke with hands on a small board or arms at side.'),
  ('SCA1-13', 1, 13, 'Starts', 'Perform a sitting dive from the side of the pool.'),
  ('SCA1-14', 1, 14, 'Starts', 'Perform a back dive from a standing position in the water.'),
  ('SCA2-01', 2, 1, 'Training skills', 'Complete a short set (e.g. 8 x 25 metres) on a set turnaround time (e.g. every 60 seconds). You must set off at a prescribed interval (e.g. every 5 or 10 seconds).'),
  ('SCA2-02', 2, 2, 'Underwater skills', 'Push off from the wall into a front streamlined position underwater and dolphin kick for a minimum of 5 metres.'),
  ('SCA2-03', 2, 3, 'Underwater skills', 'Push off from the wall into a front streamlined position underwater and perform a breaststroke underwater pull out.'),
  ('SCA2-04', 2, 4, 'Underwater skills', 'Push off from the wall into a back streamlined position underwater and dolphin kick for a minimum of 5 metres.'),
  ('SCA2-05', 2, 5, 'Knowledge', 'Demonstrate appropriate hydration strategies over a minimum of four training sessions.'),
  ('SCA2-06', 2, 6, 'Knowledge', 'Demonstrate an understanding of when and what to eat in relation to a training session.'),
  ('SCA2-07', 2, 7, 'Drills & kicking', 'Perform the front crawl single arm drill with one arm by the side for 25 metres.'),
  ('SCA2-08', 2, 8, 'Drills & kicking', 'Perform the backstroke single arm drill with one arm by the side for 25 metres.'),
  ('SCA2-09', 2, 9, 'Drills & kicking', 'Perform the butterfly drill, three scull then one swim for 25 metres.'),
  ('SCA2-10', 2, 10, 'Drills & kicking', 'Perform the breaststroke drill, two kicks then one pull for 25 metres.'),
  ('SCA2-11', 2, 11, 'Turns', 'Perform an effective approach, rotation and touch for front crawl and backstroke turns and an effective approach, touch, rotation and touch for butterfly and breaststroke turns.'),
  ('SCA2-12', 2, 12, 'Starts', 'Perform a kneeling dive from the poolside.'),
  ('SCA2-13', 2, 13, 'Starts', 'Perform a backstroke start from the wall, ideally with feet in a trough.'),
  ('SCA3-01', 3, 1, 'Preparation', 'Demonstrate an understanding of the four phases of the Raise, Mobilise, Activate, Prime (RMAP) warm up. Perform one exercise from each section.'),
  ('SCA3-02', 3, 2, 'Preparation', 'Demonstrate an understanding of effective stretching protocols. Perform two key stretches.'),
  ('SCA3-03', 3, 3, 'Training skills', 'Complete a short set (e.g. 8 x 25 metres) on a set turnaround time (e.g. every 60 seconds), using the pace clock to estimate the swim time on each repeat. Set off at a prescribed interval (e.g. every 5 or 10 seconds).'),
  ('SCA3-04', 3, 4, 'Underwater skills', 'Push off from the wall into a front streamlined position underwater and dolphin kick for a minimum of 5 metres. Transition through the surface of the water using an alternate kick into front crawl swimming for a minimum of five strokes.'),
  ('SCA3-05', 3, 5, 'Underwater skills', 'Push off from the wall into a front streamlined position underwater and dolphin kick for a minimum of 5 metres. Transition through the surface of the water into butterfly swimming for a minimum of five strokes.'),
  ('SCA3-06', 3, 6, 'Underwater skills', 'Push off from the wall into a front streamlined position underwater and perform a breaststroke underwater pull out. Transition through the surface of the water into breaststroke swimming for a minimum of five strokes.'),
  ('SCA3-07', 3, 7, 'Underwater skills', 'Push off from the wall into a back streamlined position underwater and dolphin kick for a minimum of 5 metres. Transition through the surface of the water using an alternate kick into backstroke swimming for a minimum of five strokes.'),
  ('SCA3-08', 3, 8, 'Goal setting', 'Demonstrate an understanding of process goals.'),
  ('SCA3-09', 3, 9, 'Full stroke', 'Swim 25 metres full stroke front crawl demonstrating the connectivity of rotation into limb actions, starting with the correct push off from the wall, underwater phase and transition to stroke.'),
  ('SCA3-10', 3, 10, 'Full stroke', 'Swim 25 metres full stroke backstroke demonstrating the connectivity of rotation into limb actions, starting with the correct push off from the wall, underwater phase and transition to stroke.'),
  ('SCA3-11', 3, 11, 'Full stroke', 'Swim 25 metres full stroke butterfly demonstrating the ability to resist short axis rotation to produce symmetrical limb actions, starting with the correct push off from the wall, underwater phase and transition to stroke.'),
  ('SCA3-12', 3, 12, 'Full stroke', 'Swim 25 metres full stroke breaststroke demonstrating the ability to resist short axis rotation to produce symmetrical limb actions, starting with the correct push off from the wall, underwater phase and transition to stroke.'),
  ('SCA3-13', 3, 13, 'Turns', 'Perform an effective push off and transition to stroke for each stroke turn.'),
  ('SCA3-14', 3, 14, 'Starts', 'Perform a standing dive from the poolside into a streamlined position underwater.'),
  ('SCA3-15', 3, 15, 'Starts', 'Perform a backstroke start from the wall, ideally with feet in a trough, into a streamlined position underwater.'),
  ('SCA3-16', 3, 16, 'Relays', 'Perform a simulated single step relay takeover action with combined arm swing on poolside.'),
  ('SCA4-01', 4, 1, 'Preparation', 'Warm up using a minimum of two Raise, Mobilise or Activate exercises and one Prime exercise.'),
  ('SCA4-02', 4, 2, 'Preparation', 'Perform a post swim stretching routine using a minimum of four key stretches.'),
  ('SCA4-03', 4, 3, 'Training skills', 'Complete a short set (e.g. 8 x 25 metres) on a set turnaround time (e.g. every 60 seconds), aiming to complete each repeat at a set pace (e.g. 40 seconds) to get a consistent rest (e.g. 20 seconds). Set off at a prescribed interval (e.g. every 5 or 10 seconds).'),
  ('SCA4-04', 4, 4, 'Goal setting', 'Set one process goal relating to improving stroke technique.'),
  ('SCA4-05', 4, 5, 'Full stroke', 'Swim 50 metres of each stroke (25 metres butterfly) demonstrating effective breathing and timing, starting with the correct push off from the wall, underwater phase and transition to stroke.'),
  ('SCA4-06', 4, 6, 'Full stroke', 'Swim 100 metres individual medley, starting with the correct push off from the wall, underwater phase and transition to stroke with legal touch turns.'),
  ('SCA4-07', 4, 7, 'Turns', 'Perform a legal and efficient turn on each of the four strokes from 10 metres in to 10 metres out from the wall.'),
  ('SCA4-08', 4, 8, 'Turns', 'Perform a legal and effective sequence of movements for each of the three individual medley transition turns.'),
  ('SCA4-09', 4, 9, 'Starts', 'Perform a track start using a starting block.'),
  ('SCA4-10', 4, 10, 'Starts', 'Perform a backstroke start using a starting block.'),
  ('SCA4-11', 4, 11, 'Relays', 'Perform a relay takeover arm swing and step from the side of the pool into the water.'),
  ('SCA4-12', 4, 12, 'Relays', 'Perform a single step relay takeover from the side of the pool into 25 metres front crawl swim.'),
  ('SCA5-01', 5, 1, 'Preparation', 'Warm up using a minimum of three Raise, Mobilise or Activate exercises and one Prime exercise.'),
  ('SCA5-02', 5, 2, 'Preparation', 'Complete a post swim stretching routine using a minimum of six key stretches.'),
  ('SCA5-03', 5, 3, 'Training skills', 'Complete a short set (e.g. 4 x 50 metres) on a set turnaround time (e.g. 90 seconds), aiming to swim each repeat at a set pace (e.g. 60 seconds) to get consistent rest (e.g. 30 seconds). Take a kick and stroke count on each repeat. Set off at a prescribed interval (e.g. every 5 or 10 seconds).'),
  ('SCA5-04', 5, 4, 'Goal setting', 'Set one process goal relating to improving a swimming skill e.g. a start, turn or finish.'),
  ('SCA5-05', 5, 5, 'Full stroke', 'For each stroke, swim 4 x 50 metres full stroke (4 x 25 metres butterfly), counting and maintaining an even underwater kick and stroke count.'),
  ('SCA5-06', 5, 6, 'Full stroke', 'Swim 100 metres individual medley from a track start on the starting block, incorporating legal and effective transition turns, starting with the correct push off from the wall, underwater phase and transition to stroke.'),
  ('SCA5-07', 5, 7, 'Turns', 'Perform a legal and efficient turn on each of the four strokes at race speed from 10 metres in to 10 metres out.'),
  ('SCA5-08', 5, 8, 'Turns', 'Perform a legal and effective push off from the wall and transition to stroke for each individual medley turn.'),
  ('SCA5-09', 5, 9, 'Starts', 'Following the starting procedure used in competitions, demonstrate the correct timing of ascent onto the starting block. Then perform a track start using a starting block demonstrating an effective set position, take off, flight, entry, underwater phase and transition to full stroke.'),
  ('SCA5-10', 5, 10, 'Starts', 'Following the starting procedure used in competitions, demonstrate the correct timing of entry into the water. Then perform a backstroke start using a starting block demonstrating an effective set position, take off, flight, entry, underwater phase and transition to full stroke.'),
  ('SCA5-11', 5, 11, 'Finishes', 'Perform a legal and effective finish on each of the four strokes.'),
  ('SCA5-12', 5, 12, 'Relays', 'Perform a single step relay takeover from the starting block into 25 metres front crawl swim.'),
  ('SCA5-13', 5, 13, 'Relays', 'Perform a single step relay takeover from the starting block into 25 metres front crawl swim, taking over from an incoming swimmer.'),
  ('SCA6-01', 6, 1, 'Preparation', 'Warm up using a minimum of four Raise, Mobilise, Activate exercises and one Prime exercise.'),
  ('SCA6-02', 6, 2, 'Preparation', 'Perform a post swim stretching routine using a minimum of eight key stretches.'),
  ('SCA6-03', 6, 3, 'Training skills', 'Complete a short set (e.g. 4 x 50 metres) on a set turnaround time (e.g. 90 seconds), aiming to swim each repeat at a set pace (e.g. 60 seconds) to get consistent rest (e.g. 30 seconds). Take a kick and stroke count on each repeat and determine the Stroke Efficiency Index. Set off at a prescribed interval (e.g. every 5 or 10 seconds).'),
  ('SCA6-04', 6, 4, 'Goal setting', 'Set one process goal relating to improving technique on individual medley turns and relay takeovers.'),
  ('SCA6-05', 6, 5, 'Full stroke', 'For each stroke, swim 4 x 50 metres full stroke (4 x 25 metres butterfly), maintaining underwater kick count and an even stroke count. Time each swim and determine the Stroke Efficiency Index for each. Start each with the correct push off from the wall, underwater phase and transition to stroke.'),
  ('SCA6-06', 6, 6, 'Full stroke', 'Swim 100 metres individual medley from a track start on the starting block incorporating legal and efficient medley transition turns at race speed.'),
  ('SCA6-07', 6, 7, 'Turns', 'Perform a legal and efficient turn from 10 metres in to 10 metres out at race speed for each of the individual medley transition turns.'),
  ('SCA6-08', 6, 8, 'Starts', 'Following the starting procedure used in competitions, perform a track start using a starting block. Demonstrate an effective set position, take off, flight, entry, underwater phase, pull out and transition to stroke into 50 metres full stroke swim (either front crawl or breaststroke) or 25 metres full stroke swim using butterfly. Perform at race speed, timed to 15 metres.'),
  ('SCA6-09', 6, 9, 'Starts', 'Following the starting procedure used in competitions, perform a backstroke start using a starting block. Demonstrate an effective set position, take off, flight, entry, underwater phase, pull out, transition to stroke into 50 metres full stroke backstroke at race speed, timed to 15 metres.'),
  ('SCA6-10', 6, 10, 'Finishes', 'Perform a legal and effective finish on each of the four strokes at race speed, timed 10 to 15 metres in.'),
  ('SCA6-11', 6, 11, 'Relays', 'Perform a single step relay takeover from the starting block into 50 metres front crawl swim at simulated race speed.'),
  ('SCA6-12', 6, 12, 'Relays', 'Perform a single step relay takeover from the starting block into 50 metres front crawl swim taking over from an incoming swimmer at race speed.')
on conflict (outcome_id) do update set area = excluded.area, outcome = excluded.outcome;

-- 3. Per swimmer, per club ---------------------------------------------------------------------
-- Which awards a coach has switched on for a swimmer, and when each was achieved.
create table if not exists public.swimmer_club_awards (
  club_id        uuid not null references public.clubs(id),
  swimmer_id     uuid not null references public.swimmers(id) on delete cascade,
  award          smallint not null references public.club_award_levels(award),
  activated_on   date not null default current_date,
  activated_by   uuid default auth.uid(),
  achieved_on    date,
  signed_off_by  uuid,
  updated_at     timestamptz not null default now(),
  primary key (club_id, swimmer_id, award)
);
comment on table public.swimmer_club_awards is
  'Club Award activated for a swimmer by a coach; achieved_on is set automatically when every criterion is at 100%.';

-- One mark per swimmer per criterion at a club. score 0-5 = 0%-100% in 20% steps.
create table if not exists public.swimmer_award_outcomes (
  club_id     uuid not null references public.clubs(id),
  swimmer_id  uuid not null references public.swimmers(id) on delete cascade,
  outcome_id  text not null references public.club_award_outcomes(outcome_id),
  award       smallint not null references public.club_award_levels(award),
  score       smallint not null check (score between 0 and 5),
  assessed_on date not null default current_date,
  assessed_by uuid default auth.uid(),
  notes       text check (char_length(notes) <= 500),
  updated_at  timestamptz not null default now(),
  primary key (club_id, swimmer_id, outcome_id)
);
create index if not exists swimmer_award_outcomes_swimmer on public.swimmer_award_outcomes (swimmer_id, award);
create index if not exists swimmer_club_awards_swimmer on public.swimmer_club_awards (swimmer_id);

-- Fill club_id (the swimmer's club today) and award (from the outcome); stamp who and when.
create or replace function app_private.award_row_fill() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if new.club_id is null then
    select s.club_id into new.club_id from public.swimmers s where s.id = new.swimmer_id;
  end if;
  if tg_table_name = 'swimmer_award_outcomes' then
    select o.award into new.award from public.club_award_outcomes o where o.outcome_id = new.outcome_id;
    if tg_op = 'UPDATE' and new.score is distinct from old.score then
      new.assessed_by := coalesce(auth.uid(), new.assessed_by);
    end if;
  end if;
  new.updated_at := now();
  return new;
end $fn$;
revoke all on function app_private.award_row_fill() from public, anon, authenticated;

drop trigger if exists swimmer_award_outcomes_fill on public.swimmer_award_outcomes;
create trigger swimmer_award_outcomes_fill before insert or update on public.swimmer_award_outcomes
  for each row execute function app_private.award_row_fill();
drop trigger if exists swimmer_club_awards_fill on public.swimmer_club_awards;
create trigger swimmer_club_awards_fill before insert or update on public.swimmer_club_awards
  for each row execute function app_private.award_row_fill();

-- After a mark changes: make sure the award is activated, then set or clear achieved_on.
-- Runs as definer, but only ever touches the same club / swimmer / award as the row the caller
-- was allowed to write.
create or replace function app_private.award_sync() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  r record;
  v_total int;
  v_full  int;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if tg_op <> 'DELETE' then
    insert into public.swimmer_club_awards (club_id, swimmer_id, award, activated_by)
    values (r.club_id, r.swimmer_id, r.award, auth.uid())
    on conflict (club_id, swimmer_id, award) do nothing;
  end if;
  select count(*) into v_total from public.club_award_outcomes o where o.award = r.award;
  select count(*) into v_full from public.swimmer_award_outcomes m
   where m.club_id = r.club_id and m.swimmer_id = r.swimmer_id and m.award = r.award and m.score = 5;
  update public.swimmer_club_awards a
     set achieved_on   = case when v_full >= v_total then coalesce(a.achieved_on, current_date) end,
         signed_off_by = case when v_full >= v_total then coalesce(a.signed_off_by, auth.uid()) end
   where a.club_id = r.club_id and a.swimmer_id = r.swimmer_id and a.award = r.award
     and (a.achieved_on is null) = (v_full >= v_total);
  return null;
end $fn$;
revoke all on function app_private.award_sync() from public, anon, authenticated;
drop trigger if exists swimmer_award_outcomes_sync on public.swimmer_award_outcomes;
create trigger swimmer_award_outcomes_sync after insert or update or delete on public.swimmer_award_outcomes
  for each row execute function app_private.award_sync();

-- Rules: access follows the swimmer (role, squad, own child) AND the row's club must be the caller's.
do $do$
declare t text;
begin
  foreach t in array array['swimmer_club_awards','swimmer_award_outcomes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists rbac_select on public.%I', t);
    execute format('drop policy if exists rbac_insert on public.%I', t);
    execute format('drop policy if exists rbac_update on public.%I', t);
    execute format('drop policy if exists rbac_delete on public.%I', t);
    execute format($p$create policy rbac_select on public.%I for select to authenticated
      using (swimmer_id in (select app_private.swimmer_ids('awards'::text, false)) and club_id in (select app_private.my_club_ids()))$p$, t);
    execute format($p$create policy rbac_insert on public.%I for insert to authenticated
      with check (swimmer_id in (select app_private.swimmer_ids('awards'::text, true)) and club_id in (select app_private.my_club_ids()))$p$, t);
    execute format($p$create policy rbac_update on public.%I for update to authenticated
      using (swimmer_id in (select app_private.swimmer_ids('awards'::text, true)) and club_id in (select app_private.my_club_ids()))
      with check (swimmer_id in (select app_private.swimmer_ids('awards'::text, true)) and club_id in (select app_private.my_club_ids()))$p$, t);
    execute format($p$create policy rbac_delete on public.%I for delete to authenticated
      using (swimmer_id in (select app_private.swimmer_ids('awards'::text, true)) and club_id in (select app_private.my_club_ids()))$p$, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$do$;

-- 4. Feature for the standalone Club-Awards-app ---------------------------------------------------
insert into public.app_features (key, name, description, tier) values
  ('club_awards', 'Club Awards app', 'The standalone Club-Awards-app (apps/club-awards): Swim England Swimming Club Awards 1-6.', 'coach')
on conflict (key) do nothing;
insert into public.club_features (club_id, feature, source, note)
select f.club_id, 'club_awards', 'manual', 'Switched on with Coach Tools (23 Nov 2026)'
from public.club_features f where f.feature = 'coach_tools' and f.enabled
on conflict (club_id, feature) do nothing;

-- 5. Checks -------------------------------------------------------------------------------------
do $chk$
declare n int;
begin
  select count(*) into n from public.club_award_outcomes;
  if n <> 80 then raise exception 'Club awards: expected 80 outcomes, found %', n; end if;
  select count(*) into n from app_private.tenancy_exposure() where severity = 'ERROR';
  if n > 0 then raise exception 'Club awards: tenancy_exposure() reports % errors', n; end if;
  select count(*) into n from app_private.anon_exposure();
  if n > 0 then raise exception 'Club awards: anon_exposure() returned % rows', n; end if;
end
$chk$;
