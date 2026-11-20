import type { SupabaseClient } from "@supabase/supabase-js";
import { sb } from "./supabase";
import { clubCols, clubIdOf } from "./clubs";
import { CATEGORIES } from "./feedback";
import { isoAdd } from "./util";
import { ZONES, type Block, type MicroCtx, type SeasonCtx, type SetBlock } from "./plans";

// Tables added for the free-text planner aren't in the generated types yet.
const db = sb as unknown as SupabaseClient;

// Session writer: free-form session planning inside Coach Tools (replicates the
// Free-Text Session Planner app). The coach writes in their own shorthand; the
// analyse-session-plan Edge Function turns it into blocks, sets and totals.

/** Session focus buttons: the Feedback Stroke/Skills list, stored as swimmer_feedback.category values. */
export const FOCUS = CATEGORIES;
/** Primary training focus (stored in session_plans.training_zone). */
export const PRIMARY = [...ZONES, "Race pace", "Technique", "Recovery"];
/** Feedback category → the older stroke_skills codes, so lists, tags and stats keep working. */
const CAT_SKILL: Record<string, string> = { Free: "FR", Back: "BK", Breast: "Brs", Fly: "Fly", Dive: "Start", Transition: "Trans.", "Touch turn": "Turns", "Tumble turn": "Turns" };
const SKILL_CAT: Record<string, string> = { FR: "Free", BK: "Back", Brs: "Breast", Fly: "Fly", Start: "Dive", "Trans.": "Transition" };
export const skillsFromFocus = (cats: string[]) => [...new Set(cats.map(c => CAT_SKILL[c]).filter(Boolean))];
export const focusFromSkills = (skills: string[]) => FOCUS.filter(c => skills.some(k => SKILL_CAT[k] === c));

// ---------------------------------------------------------------------------
// Analysis (Edge Function) types
// ---------------------------------------------------------------------------
export interface ASet {
  text: string; reps?: number; distance_m?: number; stroke?: string; kind?: string; effort?: string;
  interval_text?: string; interval_s?: number; target_text?: string; rest_s?: number; equipment?: string[];
  drill_name?: string; drill_id?: string; term_ids?: string[];
}
export interface ABlock { type: "heading" | "set" | "repeat_group" | "note"; text?: string; set?: ASet; reps?: number; label?: string; children?: ASet[]; }
export interface AFlag { term?: string; text: string; reason: string; checked?: boolean; explained?: boolean; }
export interface APlan {
  title: string; focus: string; training_zone?: string; stroke_skills?: string[]; main_set?: string; stated_total_m?: number;
  blocks: ABlock[]; flags: AFlag[];
}
export interface ATotals { total_m: number; by_stroke: Record<string, number>; by_type: Record<string, number>; by_zone: Record<string, number>; }
export interface Analysis { plan: APlan; totals: ATotals; parser_version: string; }
export interface Clarification { term: string; meaning: string; }

export async function analysePlan(args: {
  text: string; club: string; squadName: string; date: string; pool: string | null; ctx: MicroCtx | null;
  focus: string[]; primary: string; clarifications: Clarification[];
}): Promise<Analysis> {
  const { ctx } = args;
  const chosen = [args.focus.length ? `coach's chosen focus: ${args.focus.join(", ")}` : "", args.primary ? `primary training focus: ${args.primary}` : ""].filter(Boolean).join("; ");
  const { data, error } = await sb.functions.invoke("analyse-session-plan", {
    body: {
      text: args.text, club_id: clubIdOf(args.club), squad_name: args.squadName, date: args.date, pool_size: args.pool,
      clarifications: args.clarifications,
      context: ctx ? {
        meso: [ctx.micro.macroTitle, ctx.micro.meso ? `meso ${ctx.micro.meso}` : "", `week ${ctx.micro.week_no}`].filter(Boolean).join(", "),
        week_focus: [ctx.micro.qes_focus, chosen].filter(Boolean).join("; ") || undefined,
        stroke_focus: ctx.session?.stroke_focus || undefined,
        outline: ctx.session?.outline || undefined
      } : (chosen ? { week_focus: chosen } : {})
    }
  });
  if (error) {
    // The function sends a friendly message in its JSON body.
    let msg = error.message;
    try { const body = await (error as { context?: Response }).context?.json(); if (body?.error) msg = body.error; } catch { /* keep message */ }
    throw new Error(msg);
  }
  if (!data?.plan) throw new Error((data as { error?: string })?.error || "The AI didn't return a plan. Try again.");
  return data as Analysis;
}

/** Analysis blocks → the app's plan content (what Session plans, PDF and the usage log read). */
export function toContent(blocks: ABlock[]): Block[] {
  const set = (s: ASet): SetBlock => ({ type: "set", text: s.text, drill_ids: s.drill_id ? [s.drill_id] : [] });
  const out: Block[] = [];
  for (const b of blocks ?? []) {
    if (b.type === "heading" && b.text?.trim()) out.push({ type: "heading", text: b.text.trim(), bold: true, underline: true });
    else if (b.type === "note" && b.text?.trim()) out.push({ type: "note", text: b.text.trim() });
    else if (b.type === "set" && b.set?.text) out.push(set(b.set));
    else if (b.type === "repeat_group" && (b.children ?? []).length) {
      if (b.label?.trim()) out.push({ type: "note", text: b.label.trim() });
      out.push({ type: "repeat_group", reps: b.reps || 1, children: b.children!.filter(c => c?.text).map(set) });
    }
  }
  return out;
}

/** One row per set for session_plan_sets. */
export function toSetRows(blocks: ABlock[], planId: string, clubId: string) {
  const rows: Record<string, unknown>[] = [];
  let section: string | null = null;
  const add = (s: ASet, groupReps: number, label: string | null) => {
    const reps = s.reps ?? 1;
    rows.push({
      session_plan_id: planId, club_id: clubId, set_order: rows.length + 1, section, group_label: label, group_reps: groupReps,
      reps, distance_m: s.distance_m ?? null, total_m: s.distance_m ? reps * s.distance_m * groupReps : null,
      stroke: s.stroke ?? null, kind: s.kind ?? null, effort: s.effort ?? null, interval_text: s.interval_text ?? null,
      interval_s: s.interval_s ?? null, target_text: s.target_text ?? null, rest_s: s.rest_s ?? null,
      equipment: s.equipment?.length ? s.equipment : null, drill_id: s.drill_id ?? null, drill_name: s.drill_name ?? null, description: s.text
    });
  };
  for (const b of blocks ?? []) {
    if (b.type === "heading") section = b.text?.trim() || section;
    if (b.type === "set" && b.set) add(b.set, 1, null);
    if (b.type === "repeat_group") for (const c of b.children ?? []) add(c, b.reps || 1, b.label?.trim() || null);
  }
  return rows;
}

/** Older block plans opened in the writer: their content as text, one line per block. */
export function contentToText(content: Block[] | null | undefined): string {
  const lines: string[] = [];
  for (const b of content ?? []) {
    if (b.type === "heading") { if (lines.length) lines.push(""); lines.push(b.text); }
    else if (b.type === "set" || b.type === "note") lines.push(b.text);
    else if (b.type === "drill") lines.push(b.drill_name);
    else if (b.type === "repeat_group") { lines.push(`${b.reps}x`); for (const c of b.children ?? []) lines.push("  " + c.text); }
  }
  return lines.join("\n").trim();
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------
export interface WriterDraft {
  id: string | null; club: string; coach: string; title: string; text: string; squadId: string; date: string; pool: string | null;
  focus: string[]; primary: string; ctx: MicroCtx | null; analysis: Analysis | null; flags: AFlag[];
}

let hasFocusCol = true;
const missingFocusCol = (e: { message?: string } | null) => !!e && /focus_categories/.test(e.message || "");

/** Insert or update the plan. With no new analysis (text unchanged) only the details are updated. */
export async function saveWritten(d: WriterDraft): Promise<string> {
  const base: Record<string, unknown> = {
    title: d.title.trim(), squad_id: d.squadId, intended_date: d.date, pool_size: d.pool,
    micro_id: d.ctx?.micro.id ?? null, micro_session_id: d.ctx?.session?.id ?? null,
    macro: d.ctx?.micro.macroTitle ?? null, meso: d.ctx?.micro.meso ? String(d.ctx.micro.meso) : null,
    training_zone: d.primary || d.analysis?.plan.training_zone || null,
    stroke_skills: d.focus.length ? skillsFromFocus(d.focus) : (d.analysis?.plan.stroke_skills ?? []),
    focus_categories: d.focus, flags: d.flags, source: "freetext", updated_at: new Date().toISOString()
  };
  if (d.analysis) {
    const a = d.analysis;
    Object.assign(base, {
      raw_text: d.text, content: toContent(a.plan.blocks), total_distance_m: a.totals.total_m || 0,
      session_focus: a.plan.focus || null, main_set: a.plan.main_set || null,
      distance_by_stroke: a.totals.by_stroke, distance_by_type: a.totals.by_type, distance_by_zone: a.totals.by_zone,
      parsed_at: new Date().toISOString(), parser_version: a.parser_version
    });
  }
  const write = async (row: Record<string, unknown>) => d.id
    ? sb.from("session_plans").update(row as never).eq("id", d.id).select("id, club_id").single()
    : sb.from("session_plans").insert({ ...row, ...clubCols(d.club), coach: d.coach } as never).select("id, club_id").single();
  if (!hasFocusCol) delete base.focus_categories;
  let res = await write(base);
  if (missingFocusCol(res.error)) { hasFocusCol = false; delete base.focus_categories; res = await write(base); }
  if (res.error) throw res.error;
  const { id, club_id } = res.data as { id: string; club_id: string };

  if (d.analysis) {
    const del = await db.from("session_plan_sets").delete().eq("session_plan_id", id);
    if (del.error) throw del.error;
    const rows = toSetRows(d.analysis.plan.blocks, id, club_id);
    if (rows.length) { const ins = await db.from("session_plan_sets").insert(rows as never); if (ins.error) throw ins.error; }
  }
  // Credit any registers already taken for this session (best effort).
  sb.rpc("link_attendance_to_plan" as never, { p_plan: id } as never).then(({ error }) => { if (error) console.warn("link registers:", error.message); });
  return id;
}

/** The coach's explanation of a term: kept in the club's planner glossary (feeds the club vocabulary). */
export async function saveExplanation(club: string, userId: string | undefined, coach: string, term: string, meaning: string) {
  const clubId = clubIdOf(club);
  const row = { club_id: clubId, term: term.trim(), meaning: meaning.trim(), created_by: userId ?? null, coach, updated_at: new Date().toISOString() };
  const ins = await db.from("planner_glossary").insert(row as never);
  if (!ins.error) return;
  if (ins.error.code !== "23505") throw ins.error;
  const upd = await db.from("planner_glossary").update({ meaning: row.meaning, updated_at: row.updated_at } as never).eq("club_id", clubId).ilike("term", row.term);
  if (upd.error) throw upd.error;
}

// ---------------------------------------------------------------------------
// Season context for the chosen date (right-hand top window)
// ---------------------------------------------------------------------------
export interface SeasonDetail {
  macroNote: string | null;
  macroWeeks: number; weekInMacro: number; macroFrom: string | null; macroTo: string | null;
  mesoFrom: string | null; mesoTo: string | null; mesoWeeks: number; weekInMeso: number;
  plannedVolume: number | null; plannedThisWeek: number; plansThisWeek: number;
  windows: { id: string; kind: string; title: string | null; starts_on: string; ends_on: string; note: string | null }[];
  nextComp: { name: string; date_from: string; days: number } | null;
}

export async function loadSeasonDetail(season: SeasonCtx, ctx: MicroCtx, squadId: string, date: string, planId: string | null): Promise<SeasonDetail> {
  const macro = season.macros.find(m => m.id && (m.micros || []).some(x => x.id === ctx.micro.id));
  const weeks = (macro?.micros || []).filter(x => x.is_active && x.week_commencing).sort((a, b) => a.week_commencing!.localeCompare(b.week_commencing!));
  const meso = ctx.micro.meso ? weeks.filter(x => x.meso === ctx.micro.meso) : [];
  const wc = ctx.micro.week_commencing!;
  const [mq, wq, pq] = await Promise.all([
    sb.from("macros").select("head_coach_note").eq("id", macro?.id ?? "").maybeSingle(),
    db.from("season_windows").select("id, kind, title, starts_on, ends_on, note, squad_id, squad_ids")
      .eq("season_id", ctx.micro.seasonId).eq("is_active", true).lte("starts_on", isoAdd(date, 14)).gte("ends_on", date).order("starts_on"),
    sb.from("session_plans").select("id, total_distance_m").eq("squad_id", squadId).gte("intended_date", wc).lte("intended_date", isoAdd(wc, 6))
  ]);
  const vq = await sb.from("micros").select("planned_volume_m").eq("id", ctx.micro.id).maybeSingle();
  type W = SeasonDetail["windows"][number] & { squad_id: string | null; squad_ids: string[] | null };
  const windows = ((wq.data ?? []) as W[]).filter(w => (!w.squad_id && !(w.squad_ids || []).length) || w.squad_id === squadId || (w.squad_ids || []).includes(squadId));
  const plans = ((pq.data ?? []) as { id: string; total_distance_m: number | null }[]).filter(p => p.id !== planId);
  const comp = season.comps.filter(c => c.season_id === ctx.micro.seasonId && c.date_from >= date).sort((a, b) => a.date_from.localeCompare(b.date_from))[0];
  const idx = (list: typeof weeks) => Math.max(1, list.findIndex(x => x.id === ctx.micro.id) + 1);
  return {
    macroNote: (mq.data as { head_coach_note: string | null } | null)?.head_coach_note ?? null,
    macroWeeks: weeks.length, weekInMacro: idx(weeks),
    macroFrom: weeks[0]?.week_commencing ?? null, macroTo: weeks.length ? isoAdd(weeks[weeks.length - 1].week_commencing!, 6) : null,
    mesoWeeks: meso.length, weekInMeso: meso.length ? idx(meso) : 0,
    mesoFrom: meso[0]?.week_commencing ?? null, mesoTo: meso.length ? isoAdd(meso[meso.length - 1].week_commencing!, 6) : null,
    plannedVolume: (vq.data as { planned_volume_m: number | null } | null)?.planned_volume_m ?? null,
    plannedThisWeek: plans.reduce((s, p) => s + (p.total_distance_m || 0), 0), plansThisWeek: plans.length,
    windows: windows.map(({ squad_id: _a, squad_ids: _b, ...w }) => w),
    nextComp: comp ? { name: comp.name, date_from: comp.date_from, days: Math.round((Date.parse(comp.date_from) - Date.parse(date)) / 86400000) } : null
  };
}

// ---------------------------------------------------------------------------
// Current feedback for the squad (right-hand bottom window)
// ---------------------------------------------------------------------------
export interface CurrentFb {
  thread_id: string; who: string; category: string; criterion: string | null; status: string | null;
  observation: string | null; remedial_action: string | null; note: string | null; session_date: string; coach: string | null;
  drill_name?: string | null;
}
type FbRow = Omit<CurrentFb, "who"> & { entry_type: string; created_at: string };

/** Latest entry of each feedback string, up to the chosen date; Embedded strings only when asked. */
function latest<T extends FbRow>(rows: T[], withEmbedded: boolean): T[] {
  const seen = new Set<string>(); const out: T[] = [];
  for (const r of rows) { if (seen.has(r.thread_id)) continue; seen.add(r.thread_id); out.push(r); }
  return out.filter(r => withEmbedded || r.status !== "Embedded");
}

export async function loadSwimmerFb(squadId: string, date: string, withEmbedded: boolean): Promise<CurrentFb[]> {
  const sw = await sb.from("swimmers").select("id, full_name").eq("squad_id", squadId).eq("active", true);
  if (sw.error) throw sw.error;
  const names = new Map(((sw.data ?? []) as { id: string; full_name: string }[]).map(s => [s.id, s.full_name]));
  if (!names.size) return [];
  const { data, error } = await sb.from("swimmer_feedback")
    .select("thread_id, swimmer_id, entry_type, category, criterion, status, observation, remedial_action, note, session_date, created_at, coach")
    .in("swimmer_id", [...names.keys()]).lte("session_date", date)
    .order("session_date", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
  if (error) throw error;
  const rows = (data ?? []) as (FbRow & { swimmer_id: string })[];
  return latest(rows, withEmbedded).map(r => ({ ...r, who: names.get(r.swimmer_id) ?? "Swimmer" }))
    .sort((a, b) => a.who.localeCompare(b.who) || b.session_date.localeCompare(a.session_date));
}

export async function loadSquadFb(squadId: string, date: string, withEmbedded: boolean): Promise<CurrentFb[]> {
  const { data, error } = await sb.from("squad_feedback")
    .select("thread_id, entry_type, category, criterion, status, observation, remedial_action, note, session_date, created_at, coach, drills_library(drill_name)")
    .eq("squad_id", squadId).eq("is_active", true).lte("session_date", date)
    .order("session_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  const rows = (data ?? []) as unknown as (FbRow & { drills_library: { drill_name: string } | null })[];
  return latest(rows, withEmbedded).map(r => ({ ...r, who: "Squad", drill_name: r.drills_library?.drill_name ?? null }));
}
