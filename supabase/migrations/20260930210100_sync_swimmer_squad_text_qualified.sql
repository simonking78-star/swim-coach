-- Schema-qualify the squad-name sync trigger so it also works when fired from
-- SECURITY DEFINER functions with an empty search_path (e.g. reactivate_swimmer).
create or replace function public.sync_swimmer_squad_text()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if new.squad_id is not null then
    select name into new.squad from public.squads where id = new.squad_id;
  end if;
  return new;
end;
$function$;
