-- A-016 — set search_path on the 4 functions the security advisor flagged
-- as "function_search_path_mutable". cascade_squad_rename's one unqualified
-- reference to "swimmers" is qualified as public.swimmers since an empty
-- search_path means an unqualified name no longer resolves. The other
-- three already fully qualify every table reference.

create or replace function public.cascade_squad_rename()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.name is distinct from old.name then
    update public.swimmers set squad = new.name, updated_at = now() where squad_id = new.id;
    new.updated_at = now();
  end if;
  return new;
end;
$function$;

create or replace function public.recompute_is_pb()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_swimmer uuid; v_event text; v_course text;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    v_swimmer := old.swimmer_id; v_event := old.event; v_course := old.course;
  else
    v_swimmer := new.swimmer_id; v_event := new.event; v_course := new.course;
  end if;

  with ranked as (
    select id, (row_number() over (order by swim_time asc, id asc) = 1) as should_be_pb
    from public.swim_results
    where swimmer_id = v_swimmer and event = v_event and course = v_course
      and swim_time is not null
  )
  update public.swim_results sr
  set is_pb = coalesce(r.should_be_pb, false)
  from ranked r
  where sr.id = r.id
    and sr.is_pb is distinct from coalesce(r.should_be_pb, false);

  update public.swim_results
  set is_pb = false
  where swimmer_id = v_swimmer and event = v_event and course = v_course
    and swim_time is null and is_pb = true;

  if tg_op = 'UPDATE' and (
       old.swimmer_id is distinct from new.swimmer_id
    or old.event is distinct from new.event
    or old.course is distinct from new.course
  ) then
    with ranked as (
      select id, (row_number() over (order by swim_time asc, id asc) = 1) as should_be_pb
      from public.swim_results
      where swimmer_id = old.swimmer_id and event = old.event and course = old.course
        and swim_time is not null
    )
    update public.swim_results sr
    set is_pb = coalesce(r.should_be_pb, false)
    from ranked r
    where sr.id = r.id
      and sr.is_pb is distinct from coalesce(r.should_be_pb, false);

    update public.swim_results
    set is_pb = false
    where swimmer_id = old.swimmer_id and event = old.event and course = old.course
      and swim_time is null and is_pb = true;
  end if;

  return coalesce(new, old);
end;
$function$;

create or replace function public.competitions_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end $function$;

create or replace function public.competitions_link_galas()
returns integer
language sql
set search_path = ''
as $function$
  with linked as (
    update public.competitions c
       set gala_id = g.id
      from public.galas g
     where c.gala_id is null
       and c.license_number is not null
       and upper(trim(g.license_number)) = upper(c.license_number)
    returning c.id
  )
  select count(*)::integer from linked;
$function$;
