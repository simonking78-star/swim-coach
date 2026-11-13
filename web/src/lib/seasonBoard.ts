import { sb } from "./supabase";
import { isoAdd } from "./util";
import { isoDiffDays, isoDow } from "./season";

// Season Plan page (desktop) — data and layout maths for the calendar.
// Spec: claude/specs/season-plan-desktop.md (A-131 to A-143).

export type View = "annual" | "month" | "macro" | "meso" | "micro";
export const VIEWS: { key: View; label: string }[] = [
  { key: "annual", label: "Annual" }, { key: "month", label: "Month" }, { key: "macro", label: "Macro" },
  { key: "meso", label: "Meso" }, { key: "micro", label: "Micro" }
];

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
export interface BoardMicro { id: string; week_no: number; week_commencing: string | null; meso: number | null; qes_focus: string | null; technical_focus: number | null; planned_volume_m: number | null; break_days: number[] | null; }
export interface BoardMacro {
  id: string; title: string; colour: string | null;
  squadIds: string[];
  comps: { season_competition_id: string; designation: string }[];
  micros: BoardMicro[];
}
export interface BoardComp { id: string; competition_id: string | null; name: string; date_from: string; date_to: string | null; course: string; level: number | null; venue_name: string | null; }
export interface BoardWindow { id: string; kind: "test_set" | "squad_move"; squad_id: string | null; test_set_template_id: string | null; title: string; starts_on: string; ends_on: string; note: string | null; }
export interface BoardEvent { id: string; title: string; kind: string; starts_on: string; ends_on: string; squad_ids: string[] | null; location: string | null; note: string | null; }
export interface BoardPlan { id: string; squad_id: string | null; micro_id: string | null; intended_date: string | null; total_distance_m: number | null; title: string; }
export interface BoardSession { id: string; micro_id: string; squad_id: string; session_date: string; start_time: string | null; end_time: string | null; stroke_focus: string | null; }
export interface BoardData {
  macros: BoardMacro[]; comps: BoardComp[]; windows: BoardWindow[]; events: BoardEvent[];
  plans: BoardPlan[]; sessions: BoardSession[]; breaks: { start: string; end: string }[];
}

export async function loadBoard(seasonId: string, start: string, finish: string): Promise<BoardData> {
  const [mq, cq, wq, eq, bq, pq] = await Promise.all([
    sb.from("macros").select("id, title, colour, macro_squads(squad_id, is_active), macro_competitions(season_competition_id, designation, is_active), micros(id, week_no, week_commencing, meso, qes_focus, technical_focus, planned_volume_m, break_days, is_active)")
      .eq("season_id", seasonId).eq("is_active", true).order("created_at"),
    sb.from("season_competitions").select("id, competition_id, name, date_from, date_to, course, level, venue_name").eq("season_id", seasonId).eq("is_active", true).order("date_from"),
    sb.from("season_windows").select("id, kind, squad_id, test_set_template_id, title, starts_on, ends_on, note").eq("season_id", seasonId).eq("is_active", true).order("starts_on"),
    sb.from("club_events").select("id, title, kind, starts_on, ends_on, squad_ids, location, note").eq("season_id", seasonId).eq("is_active", true).order("starts_on"),
    sb.from("season_breaks").select("break_start, break_end").eq("season_id", seasonId).eq("is_active", true),
    sb.from("session_plans").select("id, squad_id, micro_id, intended_date, total_distance_m, title").gte("intended_date", start).lte("intended_date", finish)
  ]);
  for (const r of [mq, cq, wq, eq, bq, pq]) if (r.error) throw r.error;
  type RawMacro = { id: string; title: string; colour: string | null; macro_squads: { squad_id: string; is_active: boolean }[];
    macro_competitions: { season_competition_id: string; designation: string; is_active: boolean }[]; micros: (BoardMicro & { is_active: boolean })[] };
  const macros: BoardMacro[] = ((mq.data ?? []) as unknown as RawMacro[]).map(m => ({
    id: m.id, title: m.title, colour: m.colour,
    squadIds: (m.macro_squads || []).filter(x => x.is_active).map(x => x.squad_id),
    comps: (m.macro_competitions || []).filter(x => x.is_active).map(x => ({ season_competition_id: x.season_competition_id, designation: x.designation })),
    micros: (m.micros || []).filter(x => x.is_active && x.week_commencing).sort((a, b) => a.week_commencing!.localeCompare(b.week_commencing!))
  }));
  const microIds = macros.flatMap(m => m.micros.map(x => x.id));
  let sessions: BoardSession[] = [];
  if (microIds.length) {
    const { data, error } = await sb.from("micro_sessions").select("id, micro_id, squad_id, session_date, start_time, end_time, stroke_focus").in("micro_id", microIds).eq("is_active", true);
    if (error) throw error;
    sessions = (data ?? []) as BoardSession[];
  }
  return {
    macros,
    comps: (cq.data ?? []) as BoardComp[],
    windows: (wq.data ?? []) as BoardWindow[],
    events: (eq.data ?? []) as BoardEvent[],
    breaks: ((bq.data ?? []) as { break_start: string; break_end: string }[]).map(b => ({ start: b.break_start, end: b.break_end })),
    plans: (pq.data ?? []) as BoardPlan[],
    sessions
  };
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------
export interface Col { start: string; end: string; part?: 1 | 2; }
export const monday = (iso: string) => isoAdd(iso, 1 - isoDow(iso));
export const monthLabel = (iso: string, long = false) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", long ? { month: "long", year: "numeric" } : { month: "short" });

/** Annual: 52 weeks (more if the season runs past 52) from the season's first Monday, two columns a week. */
export function annualCols(seasonStart: string, seasonFinish: string): Col[] {
  const first = monday(seasonStart);
  const weeks = Math.max(52, Math.ceil((isoDiffDays(first, seasonFinish) + 1) / 7));
  const cols: Col[] = [];
  for (let w = 0; w < weeks; w++) {
    const m = isoAdd(first, w * 7);
    cols.push({ start: m, end: isoAdd(m, 4), part: 1 }, { start: isoAdd(m, 5), end: isoAdd(m, 6), part: 2 });
  }
  return cols;
}
export function dayCols(from: string, to: string): Col[] {
  const cols: Col[] = [];
  for (let d = from; d <= to; d = isoAdd(d, 1)) cols.push({ start: d, end: d });
  return cols;
}
/** Whole weeks covering a calendar month. */
export function monthRange(anchor: string): [string, string] {
  const first = anchor.slice(0, 8) + "01";
  const d = new Date(first + "T00:00:00"); d.setMonth(d.getMonth() + 1); d.setDate(0);
  const last = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return [monday(first), isoAdd(monday(last), 6)];
}
export const shiftMonth = (anchor: string, n: number) => {
  const d = new Date(anchor.slice(0, 8) + "01T00:00:00"); d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

/** Grid columns an item covers (inclusive indices), or null when it falls outside. */
export function span(cols: Col[], from: string, to: string | null | undefined): [number, number] | null {
  const end = to && to >= from ? to : from;
  let a = -1, b = -1;
  for (let i = 0; i < cols.length; i++) {
    if (a < 0 && cols[i].end >= from) a = i;
    if (cols[i].start <= end) b = i;
  }
  if (a < 0 || b < 0 || b < a) return null;
  return [a, b];
}

/** Brackets: consecutive runs of columns sharing a key. */
export function brackets(cols: Col[], key: (c: Col) => string | null, label: (c: Col, k: string) => string) {
  const out: { key: string; label: string; a: number; b: number; date: string }[] = [];
  cols.forEach((c, i) => {
    const k = key(c);
    if (k == null) return;
    const last = out[out.length - 1];
    if (last && last.key === k && last.b === i - 1) last.b = i;
    else out.push({ key: k, label: label(c, k), a: i, b: i, date: c.start });
  });
  return out;
}
/** A week belongs to the month of its Thursday (ISO rule). */
export const weekMonth = (c: Col) => isoAdd(monday(c.start), 3).slice(0, 7);

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
export type CompKind = "team" | "train_through" | "qualifying" | "target" | "unset";
export const COMP_KIND: Record<CompKind, { label: string; shape: "block" | "dot"; cls: string }> = {
  team:          { label: "Team event",      shape: "block", cls: "k-team" },
  target:        { label: "Target",          shape: "block", cls: "k-target" },
  qualifying:    { label: "Qualifying",      shape: "dot",   cls: "k-qual" },
  train_through: { label: "Train-through",   shape: "dot",   cls: "k-tt" },
  unset:         { label: "Type not set",    shape: "dot",   cls: "k-unset" }
};
export const EVENT_KIND: Record<string, { label: string; icon: string }> = {
  social: { label: "Social", icon: "🎉" }, open_water: { label: "Open water", icon: "🌊" },
  fundraiser: { label: "Fundraiser", icon: "💷" }, other: { label: "Club event", icon: "📌" }
};

export type BoardItem =
  | { t: "comp"; id: string; from: string; to: string; kind: CompKind; comp: BoardComp; macroTitle: string | null }
  | { t: "window"; id: string; from: string; to: string; w: BoardWindow }
  | { t: "event"; id: string; from: string; to: string; e: BoardEvent };

/** Everything on one squad's events row. Competitions take the type the squad's macro gives them. */
export function squadItems(d: BoardData, squadId: string): BoardItem[] {
  const items: BoardItem[] = [];
  const mine = d.macros.filter(m => m.squadIds.includes(squadId));
  const linkedAnywhere = new Set(d.macros.flatMap(m => m.comps.map(c => c.season_competition_id)));
  for (const c of d.comps) {
    const link = mine.flatMap(m => m.comps.filter(x => x.season_competition_id === c.id).map(x => ({ ...x, macro: m.title })))[0];
    if (link) items.push({ t: "comp", id: c.id, from: c.date_from, to: c.date_to || c.date_from, kind: (link.designation as CompKind) in COMP_KIND ? link.designation as CompKind : "unset", comp: c, macroTitle: link.macro });
    else if (!linkedAnywhere.has(c.id)) items.push({ t: "comp", id: c.id, from: c.date_from, to: c.date_to || c.date_from, kind: "unset", comp: c, macroTitle: null });
  }
  for (const w of d.windows) if (!w.squad_id || w.squad_id === squadId) items.push({ t: "window", id: w.id, from: w.starts_on, to: w.ends_on, w });
  for (const e of d.events) if (!e.squad_ids?.length || e.squad_ids.includes(squadId)) items.push({ t: "event", id: e.id, from: e.starts_on, to: e.ends_on, e });
  return items.sort((a, b) => a.from.localeCompare(b.from));
}

/** Greedy lanes: up to `max` lanes, the rest counted as overflow per column. */
export function laneItems<T extends { a: number; b: number }>(items: T[], max = 3) {
  const ends: number[] = [];
  const placed: (T & { lane: number })[] = [];
  const over: T[] = [];
  for (const it of items.slice().sort((x, y) => x.a - y.a)) {
    let lane = ends.findIndex(e => e < it.a);
    if (lane < 0 && ends.length < max) { lane = ends.length; ends.push(-1); }
    if (lane < 0) { over.push(it); continue; }
    ends[lane] = it.b;
    placed.push({ ...it, lane });
  }
  return { placed, over, lanes: Math.max(1, ends.length) };
}

export interface WeekCell { micro: BoardMicro; macro: BoardMacro; from: string; metres: number | null; planned: boolean; }

/** One squad's training weeks with planned metres: session plans first, else the week's planned volume. */
export function squadWeeks(d: BoardData, squadId: string): WeekCell[] {
  const out: WeekCell[] = [];
  for (const m of d.macros.filter(x => x.squadIds.includes(squadId))) {
    for (const mi of m.micros) {
      const wc = mi.week_commencing!;
      const plans = d.plans.filter(p => p.squad_id === squadId && (p.micro_id === mi.id || (!p.micro_id && p.intended_date && p.intended_date >= wc && p.intended_date <= isoAdd(wc, 6))));
      const sum = plans.reduce((n, p) => n + (p.total_distance_m || 0), 0);
      const metres = sum > 0 ? sum : mi.planned_volume_m ?? null;
      out.push({ micro: mi, macro: m, from: wc, metres, planned: sum > 0 });
    }
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

/** Shade 1 (lightest) … 5 (deep blue) by the squad's own quintiles. 0 = no volume. */
export function shader(values: number[]) {
  const v = values.filter(x => x > 0).sort((a, b) => a - b);
  const q = [0.2, 0.4, 0.6, 0.8].map(p => v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : 0);
  const fn = (x: number | null) => (!x || x <= 0 ? 0 : x <= q[0] ? 1 : x <= q[1] ? 2 : x <= q[2] ? 3 : x <= q[3] ? 4 : 5);
  return { fn, min: v[0] ?? null, max: v[v.length - 1] ?? null };
}

/** Meso runs inside a macro: consecutive weeks with the same meso number. */
export function mesoRuns(m: BoardMacro) {
  const runs: { meso: number | null; from: string; to: string; weeks: BoardMicro[] }[] = [];
  for (const mi of m.micros) {
    const last = runs[runs.length - 1];
    if (last && last.meso === mi.meso && isoDiffDays(last.to, mi.week_commencing!) <= 7) { last.to = isoAdd(mi.week_commencing!, 6); last.weeks.push(mi); }
    else runs.push({ meso: mi.meso, from: mi.week_commencing!, to: isoAdd(mi.week_commencing!, 6), weeks: [mi] });
  }
  return runs;
}
export const macroRange = (m: BoardMacro): [string, string] | null =>
  m.micros.length ? [m.micros[0].week_commencing!, isoAdd(m.micros[m.micros.length - 1].week_commencing!, 6)] : null;

/** Colour for a macro: its own, else one from a fixed palette by position. */
const MACRO_PALETTE = ["#6a4c93", "#1982c4", "#8ac926", "#ff924c", "#c5283d", "#2a9d8f", "#e9c46a", "#3a506b"];
export const macroColour = (m: BoardMacro, i: number) => m.colour || MACRO_PALETTE[i % MACRO_PALETTE.length];
const MESO_PALETTE = ["#9ad1d4", "#f6bd60", "#cdb4db", "#a8dadc", "#ffc8dd", "#bde0fe"];
export const mesoColour = (meso: number | null) => (meso == null ? "#d9dee5" : MESO_PALETTE[(meso - 1) % MESO_PALETTE.length]);

// ---------------------------------------------------------------------------
// Editors: windows, club events, registrations, competition standard.
// club_id is never sent: the database copies it from the season (or competition).
// ---------------------------------------------------------------------------
const now = () => new Date().toISOString();
export async function saveWindow(seasonId: string, w: Omit<BoardWindow, "id"> & { id?: string | null }) {
  const row = { season_id: seasonId, kind: w.kind, squad_id: w.squad_id || null, test_set_template_id: w.kind === "test_set" ? w.test_set_template_id || null : null,
    title: w.title.trim(), starts_on: w.starts_on, ends_on: w.ends_on, note: w.note?.trim() || null };
  const r = w.id ? await sb.from("season_windows").update(row as never).eq("id", w.id) : await sb.from("season_windows").insert({ ...row } as never);
  if (r.error) throw r.error;
}
export async function saveEvent(seasonId: string, e: Omit<BoardEvent, "id"> & { id?: string | null }) {
  const row = { season_id: seasonId, title: e.title.trim(), kind: e.kind, starts_on: e.starts_on, ends_on: e.ends_on,
    squad_ids: e.squad_ids?.length ? e.squad_ids : null, location: e.location?.trim() || null, note: e.note?.trim() || null };
  const r = e.id ? await sb.from("club_events").update(row as never).eq("id", e.id) : await sb.from("club_events").insert({ ...row } as never);
  if (r.error) throw r.error;
}
export async function disableBoardRow(table: "season_windows" | "club_events", id: string) {
  const { error } = await sb.from(table).update({ is_active: false, updated_at: now() } as never).eq("id", id);
  if (error) throw error;
}

export interface RegSwimmer { id: string; full_name: string; squad_id: string | null; status: string | null; }
export async function loadRegistrations(compId: string, clubId: string, squadIds: string[] | null): Promise<RegSwimmer[]> {
  let q = sb.from("swimmers").select("id, full_name, squad_id").eq("club_id", clubId).eq("active", true).order("full_name");
  if (squadIds?.length) q = q.in("squad_id", squadIds);
  const [sw, reg] = await Promise.all([q, sb.from("competition_registrations").select("swimmer_id, status").eq("season_competition_id", compId)]);
  if (sw.error) throw sw.error;
  if (reg.error) throw reg.error;
  const st = new Map(((reg.data ?? []) as { swimmer_id: string; status: string }[]).map(r => [r.swimmer_id, r.status]));
  return ((sw.data ?? []) as { id: string; full_name: string; squad_id: string | null }[]).map(s => ({ ...s, status: st.get(s.id) ?? null }));
}
export async function setRegistration(compId: string, swimmerId: string, status: string | null) {
  if (!status) {
    const { error } = await sb.from("competition_registrations").delete().eq("season_competition_id", compId).eq("swimmer_id", swimmerId);
    if (error) throw error;
    return;
  }
  const { error } = await sb.from("competition_registrations").upsert(
    { season_competition_id: compId, swimmer_id: swimmerId, status, updated_at: now() } as never,
    { onConflict: "season_competition_id,swimmer_id" });
  if (error) throw error;
}

export interface Standard { county: string; cqt_gala_id: string; cqt_time_type: string; cct_gala_id: string | null; cct_time_type: string | null; age_at: string | null; }
export interface StandardOption { gala_id: string; gala: string; time_type: string; rows: number; }
export async function loadStandard(seasonId: string): Promise<(Standard & { confirmed_at: string }) | null> {
  const { data, error } = await sb.from("club_competition_standards").select("county, cqt_gala_id, cqt_time_type, cct_gala_id, cct_time_type, age_at, confirmed_at").eq("season_id", seasonId).maybeSingle();
  if (error) throw error;
  return data as (Standard & { confirmed_at: string }) | null;
}
/** Every standard on file (gala + time type), to choose CQT and CCT from. */
export async function loadStandardOptions(): Promise<StandardOption[]> {
  // Paged: the API returns at most 1,000 rows per request
  const rows: { gala_id: string; time_type: string; galas: { name: string } | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("qualifying_times").select("gala_id, time_type, galas(name)").not("swim_time", "is", null).order("id").range(from, from + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as typeof rows));
    if (!data || data.length < 1000) break;
  }
  const m = new Map<string, StandardOption>();
  for (const r of rows) {
    const k = r.gala_id + "|" + r.time_type;
    const o = m.get(k) || { gala_id: r.gala_id, gala: r.galas?.name || "Unnamed", time_type: r.time_type, rows: 0 };
    o.rows++; m.set(k, o);
  }
  return [...m.values()].sort((a, b) => a.gala.localeCompare(b.gala) || a.time_type.localeCompare(b.time_type));
}
export async function saveStandard(seasonId: string, s: Standard) {
  const { error } = await sb.from("club_competition_standards").upsert(
    { season_id: seasonId, ...s, confirmed_at: now() } as never, { onConflict: "season_id" });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Panels (public.season_plan_panels)
// ---------------------------------------------------------------------------
export interface Panels {
  season: { id: string; title: string; start: string; finish: string; today: string };
  prev: { id: string; title: string; start: string; to: string } | null;
  attendance: { period: "this" | "prev"; squad_id: string; attended: number; counted: number; hours: number; metres: number; swimmer_weeks: number }[];
  weekly: { period: "this" | "prev"; squad_id: string; week: number; metres: number; hours: number; swimmers: number }[];
  sessions: { squad_id: string; available: number; completed: number; plans: number; plans_season: number }[];
  tests: { template_name: string; level: number | null; squad_id: string | null; n: number; median: number | null; min: number | null; max: number | null }[];
  standard: { county: string; age_at: string } | null;
  band_swimmers?: { squad_id: string | null; band: number; n: number }[];
  band_events?: { squad_id: string | null; band: number; n: number }[];
  band_unscored?: { squad_id: string | null; n: number }[];
  non_competitors: { squad_id: string | null; n: number; total: number }[];
  next_comp: { id: string; name: string; date: string; squads: { squad_id: string | null; eligible: number; registered: number }[] } | null;
}
export async function loadPanels(seasonId: string): Promise<Panels | null> {
  const { data, error } = await sb.rpc("season_plan_panels" as never, { p_season: seasonId } as never);
  if (error) throw error;
  return data as unknown as Panels | null;
}
export const BANDS = ["CQT", "CCT", "Within 5% of CCT", "Within 10% of CCT", "More than 10% off CCT"];
