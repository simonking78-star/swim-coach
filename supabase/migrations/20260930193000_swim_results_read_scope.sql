-- Race results: visible via Statistics (read) or Roster access only - not via Stopwatch.
drop policy if exists rbac_select on public.swim_results;
create policy rbac_select on public.swim_results for select to authenticated
  using ((select app_private.stats_any())
         or swimmer_id in (select app_private.swimmer_ids('roster', false))
         or swimmer_id in (select app_private.swimmer_ids('stats', false)));
