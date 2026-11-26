-- 50m Kick test (KCK-50) for Redhill and Reigate, v1.0, published.
-- Run once per environment after 20261126190000_mm_kick_gap_test.sql.
-- Set :status to 'draft' until the app code that captures paired times is
-- deployed, then switch it to 'live' in the Protocol library.
do $$
declare club uuid := '5cfe4e20-945d-4d4a-9131-f3e02f28aafb'; pid uuid; vid uuid;
begin
  if exists (select 1 from public.mm_protocols where club_id = club and code = 'KCK-50') then return; end if;
  insert into public.mm_protocols (club_id, code, name, determinant, kind, better, status, description)
  values (club, 'KCK-50', '50m Kick test (fins / no fins)', 'kick', 'timed', 'lower', 'draft',
          'Two 50 m kicks on a 2:00 cycle, the first with fins and the second without. The result is the gap: no-fins time minus fins time. The aim is to close the gap over time to around 10 seconds.')
  returning id into pid;
  insert into public.mm_protocol_versions (protocol_id, major, minor, sheet, levels, measure, intended_cycle, min_gap_days)
  values (pid, 1, 0,
    jsonb_build_object(
      'equipment', 'Kick float, fins, pace clock, a timekeeper with a stopwatch',
      'pool_setup', '25 m pool: each 50 m is two lengths with a hand-touch change at the far wall.',
      'warm_up', 'Standard warm-up',
      'procedure', E'Start in the water, feet on the wall, one arm stretched in front on the float, the other holding the wall.\nOn the coach''s signal, throw the wall arm onto the float and drive straight into a high-intensity kick.\nApproaching the far wall, use the last few kicks to move the float across and reach with the opposite hand to the wall. As the hand touches, tuck the knees, plant the feet and go again for the second length.\nAfter the two lengths (50 m), take the fins off and get ready for the second 50 m kick, without fins.\nBoth 50s are on a 2:00 cycle: the no-fins 50 starts 2:00 after the fins 50.\nThe timekeeper records each 50 m to the nearest second.',
      'script', E'"Feet on the wall, one hand on the float, one on the wall. On my signal, arm onto the float and kick as hard as you can. Change hands on the float at the wall, touch, tuck and go again. Two lengths with fins, then fins off and the same again without."',
      'safety', 'No maximal test for a swimmer who is unwell, injured or returning from a break.',
      'recorded', 'Time with fins and time without fins, to the nearest second. The app works out the gap (no fins − fins); the target is around 10 s.'),
    jsonb_build_array(jsonb_build_object('key', 'L1', 'label', 'All squads', 'stroke', 'Kick on a float', 'distance_m', 50, 'start', 'push',
      'streams', jsonb_build_array('Academy', 'Academy Plus', 'Bronze', 'Silver', 'Gold', 'Platinum'),
      'setup', '2 × 50 m kick on 2:00: fins, then no fins')),
    jsonb_build_object('unit', 's', 'counts', 'gap', 'trials', 1, 'precision', 0, 'interval_s', 120, 'target_gap_s', 10,
      'variants', jsonb_build_array(jsonb_build_object('key', 'fins', 'label', 'With fins'), jsonb_build_object('key', 'no_fins', 'label', 'Without fins'))),
    null, 14)
  returning id into vid;
  update public.mm_protocol_versions set published_at = now() where id = vid;
end $$;
