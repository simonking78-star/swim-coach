-- A-154: one approved term per club + name + stroke (the library has e.g. "3-point touch" for two strokes).
drop index public.vocabulary_terms_approved_unique;
create unique index vocabulary_terms_approved_unique on public.vocabulary_terms (club_id, lower(term), coalesce(lower(stroke), '')) where status = 'approved';

insert into public.vocabulary_terms (club_id, term, aliases, meaning, term_type, stroke, details, status, legacy_drill_id, created_by, created_at)
select d.club_id, d.drill_name, coalesce(d.pseudonyms, '{}'), d.primary_purpose, 'drill', d.stroke,
       jsonb_strip_nulls(jsonb_build_object('purpose', d.primary_purpose, 'biomechanical', d.biomechanical, 'blabt', d.blabt,
         'equipment', d.equipment, 'regression', d.regression, 'progression', d.progression, 'coach', d.coach)),
       'approved', d.id, null, d.created_at
from public.drills_library d
where d.club_id is not null
  and not exists (select 1 from public.vocabulary_terms v where v.legacy_drill_id = d.id);

-- Data step run on production 17 Nov 2026 (not part of the migration):
-- the 65 Crawley drills were copied into Redhill and Reigate's vocabulary as approved terms,
-- each with details.copied_from_club / details.copied_from_term_id.
