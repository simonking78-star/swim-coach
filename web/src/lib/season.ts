import { sb } from "./supabase";
import { isoAdd, fmtDate } from "./util";
import type { Micro, MicroSession, SeasonCtx } from "./plans";
import { clubIdOf, clubCols } from "./clubs";

// Timetables, Season planner and Competitions — same tables and rules as the
// current app. Nothing is ever erased: "delete"/"remove" sets is_active=false.

export const DAYS_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAYS_LONG = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const POOLS = ["17m", "25m", "50m"];
export const MI_STROKES = ["Free", "Back", "Brs", "Fly", "IM"];
export const DESIGNATIONS: Record<string, string> = { target: "Target", qualifying: "Qualifying", train_through: "Train-through", team: "Team" };
/** [event no, SC name, LC name or null when not swum long course] */
export const EVENTS_18: [number, string, string | null][] = [
  [1, "50 Free", "50 Free"], [2, "50 Back", "50 Back"], [3, "50 Breast", "50 Breast"], [4, "50 Fly", "50 Fly"],
  [5, "100 Free", "100 Free"], [6, "100 Back", "100 Back"], [7, "100 Breast", "100 Breast"], [8, "100 Fly", "100 Fly"],
  [9, "200 Free", "200 Free"], [10, "200 Back", "200 Back"], [11, "200 Breast", "200 Breast"], [12, "200 Fly", "200 Fly"],
  [13, "400 Free", "400 Free"], [14, "800 Free", "800 Free"], [15, "1500 Free", "1500 Free"],
  [16, "100 IM", null], [17, "200 IM", "200 IM"], [18, "400 IM", "400 IM"]
];

export const isoDow = (iso: string) => { const g = new Date(iso + "T00:00:00").getDay(); return g === 0 ? 7 : g; };
export const isoDiffDays = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
/** "18:30:00" → "6:30 pm" */
export function fmtTime(t: string | null | undefined) {
  if (!t) return "";
  const h = parseInt(t.slice(0, 2), 10);
  return `${h % 12 || 12}:${t.slice(3, 5)} ${h >= 12 ? "pm" : "am"}`;
}
export const fmtRange = (a: string, b?: string | null) => (b && b !== a ? `${fmtDate(a)} – ${fmtDate(b)}` : fmtDate(a));
const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------
export interface Season { id: string; title: string; start_date: string; finish_date: string; }

export async function loadSeasons(club: string): Promise<Season[]> {
  const { data, error } = await sb.from("seasons").select("id, title, start_date, finish_date").eq("club_id", clubIdOf(club)).eq("is_active", true).order("start_date");
  if (error) throw error;
  return (data ?? []) as Season[];
}
/** The season running today, else the next one, else the latest. */
export function pickSeason(rows: Season[], today: string): Season | null {
  return rows.find(s => s.start_date <= today && s.finish_date >= today) || rows.find(s => s.start_date > today) || rows[rows.length - 1] || null;
}

// ---------------------------------------------------------------------------
// Timetables
// ---------------------------------------------------------------------------
export interface TtSession { id: string; day_of_week: number; start_time: string; end_time: string | null; pool_size: string | null; is_active: boolean; }
export interface Timetable {
  id: string; squad_id: string; season_id: string | null; season_start: string; season_end: string; weekly_focus: string | null;
  squads: { name: string; club_id: string }; timetable_sessions: TtSession[];
}
export interface SeasonComp {
  id: string; season_id: string; competition_id: string | null; name: string; date_from: string; date_to: string | null;
  course: string; level: number | null; competitions?: { gala_id: string | null } | null;
}
export interface Gala { id: string; name: string; date_start: string | null; date_end: string | null; entries_open: string | null; entries_close: string | null; }
export interface MacroLite { id: string; season_id: string; title: string; macro_squads: { squad_id: string; is_active: boolean }[]; micros: Micro[]; }
export interface TimetablesData { timetables: Timetable[]; galas: Gala[]; seasons: Season[]; comps: SeasonComp[]; macros: MacroLite[]; }

export async function loadTimetablesData(club: string): Promise<TimetablesData> {
  const [tt, gl, seasons] = await Promise.all([
    sb.from("timetables")
      .select("id, squad_id, season_id, season_start, season_end, weekly_focus, squads!inner(name, club_id), timetable_sessions(id, day_of_week, start_time, end_time, pool_size, is_active)")
      .eq("is_active", true).eq("squads.club_id", clubIdOf(club)).eq("timetable_sessions.is_active", true),
    sb.from("galas").select("id, name, date_start, date_end, entries_open, entries_close"),
    loadSeasons(club)
  ]);
  if (tt.error) throw tt.error;
  if (gl.error) console.error(gl.error);
  const out: TimetablesData = { timetables: (tt.data ?? []) as unknown as Timetable[], galas: (gl.data ?? []) as Gala[], seasons, comps: [], macros: [] };
  const ids = seasons.map(s => s.id);
  if (ids.length) {
    const [sc, mq] = await Promise.all([
      sb.from("season_competitions").select("id, season_id, competition_id, name, date_from, date_to, course, level, competitions(gala_id)").in("season_id", ids).eq("is_active", true).order("date_from"),
      sb.from("macros").select("id, season_id, title, macro_squads(squad_id, is_active), micros(id, week_no, week_commencing, meso, qes_focus, technical_focus, break_days, is_active)").in("season_id", ids).eq("is_active", true)
    ]);
    if (sc.error) throw sc.error;
    if (mq.error) throw mq.error;
    out.comps = (sc.data ?? []) as unknown as SeasonComp[];
    out.macros = (mq.data ?? []) as unknown as MacroLite[];
  }
  return out;
}

export type TtState = "current" | "upcoming" | "past";
export function ttState(t: Pick<Timetable, "season_start" | "season_end">, today: string): TtState {
  if (t.season_end < today) return "past";
  if (t.season_start > today) return "upcoming";
  return "current";
}
/** Its season_id, or (older rows) the season covering its band. */
export function seasonOf(t: Timetable, seasons: Season[]): Season | null {
  if (t.season_id) return seasons.find(s => s.id === t.season_id) || null;
  return seasons.find(s => s.start_date <= t.season_start && s.finish_date >= t.season_end) || null;
}
/** This week's micro-cycle for a squad in a season, or the next one coming up. */
export function weekFocus(macros: MacroLite[], squadId: string, seasonId: string, today: string) {
  const micros: (Micro & { macroTitle: string })[] = [];
  macros.filter(m => m.season_id === seasonId && (m.macro_squads || []).some(x => x.squad_id === squadId && x.is_active))
    .forEach(m => (m.micros || []).forEach(mi => { if (mi.is_active && mi.week_commencing) micros.push({ ...mi, macroTitle: m.title }); }));
  micros.sort((a, b) => a.week_commencing!.localeCompare(b.week_commencing!));
  const cur = micros.find(mi => mi.week_commencing! <= today && isoAdd(mi.week_commencing!, 6) >= today);
  if (cur) return { micro: cur, current: true };
  const next = micros.find(mi => mi.week_commencing! > today);
  return next ? { micro: next, current: false } : null;
}
export function meetStatus(g: { entries_open: string | null; entries_close: string | null }, today: string) {
  if (g.entries_close && g.entries_close < today) return { key: "closed", label: "Entries closed" };
  if (g.entries_open && g.entries_open <= today) return { key: "open", label: "Open to enter" };
  return { key: "pending", label: g.entries_open ? "Pending · opens " + fmtDate(g.entries_open) : "Pending" };
}
/** The season's competitions not yet finished, with the linked gala's entry window. */
export function upcomingMeets(d: TimetablesData, season: Season | null, today: string) {
  if (!season) return [];
  return d.comps.filter(c => c.season_id === season.id && (c.date_to || c.date_from) >= today).map(c => {
    const g = c.competitions?.gala_id ? d.galas.find(x => x.id === c.competitions!.gala_id) : null;
    return { ...c, entries_open: g?.entries_open ?? null, entries_close: g?.entries_close ?? null };
  });
}

export async function disableTimetable(id: string) {
  const { error } = await sb.from("timetables").update({ is_active: false, disabled_at: now() } as never).eq("id", id);
  if (error) throw error;
}

export interface TtRow { id: string | null; day: string; start: string; end: string; pool: string; }
export interface TtDraft { id: string | null; squadId: string; squadName: string; seasonId: string; start: string; end: string; rows: TtRow[]; removedIds: string[]; }
const hhmmss = (t: string) => (t.length === 5 ? t + ":00" : t);

/** Same checks as the current app, plus: the finish time is required (it sets the session length for attendance). */
export function validateTimetable(d: TtDraft, seasons: Season[], others: Timetable[]): string | null {
  if (!d.squadId) return "Choose a squad.";
  if (!d.rows.length) return "Add at least one session.";
  for (let i = 0; i < d.rows.length; i++) {
    const r = d.rows[i];
    if (!r.day || !r.start) return `Session ${i + 1}: choose a day and a start time.`;
    if (!r.end) return `Session ${i + 1}: set the finish time — it sets the session length used for attendance.`;
    if (hhmmss(r.end) <= hhmmss(r.start)) return `Session ${i + 1}: the finish time must be after the start time.`;
  }
  const seen = new Set<string>();
  for (const r of d.rows) { const k = r.day + "|" + hhmmss(r.start); if (seen.has(k)) return "Two sessions have the same day and time."; seen.add(k); }
  const season = seasons.find(s => s.id === d.seasonId);
  if (!season) return "Choose the season this timetable belongs to.";
  if (!d.start || !d.end) return "Set the band start and end dates.";
  if (d.end < d.start) return "The band end date must be on or after the band start date.";
  if (d.start < season.start_date || d.end > season.finish_date) return `The band must fall inside ${season.title} (${fmtDate(season.start_date)} – ${fmtDate(season.finish_date)}).`;
  const clash = others.find(t => t.id !== d.id && t.squad_id === d.squadId && t.season_start <= d.end && t.season_end >= d.start);
  if (clash) return `${d.squadName} already has a timetable covering ${fmtDate(clash.season_start)} – ${fmtDate(clash.season_end)}. Edit that one, or change these dates.`;
  return null;
}

/** Saves the timetable and its sessions. Mutates d.id / row ids so a retry after a partial failure updates rather than duplicates. */
export async function saveTimetable(d: TtDraft): Promise<string> {
  if (d.id) {
    const { error } = await sb.from("timetables").update({ squad_id: d.squadId, season_id: d.seasonId, season_start: d.start, season_end: d.end, updated_at: now() } as never).eq("id", d.id);
    if (error) throw error;
  } else {
    const { data, error } = await sb.from("timetables").insert({ squad_id: d.squadId, season_id: d.seasonId, season_start: d.start, season_end: d.end } as never).select("id").single();
    if (error) throw error;
    d.id = (data as { id: string }).id;
  }
  const payload = (r: TtRow) => ({ day_of_week: parseInt(r.day, 10), start_time: hhmmss(r.start), end_time: hhmmss(r.end), pool_size: r.pool || null });
  for (const r of d.rows.filter(r => r.id)) {
    const { error } = await sb.from("timetable_sessions").update(payload(r) as never).eq("id", r.id!);
    if (error) throw error;
  }
  const fresh = d.rows.filter(r => !r.id);
  if (fresh.length) {
    const { data, error } = await sb.from("timetable_sessions").insert(fresh.map(r => ({ timetable_id: d.id, ...payload(r) })) as never).select("id");
    if (error) throw error;
    ((data ?? []) as { id: string }[]).forEach((x, i) => { fresh[i].id = x.id; });
  }
  if (d.removedIds.length) {
    const { error } = await sb.from("timetable_sessions").update({ is_active: false } as never).in("id", d.removedIds);
    if (error) throw error;
    d.removedIds = [];
  }
  return d.id!;
}

// ---------------------------------------------------------------------------
// Week plan: one card per squad for a Mon–Sun week
// ---------------------------------------------------------------------------
export interface WeekPlan { id: string; title: string; squad_id: string | null; intended_date: string; micro_session_id: string | null; total_distance_m: number | null; stroke_skills: string[] | null; training_zone: string | null; }
export async function loadWeekPlans(club: string, from: string, to: string): Promise<WeekPlan[]> {
  const { data, error } = await sb.from("session_plans").select("id, title, squad_id, intended_date, micro_session_id, total_distance_m, stroke_skills, training_zone")
    .eq("club_id", clubIdOf(club)).gte("intended_date", from).lte("intended_date", to);
  if (error) throw error;
  return (data ?? []) as WeekPlan[];
}

type MicroX = Micro & { macroTitle: string; seasonId: string };
/** "Break day" (ticked in the micro-cycle) or "Season break", else "". */
export function breakLabel(ctx: SeasonCtx | undefined, date: string, micro: MicroX | null): string {
  if (micro && (micro.break_days || []).map(Number).includes(isoDow(date))) return "Break day";
  const b = (ctx?.breaks || []).find(x => date >= x.break_start && date <= x.break_end && (!micro || x.season_id === micro.seasonId));
  return b ? "Season break" : "";
}
export interface WeekRow { ts: TtSession; m: MicroSession | null; plan: WeekPlan | null; }
export interface WeekDay { date: string; dow: number; rows: WeekRow[]; brk: string; }
export interface WeekCard { squadId: string; name: string; micro: MicroX | null; seasonTitle: string | null; comp: { name: string; date_from: string } | null; days: WeekDay[]; total: number; written: number; missing: number; }

export function microOfWeek(ctx: SeasonCtx | undefined, squadId: string, wk: string): MicroX | null {
  if (!ctx) return null;
  for (const m of ctx.macros) {
    if (!(m.macro_squads || []).some(x => x.squad_id === squadId && x.is_active)) continue;
    for (let d = 0; d < 7; d++) {
      const date = isoAdd(wk, d);
      const hit = (m.micros || []).find(mi => mi.is_active && mi.week_commencing && mi.week_commencing <= date && isoAdd(mi.week_commencing, 6) >= date);
      if (hit) return { ...hit, macroTitle: m.title, seasonId: m.season_id };
    }
  }
  return null;
}

export function buildWeekCard(sq: { id: string; name: string }, tts: Timetable[], wk: string, ctx: SeasonCtx | undefined, plans: WeekPlan[]): WeekCard {
  const micro = microOfWeek(ctx, sq.id, wk);
  const card: WeekCard = { squadId: sq.id, name: sq.name, micro, seasonTitle: null, comp: null, days: [], total: 0, written: 0, missing: 0 };
  if (micro && ctx) {
    card.seasonTitle = ctx.seasons.find(s => s.id === micro.seasonId)?.title ?? null;
    const wc = micro.week_commencing!;
    card.comp = ctx.comps.find(c => c.date_from >= isoAdd(wc, 5) && c.date_from <= isoAdd(wc, 7)) ?? null;
  }
  for (let d = 0; d < 7; d++) {
    const date = isoAdd(wk, d), dow = d + 1;
    const t = tts.find(x => x.season_start <= date && x.season_end >= date);
    const slots = t ? (t.timetable_sessions || []).filter(x => x.is_active !== false && x.day_of_week === dow).sort((a, b) => a.start_time.localeCompare(b.start_time)) : [];
    const brk = breakLabel(ctx, date, micro);
    const ms = micro && ctx ? ctx.sessions.filter(x => x.micro_id === micro.id && x.squad_id === sq.id && x.session_date === date) : [];
    const dayPlans = plans.filter(p => p.squad_id === sq.id && p.intended_date === date);
    const rows: WeekRow[] = slots.map(ts => {
      const m = ms.find(x => x.start_time === ts.start_time) || null;
      return { ts, m, plan: m ? dayPlans.find(p => p.micro_session_id === m.id) || null : null };
    });
    // Plans not tied to a specific session fill the remaining sessions in time order.
    const used = new Set(rows.filter(r => r.plan).map(r => r.plan!.id));
    const spare = dayPlans.filter(p => !used.has(p.id));
    rows.forEach(r => { if (!r.plan && spare.length) r.plan = spare.shift()!; });
    if (!brk) rows.forEach(r => { card.total++; if (r.plan) card.written++; else card.missing++; });
    card.days.push({ date, dow, rows, brk });
  }
  return card;
}

// ---------------------------------------------------------------------------
// Season overview (one panel per squad)
// ---------------------------------------------------------------------------
/** For each squad, this week's micro in the season (or the next one coming up). */
export function pickMicros(ctx: SeasonCtx, seasonId: string, squads: { id: string }[], today: string): Record<string, MicroX | null> {
  const out: Record<string, MicroX | null> = {};
  for (const sq of squads) {
    const list: MicroX[] = [];
    ctx.macros.filter(m => m.season_id === seasonId && (m.macro_squads || []).some(x => x.squad_id === sq.id && x.is_active))
      .forEach(m => (m.micros || []).forEach(mi => { if (mi.is_active && mi.week_commencing) list.push({ ...mi, macroTitle: m.title, seasonId: m.season_id }); }));
    list.sort((a, b) => a.week_commencing!.localeCompare(b.week_commencing!));
    out[sq.id] = list.find(mi => mi.week_commencing! <= today && isoAdd(mi.week_commencing!, 6) >= today) || list.find(mi => mi.week_commencing! > today) || null;
  }
  return out;
}
export async function loadPlansBetween(club: string, from: string, to: string) {
  const { data, error } = await sb.from("session_plans").select("id, squad_id, intended_date").eq("club_id", clubIdOf(club)).gte("intended_date", from).lte("intended_date", to).not("squad_id", "is", null);
  if (error) throw error;
  return (data ?? []) as { id: string; squad_id: string; intended_date: string }[];
}

// ---------------------------------------------------------------------------
// Planning: season title, dates, breaks; competitions and macros lists
// ---------------------------------------------------------------------------
export interface BreakRow { id: string | null; start: string; end: string; }
export interface PlanningComp extends SeasonComp { total_days: number | null; venue_name: string | null; venue_url: string | null; competition_events: { id: string; is_active: boolean }[]; }
export interface PlanningMacro {
  id: string; title: string; head_coach_note: string | null; micro_count: number;
  macro_squads: { squad_id: string; is_active: boolean; squads: { name: string } | null }[];
  macro_competitions: { season_competition_id: string; designation: string; is_active: boolean }[];
}

export async function loadBreaks(seasonId: string): Promise<BreakRow[]> {
  const { data, error } = await sb.from("season_breaks").select("id, break_start, break_end").eq("season_id", seasonId).eq("is_active", true).order("break_start");
  if (error) throw error;
  return ((data ?? []) as { id: string; break_start: string; break_end: string }[]).map(b => ({ id: b.id, start: b.break_start, end: b.break_end }));
}
export async function loadPlanningLists(seasonId: string): Promise<{ comps: PlanningComp[]; macros: PlanningMacro[] }> {
  const [c, m] = await Promise.all([
    sb.from("season_competitions").select("*, competition_events(id, is_active)").eq("season_id", seasonId).eq("is_active", true).order("date_from"),
    sb.from("macros").select("id, title, head_coach_note, micro_count, macro_squads(squad_id, is_active, squads(name)), macro_competitions(season_competition_id, designation, is_active)")
      .eq("season_id", seasonId).eq("is_active", true).order("created_at")
  ]);
  if (c.error) throw c.error;
  if (m.error) throw m.error;
  return { comps: (c.data ?? []) as unknown as PlanningComp[], macros: (m.data ?? []) as unknown as PlanningMacro[] };
}

export function validateSeason(title: string, start: string, finish: string, breaks: BreakRow[]): string | null {
  if (!title.trim()) return "Give the season a title.";
  if (!start || !finish) return "Set the season start and finish dates.";
  if (finish < start) return "The season finish date must be on or after the start date.";
  for (let i = 0; i < breaks.length; i++) {
    const b = breaks[i];
    if (!b.start || !b.end) return `Break ${i + 1}: set both dates, or remove it.`;
    if (b.end < b.start) return `Break ${i + 1}: finish must be on or after start.`;
    if (b.start < start || b.end > finish) return `Break ${i + 1} must fall inside the season.`;
  }
  return null;
}

/** One active season per club at a time. Returns the season id. */
export async function saveSeason(club: string, seasonId: string | null, title: string, start: string, finish: string, breaks: BreakRow[], removedBreakIds: string[]): Promise<string> {
  const row = { ...clubCols(club), title: title.trim(), start_date: start, finish_date: finish, updated_at: now() };
  const { data: others, error: oe } = await sb.from("seasons").select("id, title").eq("club_id", clubIdOf(club)).eq("is_active", true).lte("start_date", finish).gte("finish_date", start);
  if (oe) throw oe;
  const clash = ((others ?? []) as { id: string; title: string }[]).find(o => o.id !== seasonId);
  if (clash) throw new Error(`These dates overlap “${clash.title}”. Change the dates.`);
  let id = seasonId;
  if (id) {
    const { error } = await sb.from("seasons").update(row as never).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await sb.from("seasons").insert(row as never).select("id").single();
    if (error) throw error;
    id = (data as { id: string }).id;
  }
  for (const b of breaks) {
    const p = { season_id: id, break_start: b.start, break_end: b.end, updated_at: now() };
    if (b.id) { const { error } = await sb.from("season_breaks").update(p as never).eq("id", b.id); if (error) throw error; }
    else { const { data, error } = await sb.from("season_breaks").insert(p as never).select("id").single(); if (error) throw error; b.id = (data as { id: string }).id; }
  }
  if (removedBreakIds.length) {
    const { error } = await sb.from("season_breaks").update({ is_active: false } as never).in("id", removedBreakIds);
    if (error) throw error;
  }
  return id!;
}

export async function disableRow(table: "season_competitions" | "macros", id: string) {
  const { error } = await sb.from(table).update({ is_active: false, disabled_at: now() } as never).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Competition (season event) form
// ---------------------------------------------------------------------------
export interface ScrapedComp { id: string; name: string; date_start: string; date_end: string | null; level: number | null; course: string | null; town_city: string | null; website_url: string | null; gala_id: string | null; }
export async function loadScrapedInSeason(s: Season): Promise<ScrapedComp[]> {
  const { data, error } = await sb.from("competitions").select("id, name, date_start, date_end, level, course, town_city, website_url, gala_id")
    .gte("date_start", s.start_date).lte("date_start", s.finish_date).order("date_start");
  if (error) throw error;
  return (data ?? []) as ScrapedComp[];
}
export interface EvState { id: string | null; ticked: boolean; session: string; prog: string; }
export async function loadCompEvents(seasonCompId: string): Promise<Record<number, EvState>> {
  const { data, error } = await sb.from("competition_events").select("id, event_no, session, programme_event_no, is_active").eq("season_competition_id", seasonCompId);
  if (error) throw error;
  const out: Record<number, EvState> = {};
  ((data ?? []) as { id: string; event_no: number; session: string | null; programme_event_no: string | null; is_active: boolean }[])
    .forEach(r => { out[r.event_no] = { id: r.id, ticked: r.is_active, session: r.session || "", prog: r.programme_event_no || "" }; });
  return out;
}
export interface CompDraft { id: string | null; competitionId: string | null; name: string; course: string; level: string; from: string; to: string; venue: string; url: string; events: Record<number, EvState>; }
export function validateComp(d: CompDraft): string | null {
  if (!d.name.trim()) return "A competition needs a name.";
  if (!d.course) return "Choose SC or LC.";
  if (!d.from || !d.to) return "Set the From and To dates.";
  if (d.to < d.from) return "The To date must be on or after the From date.";
  if (d.url.trim() && !/^https?:\/\//i.test(d.url.trim())) return "The website link must start with http:// or https://";
  return null;
}
export async function saveComp(seasonId: string, d: CompDraft): Promise<string> {
  const row = {
    season_id: seasonId, competition_id: d.competitionId, name: d.name.trim(), course: d.course, level: d.level ? +d.level : null,
    date_from: d.from, date_to: d.to, venue_name: d.venue.trim() || null, venue_url: d.url.trim() || null, updated_at: now()
  };
  if (d.id) { const { error } = await sb.from("season_competitions").update(row as never).eq("id", d.id); if (error) throw error; }
  else { const { data, error } = await sb.from("season_competitions").insert(row as never).select("id").single(); if (error) throw error; d.id = (data as { id: string }).id; }
  for (const [no, sc, lc] of EVENTS_18) {
    const st = d.events[no];
    if (!st) continue;
    const on = st.ticked && (d.course === "LC" ? !!lc : true);
    const p = { season_competition_id: d.id, event_no: no, course: d.course, event_name: d.course === "LC" ? lc || sc : sc,
      session: st.session.trim() || null, programme_event_no: st.prog.trim() || null, is_active: on, updated_at: now() };
    if (st.id) { const { error } = await sb.from("competition_events").update(p as never).eq("id", st.id); if (error) throw error; }
    else if (on) { const { data, error } = await sb.from("competition_events").insert(p as never).select("id").single(); if (error) throw error; st.id = (data as { id: string }).id; }
  }
  return d.id!;
}

// ---------------------------------------------------------------------------
// Macro form
// ---------------------------------------------------------------------------
export interface MacroDraft { id: string | null; title: string; note: string; count: string; squads: Set<string>; prevSquads: Set<string>; comps: Record<string, string>; prevComps: Set<string>; }
export function validateMacro(d: MacroDraft): string | null {
  const n = parseInt(d.count, 10);
  if (!d.squads.size) return "Tick at least one squad.";
  if (!d.title.trim()) return "Give the macro a title.";
  if (!(n >= 1 && n <= 52)) return "Enter a number of micro-cycles between 1 and 52.";
  return null;
}
export async function saveMacro(seasonId: string, d: MacroDraft): Promise<string> {
  const t = now();
  const row = { season_id: seasonId, title: d.title.trim(), head_coach_note: d.note.trim() || null, micro_count: parseInt(d.count, 10), updated_at: t };
  if (d.id) { const { error } = await sb.from("macros").update(row as never).eq("id", d.id); if (error) throw error; }
  else { const { data, error } = await sb.from("macros").insert(row as never).select("id").single(); if (error) throw error; d.id = (data as { id: string }).id; }
  const sqRows = [...new Set([...d.squads, ...d.prevSquads])].map(id => ({ macro_id: d.id, squad_id: id, is_active: d.squads.has(id) }));
  if (sqRows.length) { const { error } = await sb.from("macro_squads").upsert(sqRows as never, { onConflict: "macro_id,squad_id" }); if (error) throw error; }
  const mcRows = Object.entries(d.comps).filter(([, v]) => v).map(([id, v]) => ({ macro_id: d.id, season_competition_id: id, designation: v, is_active: true, updated_at: t }));
  if (mcRows.length) { const { error } = await sb.from("macro_competitions").upsert(mcRows as never, { onConflict: "macro_id,season_competition_id" }); if (error) throw error; }
  const dropped = [...d.prevComps].filter(id => !d.comps[id]);
  if (dropped.length) {
    const { error } = await sb.from("macro_competitions").update({ is_active: false, updated_at: t } as never).eq("macro_id", d.id!).in("season_competition_id", dropped);
    if (error) throw error;
  }
  return d.id!;
}

// ---------------------------------------------------------------------------
// Micro-cycles: one card per week, sessions seeded from the squads' timetables
// ---------------------------------------------------------------------------
export interface MiSession { id: string | null; squad_id: string; session_date: string; start_time: string | null; end_time: string | null; timetable_session_id: string | null; stroke_focus: string; outline: string; }
export interface MiWeek { id: string | null; no: number; wc: string; meso: string; qes: string; tech: string; breakDays: Set<number>; saved: MiSession[]; sessions: MiSession[]; }
export interface MiData {
  macro: { id: string; title: string; micro_count: number; season_id: string };
  squads: { id: string; name: string }[];
  weeks: MiWeek[];
  comps: { id: string; name: string; date_from: string; date_to: string | null }[];
  timetables: { id: string; squad_id: string; season_start: string; season_end: string; timetable_sessions: TtSession[] }[];
  breaks: { break_start: string; break_end: string }[];
}

export async function loadMicroWeeks(macroId: string, season: Season | null, today: string): Promise<MiData> {
  const { data: macro, error } = await sb.from("macros").select("id, title, micro_count, season_id, macro_squads(squad_id, is_active, squads(name))").eq("id", macroId).single();
  if (error) throw error;
  type M = MiData["macro"] & { macro_squads: { squad_id: string; is_active: boolean; squads: { name: string } | null }[] };
  const m = macro as unknown as M;
  const squads = (m.macro_squads || []).filter(x => x.is_active).map(x => ({ id: x.squad_id, name: x.squads?.name || "Squad" }));
  const sqIds = squads.map(s => s.id);
  const [mi, sc, tt, br] = await Promise.all([
    sb.from("micros").select("id, week_no, week_commencing, meso, qes_focus, technical_focus, break_days, micro_sessions(id, squad_id, session_date, start_time, end_time, stroke_focus, outline, timetable_session_id, is_active)")
      .eq("macro_id", macroId).eq("is_active", true).order("week_no"),
    sb.from("season_competitions").select("id, name, date_from, date_to").eq("season_id", m.season_id).eq("is_active", true),
    sqIds.length
      ? sb.from("timetables").select("id, squad_id, season_start, season_end, timetable_sessions(id, day_of_week, start_time, end_time, pool_size, is_active)").in("squad_id", sqIds).eq("is_active", true)
      : Promise.resolve({ data: [], error: null }),
    sb.from("season_breaks").select("break_start, break_end").eq("season_id", m.season_id).eq("is_active", true)
  ]);
  for (const r of [mi, sc, tt, br]) if (r.error) throw r.error;
  type E = { id: string; week_no: number; week_commencing: string | null; meso: number | null; qes_focus: string | null; technical_focus: number | null; break_days: number[] | null; micro_sessions: (MiSession & { is_active: boolean; stroke_focus: string | null; outline: string | null })[] };
  const existing = (mi.data ?? []) as unknown as E[];
  const weeks: MiWeek[] = [];
  for (let n = 1; n <= m.micro_count; n++) {
    const e = existing.find(x => x.week_no === n), prev = weeks[n - 2];
    const wc = e?.week_commencing ? e.week_commencing
      : prev?.wc ? isoAdd(prev.wc, 7)
      : n === 1 && season ? isoMonday(season.start_date > today ? season.start_date : today) : "";
    weeks.push({
      id: e?.id ?? null, no: n, wc, meso: e?.meso ? String(e.meso) : "", qes: e?.qes_focus || "", tech: e?.technical_focus ? String(e.technical_focus) : "",
      breakDays: new Set((e?.break_days || []).map(Number)),
      saved: (e?.micro_sessions || []).filter(s => s.is_active).map(s => ({ ...s, stroke_focus: s.stroke_focus || "", outline: s.outline || "" })),
      sessions: []
    });
  }
  const data: MiData = {
    macro: { id: m.id, title: m.title, micro_count: m.micro_count, season_id: m.season_id }, squads, weeks,
    comps: (sc.data ?? []) as MiData["comps"], timetables: (tt.data ?? []) as unknown as MiData["timetables"], breaks: (br.data ?? []) as MiData["breaks"]
  };
  data.weeks = data.weeks.map(w => seedWeek(data, w));
  return data;
}
const isoMonday = (iso: string) => isoAdd(iso, 1 - isoDow(iso));
export const inSeasonBreak = (d: Pick<MiData, "breaks">, iso: string) => d.breaks.some(b => iso >= b.break_start && iso <= b.break_end);

/** Rebuild a week's session rows from each squad's timetable, keeping anything already typed or saved. */
export function seedWeek(d: Pick<MiData, "squads" | "timetables" | "breaks">, w: MiWeek): MiWeek {
  const keep: Record<string, MiSession> = {};
  [...w.saved, ...w.sessions].forEach(s => { keep[`${s.squad_id}|${s.session_date}|${s.start_time || ""}`] = s; });
  const sessions: MiSession[] = [];
  if (w.wc) {
    for (let k = 0; k < 7; k++) {
      const date = isoAdd(w.wc, k), dow = isoDow(date);
      if (inSeasonBreak(d, date) || w.breakDays.has(dow)) continue;
      for (const sq of d.squads) {
        const t = d.timetables.find(x => x.squad_id === sq.id && x.season_start <= date && x.season_end >= date);
        if (!t) continue;
        (t.timetable_sessions || []).filter(s => s.is_active && s.day_of_week === dow).sort((a, b) => a.start_time.localeCompare(b.start_time)).forEach(ts => {
          const key = `${sq.id}|${date}|${ts.start_time}`, old = keep[key];
          sessions.push({ id: old?.id ?? null, squad_id: sq.id, session_date: date, start_time: ts.start_time, end_time: ts.end_time || null, timetable_session_id: ts.id, stroke_focus: old?.stroke_focus || "", outline: old?.outline || "" });
          if (old) delete keep[key];
        });
      }
    }
    // Saved sessions whose timetable slot has gone stay visible, so nothing typed is lost.
    Object.values(keep).forEach(s => {
      if (s.id && !w.breakDays.has(isoDow(s.session_date)) && s.session_date >= w.wc && s.session_date <= isoAdd(w.wc, 6)) sessions.push({ ...s });
    });
  }
  sessions.sort((a, b) => a.session_date.localeCompare(b.session_date) || (a.start_time || "").localeCompare(b.start_time || ""));
  return { ...w, sessions };
}

/** "" = none, "*" = sessions that day differ, else the shared value. */
export function dayStroke(w: MiWeek, date: string): string {
  const vals = [...new Set(w.sessions.filter(s => s.session_date === date).map(s => (s.stroke_focus || "").trim()))];
  return vals.length > 1 ? "*" : vals[0] || "";
}
export function daySummary(w: MiWeek): string {
  if (!w.wc) return "";
  const bits: string[] = [];
  for (let k = 0; k < 7; k++) { const v = dayStroke(w, isoAdd(w.wc, k)); if (v) bits.push(`${DAYS_SHORT[k + 1]} ${v === "*" ? "Mixed" : v}`); }
  return bits.join(" · ");
}

export async function saveMicros(d: MiData): Promise<MiWeek[]> {
  const missing = d.weeks.find(w => !w.wc);
  if (missing) throw new Error(`Week ${missing.no}: set the week commencing date.`);
  const t = now(), macroId = d.macro.id;
  const { data: saved, error } = await sb.from("micros").upsert(d.weeks.map(w => ({
    macro_id: macroId, week_no: w.no, week_commencing: w.wc, meso: w.meso ? +w.meso : null, qes_focus: w.qes || null,
    technical_focus: w.tech ? +w.tech : null, break_days: [...w.breakDays].sort((a, b) => a - b), is_active: true, updated_at: t
  })) as never, { onConflict: "macro_id,week_no" }).select("id, week_no");
  if (error) throw error;
  const weeks = d.weeks.map(w => ({ ...w, sessions: w.sessions.map(s => ({ ...s })) }));
  ((saved ?? []) as { id: string; week_no: number }[]).forEach(r => { const w = weeks.find(x => x.no === r.week_no); if (w) w.id = r.id; });
  // Weeks beyond the macro's count are disabled, not erased.
  const { error: e2 } = await sb.from("micros").update({ is_active: false, updated_at: t } as never).eq("macro_id", macroId).gt("week_no", d.macro.micro_count);
  if (e2) throw e2;
  for (const w of weeks) {
    const keepIds: string[] = [];
    for (const s of w.sessions) {
      const p = { micro_id: w.id, squad_id: s.squad_id, session_date: s.session_date, start_time: s.start_time, end_time: s.end_time,
        timetable_session_id: s.timetable_session_id || null, stroke_focus: s.stroke_focus.trim() || null, outline: s.outline.trim() || null, is_active: true, updated_at: t };
      if (s.id) { const { error } = await sb.from("micro_sessions").update(p as never).eq("id", s.id); if (error) throw error; }
      else { const { data, error } = await sb.from("micro_sessions").insert(p as never).select("id").single(); if (error) throw error; s.id = (data as { id: string }).id; }
      keepIds.push(s.id!);
    }
    let q = sb.from("micro_sessions").update({ is_active: false, updated_at: t } as never).eq("micro_id", w.id!).eq("is_active", true);
    if (keepIds.length) q = q.not("id", "in", `(${keepIds.join(",")})`);
    const { error: e3 } = await q;
    if (e3) throw e3;
    w.saved = w.sessions.map(s => ({ ...s }));
  }
  return weeks;
}

/** Drills from squad feedback for these weeks (squad_drill_weeks). */
export interface SdwRow { micro_id: string; squad_id: string; drill_id: string; drill_name: string; reason: string; }
export async function loadSquadDrillWeeks(microIds: string[], squadIds: string[]): Promise<SdwRow[]> {
  if (!microIds.length) return [];
  let q = sb.from("squad_drill_weeks").select("micro_id, squad_id, drill_id, drills_library(id, drill_name, stroke), squad_feedback(category, criterion, status)").in("micro_id", microIds).eq("is_active", true);
  if (squadIds.length) q = q.in("squad_id", squadIds);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  type R = { micro_id: string; squad_id: string; drill_id: string; drills_library: { drill_name: string } | null; squad_feedback: { category: string; criterion: string | null; status: string | null } | null };
  return ((data ?? []) as unknown as R[]).filter(r => r.drills_library).map(r => ({
    micro_id: r.micro_id, squad_id: r.squad_id, drill_id: r.drill_id, drill_name: r.drills_library!.drill_name,
    reason: [r.squad_feedback?.category, r.squad_feedback?.criterion, r.squad_feedback?.status].filter(Boolean).join(" · ")
  }));
}

// ---------------------------------------------------------------------------
// Competitions (scraped list) and qualifying times
// ---------------------------------------------------------------------------
export interface Competition { id: string; name: string; license_number: string | null; date_start: string; date_end: string | null; level: number | null; course: string | null; pool_length_m: number | null; town_city: string | null; region: string | null; website_url: string | null; gala_id: string | null; }
export interface CompFile { competition_id: string; file_name: string | null; file_kind: string | null; source_url: string | null; public_url: string | null; }
export async function loadCompetitions(today: string) {
  const { data, error } = await sb.from("competitions")
    .select("id, name, license_number, date_start, date_end, level, course, pool_length_m, town_city, region, website_url, gala_id")
    .or(`date_end.gte.${today},and(date_end.is.null,date_start.gte.${today})`).order("date_start").limit(1000);
  if (error) throw error;
  const items = (data ?? []) as Competition[];
  const galaIds = [...new Set(items.map(c => c.gala_id).filter(Boolean))] as string[];
  const [fq, qq] = await Promise.all([
    sb.from("competition_files").select("competition_id, file_name, file_kind, file_ext, source_url, public_url, status").limit(2000),
    galaIds.length ? sb.from("qualifying_times").select("gala_id").in("gala_id", galaIds).limit(10000) : Promise.resolve({ data: [], error: null })
  ]);
  if (fq.error) console.error(fq.error);
  if (qq.error) console.error(qq.error);
  const files: Record<string, CompFile[]> = {};
  ((fq.data ?? []) as CompFile[]).forEach(f => { (files[f.competition_id] ||= []).push(f); });
  const qtCount: Record<string, number> = {};
  ((qq.data ?? []) as { gala_id: string }[]).forEach(r => { qtCount[r.gala_id] = (qtCount[r.gala_id] || 0) + 1; });
  return { items, files, qtCount };
}

export interface QtRow { event: string; gender: string; age_group: string; time_type: string; course: string; reference_age_type: string | null; swim_time: string | null; swim_time_display: string | null; has_standard: boolean; }
export function qtFmt(r: Pick<QtRow, "swim_time" | "swim_time_display">): string {
  if (r.swim_time_display) return r.swim_time_display;
  if (!r.swim_time) return "—";
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.swim_time);
  if (!m) return r.swim_time;
  const mins = +m[1] * 60 + +m[2], secs = (+m[3]).toFixed(2).padStart(5, "0");
  return mins ? `${mins}:${secs}` : secs;
}
/** Crosstab: one row per course/type/sex/event, one column per age group. */
export async function loadQtTable(galaId: string) {
  const { data, error } = await sb.from("qualifying_times").select("event, gender, age_group, time_type, course, reference_age_type, swim_time, swim_time_display, has_standard").eq("gala_id", galaId).limit(2000);
  if (error) throw error;
  const rows = (data ?? []) as QtRow[];
  const ages = [...new Set(rows.map(r => r.age_group))].sort((a, b) => (parseInt(a) || 99) - (parseInt(b) || 99) || String(a).localeCompare(b));
  const groups = new Map<string, { course: string; type: string; gender: string; event: string; t: Record<string, string> }>();
  rows.forEach(r => {
    const k = [r.course, r.time_type, r.gender, r.event].join("|");
    if (!groups.has(k)) groups.set(k, { course: r.course, type: r.time_type, gender: r.gender, event: r.event, t: {} });
    groups.get(k)!.t[r.age_group] = r.has_standard === false ? "—" : qtFmt(r);
  });
  const basis = [...new Set(rows.map(r => r.reference_age_type).filter(Boolean))].join("; ");
  return { ages, groups: [...groups.values()], basis, count: rows.length };
}
