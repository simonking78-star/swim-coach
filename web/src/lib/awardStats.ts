// Statistics → Club Awards progression. Spec: claude/specs/club-awards-stats.md
// Two views over the same Club Awards marks (lib/awards.ts):
//  1. Ranking: every swimmer in the club by Club Awards progression points
//     (sum over awards of award no. x % complete, as Club Standing part 4).
//  2. Skill segments: the 80 Swim England outcomes regrouped into six skill
//     segments, each a short ladder of stages (one stage per award the segment
//     appears in), so a coach can see where a swimmer or squad is in each skill.
import { AwardIndex, scorePct, type AwardLevel, type AwardOutcome } from "./awards";

// ---------- Ranking ----------

export interface RankRow {
  id: string; name: string; squadId: string | null; squad: string; age: number | null;
  pcts: number[];            // award 1..6 % complete
  achieved: boolean[];       // award 1..6 achieved
  points: number;            // sum of award x %, 0..2100
  highest: number | null;    // highest award achieved
  working: number | null;    // lowest award not yet achieved (null = all six done)
  clubRank: number; squadRank: number;
}

export const MAX_POINTS = 21 * 100; // (1+2+...+6) x 100%

export function ageOn(dob: string | null | undefined, on = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  let a = on.getFullYear() - d.getFullYear();
  if (on.getMonth() < d.getMonth() || (on.getMonth() === d.getMonth() && on.getDate() < d.getDate())) a--;
  return a;
}

/** Competition ranking (1, 2, 2, 4): equal points share a rank. Rows must be sorted by points, highest first. */
function assignRanks<T>(rows: T[], points: (r: T) => number, set: (r: T, rank: number) => void) {
  let prev: number | null = null, rank = 0;
  rows.forEach((r, i) => { const p = points(r); if (p !== prev) { rank = i + 1; prev = p; } set(r, rank); });
}

export interface RankSwimmer { id: string; full_name: string; squad_id: string | null; date_of_birth: string | null; }

export function rankSwimmers(index: AwardIndex, swimmers: RankSwimmer[], squadName: (id: string | null) => string): RankRow[] {
  const levels = index.ref.levels;
  const rows: RankRow[] = swimmers.map(s => {
    const pcts = levels.map(l => index.awardPct(s.id, l.award));
    // An award counts as achieved when the database says so, or every criterion is at 100%.
    const achieved = levels.map((l, i) => index.achieved(s.id, l.award) || pcts[i] >= 100);
    const points = levels.reduce((t, l, i) => t + l.award * pcts[i], 0);
    const got = levels.filter((_, i) => achieved[i]).map(l => l.award);
    const notYet = levels.filter((_, i) => !achieved[i]).map(l => l.award);
    return {
      id: s.id, name: s.full_name, squadId: s.squad_id, squad: squadName(s.squad_id), age: ageOn(s.date_of_birth),
      pcts, achieved, points, highest: got.length ? Math.max(...got) : null, working: notYet.length ? Math.min(...notYet) : null,
      clubRank: 0, squadRank: 0
    };
  });
  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  assignRanks(rows, r => r.points, (r, n) => { r.clubRank = n; });
  const bySquad = new Map<string, RankRow[]>();
  for (const r of rows) { const k = r.squadId ?? ""; bySquad.set(k, [...(bySquad.get(k) ?? []), r]); }
  for (const list of bySquad.values()) assignRanks(list, r => r.points, (r, n) => { r.squadRank = n; });
  return rows;
}

// ---------- Skill segments ----------

export interface SegmentDef { key: string; name: string; short: string; icon: string; areas: string[]; blurb: string; }

/**
 * Six segments from the twelve Swim England areas. The grouping follows how the
 * skill develops across the awards rather than how each award is laid out:
 * water skills finish at Award 3, turns begin at Award 2, finishes at Award 5.
 */
export const SEGMENTS: SegmentDef[] = [
  { key: "water", name: "Water skills & streamlining", short: "Water skills", icon: "🌊", areas: ["Body position", "Underwater skills"],
    blurb: "Floats and streamline, push-offs, underwater dolphin kick and pull-out, breaking out into stroke." },
  { key: "stroke", name: "Stroke technique", short: "Stroke", icon: "🏊", areas: ["Drills & kicking", "Full stroke"],
    blurb: "From kicking and drills to connected full stroke, IM, stroke counts and Stroke Efficiency Index." },
  { key: "starts", name: "Starts, relays & finishes", short: "Starts", icon: "🚩", areas: ["Starts", "Relays", "Finishes"],
    blurb: "Sitting dive to race-speed block starts, relay takeovers and legal finishes." },
  { key: "turns", name: "Turns", short: "Turns", icon: "🔄", areas: ["Turns"],
    blurb: "Approach and touch, push-off and transition, legal turns at race speed, IM transition turns." },
  { key: "pace", name: "Training & pace skills", short: "Pace", icon: "⏱️", areas: ["Training skills"],
    blurb: "Pace clock and send-offs, holding a set pace, stroke counting and efficiency." },
  { key: "athlete", name: "Athlete preparation & mindset", short: "Athlete", icon: "🧠", areas: ["Knowledge", "Preparation", "Goal setting"],
    blurb: "Equipment, hydration and nutrition, RMAP warm-up, stretching and process goals." }
];

/** Short stage names: one per segment per award the segment appears in. */
const STAGE_NAMES: Record<string, Record<number, string>> = {
  water: { 1: "Float & streamline push-off", 2: "Underwater kick & pull-out", 3: "Breakout into stroke" },
  stroke: { 1: "Kick on all four strokes", 2: "Single-arm & timing drills", 3: "25m connected full stroke", 4: "50m each stroke & 100 IM",
    5: "Even kick & stroke counts", 6: "Efficiency index & race-pace IM" },
  starts: { 1: "Sitting & in-water back dive", 2: "Kneeling dive & back start", 3: "Standing dive & relay drill", 4: "Block starts & relay entry",
    5: "Race start, finishes, block relays", 6: "Race-speed starts, finishes, relays" },
  turns: { 2: "Approach, rotate & touch", 3: "Push-off & transition", 4: "Legal turns & IM transitions", 5: "Race-speed turns", 6: "Race-speed IM turns" },
  pace: { 1: "Read the pace clock", 2: "Swim on a turnaround", 3: "Estimate swim times", 4: "Hold a set pace", 5: "Pace with stroke counts", 6: "Pace with efficiency index" },
  athlete: { 1: "Equipment know-how", 2: "Hydration & nutrition", 3: "Warm-up, stretch, process goals", 4: "Own warm-up & technique goal",
    5: "Longer routine & skill goal", 6: "Full routine & IM/relay goal" }
};

export interface Stage { award: number; name: string; outcomes: AwardOutcome[]; }
export interface Segment extends SegmentDef { stages: Stage[]; outcomes: AwardOutcome[]; }

/** Build the segment ladders from the reference outcomes. Any area not listed above lands in "Other". */
export function buildSegments(outcomes: AwardOutcome[]): Segment[] {
  const known = new Set(SEGMENTS.flatMap(s => s.areas));
  const defs = [...SEGMENTS];
  if (outcomes.some(o => !known.has(o.area))) {
    defs.push({ key: "other", name: "Other criteria", short: "Other", icon: "•", areas: [...new Set(outcomes.filter(o => !known.has(o.area)).map(o => o.area))], blurb: "Criteria in areas not yet grouped." });
  }
  return defs.map(d => {
    const mine = outcomes.filter(o => d.areas.includes(o.area));
    const awards = [...new Set(mine.map(o => o.award))].sort((a, b) => a - b);
    const stages = awards.map(a => ({ award: a, name: STAGE_NAMES[d.key]?.[a] ?? `Award ${a}`, outcomes: mine.filter(o => o.award === a) }));
    return { ...d, stages, outcomes: mine };
  }).filter(s => s.outcomes.length);
}

export interface SegmentPosition {
  stagePcts: number[];      // % complete for each stage
  secured: number;          // highest stage index at 100% (-1 = none)
  next: number | null;      // stage to work on: the one above `secured`, else the earliest gap (null = every stage complete)
  gaps: number[];           // stage indexes below `secured` that are not complete
  pct: number;              // whole segment % (every criterion equal, unmarked = 0)
  started: boolean;         // any mark in the segment
}

export function segmentPosition(index: AwardIndex, swimmerId: string, seg: Segment): SegmentPosition {
  const pctOf = (o: AwardOutcome) => scorePct(index.score(swimmerId, o.outcome_id)) ?? 0;
  const stagePcts = seg.stages.map(st => Math.round(st.outcomes.reduce((t, o) => t + pctOf(o), 0) / st.outcomes.length));
  let secured = -1;
  stagePcts.forEach((p, i) => { if (p >= 100) secured = i; });
  const gaps = stagePcts.map((p, i) => (i < secured && p < 100 ? i : -1)).filter(i => i >= 0);
  // Top stage secured but an earlier one isn't: the earliest gap is what's next.
  const next = secured + 1 < seg.stages.length ? secured + 1 : gaps.length ? gaps[0] : null;
  const pct = Math.round(seg.outcomes.reduce((t, o) => t + pctOf(o), 0) / seg.outcomes.length);
  const started = seg.outcomes.some(o => index.score(swimmerId, o.outcome_id) != null);
  return { stagePcts, secured, next, gaps, pct, started };
}

/** Squad picture for one segment: swimmers at each secured stage and the mean % of each stage. */
export function segmentSummary(index: AwardIndex, ids: string[], seg: Segment) {
  const pos = ids.map(id => segmentPosition(index, id, seg));
  const atStage = seg.stages.map((_, i) => pos.filter(p => p.secured === i).length);
  const notSecured = pos.filter(p => p.secured < 0).length;
  const stageMean = seg.stages.map((_, i) => (pos.length ? Math.round(pos.reduce((t, p) => t + p.stagePcts[i], 0) / pos.length) : 0));
  const mean = pos.length ? Math.round(pos.reduce((t, p) => t + p.pct, 0) / pos.length) : 0;
  return { atStage, notSecured, stageMean, mean, count: pos.length };
}

export const levelOf = (levels: AwardLevel[], award: number) => levels.find(l => l.award === award);
