import { sb } from "./supabase";
import { parseTimeStr } from "./results";
import { clubNameOf, SWIMMER_SQUAD, flatSquad } from "./clubs";

// Swimmer Comparison — same method as the current app:
// one swimmer, one event and course, inside a date window, against another
// swimmer, the average of swimmers born the same year, or a squad average.
// Improvement is measured per swimmer from their FIRST swim in the window:
//   improvement % = (first time − best time so far) ÷ first time × 100
// A group's value at each month-end is the mean of its members' best-so-far
// improvement, counting only members with 2+ swims in the window. The
// swimmer being analysed is never counted in their own group. Year of birth
// is the date of birth where on file, else the most common (meet year − age
// at swim) on their results, flagged "est.".

export const DISTANCES: Record<string, number[]> = {
  Freestyle: [50, 100, 200, 400, 800, 1500],
  Backstroke: [50, 100, 200],
  Breaststroke: [50, 100, 200],
  Butterfly: [50, 100, 200],
  "Individual Medley": [100, 200, 400]
};
export const ALL_CLUBS = "__all__";

export interface CmpSwimmer { id: string; full_name: string; club: string | null; squad: string | null; date_of_birth: string | null; active: boolean | null; }
export interface CmpRow { swimmer_id: string; t: number; meet_date: string; meet_name: string | null; age_at_swim: number | null; }
export interface Yob { year: number; est: boolean; }

/** PostgREST returns at most 1000 rows per call, so page through. */
async function fetchAll<T>(build: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }> }): Promise<T[]> {
  const out: T[] = [], page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export async function loadAllSwimmers(): Promise<CmpSwimmer[]> {
  // Every swimmer on file, across clubs: club names from the club list, squad names through squad_id.
  type Raw = { id: string; full_name: string; club_id: string | null; date_of_birth: string | null; active: boolean | null; sq: { name: string } | null };
  const rows = await fetchAll<Raw>(() => sb.from("swimmers").select(`id, full_name, club_id, date_of_birth, active, ${SWIMMER_SQUAD}`).order("id"));
  return flatSquad(rows).map(({ club_id, ...r }) => ({ ...r, club: clubNameOf(club_id) }));
}

export async function loadEventRows(event: string, course: string): Promise<CmpRow[]> {
  const raw = await fetchAll<{ swimmer_id: string; swim_time_display: string | null; meet_date: string | null; meet_name: string | null; age_at_swim: number | null }>(
    () => sb.from("swim_results").select("id, swimmer_id, swim_time_display, meet_date, meet_name, age_at_swim").eq("event", event).eq("course", course).order("id"));
  return raw.map(r => ({ swimmer_id: r.swimmer_id, t: parseTimeStr(r.swim_time_display) as number, meet_date: r.meet_date as string, meet_name: r.meet_name, age_at_swim: r.age_at_swim }))
    .filter(r => r.t != null && !!r.meet_date);
}

export const ms = (d: string) => Date.parse(d + "T00:00:00Z");

export function groupBySwimmer(rows: CmpRow[]): Map<string, CmpRow[]> {
  const m = new Map<string, CmpRow[]>();
  for (const r of rows) { const l = m.get(r.swimmer_id); l ? l.push(r) : m.set(r.swimmer_id, [r]); }
  return m;
}

export function yobOf(s: CmpSwimmer | undefined, rows: CmpRow[] | undefined): Yob | null {
  if (s?.date_of_birth) return { year: +s.date_of_birth.slice(0, 4), est: false };
  const counts = new Map<number, number>();
  for (const r of rows ?? []) {
    if (r.age_at_swim == null) continue;
    const y = +r.meet_date.slice(0, 4) - r.age_at_swim;
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  let best: number | null = null, bestN = 0;
  counts.forEach((n, y) => { if (n > bestN || (n === bestN && best != null && y > best)) { best = y; bestN = n; } });
  return best != null ? { year: best, est: true } : null;
}
export const yobLabel = (y: Yob | null) => (y ? `${y.year}${y.est ? " (est.)" : ""}` : "unknown");

export interface Window { start: string; end: string; }
export const OPEN_START = "1900-01-01", OPEN_END = "2999-12-31";
export function normWindow(a: string, b: string): Window {
  if (a && b && a > b) [a, b] = [b, a];
  return { start: a || OPEN_START, end: b || OPEN_END };
}

/** One swimmer's swims inside the window, oldest first. */
export function swimsIn(rows: CmpRow[] | undefined, w: Window): CmpRow[] {
  return (rows ?? []).filter(r => r.meet_date >= w.start && r.meet_date <= w.end)
    .sort((a, b) => a.meet_date.localeCompare(b.meet_date) || a.t - b.t);
}

export interface StatPt { x: number; t: number; raw: number; bsf: number; meet: string | null; date: string; }
export interface Stats { n: number; first: number; best: number; bestDate: string | null; impSec: number; impPct: number; spanMonths: number; ratePct: number | null; pts: StatPt[]; }

export function stats(swims: CmpRow[]): Stats | null {
  if (!swims.length) return null;
  const base = swims[0].t;
  let best = Infinity, bestDate: string | null = null;
  const pts = swims.map(r => {
    if (r.t < best) { best = r.t; bestDate = r.meet_date; }
    return { x: ms(r.meet_date), t: r.t, raw: ((base - r.t) / base) * 100, bsf: ((base - best) / base) * 100, meet: r.meet_name, date: r.meet_date };
  });
  const spanMonths = (ms(swims[swims.length - 1].meet_date) - ms(swims[0].meet_date)) / (86400000 * 30.44);
  const impPct = ((base - best) / base) * 100;
  return { n: swims.length, first: base, best, bestDate, impSec: base - best, impPct, spanMonths, ratePct: spanMonths >= 0.5 ? impPct / spanMonths : null, pts };
}

/** Best-so-far improvement % at time x. */
export function bsfAt(st: Stats, x: number): number | null {
  let v: number | null = null;
  for (const p of st.pts) { if (p.x <= x) v = p.bsf; else break; }
  return v;
}

export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Month-end timestamps across the window (open ends clamped to the data), plus the window end. */
export function monthEnds(w: Window, allDates: string[]): number[] {
  let s = w.start, e = w.end;
  if (s === OPEN_START || e === OPEN_END) {
    const d = [...allDates].sort();
    if (!d.length) return [];
    if (s === OPEN_START) s = d[0];
    if (e === OPEN_END) e = d[d.length - 1];
  }
  const endMs = ms(e), out: number[] = [];
  const s0 = new Date(ms(s));
  let d = new Date(Date.UTC(s0.getUTCFullYear(), s0.getUTCMonth() + 1, 0));
  while (d.getTime() < endMs) { out.push(d.getTime()); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0)); }
  out.push(endMs);
  return out;
}

export interface Member { id: string; st: Stats; }
export interface Group { label: string; members: Member[]; total: number; excludedOneOff: number; estCount: number; }

/** Members of a comparison group with their stats; only 2+ swims count. */
export function buildGroup(label: string, ids: string[], bySwimmer: Map<string, CmpRow[]>, w: Window, yob: (id: string) => Yob | null): Group {
  const withSwims = ids.map(id => ({ id, st: stats(swimsIn(bySwimmer.get(id), w)) })).filter((m): m is Member => !!m.st);
  const members = withSwims.filter(m => m.st.n >= 2);
  return { label, members, total: withSwims.length, excludedOneOff: withSwims.length - members.length, estCount: members.filter(m => yob(m.id)?.est).length };
}

/** Group mean and interquartile band of best-so-far improvement at each month-end. */
export function groupSeries(g: Group, ends: number[]) {
  const mean: { x: number; y: number; n: number }[] = [], p25: { x: number; y: number }[] = [], p75: { x: number; y: number }[] = [];
  for (const x of ends) {
    const vals = g.members.map(m => bsfAt(m.st, x)).filter((v): v is number => v != null).sort((a, b) => a - b);
    if (!vals.length) continue;
    mean.push({ x, y: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length });
    p25.push({ x, y: quantile(vals, 0.25)! });
    p75.push({ x, y: quantile(vals, 0.75)! });
  }
  return { mean, p25, p75 };
}

export const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(1)}%`);
export const fmtRate = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}%/mo`);
export const fmtMonth = (v: number) => new Date(v).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
export const fmtDayMs = (v: number) => new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
