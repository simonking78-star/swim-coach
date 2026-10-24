-- Club & squad normalisation · Phases 1–2 (PERMANENT)
-- Spec: claude/specs/club-and-squad-normalisation.md
-- Additive only: new clubs rows, new club_id columns + indexes, two-way fill trigger.
-- Nothing is renamed or dropped; the current app keeps working unchanged.
-- Safety: if any check at the end fails, the whole script is rolled back.
-- Running it a second time fails at the first "add column" and changes nothing.
-- Clubs with no Swim England code (e.g. on staging) are reported as a notice, not an error.

do $migrate$
declare
  t text; n int; m int; bad text := '';
  tabs text[] := array['swimmers','swim_results','seasons','session_plans','drills_library','squad_feedback',
                       'squad_drill_weeks','squad_month_snapshots','user_roles','role_test_mode','swimmer_archive',
                       'app_events','app_feedback'];
begin
  set local lock_timeout = '5s';

  -- ===== Phase 1: club register =====
  alter table public.clubs
    add column club_code text references public.club_codes(club_code),
    add column short_name text,
    add column is_coaching boolean not null default false;

  update public.clubs set is_coaching = true;   -- the three clubs that run squads in the app
  update public.clubs c set club_code = v.code
  from (values ('Crawley Swimming Club','CRWS'),('Redhill and Reigate','RERS'),('Mid Sussex Marlins','MSMS')) v(name, code)
  where c.name = v.name;

  insert into public.clubs (name, club_code, is_coaching)
  select n.club, coalesce(man.code, k.club_code), false
  from (select club from public.swimmers union select club from public.swim_results) n
  left join (values ('Atlantis','ATLS'),('Dorking','DORS'),('Edenbridge','EDPS'),('Redhill Marlins','RMAS')) man(name, code)
         on man.name = n.club
  left join public.club_codes k on upper(k.club_name) = upper(n.club)
  where n.club is not null
    and not exists (select 1 from public.clubs c where c.name = n.club);

  alter table public.clubs add constraint clubs_club_code_key unique (club_code);
  comment on column public.clubs.is_coaching is 'True for clubs that run squads in Coach Tools; false for clubs known only from results.';
  comment on column public.clubs.club_code   is 'Swim England club code (club_codes.club_code).';

  -- ===== Phase 2: club_id on every table that held only the club name =====
  foreach t in array tabs loop
    execute format('alter table public.%I add column club_id uuid references public.clubs(id)', t);
    execute format('update public.%I x set club_id = c.id from public.clubs c where c.name = x.club', t);
    execute format('create index %I on public.%I (club_id)', t || '_club_id_idx', t);
    execute format('comment on column public.%I.club_id is %L', t,
                   'Club by id. During the migration it is kept in step with the club name column by app_private.fill_club_both().');
  end loop;

  -- Keeps name and id in step while old and new app versions both write (removed in Phase 6)
  create or replace function app_private.fill_club_both() returns trigger
  language plpgsql set search_path = '' as $f$
  begin
    if new.club_id is null and new.club is not null then
      new.club_id := (select c.id from public.clubs c where c.name = new.club);
    elsif new.club is null and new.club_id is not null then
      new.club := (select c.name from public.clubs c where c.id = new.club_id);
    end if;
    return new;
  end $f$;

  foreach t in array tabs loop
    execute format('create trigger %I before insert or update of club, club_id on public.%I
                    for each row execute function app_private.fill_club_both()', t || '_fill_club_both', t);
  end loop;

  -- ===== Checks: any failure rolls the whole script back =====
  select count(*) into n from public.clubs where club_code is null;
  if n > 0 then raise notice 'Clubs without a Swim England code: % (map them in clubs.club_code).', n; end if;

  foreach t in array tabs loop
    execute format('select count(*) from public.%I where club is not null and club_id is null', t) into m;
    if m > 0 then bad := bad || format(' %s unmatched in %s;', m, t); end if;
  end loop;

  if bad <> '' then
    raise exception 'Migration cancelled, nothing changed:%', bad;
  end if;

  raise notice 'Done: % clubs (% coaching); club_id added to % tables.',
    (select count(*) from public.clubs), (select count(*) from public.clubs where is_coaching), array_length(tabs, 1);
end $migrate$;
