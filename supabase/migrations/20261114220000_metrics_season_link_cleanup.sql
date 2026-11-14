-- Cleanup after the Metrics & Measures ↔ Season Planner link is deployed (A-152).
-- APPLY ONLY AFTER the app from PR "Link Metrics & Measures test sets to the Season Planner"
-- is live: the previous app still reads mm_windows and season_windows.test_set_template_id.
--   * mm_windows: replaced by season_windows (kind test_set); empty.
--   * season_windows.test_set_template_id: pointed at the retired Test & Assess templates; never set.
do $$
begin
  if exists (select 1 from public.mm_windows) then raise exception 'mm_windows has rows — move them to season_windows first.'; end if;
  if exists (select 1 from public.season_windows where test_set_template_id is not null) then raise exception 'season_windows.test_set_template_id is in use.'; end if;
end $$;
drop table public.mm_windows;
alter table public.season_windows drop column test_set_template_id;
