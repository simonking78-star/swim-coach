-- A-154: when the free-text planner saves a coach's explanation of a term, add it to the club vocabulary as pending
-- (used straight away; Claude reviews it on the next analysis; head coach sees the verdict).
create or replace function app_private.trg_planner_glossary_to_vocab()
returns trigger language plpgsql security definer set search_path = '' as $$
declare src uuid;
begin
  select v.id into src from public.vocabulary_terms v
   where v.club_id = new.club_id and new.drill_id is not null
     and (v.legacy_drill_id = new.drill_id
          or exists (select 1 from public.vocabulary_terms o where o.id::text = v.details->>'copied_from_term_id' and o.legacy_drill_id = new.drill_id))
   limit 1;
  if exists (select 1 from public.vocabulary_terms v where v.club_id = new.club_id and v.status <> 'rejected'
             and (lower(v.term) = lower(new.term) or lower(new.term) = any (select lower(a) from unnest(v.aliases) a))) then
    return new;
  end if;
  if src is not null then
    -- The coach said this word means an existing drill: treat it as an alias, flagged for the head coach.
    update public.vocabulary_terms set aliases = array_append(aliases, new.term) where id = src;
    insert into public.vocabulary_terms (club_id, term, meaning, term_type, status, merged_into, auto_merged,
                                         claude_verdict, claude_reason, claude_match_id, created_by)
    values (new.club_id, new.term, new.meaning, 'drill', 'merged', src, true,
            'duplicate', 'Coach linked this word to an existing drill when defining it.', src, new.created_by);
  else
    insert into public.vocabulary_terms (club_id, term, meaning, term_type, status, created_by, details)
    values (new.club_id, new.term, new.meaning, 'other', 'pending', new.created_by,
            jsonb_build_object('source', 'planner_glossary', 'planner_glossary_id', new.id::text));
  end if;
  return new;
end; $$;

create trigger planner_glossary_to_vocabulary
  after insert on public.planner_glossary
  for each row execute function app_private.trg_planner_glossary_to_vocab();
