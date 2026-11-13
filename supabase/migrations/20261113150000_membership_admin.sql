-- Membership administration (Accounts · Athletes · Registration)
-- Spec: claude/specs/membership-admin.md (13 Nov 2026)
-- Applied 13 Nov 2026: staging (zefgaemhqgczyqwamfjs) then production (nxlgeykipnvswyeshrbl); role tests passed on both.
--
-- Decisions (Simon, 13 Nov 2026):
--   * The app becomes the master record for members (SportsEngine Motion retired for membership).
--   * Medical + emergency contacts: edited by superadmin / club admin; read by head coach (club)
--     and by every coach of the swimmer's squad. Helpers, parents and swimmers: none.
--   * Billing = fee amounts + paid status only. No card or bank details are ever stored.
--   * Registration tab = applications (pending accounts) + Swim England registration.
--
-- What this adds
--   1. Two rows in the access matrix: "membership" and "medical".
--   2. member_accounts (account holder / household) and member_guardians.
--   3. swimmers.account_id (athletes linked to an account holder).
--   4. swimmer_medical + swimmer_emergency_contacts  (special category: Article 9).
--   5. member_fees (fees + paid status).
--   6. swim_england_registrations.
--   7. member_audit (who changed what, field names only; no medical values copied).
--   8. Account -> swimmers.parent_* sync, so the screens that still read parent_* keep working.
--   9. One-off backfill (before step 8): an account for each distinct parent on existing swimmers.

begin;
set local lock_timeout = '5s';

-- 1. Access matrix -----------------------------------------------------------------------
create or replace function app_private.level(p_section text, p_role text) returns text
language sql immutable set search_path = '' as $f$
  select coalesce(('{
    "attendance":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"SE"},
    "feedback":  {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"SE","parent":"CR","swimmer":"CR"},
    "plans":     {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"R"},
    "timetables":{"superadmin":"E","club_admin":"E","head_coach":"E","coach":"R","helper":"R","parent":"R","swimmer":"R"},
    "season":    {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"R"},
    "roster":    {"superadmin":"E","club_admin":"E","head_coach":"R","coach":"SR","helper":"SR","parent":"CR"},
    "stats":     {"superadmin":"E","club_admin":"R","head_coach":"R","coach":"R","parent":"CR","swimmer":"CR"},
    "stopwatch": {"superadmin":"E","club_admin":"E","head_coach":"E","coach":"E","helper":"SE"},
    "admin":     {"superadmin":"E","club_admin":"E"},
    "appdev":    {"superadmin":"E"},
    "membership":{"superadmin":"E","club_admin":"E","head_coach":"R"},
    "medical":   {"superadmin":"E","club_admin":"E","head_coach":"R","coach":"SR"}
  }'::jsonb -> p_section ->> p_role), 'N');
$f$;

-- Shared touch trigger: updated_at / updated_by
create or replace function app_private.touch_member_row() returns trigger
language plpgsql set search_path = '' as $f$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $f$;

-- 2. Account holders ---------------------------------------------------------------------
create table public.member_accounts (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubs(id),
  account_ref     text,                                   -- club's own reference, optional
  title           text,
  first_name      text not null,
  last_name       text not null,
  email           text,
  phone_mobile    text,
  phone_other     text,
  address_line1   text,
  address_line2   text,
  town            text,
  county          text,
  postcode        text,
  status          text not null default 'pending'
                  check (status in ('pending','live','suspended','resigned')),
  status_changed_on date not null default current_date,
  applied_on      date default current_date,
  joined_on       date,
  resigned_on     date,
  club_roles      text[] not null default '{}',           -- volunteer / committee roles (not app permissions)
  user_id         uuid references auth.users(id) on delete set null,  -- app login, when they have one
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
create unique index member_accounts_ref_uq on public.member_accounts (club_id, account_ref) where account_ref is not null;
create index member_accounts_club_status on public.member_accounts (club_id, status);
create index member_accounts_user on public.member_accounts (user_id) where user_id is not null;

create table public.member_guardians (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.member_accounts(id) on delete cascade,
  club_id       uuid not null references public.clubs(id),
  full_name     text not null,
  relationship  text,
  phone         text,
  email         text,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create index member_guardians_account on public.member_guardians (account_id);

-- 3. Athletes linked to an account ---------------------------------------------------------
alter table public.swimmers add column if not exists account_id uuid references public.member_accounts(id) on delete set null;
create index if not exists swimmers_account on public.swimmers (account_id) where account_id is not null;

-- 4. Medical + emergency contacts (special category) -----------------------------------------
create table public.swimmer_medical (
  swimmer_id      uuid primary key references public.swimmers(id) on delete cascade,
  club_id         uuid not null references public.clubs(id),
  conditions      text,
  medication      text,
  allergies       text,
  other_notes     text,
  gp_name         text,
  gp_phone        text,
  consent_emergency_treatment boolean,
  reviewed_on     date,                                   -- "medical date": last checked with the family
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);

create table public.swimmer_emergency_contacts (
  id            uuid primary key default gen_random_uuid(),
  swimmer_id    uuid not null references public.swimmers(id) on delete cascade,
  club_id       uuid not null references public.clubs(id),
  priority      smallint not null default 1 check (priority between 1 and 5),
  full_name     text not null,
  relationship  text,
  phone         text not null,
  phone_alt     text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create index swimmer_emergency_contacts_swimmer on public.swimmer_emergency_contacts (swimmer_id, priority);

-- 5. Fees ------------------------------------------------------------------------------------
create table public.member_fees (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubs(id),
  account_id    uuid not null references public.member_accounts(id) on delete cascade,
  swimmer_id    uuid references public.swimmers(id) on delete set null,   -- null = account-level fee
  fee_type      text not null check (fee_type in ('membership','squad','other')),
  description   text,
  amount        numeric(8,2) not null check (amount >= 0),
  period_start  date,
  period_end    date,
  due_on        date,
  status        text not null default 'due' check (status in ('due','paid','overdue','waived','refunded')),
  paid_on       date,
  method        text check (method in ('direct_debit','standing_order','bank_transfer','card','cash','other')),
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  check (status <> 'paid' or paid_on is not null)
);
create index member_fees_account on public.member_fees (account_id);
create index member_fees_swimmer on public.member_fees (swimmer_id) where swimmer_id is not null;

-- 6. Swim England registration ----------------------------------------------------------------
create table public.swim_england_registrations (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubs(id),
  swimmer_id    uuid not null references public.swimmers(id) on delete cascade,
  reg_year      int not null check (reg_year between 2000 and 2100),
  category      text not null check (category in ('1','2','3')),
  status        text not null default 'pending' check (status in ('pending','registered','lapsed','transferred')),
  registered_on date,
  expires_on    date,
  notes         text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  unique (swimmer_id, reg_year)
);

-- touch triggers
do $t$
declare t text;
begin
  foreach t in array array['member_accounts','member_guardians','swimmer_medical','swimmer_emergency_contacts',
                           'member_fees','swim_england_registrations'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app_private.touch_member_row()', t || '_touch', t);
  end loop;
end $t$;

-- club_id on child rows always follows the parent (cannot be spoofed to another club)
create or replace function app_private.member_child_club() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
  if tg_table_name in ('member_guardians','member_fees') then
    select a.club_id into new.club_id from public.member_accounts a where a.id = new.account_id;
  else
    select s.club_id into new.club_id from public.swimmers s where s.id = new.swimmer_id;
  end if;
  if new.club_id is null then raise exception 'Linked record not found'; end if;
  return new;
end $f$;
do $t$
declare t text;
begin
  foreach t in array array['member_guardians','member_fees','swimmer_medical','swimmer_emergency_contacts','swim_england_registrations'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function app_private.member_child_club()', t || '_club', t);
  end loop;
end $t$;

-- 7. Audit (field names, never values, for medical) ---------------------------------------------
create table public.member_audit (
  id          bigint generated always as identity primary key,
  club_id     uuid,
  table_name  text not null,
  row_id      text not null,
  action      text not null,
  fields      text[],
  changed_by  uuid default auth.uid(),
  changed_at  timestamptz not null default now()
);
create index member_audit_row on public.member_audit (table_name, row_id);

create or replace function app_private.member_audit_write() returns trigger
language plpgsql security definer set search_path = '' as $f$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  f text[];
  r jsonb := coalesce(n, o);
begin
  if tg_op = 'UPDATE' then
    select array_agg(k) into f from jsonb_object_keys(n) k
    where k not in ('updated_at','updated_by') and (n -> k) is distinct from (o -> k);
    if f is null then return null; end if;
  end if;
  insert into public.member_audit (club_id, table_name, row_id, action, fields)
  values ((r ->> 'club_id')::uuid, tg_table_name, coalesce(r ->> 'id', r ->> 'swimmer_id'), lower(tg_op), f);
  return null;
end $f$;
do $t$
declare t text;
begin
  foreach t in array array['member_accounts','member_guardians','swimmer_medical','swimmer_emergency_contacts',
                           'member_fees','swim_england_registrations'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app_private.member_audit_write()', t || '_audit', t);
  end loop;
end $t$;

-- Backfill (runs before the account->swimmer sync triggers exist, so parent_* stay as typed) --
-- One account per distinct parent: club + email, else club + name + phone.
create temp table _mb_src on commit drop as
select s.id as swimmer_id, s.club_id, coalesce(s.active, false) as active,
       nullif(trim(s.parent_name),'')  as pname,
       nullif(lower(trim(s.parent_email)),'') as pemail,
       nullif(trim(s.parent_phone),'') as pphone,
       s.club_id::text || '|' || coalesce(nullif(lower(trim(s.parent_email)),''),
         lower(coalesce(trim(s.parent_name),'')) || '|' || coalesce(trim(s.parent_phone),'')) as k
from public.swimmers s
where s.club_id is not null and s.account_id is null
  and (nullif(trim(s.parent_name),'') is not null or nullif(trim(s.parent_email),'') is not null);

create temp table _mb_acc on commit drop as
select gen_random_uuid() as id, k, club_id,
       (array_agg(pname order by active desc) filter (where pname is not null))[1] as pname,
       max(pemail) as pemail,
       (array_agg(pphone order by active desc) filter (where pphone is not null))[1] as pphone,
       bool_or(active) as any_active
from _mb_src group by k, club_id;

insert into public.member_accounts (id, club_id, first_name, last_name, email, phone_mobile, status, applied_on, notes, created_by)
select id, club_id,
       split_part(coalesce(pname, split_part(pemail,'@',1)), ' ', 1),
       coalesce(nullif(trim(substr(coalesce(pname,''), position(' ' in coalesce(pname,'') || ' '))), ''), '(surname to check)'),
       pemail, pphone,
       case when any_active then 'live' else 'resigned' end,
       null,
       'Created from swimmer parent details on ' || current_date || ' - please check name, address and status.',
       null
from _mb_acc;

update public.swimmers s set account_id = a.id
from _mb_src x join _mb_acc a using (k)
where s.id = x.swimmer_id;

-- 8. Keep swimmers.parent_* in step with the account (other screens still read them) -----------
create or replace function app_private.member_account_to_swimmers() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
  update public.swimmers s
     set parent_name  = trim(coalesce(new.first_name,'') || ' ' || coalesce(new.last_name,'')),
         parent_email = new.email,
         parent_phone = coalesce(new.phone_mobile, new.phone_other)
   where s.account_id = new.id;
  return null;
end $f$;
create trigger member_accounts_sync_swimmers
  after update of first_name, last_name, email, phone_mobile, phone_other on public.member_accounts
  for each row execute function app_private.member_account_to_swimmers();

create or replace function app_private.swimmer_account_link() returns trigger
language plpgsql security definer set search_path = '' as $f$
declare a public.member_accounts;
begin
  if new.account_id is not null and new.account_id is distinct from old.account_id then
    select * into a from public.member_accounts where id = new.account_id;
    if a.club_id is distinct from new.club_id then raise exception 'Account belongs to a different club'; end if;
    new.parent_name  := trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,''));
    new.parent_email := a.email;
    new.parent_phone := coalesce(a.phone_mobile, a.phone_other);
  end if;
  return new;
end $f$;
create trigger swimmers_account_link before update of account_id on public.swimmers
  for each row execute function app_private.swimmer_account_link();

-- RLS -----------------------------------------------------------------------------------------
alter table public.member_accounts            enable row level security;
alter table public.member_guardians           enable row level security;
alter table public.swimmer_medical            enable row level security;
alter table public.swimmer_emergency_contacts enable row level security;
alter table public.member_fees                enable row level security;
alter table public.swim_england_registrations enable row level security;
alter table public.member_audit               enable row level security;

-- membership: club-scoped, E = write, R = read
do $p$
declare t text;
begin
  foreach t in array array['member_accounts','member_guardians','member_fees','swim_england_registrations'] loop
    execute format('create policy rbac_select on public.%I for select to authenticated using (app_private.can_c(''membership'', false, club_id))', t);
    execute format('create policy rbac_insert on public.%I for insert to authenticated with check (app_private.can_c(''membership'', true, club_id))', t);
    execute format('create policy rbac_update on public.%I for update to authenticated using (app_private.can_c(''membership'', true, club_id)) with check (app_private.can_c(''membership'', true, club_id))', t);
    execute format('create policy rbac_delete on public.%I for delete to authenticated using (app_private.can_c(''membership'', true, club_id))', t);
  end loop;
  -- medical: read by squad (coach SR) via can_swimmer; write E only
  foreach t in array array['swimmer_medical','swimmer_emergency_contacts'] loop
    execute format('create policy rbac_select on public.%I for select to authenticated using (app_private.can_swimmer(''medical'', false, swimmer_id))', t);
    execute format('create policy rbac_insert on public.%I for insert to authenticated with check (app_private.can_swimmer(''medical'', true, swimmer_id))', t);
    execute format('create policy rbac_update on public.%I for update to authenticated using (app_private.can_swimmer(''medical'', true, swimmer_id)) with check (app_private.can_swimmer(''medical'', true, swimmer_id))', t);
    execute format('create policy rbac_delete on public.%I for delete to authenticated using (app_private.can_swimmer(''medical'', true, swimmer_id))', t);
  end loop;
end $p$;
-- audit: read by membership editors of that club; written only by the trigger
create policy rbac_select on public.member_audit for select to authenticated
  using (app_private.can_c('membership', true, club_id));

revoke all on public.member_accounts, public.member_guardians, public.swimmer_medical,
              public.swimmer_emergency_contacts, public.member_fees, public.swim_england_registrations,
              public.member_audit from anon;
grant select, insert, update, delete on public.member_accounts, public.member_guardians, public.swimmer_medical,
              public.swimmer_emergency_contacts, public.member_fees, public.swim_england_registrations to authenticated;
grant select on public.member_audit to authenticated;

commit;

-- Checks after applying (expect: 0 rows unlinked with parent details; no anon policies):
--   select count(*) from public.swimmers where account_id is null and coalesce(trim(parent_name),trim(parent_email),'') <> '';
--   select tablename, policyname, roles from pg_policies where tablename in
--     ('member_accounts','member_guardians','swimmer_medical','swimmer_emergency_contacts','member_fees','swim_england_registrations','member_audit');
