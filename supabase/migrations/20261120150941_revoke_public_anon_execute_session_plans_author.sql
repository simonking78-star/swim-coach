-- Lock down the session_plans author trigger function.
-- session_plans_author() is SECURITY DEFINER and only used by the
-- session_plans_author trigger on public.session_plans. Triggers fire
-- regardless of the caller's EXECUTE privilege, so signed-out (anon) and
-- general (PUBLIC) access is not needed and is removed here.
-- Applied to production (nxlgeykipnvswyeshrbl) as version 20261120150941.

revoke execute on function public.session_plans_author() from public;
revoke execute on function public.session_plans_author() from anon;
