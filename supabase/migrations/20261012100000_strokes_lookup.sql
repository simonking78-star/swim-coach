-- One stroke lookup for the whole app.
-- Every stroke column stores the short code (Fr, Bk, Brs, Fly, IM, DLK).
-- Dropdowns show `name` (long form); chips, tags and tight spaces show `code`.
-- A normaliser trigger maps legacy spellings (Free, Frontcrawl, BK, Breast…)
-- to the code on write, so older skills/imports keep working.

create table if not exists public.stroke_lookup (
  code        text primary key,
  name        text not null unique,
  sort_order  smallint not null,
  aliases     text[] not null default '{}',
  is_active   boolean not null default true
);

insert into public.stroke_lookup (code, name, sort_order, aliases) values
  ('Fr',  'Freestyle',         1, array['fr','free','freestyle','frontcrawl','front crawl','crawl']),
  ('Bk',  'Backstroke',        2, array['bk','back','backstroke']),
  ('Brs', 'Breaststroke',      3, array['brs','br','breast','breaststroke']),
  ('Fly', 'Butterfly',         4, array['fly','butterfly']),
  ('IM',  'Individual Medley', 5, array['im','individual medley','medley']),
  ('DLK', 'Dolphin',           6, array['dlk','dolphin','dolphin kick'])
on conflict (code) do update
  set name = excluded.name, sort_order = excluded.sort_order, aliases = excluded.aliases;

alter table public.stroke_lookup enable row level security;
create policy stroke_lookup_read on public.stroke_lookup for select to anon, authenticated using (true);

-- Returns the stroke code for any known spelling; anything else is returned unchanged
-- (so non-stroke values such as 'Dive', 'Kick', 'Turns' pass straight through).
create or replace function public.stroke_code(v text)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select s.code from public.stroke_lookup s
      where lower(btrim(v)) = lower(s.code) or lower(btrim(v)) = lower(s.name)
         or lower(btrim(v)) = any (s.aliases)
      limit 1),
    nullif(btrim(v), ''))
$$;

-- ---------- Data harmonisation ----------
alter table public.drills_library add column if not exists skill text;
update public.drills_library set skill = 'Turn', stroke = btrim(substr(stroke, 8))
  where stroke ilike 'turn - %';
update public.drills_library   set stroke       = public.stroke_code(stroke)       where stroke is not null;
update public.micro_sessions   set stroke_focus = public.stroke_code(stroke_focus) where stroke_focus is not null;
update public.stopwatch_times  set stroke       = public.stroke_code(stroke)       where stroke is not null;
update public.session_plans
   set stroke_skills = (select array_agg(public.stroke_code(x) order by o)
                          from unnest(stroke_skills) with ordinality u(x, o))
 where stroke_skills is not null and cardinality(stroke_skills) > 0;

alter table public.swimmer_feedback drop constraint if exists swimmer_feedback_category_check;
update public.swimmer_feedback set category = public.stroke_code(category);
update public.squad_feedback   set category = public.stroke_code(category);
alter table public.swimmer_feedback add constraint swimmer_feedback_category_check
  check (category = any (array['Fr','Bk','Brs','Fly','IM','DLK','Dive','Transition',
                               'Touch turn','Tumble turn','Training mindset','Racing mindset']));

-- Pure stroke columns link to the lookup.
alter table public.drills_library add constraint drills_library_stroke_fkey
  foreign key (stroke) references public.stroke_lookup(code) on update cascade;
alter table public.micro_sessions add constraint micro_sessions_stroke_focus_fkey
  foreign key (stroke_focus) references public.stroke_lookup(code) on update cascade;

-- ---------- Normalise on write ----------
create or replace function public.trg_normalise_stroke()
returns trigger language plpgsql set search_path = public as $$
begin
  case tg_table_name
    when 'drills_library' then
      if new.stroke ilike 'turn - %' then new.skill := coalesce(new.skill, 'Turn'); new.stroke := btrim(substr(new.stroke, 8)); end if;
      new.stroke := public.stroke_code(new.stroke);
    when 'micro_sessions'   then new.stroke_focus := public.stroke_code(new.stroke_focus);
    when 'stopwatch_times'  then new.stroke := public.stroke_code(new.stroke);
    when 'swimmer_feedback' then new.category := public.stroke_code(new.category);
    when 'squad_feedback'   then new.category := public.stroke_code(new.category);
    when 'session_plans' then
      if new.stroke_skills is not null then
        new.stroke_skills := (select array_agg(public.stroke_code(x) order by o)
                                from unnest(new.stroke_skills) with ordinality u(x, o));
      end if;
  end case;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['drills_library','micro_sessions','stopwatch_times',
                           'swimmer_feedback','squad_feedback','session_plans'] loop
    execute format('drop trigger if exists normalise_stroke on public.%I', t);
    execute format('create trigger normalise_stroke before insert or update on public.%I
                    for each row execute function public.trg_normalise_stroke()', t);
  end loop;
end $$;

-- Results tables (swim_results, qualifying_times, conversion_factors, competition_events)
-- already use the long names ("100m Backstroke"), which match stroke_lookup.name — left as is.
