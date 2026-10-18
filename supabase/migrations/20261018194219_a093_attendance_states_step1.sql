-- A-093 step 1 — add attendance status alongside the existing boolean
-- (present stays authoritative for now; nothing reads status yet)

alter table public.attendance_records
  add column status text check (status in ('in','out','excused','q1','q2','q3')),
  add column updated_by uuid references auth.users(id),
  add column updated_at timestamptz;

-- backfill from the existing boolean
update public.attendance_records
set status = case when present then 'in' else 'out' end
where status is null;

-- keep old API clients (that only ever write `present`) correct going forward
create or replace function public.attendance_records_fill_status_from_present()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.status is null then
    new.status := case when new.present then 'in' else 'out' end;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$function$;

create trigger attendance_records_fill_status
  before insert or update on public.attendance_records
  for each row execute function public.attendance_records_fill_status_from_present();
