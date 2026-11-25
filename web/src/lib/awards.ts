// Swim England Swimming Club Awards 1-6. Spec: claude/specs/club-awards.md
// Tables: club_award_levels, club_award_outcomes (shared reference), swimmer_club_awards (activated /
// achieved per swimmer at a club), swimmer_award_outcomes (one 5-point mark per swimmer per criterion).
// The database activates an award when a criterion is marked and sets achieved_on when every
// criterion is at 100%; this file only reads, writes marks and works out the percentages.
import { sb } from "./supabase";

export interface AwardLevel { award: number; title: string; colour: string; icon: string; }
export interface AwardOutcome { outcome_id: string; award: number; outcome_no: number; area: string; outcome: string; }
export interface AwardMark { swimmer_id: string; outcome_id: string; award: number; score: number; assessed_on: string; }
export interface AwardActivation { swimmer_id: string; award: number; activated_on: string; achieved_on: string | null; }
export interface AwardRef { levels: AwardLevel[]; outcomes: AwardOutcome[]; byAward: Map<number, AwardOutcome[]>; }

/** Marking scale: 1-5, each step 20% of the criterion. */
export const SCALE = [1, 2, 3, 4, 5] as const;
export const scorePct = (score: number | null | undefined) => (score == null ? null : score * 20);

export type CritStatus = "none" | "red" | "amber" | "green" | "done";
/** No mark = not started; red 0-25%, amber 26-75%, green 76-99%, tick at 100%. */
export function statusOf(pct: number | null | undefined): CritStatus {
  if (pct == null) return "none";
  if (pct >= 100) return "done";
  if (pct >= 76) return "green";
  if (pct >= 26) return "amber";
  return "red";
}
export const STATUS_LABEL: Record<CritStatus, string> = {
  none: "Not started", red: "Started (0-25%)", amber: "Developing (26-75%)", green: "Nearly there (76-99%)", done: "Complete"
};

export async function loadAwardRef(): Promise<AwardRef> {
  const [lv, oc] = await Promise.all([
    sb.from("club_award_levels").select("award, title, colour, icon").order("award"),
    sb.from("club_award_outcomes").select("outcome_id, award, outcome_no, area, outcome").order("award").order("outcome_no")
  ]);
  if (lv.error) throw lv.error;
  if (oc.error) throw oc.error;
  const outcomes = (oc.data ?? []) as AwardOutcome[];
  const byAward = new Map<number, AwardOutcome[]>();
  for (const o of outcomes) byAward.set(o.award, [...(byAward.get(o.award) ?? []), o]);
  return { levels: (lv.data ?? []) as AwardLevel[], outcomes, byAward };
}

export interface AwardData { marks: AwardMark[]; activations: AwardActivation[]; }

/** Supabase returns at most 1,000 rows per request, so read in pages until a short page comes back. */
const PAGE = 1000;
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Marks and activations at one club for a list of swimmers (every row, however many). */
export async function loadAwardData(clubId: string, swimmerIds: string[]): Promise<AwardData> {
  const out: AwardData = { marks: [], activations: [] };
  for (let i = 0; i < swimmerIds.length; i += 150) {
    const ids = swimmerIds.slice(i, i + 150);
    const [m, a] = await Promise.all([
      readAll<AwardMark>((f, t) => sb.from("swimmer_award_outcomes").select("swimmer_id, outcome_id, award, score, assessed_on")
        .eq("club_id", clubId).in("swimmer_id", ids).order("swimmer_id").order("outcome_id").range(f, t)),
      readAll<AwardActivation>((f, t) => sb.from("swimmer_club_awards").select("swimmer_id, award, activated_on, achieved_on")
        .eq("club_id", clubId).in("swimmer_id", ids).order("swimmer_id").order("award").range(f, t))
    ]);
    out.marks.push(...m);
    out.activations.push(...a);
  }
  return out;
}

/** Fast lookups over loaded data. */
export class AwardIndex {
  private marks = new Map<string, number>();
  private acts = new Map<string, AwardActivation>();
  constructor(public ref: AwardRef, data: AwardData) {
    for (const m of data.marks) this.marks.set(m.swimmer_id + "|" + m.outcome_id, m.score);
    for (const a of data.activations) this.acts.set(a.swimmer_id + "|" + a.award, a);
  }
  score(swimmerId: string, outcomeId: string): number | null { return this.marks.get(swimmerId + "|" + outcomeId) ?? null; }
  activation(swimmerId: string, award: number) { return this.acts.get(swimmerId + "|" + award) ?? null; }
  active(swimmerId: string, award: number) { return this.acts.has(swimmerId + "|" + award); }
  achieved(swimmerId: string, award: number) { return !!this.acts.get(swimmerId + "|" + award)?.achieved_on; }
  /** Award completion 0-100: every criterion counts equally; unmarked counts as 0. */
  awardPct(swimmerId: string, award: number): number {
    const list = this.ref.byAward.get(award) ?? [];
    if (!list.length) return 0;
    const sum = list.reduce((t, o) => t + (scorePct(this.score(swimmerId, o.outcome_id)) ?? 0), 0);
    return Math.round(sum / list.length);
  }
  /** Mean over swimmers. */
  squadAwardPct(swimmerIds: string[], award: number): number {
    if (!swimmerIds.length) return 0;
    return Math.round(swimmerIds.reduce((t, id) => t + this.awardPct(id, award), 0) / swimmerIds.length);
  }
  /** Mean over swimmers of one criterion (unmarked counts as 0). */
  squadCritPct(swimmerIds: string[], outcomeId: string): number {
    if (!swimmerIds.length) return 0;
    return Math.round(swimmerIds.reduce((t, id) => t + (scorePct(this.score(id, outcomeId)) ?? 0), 0) / swimmerIds.length);
  }
  countWith(swimmerIds: string[], fn: (id: string) => boolean) { return swimmerIds.filter(fn).length; }
}

/** One pending change: a score 1-5, or null to clear the mark. */
export interface MarkChange { swimmer_id: string; outcome_id: string; score: number | null; }

export async function saveMarks(clubId: string, changes: MarkChange[], on: string): Promise<void> {
  const up = changes.filter(c => c.score != null).map(c => ({ club_id: clubId, swimmer_id: c.swimmer_id, outcome_id: c.outcome_id, score: c.score as number, assessed_on: on }));
  const clear = changes.filter(c => c.score == null);
  if (up.length) {
    const { error } = await sb.from("swimmer_award_outcomes").upsert(up, { onConflict: "club_id,swimmer_id,outcome_id" });
    if (error) throw error;
  }
  for (const c of clear) {
    const { error } = await sb.from("swimmer_award_outcomes").delete()
      .eq("club_id", clubId).eq("swimmer_id", c.swimmer_id).eq("outcome_id", c.outcome_id);
    if (error) throw error;
  }
}

/** Switch an award on or off for swimmers. Switching off keeps their marks. */
export async function setActivated(clubId: string, swimmerIds: string[], award: number, on: boolean): Promise<void> {
  if (!swimmerIds.length) return;
  if (on) {
    const rows = swimmerIds.map(id => ({ club_id: clubId, swimmer_id: id, award }));
    const { error } = await sb.from("swimmer_club_awards").upsert(rows, { onConflict: "club_id,swimmer_id,award", ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await sb.from("swimmer_club_awards").delete().eq("club_id", clubId).eq("award", award).in("swimmer_id", swimmerIds);
    if (error) throw error;
  }
}

export interface AwardSquad { id: string; name: string; }
export async function loadAwardSquads(clubId: string): Promise<AwardSquad[]> {
  const { data, error } = await sb.from("squads").select("id, name").eq("club_id", clubId).order("name");
  if (error) throw error;
  return (data ?? []) as AwardSquad[];
}
export interface AwardSwimmer { id: string; full_name: string; squad_id: string | null; }
export async function loadAwardSwimmers(clubId: string, squadId?: string): Promise<AwardSwimmer[]> {
  let q = sb.from("swimmers").select("id, full_name, squad_id").eq("club_id", clubId).eq("active", true).order("full_name");
  if (squadId) q = q.eq("squad_id", squadId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AwardSwimmer[];
}

/** True when the database hasn't had the Club Awards update yet. */
export const awardsMissing = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return !!x && (x.code === "42P01" || x.code === "PGRST205" || /club_award/.test(x.message ?? ""));
};
