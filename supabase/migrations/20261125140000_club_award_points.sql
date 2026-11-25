-- Club Awards scoring in the database (25 Nov 2026). Spec: claude/specs/club-awards-stats.md
-- The app used to download every criterion mark (2,947 rows and growing) and add them up in the
-- browser, which broke once the club passed Supabase's 1,000-rows-per-request limit. These two
-- views do the adding up in Postgres, so Statistics reads one row per swimmer per award (or one
-- row per swimmer) instead.
--
-- security_invoker = true: the views run with the caller's rights, so the RLS on
-- swimmer_award_outcomes / swimmer_club_awards (role, squad, own child, own club) applies unchanged.

-- One row per club + swimmer + award that has a mark or an activation.
create or replace view public.swimmer_award_progress with (security_invoker = true) as
with marks as (
  select club_id, swimmer_id, award,
         sum(score)                          as score_sum,
         count(*)                            as marked,
         count(*) filter (where score = 5)   as complete,
         max(assessed_on)                    as last_assessed
    from public.swimmer_award_outcomes
   group by club_id, swimmer_id, award
), totals as (
  select award, count(*) as n from public.club_award_outcomes group by award
)
select coalesce(m.club_id, a.club_id)       as club_id,
       coalesce(m.swimmer_id, a.swimmer_id) as swimmer_id,
       coalesce(m.award, a.award)           as award,
       t.n::int                             as criteria_total,
       coalesce(m.marked, 0)::int           as criteria_marked,
       coalesce(m.complete, 0)::int         as criteria_complete,
       -- % complete: every criterion counts equally, unmarked = 0, score 1-5 = 20%-100%
       round(coalesce(m.score_sum, 0) * 20.0 / t.n)::int as pct,
       (a.swimmer_id is not null)           as activated,
       a.activated_on,
       a.achieved_on,
       (a.achieved_on is not null or coalesce(m.complete, 0) >= t.n) as achieved,
       m.last_assessed
  from marks m
  full join public.swimmer_club_awards a
         on a.club_id = m.club_id and a.swimmer_id = m.swimmer_id and a.award = m.award
  join totals t on t.award = coalesce(m.award, a.award);

comment on view public.swimmer_award_progress is
  'Club Awards: % complete per swimmer per award (unmarked criteria count 0). RLS of the underlying tables applies.';

-- One row per club + swimmer: points = sum of award no. x % complete (Award 1 up to 100 ... Award 6 up to 600; max 2,100).
create or replace view public.swimmer_award_points with (security_invoker = true) as
select club_id, swimmer_id,
       sum(award * pct)::int                                        as points,
       count(*) filter (where achieved)::int                        as awards_achieved,
       max(award) filter (where achieved)                           as highest_achieved,
       coalesce(max(pct) filter (where award = 1), 0)::int          as award_1_pct,
       coalesce(max(pct) filter (where award = 2), 0)::int          as award_2_pct,
       coalesce(max(pct) filter (where award = 3), 0)::int          as award_3_pct,
       coalesce(max(pct) filter (where award = 4), 0)::int          as award_4_pct,
       coalesce(max(pct) filter (where award = 5), 0)::int          as award_5_pct,
       coalesce(max(pct) filter (where award = 6), 0)::int          as award_6_pct,
       max(last_assessed)                                           as last_assessed
  from public.swimmer_award_progress
 group by club_id, swimmer_id;

comment on view public.swimmer_award_points is
  'Club Awards points per swimmer: sum of award no. x % complete (max 2,100). RLS of the underlying tables applies.';

revoke all on public.swimmer_award_progress, public.swimmer_award_points from anon, public;
grant select on public.swimmer_award_progress, public.swimmer_award_points to authenticated;

do $chk$
declare n int;
begin
  -- Views must run as the caller, or they would bypass RLS.
  select count(*) into n from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('swimmer_award_progress', 'swimmer_award_points')
     and not coalesce(c.reloptions @> array['security_invoker=true'], false);
  if n > 0 then raise exception 'Club award points: % view(s) not security_invoker', n; end if;
  select count(*) into n from app_private.anon_exposure();
  if n > 0 then raise exception 'Club award points: anon_exposure() returned % rows', n; end if;
end
$chk$;
