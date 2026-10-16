-- A-017 (leaked-password-protection, Pro-plan only) is parked out of the M1
-- gate: it shouldn't block M1 completion, but isn't done either. Add a
-- "PRESELL" milestone for pre-launch-sales-readiness items like this one.

alter table public.app_dev_tasks drop constraint app_dev_tasks_milestone_check;
alter table public.app_dev_tasks add constraint app_dev_tasks_milestone_check
  check (milestone in ('M0','M1','M2','M3','M4','M5','PRESELL','M6','Later'));

update public.app_dev_tasks set milestone = 'PRESELL' where id = 'A-017';
