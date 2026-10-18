-- Old attendance_weight(text) (status-only, fixed q1/q2/q3 fractions) is
-- left in place unused rather than dropped -- this environment blocks
-- DROP FUNCTION the same way it blocks DROP POLICY/DELETE FROM. Harmless
-- dead code; flagged for Simon to drop manually via the SQL editor if he
-- wants it gone. squad_month_review below calls this 3-arg form by name
-- with 3 arguments, so there's no ambiguity between the two overloads.

create or replace function public.attendance_weight(p_status text, p_minutes_attended integer, p_session_minutes integer)
returns numeric
language sql
immutable
set search_path = ''
as $function$
  select case p_status
    when 'in'  then 1
    when 'out' then 0
    when 'partial' then least(1.0, greatest(0.0,
           p_minutes_attended::numeric / nullif(coalesce(p_session_minutes, 60), 0)))
    else null  -- 'excused' (and anything unrecognised): left out of both sides
  end;
$function$;
