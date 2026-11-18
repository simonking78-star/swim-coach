-- A-154 phase 2: plan usage log refresh, head-coach review queue and actions.

-- Who can review vocabulary: head coach, club admin, superadmin for that club.
create or replace function app_private.is_vocab_reviewer(p_club uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app_private.eff_roles_c() r
                 where r.role in ('superadmin','club_admin','head_coach')
                   and (r.club_id is null or r.club_id = p_club));
$$;

-- Whole-word, case-insensitive pattern for a term or alias.
create or replace function app_private.term_regex(t text)
returns text language sql immutable set search_path = '' as $$
  select '(^|[^a-z0-9])' || regexp_replace(lower(t), '([^a-z0-9 ])', '\\\1', 'g') || '($|[^a-z0-9])';
$$;

-- Rebuild the usage rows for one session plan from its content.
create or replace function app_private.refresh_plan_line_usage(p_plan uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare sp record; n int := 0;
begin
  select id, club_id, squad_id, intended_date, content into sp from public.session_plans where id = p_plan;
  delete from public.plan_line_usage where session_plan_id = p_plan;
  if sp.id is null or sp.club_id is null or sp.content is null or jsonb_typeof(sp.content) <> 'array' then
    return 0;
  end if;

  with lines as (
    select b.ord::int * 1000 as line_no, b.el as s, 1 as mult
    from jsonb_array_elements(sp.content) with ordinality b(el, ord)
    where b.el->>'type' = 'set'
    union all
    select b.ord::int * 1000 + c.ord::int, c.el, greatest(coalesce(nullif(b.el->>'reps','')::int, 1), 1)
    from jsonb_array_elements(sp.content) with ordinality b(el, ord)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(b.el->'children') = 'array' then b.el->'children' else '[]'::jsonb end)
         with ordinality c(el, ord)
    where b.el->>'type' = 'repeat_group'
  ), parsed as (
    select line_no, mult,
           coalesce(case when jsonb_typeof(s->'set') = 'object' then s->'set' end, s) as st
    from lines
  ), nums as (
    select p.line_no, p.st, coalesce(p.st->>'text', '') as txt,
      coalesce(case when (p.st->>'reps') ~ '^\d+$' then (p.st->>'reps')::int end,
               (regexp_match(coalesce(p.st->>'text',''), '^\s*(\d+)\s*[xX×]\s*\d+'))[1]::int, 1) * p.mult as reps,
      coalesce(case when (p.st->>'distance_m') ~ '^\d+$' then (p.st->>'distance_m')::int end,
               (regexp_match(coalesce(p.st->>'text',''), '^\s*\d+\s*[xX×]\s*(\d+)'))[1]::int,
               (regexp_match(coalesce(p.st->>'text',''), '^\s*(\d+)\s*m?(\s|$)'))[1]::int) as dist,
      coalesce(p.st->>'interval_text', (regexp_match(coalesce(p.st->>'text',''), '(@\s*[0-9:]+|@\s*[A-Za-z]+)'))[1]) as intv,
      p.st->>'effort' as eff
    from parsed p
  ), terms as (
    select v.id, v.term, v.aliases, v.legacy_drill_id,
           coalesce(v.merged_into, v.id) as use_id,
           (select o.legacy_drill_id from public.vocabulary_terms o where o.id::text = v.details->>'copied_from_term_id') as source_drill_id
    from public.vocabulary_terms v
    where v.club_id = sp.club_id and v.active and v.status in ('approved','pending','merged')
  ), ins as (
    insert into public.plan_line_usage (session_plan_id, club_id, squad_id, plan_date, line_no, line_text,
                                        term_id, matched_text, reps, distance_m, interval_text, intensity, source)
    select sp.id, sp.club_id, sp.squad_id, sp.intended_date, n.line_no, n.txt,
           m.use_id, m.term, n.reps, n.dist, n.intv, n.eff, 'parser'
    from nums n
    left join lateral (
      select distinct on (t.use_id) t.use_id, t.term
      from terms t
      where t.id::text = n.st->>'term_id'
         or (jsonb_typeof(n.st->'term_ids') = 'array' and t.id::text in (select jsonb_array_elements_text(n.st->'term_ids')))
         or coalesce(t.legacy_drill_id, t.source_drill_id)::text = n.st->>'drill_id'
         or (jsonb_typeof(n.st->'drill_ids') = 'array'
             and coalesce(t.legacy_drill_id, t.source_drill_id)::text in (select jsonb_array_elements_text(n.st->'drill_ids')))
         or exists (select 1 from unnest(array[t.term] || t.aliases) a
                    where length(trim(a)) > 0 and lower(n.txt) ~ app_private.term_regex(trim(a)))
      order by t.use_id
    ) m on true
    returning 1
  )
  select count(*) into n from ins;
  return n;
end;
$$;

-- Refresh every plan of a club (used when the vocabulary changes).
create or replace function app_private.refresh_club_plan_usage(p_club uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.session_plans where club_id = p_club loop
    n := n + app_private.refresh_plan_line_usage(r.id);
  end loop;
  return n;
end;
$$;

-- Triggers: plan saved -> refresh that plan; vocabulary changed -> refresh the club.
create or replace function app_private.trg_session_plan_usage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.refresh_plan_line_usage(new.id);
  return null;
end;
$$;
create trigger session_plans_line_usage
  after insert or update of content, squad_id, intended_date, club_id on public.session_plans
  for each row execute function app_private.trg_session_plan_usage();

create or replace function app_private.trg_vocab_refresh_usage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c uuid;
begin
  for c in select distinct club_id from new_rows loop
    perform app_private.refresh_club_plan_usage(c);
  end loop;
  return null;
end;
$$;
create trigger vocabulary_terms_refresh_usage_ins
  after insert on public.vocabulary_terms referencing new table as new_rows
  for each statement execute function app_private.trg_vocab_refresh_usage();
create trigger vocabulary_terms_refresh_usage_upd
  after update on public.vocabulary_terms referencing new table as new_rows
  for each statement execute function app_private.trg_vocab_refresh_usage();

-- Keep updated_at current.
create or replace function app_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
create trigger vocabulary_terms_touch before update on public.vocabulary_terms
  for each row execute function app_private.touch_updated_at();

-- Head coach review queue: pending terms, and auto-merges not yet looked at.
create view public.vocabulary_review_queue with (security_invoker = true) as
select v.id, v.club_id, v.term, v.meaning, v.term_type, v.stroke, v.status,
       v.auto_merged, v.claude_verdict, v.claude_reason, v.claude_checked_at,
       v.claude_match_id, m.term as match_term, m.meaning as match_meaning,
       v.merged_into, mi.term as merged_into_term,
       v.created_by, v.created_at,
       coalesce((select jsonb_agg(jsonb_build_object('target', dt.name, 'group', dt.target_group, 'weight', tt.weight))
                 from public.term_targets tt join public.development_targets dt on dt.id = tt.target_id
                 where tt.term_id = v.id), '[]'::jsonb) as suggested_targets
from public.vocabulary_terms v
left join public.vocabulary_terms m on m.id = v.claude_match_id
left join public.vocabulary_terms mi on mi.id = v.merged_into
where v.active
  and app_private.is_vocab_reviewer(v.club_id)
  and (v.status = 'pending' or (v.auto_merged and v.reviewed_at is null));
grant select on public.vocabulary_review_queue to authenticated;

-- Review actions (head coach / club admin / superadmin only).
create or replace function public.vocab_approve(p_term uuid, p_meaning text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.vocabulary_terms;
begin
  select * into v from public.vocabulary_terms where id = p_term;
  if v.id is null or not app_private.is_vocab_reviewer(v.club_id) then raise exception 'Not allowed'; end if;
  update public.vocabulary_terms
     set status = 'approved', merged_into = null, auto_merged = false,
         meaning = coalesce(nullif(trim(p_meaning), ''), meaning),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_term;
  update public.term_targets set confirmed = true where term_id = p_term;
end; $$;

create or replace function public.vocab_merge(p_term uuid, p_into uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.vocabulary_terms; t public.vocabulary_terms;
begin
  select * into v from public.vocabulary_terms where id = p_term;
  select * into t from public.vocabulary_terms where id = p_into;
  if v.id is null or t.id is null or v.club_id <> t.club_id or v.id = t.id then raise exception 'Bad merge'; end if;
  if not app_private.is_vocab_reviewer(v.club_id) then raise exception 'Not allowed'; end if;
  update public.vocabulary_terms
     set aliases = (select coalesce(array_agg(distinct a), '{}') from unnest(t.aliases || v.term || v.aliases) a where lower(a) <> lower(t.term))
   where id = t.id;
  update public.vocabulary_terms
     set status = 'merged', merged_into = t.id, reviewed_by = auth.uid(), reviewed_at = now()
   where id = v.id;
end; $$;

create or replace function public.vocab_reject(p_term uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.vocabulary_terms;
begin
  select * into v from public.vocabulary_terms where id = p_term;
  if v.id is null or not app_private.is_vocab_reviewer(v.club_id) then raise exception 'Not allowed'; end if;
  -- Undo an auto-merge alias if there was one.
  if v.merged_into is not null then
    update public.vocabulary_terms set aliases = array_remove(aliases, v.term) where id = v.merged_into;
  end if;
  update public.vocabulary_terms
     set status = 'rejected', merged_into = null, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_term;
end; $$;

-- Mark an auto-merge as seen without changing it.
create or replace function public.vocab_ack_merge(p_term uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.vocabulary_terms;
begin
  select * into v from public.vocabulary_terms where id = p_term;
  if v.id is null or not app_private.is_vocab_reviewer(v.club_id) then raise exception 'Not allowed'; end if;
  update public.vocabulary_terms set reviewed_by = auth.uid(), reviewed_at = now() where id = p_term;
end; $$;

revoke all on function public.vocab_approve(uuid, text), public.vocab_merge(uuid, uuid),
                       public.vocab_reject(uuid), public.vocab_ack_merge(uuid) from public, anon;
grant execute on function public.vocab_approve(uuid, text), public.vocab_merge(uuid, uuid),
                          public.vocab_reject(uuid), public.vocab_ack_merge(uuid) to authenticated;

-- Backfill usage from every existing plan.
select app_private.refresh_plan_line_usage(id) from public.session_plans;
