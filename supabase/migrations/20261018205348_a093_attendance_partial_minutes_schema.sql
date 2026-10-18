alter table public.attendance_records drop constraint attendance_records_status_check;
alter table public.attendance_records add constraint attendance_records_status_check
  check (status in ('in','out','excused','partial'));

alter table public.attendance_records
  add column minutes_attended integer,
  add column session_minutes integer;
