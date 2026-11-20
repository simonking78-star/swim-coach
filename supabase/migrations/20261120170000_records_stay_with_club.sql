-- Fixes from the first cross-club check run (A-070), decided 20 Nov 2026.
-- Spec: claude/specs/tenancy-scope.md
--
-- 1. Records stay with the club where they were recorded.
--    attendance_records, swimmer_feedback, stopwatch_times, squad_memberships, assessments,
--    test_results and mm_results are stamped with the club the swimmer was at on the day
--    (fill_club_id / club_id_for_swimmer), but their rules only asked "is this swimmer yours now".
--    After a transfer the new club could read, edit and delete the old club's records, and any
--    writer could move a record into another club. Every rule on these tables now also requires
--    the row's club to be one of the caller's clubs (reads and writes, USING and WITH CHECK).
-- 2. Race results: own swimmers only. swim_results no longer opens every club's results to anyone
--    with stats access (stats_any). Coaches see results for swimmers they can see, including those
--    swimmers' past swims for other clubs. Cross-club figures come later only as grouped statistics
--    (A-110 / A-071 rules).
-- 3. app_events / app_feedback: a signed-in user can no longer tag an entry with another club.
-- 4. cross_club_check(): knows that swim_results belong to the swimmer's club, records the
--    test-harness exceptions, and covers tables that have no other-club rows by testing against a
--    temporary copy of a row stamped with another club. The whole run now rolls back as one, so
--    nothing it does is kept.

-- Helper: the clubs the caller (or the persona being tested) holds a role in. A platform role
-- (club_id null, i.e. superadmin) gets every club.
create or replace function app_private.my_club_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select c.id from public.clubs c
  where exists (select 1 from app_private.eff_roles_c() r where r.club_id is null or r.club_id = c.id);
$fn$;
revoke all on function app_private.my_club_ids() from public, anon;
grant execute on function app_private.my_club_ids() to authenticated;

-- 1. Add the club condition to every rule on the seven tables -----------------------------------
do $do$
declare
  p record;
  cond constant text := 'club_id in (select app_private.my_club_ids())';
  n int := 0;
begin
  for p in
    select tablename, policyname, qual, with_check from pg_policies
    where schemaname = 'public'
      and tablename in ('attendance_records','swimmer_feedback','stopwatch_times','squad_memberships',
                        'assessments','test_results','mm_results')
  loop
    if coalesce(p.qual, '') ~ 'my_club_ids' or coalesce(p.with_check, '') ~ 'my_club_ids' then continue; end if;
    if p.qual is not null and p.with_check is not null then
      execute format('alter policy %I on public.%I using ((%s) and %s) with check ((%s) and %s)',
                     p.policyname, p.tablename, p.qual, cond, p.with_check, cond);
    elsif p.qual is not null then
      execute format('alter policy %I on public.%I using ((%s) and %s)', p.policyname, p.tablename, p.qual, cond);
    elsif p.with_check is not null then
      execute format('alter policy %I on public.%I with check ((%s) and %s)', p.policyname, p.tablename, p.with_check, cond);
    end if;
    n := n + 1;
  end loop;
  if n <> 28 then raise exception 'Expected 28 rules on the seven tables, changed %', n; end if;
end
$do$;

-- 2. Race results: own swimmers only ------------------------------------------------------------
alter policy rbac_select on public.swim_results using (
  (swimmer_id in (select app_private.swimmer_ids('roster'::text, false)))
  or (swimmer_id in (select app_private.swimmer_ids('stats'::text, false)))
);
comment on function app_private.stats_any() is
  'No longer used by swim_results (20 Nov 2026: results are own-swimmers only). Kept for reference; do not use for row access.';

-- 3. Activity log and feedback: no tagging another club -----------------------------------------
alter policy rbac_insert on public.app_events with check (
  user_id = auth.uid() and (club_id is null or club_id in (select app_private.my_club_ids()))
);
alter policy rbac_insert on public.app_feedback with check (
  user_id = auth.uid() and (club_id is null or club_id in (select app_private.my_club_ids()))
);

-- 4. The check ----------------------------------------------------------------------------------
-- Tables whose rows belong to a club other than the one in their club_id column.
create table if not exists app_private.cross_club_owner (
  relname text primary key,
  expr    text not null,     -- SQL expression, row alias t
  reason  text not null
);
revoke all on app_private.cross_club_owner from public, anon, authenticated;
insert into app_private.cross_club_owner (relname, expr, reason) values
  ('swim_results', 'app_private.swimmer_club_id(t.swimmer_id)',
   'club_id is the club the swimmer represented at the meet; access follows the swimmer (own swimmers incl. past swims for other clubs)')
on conflict (relname) do update set expr = excluded.expr, reason = excluded.reason;

insert into app_private.cross_club_allow (relname, action, role, reason) values
  ('app_events',     'read',   '*', 'Superadmin-only rule (is_superadmin ignores test mode); the check signs in as the superadmin, so it sees these. Not visible to club roles.'),
  ('app_feedback',   'read',   '*', 'Superadmin-only rule (is_superadmin ignores test mode); the check signs in as the superadmin, so it sees these. Not visible to club roles.'),
  ('role_test_mode', 'insert', '*', 'Platform table: one row per real superadmin (own row only). The club_id is the persona being tested, not data ownership.')
on conflict (relname, action, role) do update set reason = excluded.reason, decided_on = current_date;

create or replace function app_private.cross_club_check(p_clubs uuid[] default null, p_verbose boolean default false)
returns table(severity text, persona text, club text, relname text, action text, rows_affected bigint, detail text)
language plpgsql
set search_path = ''
as $fn$
declare
  v_super   uuid;
  c         record;
  p         record;
  t         record;
  v_f       tid[];
  v_o       tid[];
  v_fc      uuid;
  v_fr      jsonb;
  v_other   uuid;
  v_tid     tid;
  v_syn     boolean;
  n         bigint;
  n2        bigint;
  v_state   text;
  v_msg     text;
  v_checks  bigint := 0;
  v_rows    jsonb := '[]'::jsonb;
  v_uncov   text[] := '{}';
  v_synth   text[] := '{}';
  v_ok      text;
  rb  constant text := '__cross_club_rollback__';
  rba constant text := '__cross_club_rollback_all__';
begin
  begin  -- everything below is rolled back at the end; only v_rows / v_checks / v_uncov survive
    select r.user_id into v_super from public.user_roles r where r.role = 'superadmin' and r.club_id is null
     order by r.created_at limit 1;
    if v_super is null then raise exception 'cross_club_check needs a platform superadmin in user_roles'; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_super::text, true);

    create temp table _cc_target (
      relname text primary key, expr text, has_club boolean, setcol text, ins_cols text
    ) on commit drop;
    insert into _cc_target
    select cl.relname::text,
           coalesce(o.expr, case when hc.has then 't.club_id' else s.club_expr end),
           hc.has,
           (select quote_ident(a.attname) from pg_attribute a
             where a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped
               and a.attidentity = '' and a.attgenerated = ''
             order by (a.attname = 'club_id') desc, a.attnum limit 1),
           case when hc.has and pk.ok then
             (select string_agg(quote_ident(a.attname), ', ' order by a.attnum) from pg_attribute a
               where a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped
                 and a.attidentity = '' and a.attgenerated = '' and a.attnum <> pk.attnum)
           end
    from pg_class cl
    join pg_namespace ns on ns.oid = cl.relnamespace and ns.nspname = 'public'
    left join app_private.tenancy_scope s on s.relname = cl.relname
    left join app_private.cross_club_owner o on o.relname = cl.relname
    cross join lateral (select exists (select 1 from pg_attribute a where a.attrelid = cl.oid and a.attname = 'club_id' and not a.attisdropped) as has) hc
    left join lateral (
      select true as ok, i.indkey[0] as attnum
      from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
      join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where i.indrelid = cl.oid and i.indisprimary and i.indnatts = 1 and a.atttypid = 'uuid'::regtype
    ) pk on true
    where cl.relkind in ('r','p')
      and (hc.has or (s.scope = 'child' and s.club_expr is not null));

    create temp table _cc_rows (
      relname text primary key, foreign_ctids tid[], own_ctids tid[], fclub uuid, fclub_n bigint, frow jsonb, synthetic boolean
    ) on commit drop;

    for c in
      select cl.id, coalesce(cl.short_name, cl.name) as name from public.clubs cl
      where (p_clubs is null and cl.is_coaching) or cl.id = any(p_clubs)
      order by cl.name
    loop
      select cl.id into v_other from public.clubs cl where cl.id <> c.id order by cl.is_coaching desc, cl.name limit 1;
      truncate _cc_rows;

      for t in select * from _cc_target order by 1 loop
        execute format(
          'with r as (select t.ctid as tid, %1$s as cid from public.%2$I t)
           select coalesce(array_agg(tid) filter (where cid is not null and cid <> $1), ''{}''),
                  coalesce(array_agg(tid) filter (where cid = $1), ''{}'')
           from r', t.expr, t.relname)
          into v_f, v_o using c.id;
        v_syn := false;

        -- No other-club rows: copy one of this club's rows, stamped with another club.
        if cardinality(v_f) = 0 and cardinality(v_o) > 0 and t.ins_cols is not null and t.expr = 't.club_id' then
          begin
            execute format(
              'insert into public.%1$I (%2$s)
               select %2$s from jsonb_populate_record(null::public.%1$I,
                 (select to_jsonb(t) || jsonb_build_object(''club_id'', $2) from public.%1$I t where t.ctid = $1))
               returning ctid', t.relname, t.ins_cols)
              into v_tid using v_o[1], v_other;
            execute format('select t.club_id from public.%I t where t.ctid = $1', t.relname) into v_fc using v_tid;
            if v_fc is distinct from c.id then
              v_f := array[v_tid]; v_syn := true; v_synth := v_synth || (c.name || ':' || t.relname);
            end if;
          exception when others then
            null;  -- e.g. a unique key; the table stays uncovered for this club
          end;
        end if;

        insert into _cc_rows (relname, foreign_ctids, own_ctids, synthetic) values (t.relname, v_f, v_o, v_syn);
        if cardinality(v_f) = 0 then
          v_uncov := v_uncov || (c.name || ':' || t.relname);
        elsif t.has_club then
          execute format('select t.club_id, to_jsonb(t) from public.%I t where t.ctid = $1', t.relname)
            into v_fc, v_fr using v_f[1];
          if v_fc is not null then
            execute format('select count(*) from public.%I t where t.club_id = $1', t.relname) into n using v_fc;
            update _cc_rows r set fclub = v_fc, frow = v_fr, fclub_n = n where r.relname = t.relname;
          end if;
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

        for t in select tt.*, r.foreign_ctids, r.own_ctids, r.fclub, r.fclub_n, r.frow, r.synthetic
                 from _cc_target tt join _cc_rows r using (relname) order by 1 loop
          continue when cardinality(t.foreign_ctids) = 0 and cardinality(t.own_ctids) = 0;

          if cardinality(t.foreign_ctids) > 0 then
            n := 0;
            begin
              perform set_config('role', 'authenticated', true);
              execute format('select count(*) from public.%I t where t.ctid = any($1)', t.relname) into n using t.foreign_ctids;
              raise exception using errcode = 'P0001', message = rb;
            exception when others then
              if sqlerrm <> rb then n := 0; end if;
            end;
            v_checks := v_checks + 1;
            if n > 0 or p_verbose then
              v_rows := v_rows || jsonb_build_object('relname', t.relname, 'action', 'read', 'role', p.role, 'club', c.name,
                'n', n, 'detail', format('%s of %s other-club rows visible%s', n, cardinality(t.foreign_ctids),
                                         case when t.synthetic then ' (test copy)' else '' end), 'bad', n > 0);
            end if;

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

            if t.ins_cols is not null and t.frow is not null and t.fclub is not null then
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
                when v_state is null then 'OK'
                when v_state = '42501' then 'OK'
                when v_state = 'P0001' then 'OK'
                when v_state in ('23505','23503','23502','23514','23P01') then 'WARN'
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

          if t.has_club and t.expr = 't.club_id' and t.fclub is not null and cardinality(t.own_ctids) > 0 then
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

    raise exception using errcode = 'P0001', message = rba;
  exception when others then
    if sqlerrm <> rba then raise; end if;
  end;

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
         format('%s checks. Tested against a temporary copy: %s. Not covered (no rows at all for this club): %s',
                v_checks,
                coalesce(nullif(array_to_string(v_synth, ', '), ''), 'none'),
                coalesce(nullif(array_to_string(v_uncov, ', '), ''), 'none'));
end;
$fn$;

revoke all on function app_private.cross_club_check(uuid[], boolean) from public, anon, authenticated;
comment on function app_private.cross_club_check(uuid[], boolean) is
  'A-070 permanent tenancy test. Run as the database owner after every migration; FAIL and WARN rows must be fixed or recorded in app_private.cross_club_allow. The whole run is rolled back.';
