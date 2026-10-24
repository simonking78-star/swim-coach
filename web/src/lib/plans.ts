import { sb } from "./supabase";
import { QES } from "./feedback";
import { isoAdd } from "./util";
import { clubIdOf, clubCols } from "./clubs";

// Session plans — same data, parser and rules as the current app's
// viewSession / viewPlanEditor / viewPlanView.

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
export interface HeadingBlock { type: "heading"; text: string; bold: boolean; underline: boolean; }
export interface SetBlock { type: "set"; text: string; drill_ids?: string[]; }
export interface RepeatBlock { type: "repeat_group"; reps: number; children: SetBlock[]; }
export interface NoteBlock { type: "note"; text: string; }
export interface DrillBlock { type: "drill"; drill_id: string | null; drill_name: string; }
export type Block = HeadingBlock | SetBlock | RepeatBlock | NoteBlock | DrillBlock;
export type BlockType = Block["type"];

export function blankBlock(type: BlockType): Block {
  switch (type) {
    case "heading": return { type, text: "", bold: true, underline: true };
    case "set": return { type, text: "", drill_ids: [] };
    case "repeat_group": return { type, reps: 1, children: [{ type: "set", text: "", drill_ids: [] }] };
    case "note": return { type, text: "" };
    case "drill": return { type, drill_id: null, drill_name: "" };
  }
}

/** "10 x 100 @2:00 Free" → 10 reps of 100 m = 1000 m, interval "2:00". Anything else is free text (0 m). */
export function parseSetLine(raw: string | null | undefined) {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d+)\s*[xX×]\s*(\d+)\b(.*)$/);
  if (!m) return null;
  const reps = parseInt(m[1], 10), dist = parseInt(m[2], 10);
  let rest = (m[3] || "").trim();
  let interval: string | null = null;
  const at = rest.indexOf("@");
  if (at >= 0) { interval = rest.slice(at + 1).trim() || null; rest = rest.slice(0, at).trim(); }
  return { reps, dist, interval, remainder: rest || null, distance_m: reps * dist };
}

export function blockDistance(b: Block | null | undefined): number {
  if (!b) return 0;
  if (b.type === "set") return parseSetLine(b.text)?.distance_m ?? 0;
  if (b.type === "repeat_group") return (Number(b.reps) || 0) * (b.children || []).reduce((s, c) => s + blockDistance(c), 0);
  return 0;
}
export const planDistance = (content: Block[] | null | undefined) => (content || []).reduce((s, b) => s + blockDistance(b), 0);

/** Drop blocks with nothing in them, as the current app does on save. */
export function pruneBlocks(blocks: Block[]): Block[] {
  return blocks.filter(b => {
    if (b.type === "repeat_group") return (b.children || []).some(c => c.text.trim());
    if (b.type === "drill") return !!b.drill_id;
    return (b.text || "").trim();
  });
}

// ---------------------------------------------------------------------------
// Focus: Stroke & Skills ticks + Training zone
// ---------------------------------------------------------------------------
export const SKILLS = ["FR", "BK", "Brs", "Fly", "IM", "Turns", "Trans.", "DLK", "Start", "Finish"];
export const SKILL_ALIASES: Record<string, string> = { Fr: "FR", Bk: "BK", Transitions: "Trans." };
export const ZONES = ["A1-3", "Threshold", "V02m", "LT/LP", "Sprint"];
export const normSkill = (k: string) => SKILL_ALIASES[k] || k;
export const TECH_FOCUS = ["", "Streamline", "Breathing", "Body Roll", "End of Stroke", "Power phase", "Initial Actions", "Recoveries", "Kicking"];

/** Suggested ticks and zone from the micro-cycle (session stroke focus, technical focus, QES focus). */
export function suggestFocus(ctx: MicroCtx | null): { skills: string[]; zone: string } {
  const skills = new Set<string>(); let zone = "";
  if (!ctx) return { skills: [], zone };
  const t = (ctx.session?.stroke_focus || "").toLowerCase();
  if (/\b(im|medley)\b/.test(t)) skills.add("IM");
  if (/\b(fr|free|freestyle|front ?crawl|crawl)\b/.test(t)) skills.add("FR");
  if (/\b(bk|back|backstroke)\b/.test(t)) skills.add("BK");
  if (/\bdlk\b|dolphin ?kick|underwater/.test(t)) skills.add("DLK");
  if (/\b(br|brs|breast|breaststroke)\b/.test(t)) skills.add("Brs");
  if (/\b(fly|butterfly)\b/.test(t)) skills.add("Fly");
  if (/turn/.test(t)) skills.add("Turns");
  if (/transition|changeover/.test(t)) skills.add("Trans.");
  if (/\b(start|starts|dive|dives)\b/.test(t)) skills.add("Start");
  if (/finish/.test(t)) skills.add("Finish");
  if (Number(ctx.micro.technical_focus) === 6) skills.add("Start");
  if (ctx.micro.qes_focus === "sprint") zone = "Sprint";
  else if (ctx.micro.qes_focus === "endurance") zone = "A1-3";
  return { skills: SKILLS.filter(k => skills.has(k)), zone };
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export interface Plan {
  id: string; title: string; content: Block[]; total_distance_m: number | null; squad_scope: string | null; squad_id: string | null;
  micro_id: string | null; micro_session_id: string | null; pool_size: string | null; intended_date: string | null;
  updated_at: string | null; stroke_skills: string[] | null; training_zone: string | null; notes?: string | null;
  macro?: string | null; meso?: string | null; club?: string | null;
}
const LIST_COLS = "id, title, total_distance_m, squad_scope, squad_id, micro_id, micro_session_id, pool_size, intended_date, updated_at, content, stroke_skills, training_zone";

export async function loadPlans(club: string): Promise<Plan[]> {
  const { data, error } = await sb.from("session_plans").select(LIST_COLS).eq("club_id", clubIdOf(club)).order("intended_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as Plan[];
}
export async function loadPlan(id: string): Promise<Plan | null> {
  const { data, error } = await sb.from("session_plans").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as Plan | null;
}

export interface PlanDraft {
  title: string; content: Block[]; squadId: string; date: string; squadScope: string; pool: string | null;
  notes: string; skills: string[]; zone: string; ctx: MicroCtx | null; coach: string;
}

export function validatePlan(d: Pick<PlanDraft, "title" | "squadId" | "date">): string | null {
  if (!d.squadId) return "Choose the squad this plan is for.";
  if (!d.date) return "Set the session date.";
  if (!d.title.trim()) return "Give the plan a title.";
  return null;
}

/** Insert or update; then re-sync the plan's drill set-line drafts. Returns the plan id. */
export async function savePlan(club: string, id: string | null, d: PlanDraft): Promise<string> {
  const content = pruneBlocks(d.content);
  const payload = {
    title: d.title.trim(), content, total_distance_m: planDistance(content),
    squad_scope: d.squadScope.trim() || null, squad_id: d.squadId,
    micro_id: d.ctx?.micro.id ?? null, micro_session_id: d.ctx?.session?.id ?? null,
    macro: d.ctx?.micro.macroTitle ?? null, meso: d.ctx?.micro.meso ? String(d.ctx.micro.meso) : null,
    stroke_skills: d.skills, training_zone: d.zone || null, pool_size: d.pool,
    intended_date: d.date, notes: d.notes.trim() || null, updated_at: new Date().toISOString()
  };
  let planId = id;
  if (id) {
    const { error } = await sb.from("session_plans").update(payload as never).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await sb.from("session_plans").insert({ ...payload, ...clubCols(club), coach: d.coach } as never).select("id").single();
    if (error) throw error;
    planId = (data as { id: string }).id;
  }
  archiveSetLineDrafts(planId!, content, d.coach).catch(e => console.error("archive drafts:", e));
  return planId!;
}

/** Set lines that name a recognised drill, archived per plan (replaced on every save). */
export function collectDrillSetLines(content: Block[]) {
  const out: { drill_id: string; set_line_text: string }[] = [];
  const add = (b: SetBlock) => { if ((b.drill_ids || []).length && b.text?.trim()) b.drill_ids!.forEach(id => out.push({ drill_id: id, set_line_text: b.text.trim() })); };
  for (const b of content) {
    if (b.type === "set") add(b);
    if (b.type === "repeat_group") (b.children || []).forEach(add);
  }
  return out;
}
async function archiveSetLineDrafts(planId: string, content: Block[], coach: string) {
  const rows = collectDrillSetLines(content);
  await sb.from("drill_set_line_archive").delete().eq("session_plan_id", planId);
  if (!rows.length) return;
  const { error } = await sb.from("drill_set_line_archive").insert(rows.map(r => ({ ...r, session_plan_id: planId, coach })) as never);
  if (error) console.error("archive insert:", error);
}

/** Append drill blocks to an existing plan (from the Drills library). */
export async function appendDrillsToPlan(planId: string, blocks: DrillBlock[]) {
  const { data, error } = await sb.from("session_plans").select("content").eq("id", planId).single();
  if (error) throw error;
  const content = [...(((data as { content: Block[] | null }).content) || []), ...blocks];
  const { error: e2 } = await sb.from("session_plans").update({ content, total_distance_m: planDistance(content), updated_at: new Date().toISOString() } as never).eq("id", planId);
  if (e2) throw e2;
}
export async function createPlanWithDrills(club: string, title: string, date: string | null, blocks: DrillBlock[], coach: string): Promise<string> {
  const { data, error } = await sb.from("session_plans").insert({ title, content: blocks, total_distance_m: 0, intended_date: date, ...clubCols(club), coach } as never).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Season context: the micro-cycle week covering a squad + date
// ---------------------------------------------------------------------------
export interface Micro { id: string; week_no: number; week_commencing: string | null; meso: number | null; qes_focus: string | null; technical_focus: number | null; break_days: number[] | null; is_active: boolean; }
export interface MicroSession { id: string; micro_id: string; squad_id: string; session_date: string; start_time: string | null; end_time: string | null; stroke_focus: string | null; outline: string | null; }
export interface SeasonCtx {
  macros: { id: string; title: string; season_id: string; macro_squads: { squad_id: string; is_active: boolean }[]; micros: Micro[] }[];
  sessions: MicroSession[];
  comps: { id: string; season_id: string; competition_id: string | null; name: string; date_from: string; date_to: string | null; course: string; level: number | null }[];
  breaks: { season_id: string; break_start: string; break_end: string }[];
  seasons: { id: string; title: string; start_date: string; finish_date: string }[];
}
export interface MicroCtx {
  micro: Micro & { macroTitle: string; seasonId: string };
  session: MicroSession | null;
  daySessions: MicroSession[];
  comp: SeasonCtx["comps"][number] | null;
  season: { id: string; title: string } | null;
  isBreak: boolean;
}

export async function loadSeasonCtx(club: string): Promise<SeasonCtx> {
  const { data: seasons, error: se } = await sb.from("seasons").select("id, title, start_date, finish_date").eq("club_id", clubIdOf(club)).eq("is_active", true);
  if (se) throw se;
  const ids = (seasons ?? []).map(s => s.id as string);
  const out: SeasonCtx = { macros: [], sessions: [], comps: [], breaks: [], seasons: (seasons ?? []) as SeasonCtx["seasons"] };
  if (!ids.length) return out;
  const [mq, cq, bq] = await Promise.all([
    sb.from("macros").select("id, title, season_id, macro_squads(squad_id, is_active), micros(id, week_no, week_commencing, meso, qes_focus, technical_focus, break_days, is_active)").in("season_id", ids).eq("is_active", true),
    sb.from("season_competitions").select("id, season_id, competition_id, name, date_from, date_to, course, level").in("season_id", ids).eq("is_active", true),
    sb.from("season_breaks").select("season_id, break_start, break_end").in("season_id", ids).eq("is_active", true)
  ]);
  if (mq.error) throw mq.error; if (cq.error) throw cq.error; if (bq.error) throw bq.error;
  out.macros = (mq.data ?? []) as unknown as SeasonCtx["macros"];
  out.comps = (cq.data ?? []) as SeasonCtx["comps"];
  out.breaks = (bq.data ?? []) as SeasonCtx["breaks"];
  const microIds = out.macros.flatMap(m => (m.micros || []).filter(x => x.is_active).map(x => x.id));
  if (microIds.length) {
    const { data, error } = await sb.from("micro_sessions").select("id, micro_id, squad_id, session_date, start_time, end_time, stroke_focus, outline").in("micro_id", microIds).eq("is_active", true);
    if (error) throw error;
    out.sessions = (data ?? []) as MicroSession[];
  }
  return out;
}

const isoDow = (iso: string) => { const g = new Date(iso + "T00:00:00").getDay(); return g === 0 ? 7 : g; };

export function microFor(ctx: SeasonCtx | undefined, squadId: string | null, date: string | null, sessionId?: string | null): MicroCtx | null {
  if (!ctx || !squadId || !date) return null;
  let micro: MicroCtx["micro"] | null = null;
  for (const m of ctx.macros) {
    if (micro || !(m.macro_squads || []).some(x => x.squad_id === squadId && x.is_active)) continue;
    const hit = (m.micros || []).find(mi => mi.is_active && mi.week_commencing && mi.week_commencing <= date && isoAdd(mi.week_commencing, 6) >= date);
    if (hit) micro = { ...hit, macroTitle: m.title, seasonId: m.season_id };
  }
  if (!micro) return null;
  const daySessions = ctx.sessions.filter(x => x.micro_id === micro!.id && x.squad_id === squadId && x.session_date === date)
    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  const session = (sessionId && daySessions.find(x => x.id === sessionId)) || daySessions[0] || null;
  const wc = micro.week_commencing!;
  const comp = ctx.comps.find(c => c.date_from >= isoAdd(wc, 5) && c.date_from <= isoAdd(wc, 7)) || null;
  const season = ctx.seasons.find(x => x.id === micro!.seasonId) || null;
  const isBreak = (micro.break_days || []).map(Number).includes(isoDow(date)) ||
    ctx.breaks.some(b => b.season_id === micro!.seasonId && date >= b.break_start && date <= b.break_end);
  return { micro, session, daySessions, comp, season, isBreak };
}

export function microTags(mi: Micro): string[] {
  const t: string[] = [];
  if (mi.meso) t.push(`Meso ${mi.meso}`);
  if (mi.qes_focus) t.push(QES[mi.qes_focus] ?? mi.qes_focus);
  if (mi.technical_focus) t.push(`Technical: ${mi.technical_focus}. ${TECH_FOCUS[mi.technical_focus] ?? ""}`);
  return t;
}

/** "Mon 21/9, 6.30pm to 8pm" */
export function fmtWhen(iso: string, start?: string | null, end?: string | null) {
  const d = new Date(iso + "T00:00:00");
  let s = `${["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][isoDow(iso)]} ${d.getDate()}/${d.getMonth() + 1}`;
  const clock = (t: string) => { const h = parseInt(t.slice(0, 2), 10), m = t.slice(3, 5); return (h % 12 || 12) + (m === "00" ? "" : "." + m) + (h >= 12 ? "pm" : "am"); };
  if (start) s += ", " + clock(start) + (end ? " to " + clock(end) : "");
  return s;
}
export const fmtDayShort = (iso: string) => fmtWhen(iso);
export const fmtDayLong = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
export const isoMonday = (iso: string) => isoAdd(iso, 1 - isoDow(iso));

/** This week's drills for a squad, from squad feedback (squad_drill_weeks). */
export interface WeekDrill { drill_id: string; drill_name: string; reason: string; }
export async function loadWeekDrills(microId: string, squadId: string): Promise<WeekDrill[]> {
  const { data, error } = await sb.from("squad_drill_weeks")
    .select("drill_id, drills_library(id, drill_name, stroke), squad_feedback(category, criterion, status)")
    .eq("micro_id", microId).eq("squad_id", squadId).eq("is_active", true);
  if (error) throw error;
  type R = { drill_id: string; drills_library: { drill_name: string } | null; squad_feedback: { category: string; criterion: string | null; status: string | null } | null };
  const seen = new Set<string>();
  return ((data ?? []) as unknown as R[]).filter(r => r.drills_library && !seen.has(r.drill_id) && seen.add(r.drill_id)).map(r => ({
    drill_id: r.drill_id, drill_name: r.drills_library!.drill_name,
    reason: [r.squad_feedback?.category, r.squad_feedback?.criterion, r.squad_feedback?.status].filter(Boolean).join(" · ")
  }));
}

export async function loadSquadsWithIds(club: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await sb.from("squads").select("id, name").eq("club_id", clubIdOf(club)).order("name");
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}
