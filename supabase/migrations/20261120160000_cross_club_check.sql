-- A-070 made permanent: a cross-club check that runs after every migration.
-- Spec: claude/specs/tenancy-scope.md ("Cross-club check").
--
-- 1. app_private.tenancy_scope.club_expr: for every child table, how to find the row's club.
-- 2. app_private.cross_club_allow: cross-club access that is intended (empty to start).
-- 3. app_private.cross_club_check(): for each coaching club, signs in as six personas of that
--    club (club_admin, head_coach, coach and helper on one squad, parent and swimmer of one swimmer)
--    using role_test_mode, and for every club table and child table tries to:
--      read    another club's rows
--      update  another club's rows (no-op update, rolled back)
--      delete  another club's rows (rolled back)
--      insert  a copy of another club's row (rolled back)
--      move    one of its own rows into another club (rolled back)
--    Nothing is kept: every write runs in a sub-transaction that is always rolled back, and
--    the superadmin's own role_test_mode row is put back at the end.
-- 4. app_private.release_checks(): anon_exposure + tenancy_exposure errors + cross-club findings.
--    Release rule: no rows.
--
-- Run (database owner only; not callable through the API):
--   select * from app_private.release_checks();
--   select * from app_private.cross_club_check(p_verbose => true);   -- every check, incl. coverage

-- 1. Club expression per child table -------------------------------------------------------------
alter table app_private.tenancy_scope add column if not exists club_expr text;
comment on column app_private.tenancy_scope.club_expr is
  'Child tables: SQL expression (row alias t) giving the row''s club. Used by cross_club_check(). Must not depend on the caller''s visibility.';

update app_private.tenancy_scope s set club_expr = v.e
from (values
  ('competition_events',          'app_private.season_comp_club_id(t.season_competition_id)'),
  ('drill_periodisation',         '(select d.club_id from public.drills_library d where d.id = t.drill_id)'),
  ('drill_set_line_archive',      '(select p.club_id from public.session_plans p where p.id = t.session_plan_id)'),
  ('macro_competitions',          'app_private.macro_club_id(t.macro_id)'),
  ('macro_squads',                'app_private.macro_club_id(t.macro_id)'),
  ('macros',                      'app_private.season_club_id(t.season_id)'),
  ('micro_sessions',              'app_private.micro_club_id(t.micro_id)'),
  ('micros',                      'app_private.macro_club_id(t.macro_id)'),
  ('mm_trials',                   'app_private.swimmer_club_id(t.swimmer_id)'),
  ('season_breaks',               'app_private.season_club_id(t.season_id)'),
  ('season_competitions',         'app_private.season_club_id(t.season_id)'),
  ('term_targets',                '(select v.club_id from public.vocabulary_terms v where v.id = t.term_id)'),
  ('timetable_session_overrides', '(select app_private.timetable_club_id(x.timetable_id) from public.timetable_sessions x where x.id = t.timetable_session_id)'),
  ('timetable_sessions',          'app_private.timetable_club_id(t.timetable_id)'),
  ('timetables',                  'app_private.squad_club_id(t.squad_id)'),
  ('user_squads',                 'app_private.squad_club_id(t.squad_id)'),
  ('user_swimmers',               'app_private.swimmer_club_id(t.swimmer_id)')
) v(r, e)
where s.relname = v.r;

-- 2. Intended cross-club access ------------------------------------------------------------------
create table if not exists app_private.cross_club_allow (
  relname   text not null,
  action    text not null check (action in ('read','update','delete','insert','move')),
  role      text not null default '*',          -- '*' = every persona
  reason    text not null,
  decided_on date not null default current_date,
  primary key (relname, action, role)
);
revoke all on app_private.cross_club_allow from public, anon, authenticated;
comment on table app_private.cross_club_allow is
  'Cross-club access that is meant to happen. Each row needs a reason; cross_club_check() reports these as ALLOWED instead of FAIL.';

-- 3. The check -----------------------------------------------------------------------------------
create or replace function app_private.cross_club_check(p_clubs uuid[] default null, p_verbose boolean default false)
returns table(severity text, persona text, club text, relname text, action text, rows_affected bigint, detail text)
language plpgsql
set search_path = ''
as $fn$
declare
  v_super   uuid;
  v_saved   public.role_test_mode;
  v_had     boolean;
  c         record;
  p         record;
  t         record;
  v_f       tid[];
  v_o       tid[];
  v_fc      uuid;
  v_fr      jsonb;
  n         bigint;
  n2        bigint;
  v_state   text;
  v_msg     text;
  v_checks  bigint := 0;
  v_rows    jsonb := '[]'::jsonb;   -- findings, returned at the end
  v_uncov   text[] := '{}';
  v_ok      text;
  rb constant text := '__cross_club_rollback__';
begin
  select r.user_id into v_super from public.user_roles r where r.role = 'superadmin' and r.club_id is null
   order by r.created_at limit 1;
  if v_super is null then raise exception 'cross_club_check needs a platform superadmin in user_roles'; end if;

  select * into v_saved from public.role_test_mode m where m.user_id = v_super;
  v_had := found;

  perform set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_super::text, true);

  -- Targets: every public table with club_id, plus registered child tables.
  create temp table if not exists _cc_target (
    relname text primary key, expr text, has_club boolean, setcol text, ins_cols text
  ) on commit drop;
  truncate _cc_target;
  insert into _cc_target
  select cl.relname::text,
         case when hc.has then 't.club_id' else s.club_expr end,
         hc.has,
         (select quote_ident(a.attname) from pg_attribute a
           where a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped
             and a.attidentity = '' and a.attgenerated = ''
           order by (a.attname = 'club_id') desc, a.attnum limit 1),
         -- insert column list: only for tables with a single-column uuid primary key that has a default
         case when hc.has and pk.ok then
           (select string_agg(quote_ident(a.attname), ', ' order by a.attnum) from pg_attribute a
             where a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped
               and a.attidentity = '' and a.attgenerated = '' and a.attnum <> pk.attnum)
         end
  from pg_class cl
  join pg_namespace ns on ns.oid = cl.relnamespace and ns.nspname = 'public'
  left join app_private.tenancy_scope s on s.relname = cl.relname
  cross join lateral (select exists (select 1 from pg_attribute a where a.attrelid = cl.oid and a.attname = 'club_id' and not a.attisdropped) as has) hc
  left join lateral (
    select true as ok, i.indkey[0] as attnum
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where i.indrelid = cl.oid and i.indisprimary and i.indnatts = 1 and a.atttypid = 'uuid'::regtype
  ) pk on true
  where cl.relkind in ('r','p')
    and (hc.has or (s.scope = 'child' and s.club_expr is not null));

  create temp table if not exists _cc_rows (
    relname text primary key, foreign_ctids tid[], own_ctids tid[], fclub uuid, fclub_n bigint, frow jsonb
  ) on commit drop;

  for c in
    select cl.id, coalesce(cl.short_name, cl.name) as name from public.clubs cl
    where (p_clubs is null and cl.is_coaching) or cl.id = any(p_clubs)
    order by cl.name
  loop
    truncate _cc_rows;
    for t in select * from _cc_target order by 1 loop
      execute format(
        'with r as (select t.ctid as tid, %1$s as cid from public.%2$I t)
         select coalesce(array_agg(tid) filter (where cid is not null and cid <> $1), ''{}''),
                coalesce(array_agg(tid) filter (where cid = $1), ''{}'')
         from r', t.expr, t.relname)
        into v_f, v_o using c.id;
      insert into _cc_rows (relname, foreign_ctids, own_ctids) values (t.relname, v_f, v_o);
      if cardinality(v_f) = 0 then
        v_uncov := v_uncov || (c.name || ':' || t.relname);
      elsif t.has_club then
        execute format('select t.club_id, to_jsonb(t) from public.%I t where t.ctid = $1', t.relname)
          into v_fc, v_fr using v_f[1];
        execute format('select count(*) from public.%I t where t.club_id = $1', t.relname) into n using v_fc;
        update _cc_rows r set fclub = v_fc, frow = v_fr, fclub_n = n where r.relname = t.relname;
      end if;
    end loop;

    for p in
      with sq as (
        select s.id from public.squads s where s.club_id = c.id
        order by (select count(*) from public.swimmers w where w.squad_id = s.id and w.active) desc, s.id limit 1),
      sw as (
        select w.id from public.swimmers w where w.club_id = c.id and w.squad_id = (select id from sq)
        order by w.active desc, w.id limit 1)
      select v.role, v.squads, v.swimmers from (values
        ('club_admin', '{}'::uuid[], '{}'::uuid[]),
        ('head_coach', '{}'::uuid[], '{}'::uuid[]),
        ('coach',      array(select id from sq), '{}'::uuid[]),
        ('helper',     array(select id from sq), '{}'::uuid[]),
        ('parent',     '{}'::uuid[], array(select id from sw)),
        ('swimmer',    '{}'::uuid[], array(select id from sw))
      ) v(role, squads, swimmers)
    loop
      insert into public.role_test_mode (user_id, role, club_id, squad_ids, swimmer_ids, started_at, expires_at)
      values (v_super, p.role, c.id, p.squads, p.swimmers, now(), now() + interval '15 minutes')
      on conflict (user_id) do update
        set role = excluded.role, club_id = excluded.club_id, squad_ids = excluded.squad_ids,
            swimmer_ids = excluded.swimmer_ids, started_at = excluded.started_at, expires_at = excluded.expires_at;

      for t in select tt.*, r.foreign_ctids, r.own_ctids, r.fclub, r.fclub_n, r.frow
               from _cc_target tt join _cc_rows r using (relname) order by 1 loop
        continue when cardinality(t.foreign_ctids) = 0 and cardinality(t.own_ctids) = 0;

        -- read
        if cardinality(t.foreign_ctids) > 0 then
          n := 0; v_state := null;
          begin
            perform set_config('role', 'authenticated', true);
            execute format('select count(*) from public.%I t where t.ctid = any($1)', t.relname) into n using t.foreign_ctids;
            raise exception using errcode = 'P0001', message = rb;
          exception when others then
            if sqlerrm <> rb then n := 0; v_state := sqlstate; end if;
          end;
          v_checks := v_checks + 1;
          if n > 0 or p_verbose then
            v_rows := v_rows || jsonb_build_object('relname', t.relname, 'action', 'read', 'role', p.role, 'club', c.name,
              'n', n, 'detail', format('%s of %s other-club rows visible', n, cardinality(t.foreign_ctids)), 'bad', n > 0);
          end if;

          -- update (no-op on a sample of 25 visible rows)
          n := 0;
          begin
            perform set_config('role', 'authenticated', true);
            execute format('with s as (select t.ctid from public.%1$I t where t.ctid = any($1) limit 25)
                            update public.%1$I t set %2$s = t.%2$s where t.ctid in (select s.ctid from s)', t.relname, t.setcol)
              using t.foreign_ctids;
            get diagnostics n = row_count;
            raise exception using errcode = 'P0001', message = rb;
          exception when others then
            if sqlerrm <> rb then n := 0; end if;
          end;
          v_checks := v_checks + 1;
          if n > 0 or p_verbose then
            v_rows := v_rows || jsonb_build_object('relname', t.relname, 'action', 'update', 'role', p.role, 'club', c.name,
              'n', n, 'detail', format('%s other-club rows could be updated (sample of 25)', n), 'bad', n > 0);
          end if;

          -- delete (sample of 25)
          n := 0;
          begin
            perform set_config('role', 'authenticated', true);
            execute format('with s as (select t.ctid from public.%1$I t where t.ctid = any($1) limit 25)
                            delete from public.%1$I t where t.ctid in (select s.ctid from s)', t.relname)
              using t.foreign_ctids;
            get diagnostics n = row_count;
            raise exception using errcode = 'P0001', message = rb;
          exception when others then
            if sqlerrm <> rb then n := 0; end if;
          end;
          v_checks := v_checks + 1;
          if n > 0 or p_verbose then
            v_rows := v_rows || jsonb_build_object('relname', t.relname, 'action', 'delete', 'role', p.role, 'club', c.name,
              'n', n, 'detail', format('%s other-club rows could be deleted (sample of 25)', n), 'bad', n > 0);
          end if;

          -- insert a copy of another club's row
          if t.ins_cols is not null and t.frow is not null then
            n := 0; n2 := t.fclub_n; v_state := null; v_msg := null;
            begin
              perform set_config('role', 'authenticated', true);
              execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)',
                             t.relname, t.ins_cols) using t.frow;
              get diagnostics n = row_count;
              execute 'reset role';
              execute format('select count(*) from public.%I t where t.club_id = $1', t.relname) into n2 using t.fclub;
              raise exception using errcode = 'P0001', message = rb;
            exception when others then
              if sqlerrm <> rb then v_state := sqlstate; v_msg := sqlerrm; n := 0; end if;
            end;
            v_checks := v_checks + 1;
            v_ok := case
              when v_state is null and n2 > t.fclub_n then 'FAIL'
              when v_state is null then 'OK'                       -- inserted, but a trigger put it in the persona's own club
              when v_state = '42501' then 'OK'                     -- refused by the rules
              when v_state = 'P0001' then 'OK'                     -- refused by a trigger
              when v_state in ('23505','23503','23502','23514','23P01') then 'WARN'  -- rules let it through; a constraint stopped it
              else 'INFO' end;
            if v_ok <> 'OK' or p_verbose then
              v_rows := v_rows || jsonb_build_object('relname', t.relname, 'action', 'insert', 'role', p.role, 'club', c.name,
                'n', greatest(n2 - t.fclub_n, 0),
                'detail', case v_ok
                  when 'FAIL' then 'a row was written into another club'
                  when 'WARN' then 'the rules allowed a row for another club; only a constraint stopped it (' || v_state || ': ' || v_msg || ')'
                  when 'INFO' then 'inconclusive: ' || v_state || ': ' || v_msg
                  else coalesce('refused (' || v_state || ')', 'kept in own club by a trigger') end,
                'bad', v_ok in ('FAIL','WARN'), 'sev', v_ok);
            end if;
          end if;
        end if;

        -- move one of its own rows into another club
        if t.has_club and t.fclub is not null and cardinality(t.own_ctids) > 0 then
          n := 0; n2 := t.fclub_n;
          begin
            perform set_config('role', 'authenticated', true);
            execute format('update public.%I t set club_id = $2 where t.ctid = $1', t.relname) using t.own_ctids[1], t.fclub;
            get diagnostics n = row_count;
            execute 'reset role';
            execute format('select count(*) from public.%I t where t.club_id = $1', t.relname) into n2 using t.fclub;
            raise exception using errcode = 'P0001', message = rb;
          exception when others then
            if sqlerrm <> rb then n := 0; n2 := t.fclub_n; end if;
          end;
          v_checks := v_checks + 1;
          if n2 > t.fclub_n or p_verbose then
            v_rows := v_rows || jsonb_build_object('relname', t.relname, 'action', 'move', 'role', p.role, 'club', c.name,
              'n', greatest(n2 - t.fclub_n, 0),
              'detail', case when n2 > t.fclub_n then 'an own-club row could be moved into another club'
                             when n > 0 then 'update ran but the row stayed in its club'
                             else 'refused' end,
              'bad', n2 > t.fclub_n);
          end if;
        end if;
      end loop;
    end loop;
  end loop;

  -- Put the superadmin's own test mode back.
  delete from public.role_test_mode m where m.user_id = v_super;
  if v_had then insert into public.role_test_mode select (v_saved).*; end if;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  return query
  select case
           when coalesce((f->>'bad')::boolean, false) and exists (
             select 1 from app_private.cross_club_allow a
             where a.relname = f->>'relname' and a.action = f->>'action' and a.role in ('*', f->>'role')) then 'ALLOWED'
           when f ? 'sev' then f->>'sev'
           when (f->>'bad')::boolean then 'FAIL'
           else 'OK' end,
         f->>'role', f->>'club', f->>'relname', f->>'action', (f->>'n')::bigint, f->>'detail'
  from jsonb_array_elements(v_rows) f
  union all
  select 'SUMMARY', null, null, null, null, v_checks,
         format('%s checks; not covered (no other-club rows to test against): %s',
                v_checks, coalesce(nullif(array_to_string(v_uncov, ', '), ''), 'none'));
end;
$fn$;

revoke all on function app_private.cross_club_check(uuid[], boolean) from public, anon, authenticated;
comment on function app_private.cross_club_check(uuid[], boolean) is
  'A-070 permanent tenancy test. Run as the database owner after every migration; FAIL and WARN rows must be fixed or recorded in app_private.cross_club_allow.';

-- 4. One release gate ---------------------------------------------------------------------------
create or replace function app_private.release_checks()
returns table(source text, severity text, object text, detail text)
language sql
set search_path = ''
as $fn$
  select 'anon_exposure', a.severity, a.object, a.kind || ': ' || a.detail from app_private.anon_exposure() a
  union all
  select 'tenancy_exposure', e.severity, e.object, e.kind || ': ' || e.detail from app_private.tenancy_exposure() e where e.severity = 'ERROR'
  union all
  select 'cross_club', x.severity, x.persona || ' @ ' || x.club || ' → ' || x.relname || ' (' || x.action || ')', x.detail
  from app_private.cross_club_check() x where x.severity in ('FAIL','WARN','INFO');
$fn$;

revoke all on function app_private.release_checks() from public, anon, authenticated;
comment on function app_private.release_checks() is 'Release gate: must return no rows after a migration.';
