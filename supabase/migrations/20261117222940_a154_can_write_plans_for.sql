-- A-154: lets the review-vocabulary-term Edge Function check the caller may write plans for a club.
create or replace function public.can_write_plans_for(p_club uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.can_c('plans', true, p_club);
$$;
revoke all on function public.can_write_plans_for(uuid) from public, anon;
grant execute on function public.can_write_plans_for(uuid) to authenticated;
