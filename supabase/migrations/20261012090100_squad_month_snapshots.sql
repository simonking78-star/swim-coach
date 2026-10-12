-- Month-end snapshots of the monthly squad review, so a month's figures are frozen
-- once it closes (later edits to attendance/results don't silently change a report
-- already shared with admins or parents). The live function still covers the
-- current month.

create table if not exists public.squad_month_snapshots (
  club text not null,
  squad_id uuid not null references public.squads(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  metrics jsonb not null,
  generated_at timestamptz not null default now(),
  primary key (club, squad_id, month)
);
alter table public.squad_month_snapshots enable row level security;

-- Read: same rule as the live review. No anon or client writes; only the
-- month-end job (runs as the database owner) writes here.
create policy squad_snap_select on public.squad_month_snapshots for select to anon, authenticated
  using (public.squad_review_allowed(club, squad_id));

create or replace function public.snapshot_squad_month(p_month date default (date_trunc('month', now()) - interval '1 month')::date)
returns int
language plpgsql security invoker set search_path = ''
as $$
declare n int := 0; k int; c text;
begin
  for c in select distinct club from public.squads where club is not null loop
    insert into public.squad_month_snapshots (club, squad_id, month, metrics, generated_at)
    select c, r.squad_id, r.month, to_jsonb(r) - 'month' - 'squad_id', now()
    from public.squad_month_review(c, p_month, p_month) r
    on conflict (club, squad_id, month) do update
      set metrics = excluded.metrics, generated_at = excluded.generated_at;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;
revoke all on function public.snapshot_squad_month(date) from public, anon, authenticated;

-- Month-end schedule: 00:15 UTC on the 1st, snapshot the month just ended.
create extension if not exists pg_cron;
select cron.schedule('squad-month-snapshot', '15 0 1 * *', $$select public.snapshot_squad_month()$$);
