-- A-094: per-swimmer register fields. Additive, nullable.
alter table public.attendance_records
  add column if not exists note text,
  add column if not exists lane integer check (lane is null or (lane between 1 and 20)),
  add column if not exists distance_m integer check (distance_m is null or (distance_m between 0 and 30000));
comment on column public.attendance_records.distance_m is 'Distance swum in this session (m). Absent swimmers = 0; present default = planned distance (pro rata for partial attendance).';
