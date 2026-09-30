-- Callers can already read their own user_roles rows, so the check does not need definer rights.
alter function public.is_superadmin() security invoker;
