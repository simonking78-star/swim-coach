-- When a test window is added, changed or removed on the season plan, re-link
-- the test runs it covers (A-146). Runs already linked to another live window
-- keep it; runs whose window was removed are re-linked to whatever covers them
-- now (mm_session_fill does the matching).
create or replace function app_private.season_window_relink() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.kind <> 'test_set' and (tg_op = 'INSERT' or old.kind <> 'test_set') then return null; end if;
  -- runs with no window, inside the new dates
  update public.mm_sessions s set window_id = null
   where s.club_id = new.club_id and s.window_id is null
     and s.session_date between new.starts_on and new.ends_on;
  -- runs on this window: re-checked (dates, tests, squads or removal may have changed)
  if tg_op = 'UPDATE' then
    update public.mm_sessions s set window_id = null where s.window_id = new.id;
  end if;
  return null;
end $$;
revoke all on function app_private.season_window_relink() from public, anon, authenticated;
drop trigger if exists season_windows_relink on public.season_windows;
create trigger season_windows_relink after insert or update on public.season_windows
  for each row execute function app_private.season_window_relink();
