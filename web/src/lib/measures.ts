import type { SupabaseClient } from "@supabase/supabase-js";
import { sb } from "./supabase";
import { looksOffline, queueWrite } from "./offline";
import { clubIdOf, clubNameOf } from "./clubs";
import type { TestModel } from "./tests";
import { uuid } from "./util";

// Metrics & Measures (claude/specs/metrics-and-measures.md).
// A protocol is a fixed test; a version locks its levels once published; a
// session runs one published version on any date; a result is one swimmer's
// outcome, linked by the database to their own baseline and previous result.
// The database works out values, baselines and change flags — screens only show them.

// The mm_* tables are newer than database.types.ts; regenerate the types after
// the migration reaches production and drop this cast.
const db = sb as unknown as SupabaseClient;

export type Kind = "reps" | "timed" | "checklist";
export type Status = "draft" | "pilot" | "live" | "retired";
export type Better = "higher" | "lower";
export type Cycle = "quality" | "endurance" | "sprint";
export const STREAMS = ["Academy", "Academy Plus", "Bronze", "Silver", "Gold", "Platinum"];

export interface RepsRound { key: string; name: string; stroke: string; reps: number; distance: number; interval: number | null; restAfterSec: number; }
export interface Level {
  key: string; label: string; streams: string[];
  rounds?: RepsRound[];                                   // reps
  stroke?: string; distance_m?: number; start?: "push" | "dive"; setup?: string; // timed
  criteria?: { key: string; label: string }[];            // checklist
}
export interface MeasureRule { unit?: "s" | "reps" | "points"; counts?: "best" | "mean_best_two" | "mean" | "single"; trials?: number; rest_s?: number; splits?: string[]; }
export interface Sheet { equipment?: string; pool_setup?: string; warm_up?: string; position?: string; procedure?: string; script?: string; safety?: string; recorded?: string; }

export interface Determinant { code: string; name: string; sort: number; }
export interface Protocol {
  id: string; club_id: string; code: string; name: string; determinant: string; kind: Kind; better: Better;
  question_ids: string[]; status: Status; fixed_date_only: boolean; description: string | null; updated_at: string;
}
export interface Version {
  id: string; protocol_id: string; major: number; minor: number; sheet: Sheet; levels: Level[]; measure: MeasureRule;
  intended_cycle: Cycle | null; min_gap_days: number; notes: string | null; published_at: string | null; created_at: string;
}
export interface Reliability { id: string; version_id: string; level_key: string; te: number; cv_pct: number | null; icc: number | null; swc: number | null; n: number | null; studied_on: string | null; decision: string | null; }
export interface MmSession {
  id: string; club_id: string; protocol_id: string; version_id: string; window_id: string | null; session_date: string;
  pool: string | null; course: "SC" | "LC" | null; cycle_focus: string | null; cycle_week_no: number | null; on_cycle: boolean | null;
  as_protocol: boolean; group_type: "club" | "squad" | "swimmers"; squad_id: string | null; swimmer_ids: string[];
  status: "live" | "closed"; clock_started_at: string | null; tester: string | null; notes: string | null; closed_at: string | null;
}
export type Flag = "baseline" | "improved" | "noise" | "declined" | "caution" | "no_reliability";
export interface MmResult {
  id?: string; session_id: string; swimmer_id: string; level_key: string; status: "recorded" | "not_tested";
  not_tested_reason?: string | null; raw: Record<string, unknown>; value?: number | null; legal?: boolean | null;
  conditions: { timing?: string; illness?: boolean; missed_training?: boolean }; note?: string | null; recorded_by?: string | null;
  session_date?: string; protocol_id?: string; version_id?: string; major?: number; age?: number | null; year_of_birth?: number | null;
  is_baseline?: boolean; baseline_id?: string | null; previous_id?: string | null; days_since_prev?: number | null; days_since_base?: number | null;
  change_prev?: number | null; change_base?: number | null; caution?: string[]; flag?: Flag | null; rebaseline_reason?: string | null;
  exposure?: ExposureSnap | null;
}
export interface Trial { id?: string; result_id: string; trial_no: number; variant?: string; time_s: number | null; splits: Record<string, number | null>; stroke_count?: number | null; legal: boolean; illegal_reason?: string | null; }

// ---------------------------------------------------------------------------
// Labels and pure helpers
// ---------------------------------------------------------------------------
export const STATUS_LABEL: Record<Status, string> = { draft: "Draft", pilot: "Pilot", live: "Live", retired: "Retired" };
export const KIND_LABEL: Record<Kind, string> = { reps: "Repeat set (reps completed)", timed: "Timed trials", checklist: "Skills checklist" };
export const COUNTS_LABEL: Record<string, string> = { best: "Best trial", mean_best_two: "Mean of the best two", mean: "Mean of all trials", single: "Single trial" };
export const CYCLE_LABEL: Record<string, string> = { quality: "Quality", endurance: "Endurance", sprint: "Sprint" };
export const FLAG_LABEL: Record<Flag, string> = {
  baseline: "Baseline", improved: "Real improvement", noise: "Within noise", declined: "Real decline",
  caution: "Compare with caution", no_reliability: "Change shown — no reliability values yet"
};
export const CAUTION_LABEL: Record<string, string> = {
  off_cycle: "not in the protocol's cycle week", not_as_protocol: "not run as written", short_gap: "too soon after the last test", pilot: "pilot test"
};
export const NOT_TESTED = ["Unwell", "Injured", "Returning from a break", "Absent", "Other"];
export const TIMING = [["video", "Video"], ["hand2", "Hand, two timers"], ["hand1", "Hand, one timer"], ["pad", "Touch pads"]] as const;

export const versionLabel = (v: Pick<Version, "major" | "minor">) => `v${v.major}.${v.minor}`;
export const unitOf = (p: Protocol, v: Version) => v.measure.unit ?? (p.kind === "reps" ? "reps" : p.kind === "checklist" ? "points" : "s");

export function fmtValue(x: number | null | undefined, unit: string): string {
  if (x == null) return "–";
  if (unit === "s") return x >= 60 ? `${Math.floor(x / 60)}:${(x % 60).toFixed(2).padStart(5, "0")}` : `${x.toFixed(2)} s`;
  return `${Math.round(x * 10) / 10} ${unit}`;
}
/** Change is stored so that positive = better. */
export function fmtChange(x: number | null | undefined, unit: string): string {
  if (x == null) return "–";
  const n = unit === "s" ? `${Math.abs(x).toFixed(2)} s` : `${Math.round(Math.abs(x) * 10) / 10} ${unit}`;
  return x === 0 ? `no change` : `${x > 0 ? "better by" : "worse by"} ${n}`;
}

/** Default level for a swimmer: the first level that lists their squad's stream. */
export function defaultLevelKey(levels: Level[], squad: string | null): string | null {
  if (!levels.length) return null;
  const s = (squad ?? "").toLowerCase();
  const hit = levels.find(l => l.streams?.some(st => s.includes(st.toLowerCase())));
  return hit?.key ?? null;
}

/** Same rule as the database, for live display while trials are being entered. */
export function trialValue(trials: Pick<Trial, "time_s" | "legal">[], counts: MeasureRule["counts"] = "best", better: Better = "lower"): number | null {
  const t = trials.filter(x => x.legal && x.time_s != null).map(x => x.time_s as number).sort((a, b) => a - b);
  if (!t.length) return null;
  if (counts === "mean_best_two") return t.length >= 2 ? Math.round(((t[0] + t[1]) / 2) * 1000) / 1000 : null;
  if (counts === "mean") return Math.round((t.reduce((a, b) => a + b, 0) / t.length) * 1000) / 1000;
  if (counts === "best" && better === "higher") return t[t.length - 1];
  return t[0];
}

/** A reps level as a Test & Assess model, so the live pace clock can be reused. */
export function repsModel(l: Level): TestModel {
  return {
    ageBanded: false, minAge: 8, maxAge: 18, fixedLevel: 1,
    rounds: (l.rounds ?? []).map(r => ({ key: r.key, name: r.name, stroke: r.stroke, restAfterSec: r.restAfterSec, values: { all: { reps: r.reps, distance: r.distance, interval: r.interval } } }))
  };
}

export function levelSummary(p: Protocol, l: Level): string {
  if (p.kind === "reps") return (l.rounds ?? []).map(r => `${r.reps} × ${r.distance} ${r.stroke === "Individual Medley" ? "IM" : r.stroke}${r.interval ? ` @ ${Math.floor(r.interval / 60)}:${String(r.interval % 60).padStart(2, "0")}` : ""}`).join(", then ");
  if (p.kind === "timed") return [l.stroke, l.distance_m ? `${l.distance_m} m` : null, l.start ? `${l.start} start` : null].filter(Boolean).join(" · ");
  return `${l.criteria?.length ?? 0} criteria, scored 1–3`;
}

/** Problems that stop a version being published. */
export function publishProblems(p: Protocol, v: Version): string[] {
  const out: string[] = [];
  if (!v.levels.length) out.push("Add at least one level.");
  const keys = new Set<string>();
  for (const l of v.levels) {
    if (!l.key || keys.has(l.key)) out.push(`Level keys must be unique (${l.key || "blank"}).`);
    keys.add(l.key);
    if (!l.label.trim()) out.push(`Level ${l.key} needs a name.`);
    if (p.kind === "reps" && !(l.rounds ?? []).length) out.push(`${l.label || l.key}: add a round.`);
    if (p.kind === "reps") for (const r of l.rounds ?? []) if (!(r.reps > 0 && r.distance > 0)) out.push(`${l.label}: ${r.name} needs reps and distance.`);
    if (p.kind === "timed" && !(l.distance_m && l.distance_m > 0)) out.push(`${l.label || l.key}: set the distance.`);
    if (p.kind === "checklist" && !(l.criteria ?? []).length) out.push(`${l.label || l.key}: add criteria.`);
  }
  if (p.kind === "timed" && !(v.measure.trials && v.measure.trials > 0)) out.push("Set the number of trials.");
  if (!v.sheet.procedure?.trim() || v.sheet.procedure.trim() === "To be written") out.push("Write the procedure on the protocol sheet.");
  return out;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const fail = (e: { message: string; code?: string } | null) => { if (e) throw new Error(e.code === "23505" ? "That code is already used in this club." : e.message); };

export async function loadDeterminants(): Promise<Determinant[]> {
  const { data, error } = await db.from("mm_determinants").select("code, name, sort").order("sort");
  fail(error); return (data ?? []) as Determinant[];
}
export async function loadProtocols(club: string): Promise<Protocol[]> {
  const { data, error } = await db.from("mm_protocols").select("*").eq("club_id", clubIdOf(club)).order("code");
  fail(error); return (data ?? []) as Protocol[];
}
export async function loadProtocol(id: string): Promise<{ protocol: Protocol; versions: Version[]; reliability: Reliability[] } | null> {
  const { data, error } = await db.from("mm_protocols").select("*").eq("id", id).maybeSingle();
  fail(error); if (!data) return null;
  const vs = await db.from("mm_protocol_versions").select("*").eq("protocol_id", id).order("major", { ascending: false }).order("minor", { ascending: false });
  fail(vs.error);
  const versions = (vs.data ?? []) as Version[];
  let reliability: Reliability[] = [];
  if (versions.length) {
    const rl = await db.from("mm_reliability").select("*").in("version_id", versions.map(v => v.id));
    fail(rl.error); reliability = (rl.data ?? []) as Reliability[];
  }
  return { protocol: data as Protocol, versions, reliability };
}
/** The newest published version of each protocol, for running tests. */
export async function loadRunnable(club: string): Promise<{ protocol: Protocol; version: Version }[]> {
  const ps = (await loadProtocols(club)).filter(p => p.status === "pilot" || p.status === "live");
  if (!ps.length) return [];
  const { data, error } = await db.from("mm_protocol_versions").select("*").in("protocol_id", ps.map(p => p.id)).not("published_at", "is", null)
    .order("major", { ascending: false }).order("minor", { ascending: false });
  fail(error);
  const out: { protocol: Protocol; version: Version }[] = [];
  for (const p of ps) { const v = (data as Version[]).find(x => x.protocol_id === p.id); if (v) out.push({ protocol: p, version: v }); }
  return out;
}

export async function saveProtocol(club: string, p: Partial<Protocol> & Pick<Protocol, "code" | "name" | "determinant" | "kind" | "better">): Promise<string> {
  const row = { code: p.code.trim().toUpperCase(), name: p.name.trim(), determinant: p.determinant, kind: p.kind, better: p.better,
    description: p.description?.trim() || null, fixed_date_only: !!p.fixed_date_only, question_ids: p.question_ids ?? [] };
  if (p.id) { const { error } = await db.from("mm_protocols").update(row).eq("id", p.id); fail(error); return p.id; }
  const { data, error } = await db.from("mm_protocols").insert({ ...row, club_id: clubIdOf(club), status: "draft" }).select("id").single();
  fail(error);
  const id = (data as { id: string }).id;
  await newVersion(id, null);
  return id;
}
export async function setProtocolStatus(id: string, status: Status) {
  const { error } = await db.from("mm_protocols").update({ status }).eq("id", id); fail(error);
}
/** A new draft version: a copy of `from` (minor bump) or a blank v1.0. */
export async function newVersion(protocolId: string, from: Version | null, major = false): Promise<string> {
  const row = from
    ? { protocol_id: protocolId, major: major ? from.major + 1 : from.major, minor: major ? 0 : from.minor + 1, sheet: from.sheet, levels: from.levels,
        measure: from.measure, intended_cycle: from.intended_cycle, min_gap_days: from.min_gap_days, notes: null }
    : { protocol_id: protocolId, major: 1, minor: 0, sheet: {}, levels: [], measure: {}, intended_cycle: "sprint", min_gap_days: 14 };
  const { data, error } = await db.from("mm_protocol_versions").insert(row).select("id").single();
  fail(error); return (data as { id: string }).id;
}
export async function saveVersion(v: Version) {
  const { error } = await db.from("mm_protocol_versions").update({
    sheet: v.sheet, levels: v.levels, measure: v.measure, intended_cycle: v.intended_cycle, min_gap_days: v.min_gap_days, notes: v.notes
  }).eq("id", v.id);
  fail(error);
}
export async function publishVersion(id: string) {
  const { error } = await db.from("mm_protocol_versions").update({ published_at: new Date().toISOString() }).eq("id", id); fail(error);
}
export async function saveReliability(r: Omit<Reliability, "id"> & { id?: string }) {
  const { error } = await db.from("mm_reliability").upsert(r, { onConflict: "version_id,level_key" }); fail(error);
}

export async function cycleWeek(club: string, squadId: string | null, date: string): Promise<{ focus: string | null; week_no: number | null } | null> {
  const { data, error } = await db.rpc("mm_cycle_week", { p_club: clubIdOf(club), p_squad: squadId, p_date: date });
  if (error) return null;
  return ((data as { focus: string | null; week_no: number | null }[]) ?? [])[0] ?? null;
}

export async function createSession(s: { window_id?: string | null; version_id: string; date: string; group_type: MmSession["group_type"]; squad_id: string | null; swimmer_ids: string[]; pool: string | null; course: "SC" | "LC" | null; as_protocol: boolean; tester: string | null; notes: string | null }): Promise<string> {
  const { data, error } = await db.from("mm_sessions").insert({
    version_id: s.version_id, window_id: s.window_id ?? null, session_date: s.date, group_type: s.group_type, squad_id: s.squad_id, swimmer_ids: s.swimmer_ids,
    pool: s.pool, course: s.course, as_protocol: s.as_protocol, tester: s.tester, notes: s.notes
  }).select("id").single();
  fail(error); return (data as { id: string }).id;
}
export async function loadSession(id: string): Promise<MmSession | null> {
  const { data, error } = await db.from("mm_sessions").select("*").eq("id", id).maybeSingle();
  fail(error); return (data as MmSession) ?? null;
}
export async function loadSessions(club: string, opts: { status?: "live" | "closed"; limit?: number } = {}): Promise<MmSession[]> {
  let q = db.from("mm_sessions").select("*").eq("club_id", clubIdOf(club)).order("session_date", { ascending: false }).order("created_at", { ascending: false });
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q.limit(opts.limit ?? 50);
  fail(error); return (data ?? []) as MmSession[];
}
export async function updateSession(id: string, patch: Partial<Pick<MmSession, "status" | "clock_started_at" | "closed_at" | "swimmer_ids" | "as_protocol" | "notes">>) {
  const { error } = await db.from("mm_sessions").update(patch).eq("id", id); fail(error);
}
export async function loadVersion(id: string): Promise<{ version: Version; protocol: Protocol } | null> {
  const { data, error } = await db.from("mm_protocol_versions").select("*, protocol:mm_protocols(*)").eq("id", id).maybeSingle();
  fail(error); if (!data) return null;
  const { protocol, ...version } = data as Version & { protocol: Protocol };
  return { version: version as Version, protocol };
}

const RES = "id, session_id, swimmer_id, level_key, status, not_tested_reason, raw, value, legal, conditions, note, recorded_by, session_date, protocol_id, version_id, major, age, year_of_birth, is_baseline, baseline_id, previous_id, days_since_prev, days_since_base, change_prev, change_base, caution, flag, rebaseline_reason, exposure";
export async function loadSessionResults(sessionId: string): Promise<MmResult[]> {
  const { data, error } = await db.from("mm_results").select(RES).eq("session_id", sessionId);
  fail(error); return (data ?? []) as MmResult[];
}
export async function loadSessionTrials(sessionId: string): Promise<Trial[]> {
  const { data, error } = await db.from("mm_trials").select("id, result_id, trial_no, variant, time_s, splits, stroke_count, legal, illegal_reason").eq("session_id", sessionId).order("trial_no");
  fail(error); return (data ?? []) as Trial[];
}
/** All results for a protocol in the club (closed sessions only carry links and flags). */
export async function loadProtocolResults(club: string, protocolId: string): Promise<MmResult[]> {
  const out: MmResult[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("mm_results").select(RES).eq("club_id", clubIdOf(club)).eq("protocol_id", protocolId).order("session_date").range(from, from + 999);
    fail(error); out.push(...((data ?? []) as MmResult[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Saves a result (not its trials). New results get their id here, so trials can be
 *  saved against it even when the result itself was queued offline. */
export async function saveResult(r: MmResult): Promise<{ id: string; queued: boolean }> {
  const id = r.id ?? uuid();
  const payload = { id, session_id: r.session_id, swimmer_id: r.swimmer_id, level_key: r.level_key, status: r.status, not_tested_reason: r.status === "not_tested" ? r.not_tested_reason ?? "Other" : null,
    raw: r.raw, conditions: r.conditions, note: r.note ?? null, recorded_by: r.recorded_by ?? null };
  const { error } = await db.from("mm_results").upsert(payload, { onConflict: "session_id,swimmer_id" });
  if (!error) return { id, queued: false };
  if (looksOffline(error)) { await queueWrite("mm_results", payload, { onConflict: "session_id,swimmer_id" }); return { id, queued: true }; }
  throw new Error(error.message);
}
export async function saveTrial(t: Trial): Promise<"saved" | "queued"> {
  const payload = { result_id: t.result_id, trial_no: t.trial_no, variant: t.variant ?? "", time_s: t.time_s, splits: t.splits, stroke_count: t.stroke_count ?? null, legal: t.legal, illegal_reason: t.legal ? null : t.illegal_reason ?? null };
  const { error } = await db.from("mm_trials").upsert(payload, { onConflict: "result_id,variant,trial_no" });
  if (!error) return "saved";
  if (looksOffline(error)) { await queueWrite("mm_trials", payload, { onConflict: "result_id,variant,trial_no" }); return "queued"; }
  throw new Error(error.message);
}
export async function removeResult(sessionId: string, swimmerId: string) {
  const { error } = await db.from("mm_results").delete().eq("session_id", sessionId).eq("swimmer_id", swimmerId); fail(error);
}
export async function setRebaseline(resultId: string, reason: string | null) {
  const { error } = await db.rpc("mm_set_rebaseline", { p_result: resultId, p_reason: reason }); fail(error);
}

export const clubOfSession = (s: MmSession) => clubNameOf(s.club_id) ?? "";

/** Parses "7.45", "1:05.3" or "65.3" into seconds. */
export function parseSeconds(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const m = t.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Training exposure (A-126, A-127)
// ---------------------------------------------------------------------------
export const WORK_TAGS: [string, string][] = [
  ["aerobic", "Aerobic / threshold"], ["speed", "Speed"], ["race_pace", "Race pace"], ["kick", "Kick"], ["pull", "Pull"],
  ["drill", "Drill / skill"], ["efficiency", "Stroke efficiency"], ["turns", "Turns"], ["starts", "Starts"],
  ["underwater", "Underwater / streamline"], ["recovery", "Recovery"], ["warm_up", "Warm-up"]
];
export const WORK_LABEL: Record<string, string> = { ...Object.fromEntries(WORK_TAGS), swim: "Untagged swim" };

export interface PlanLine { line_no: number; line_path: number[]; heading: string | null; text: string; mult: number; metres: number; tags: string[]; auto_tags: string[]; confirmed: boolean; strokes: string[]; drill_ids: string[]; }
export interface Exposure {
  from: string; to: string; days: number; sessions: number; sessions_offered: number; hours: number; with_plan: number; metres: number;
  by_tag: Record<string, number>; lines_by_tag: Record<string, number>; by_stroke: Record<string, number>; drills: Record<string, number>;
  per_week: { sessions: number; hours: number; metres: number } | null; plan_known_pct: number | null;
}
export interface ExposureSnap { since_prev: Exposure | null; since_base: Exposure | null; d90: Exposure; tenure_days: number | null; squad_days: number | null; taken_at: string; }

export async function loadPlanLines(planId: string): Promise<PlanLine[]> {
  const { data, error } = await db.rpc("mm_plan_lines", { p_plan: planId });
  fail(error); return (data ?? []) as PlanLine[];
}
/** Writes confirmed work tags into the plan's set blocks (by path), leaving everything else as it is. */
export async function saveWorkTags(planId: string, tags: { path: number[]; tags: string[] }[]) {
  const { data, error } = await db.from("session_plans").select("content").eq("id", planId).single();
  fail(error);
  const content = JSON.parse(JSON.stringify((data as { content: unknown[] }).content ?? [])) as Record<string, unknown>[];
  for (const t of tags) {
    const top = content[t.path[0]] as Record<string, unknown> | undefined;
    const block = t.path.length > 1 ? (top?.children as Record<string, unknown>[] | undefined)?.[t.path[1]] : top;
    if (block && block.type === "set") block.work = [...t.tags].sort();
  }
  const { error: e2 } = await db.from("session_plans").update({ content, updated_at: new Date().toISOString() }).eq("id", planId);
  fail(e2);
}
export interface PlanSummary { id: string; title: string; intended_date: string | null; squad_id: string | null; total_distance_m: number | null; lines: number; confirmed: number; }
/** Plans in a club with how many of their set lines have confirmed work tags. */
export async function loadPlanTagSummary(club: string): Promise<PlanSummary[]> {
  const { data, error } = await db.from("session_plans").select("id, title, intended_date, squad_id, total_distance_m, content").eq("club_id", clubIdOf(club))
    .order("intended_date", { ascending: false, nullsFirst: false }).limit(300);
  fail(error);
  return ((data ?? []) as { id: string; title: string; intended_date: string | null; squad_id: string | null; total_distance_m: number | null; content: unknown }[]).map(p => {
    let lines = 0, confirmed = 0;
    const visit = (b: Record<string, unknown>) => { if (b?.type === "set" && String(b.text ?? "").trim()) { lines++; if (Array.isArray(b.work)) confirmed++; } };
    for (const b of (Array.isArray(p.content) ? p.content : []) as Record<string, unknown>[]) {
      if (b?.type === "repeat_group") ((b.children as Record<string, unknown>[]) ?? []).forEach(visit); else visit(b);
    }
    return { id: p.id, title: p.title, intended_date: p.intended_date, squad_id: p.squad_id, total_distance_m: p.total_distance_m, lines, confirmed };
  });
}
export async function swimmerExposure(swimmerId: string, from: string, to: string): Promise<Exposure | null> {
  const { data, error } = await db.rpc("mm_swimmer_exposure", { p_swimmer: swimmerId, p_from: from, p_to: to });
  if (error) return null;
  return data as Exposure;
}
export async function refreshExposure(club: string): Promise<number> {
  const { data, error } = await db.rpc("mm_refresh_exposure", { p_club: clubIdOf(club) });
  fail(error); return data as number;
}

// ---------------------------------------------------------------------------
// Quick measures on feedback (A-125): lower reliability than a formal test,
// shown as a trend only. Codes line up with protocol codes where one exists.
// ---------------------------------------------------------------------------
export interface QuickMeasure { code: string; label: string; kind: "count" | "legal"; hint: string; min: number; max: number; }
const STROKE_CODE: Record<string, string> = { Free: "FR", Back: "BK", Breast: "BR", Fly: "FL" };
export function quickMeasureFor(category: string): QuickMeasure | null {
  if (STROKE_CODE[category]) return { code: `EFF-${STROKE_CODE[category]}`, label: "Stroke count over a clean 25 m", kind: "count", hint: "Count from the push-off breakout to the wall, at a steady effort", min: 1, max: 80 };
  if (category === "Tumble turn" || category === "Touch turn" || category === "Transition")
    return { code: `TRN-LG-${category === "Tumble turn" ? "TB" : category === "Touch turn" ? "TO" : "TX"}`, label: "Was the turn legal?", kind: "legal", hint: "As a judge would see it", min: 0, max: 1 };
  if (category === "Dive") return { code: "UWK-DV", label: "Underwater kicks to breakout", kind: "count", hint: "Kicks from entry to the first stroke", min: 0, max: 30 };
  return null;
}
export function fmtQuick(code: string | null | undefined, value: number | null | undefined): string | null {
  if (!code || value == null) return null;
  if (code.startsWith("TRN-LG")) return value ? "Turn legal" : "Turn illegal";
  if (code.startsWith("EFF")) return `Stroke count ${value} per 25 m`;
  if (code.startsWith("UWK")) return `${value} underwater kick${value === 1 ? "" : "s"} to breakout`;
  return `${code}: ${value}`;
}

export interface QuickRow { swimmer_id: string; measure_code: string; measure_value: number; session_date: string; category: string; }
export async function loadQuickMeasures(club: string): Promise<QuickRow[]> {
  const { data, error } = await db.from("swimmer_feedback").select("swimmer_id, measure_code, measure_value, session_date, category")
    .eq("club_id", clubIdOf(club)).not("measure_code", "is", null).not("measure_value", "is", null).order("session_date").limit(5000);
  fail(error); return (data ?? []) as QuickRow[];
}
export const QUICK_LABEL = (code: string) =>
  code.startsWith("EFF-") ? `Stroke count, ${({ FR: "Freestyle", BK: "Backstroke", BR: "Breaststroke", FL: "Butterfly" } as Record<string, string>)[code.slice(4)] ?? code}`
  : code.startsWith("TRN-LG-") ? `Turn legality, ${({ TB: "tumble turn", TO: "touch turn", TX: "transition" } as Record<string, string>)[code.slice(7)] ?? code}`
  : code === "UWK-DV" ? "Underwater kicks after the dive" : code;

// ---------------------------------------------------------------------------
// Testing windows (optional planned dates; required for fixed-date protocols)
// ---------------------------------------------------------------------------
export interface Window { id: string; club_id: string; name: string; kind: string; starts_on: string; ends_on: string; protocol_ids: string[]; active: boolean; }
export const WINDOW_KIND: Record<string, string> = { baseline: "Baseline", mid: "Mid-macro", end: "End-macro", novelty: "Novelty set", t_day: "T15–T30 day", pilot: "Pilot", other: "Other" };
export async function loadWindows(club: string): Promise<Window[]> {
  const { data, error } = await db.from("mm_windows").select("*").eq("club_id", clubIdOf(club)).eq("active", true).order("starts_on");
  fail(error); return (data ?? []) as Window[];
}
export async function saveWindow(club: string, w: Omit<Window, "id" | "club_id" | "active"> & { id?: string }) {
  const row = { name: w.name.trim(), kind: w.kind, starts_on: w.starts_on, ends_on: w.ends_on, protocol_ids: w.protocol_ids };
  const { error } = w.id ? await db.from("mm_windows").update(row).eq("id", w.id) : await db.from("mm_windows").insert({ ...row, club_id: clubIdOf(club) });
  fail(error);
}
export async function removeWindow(id: string) { const { error } = await db.from("mm_windows").update({ active: false }).eq("id", id); fail(error); }

// ---------------------------------------------------------------------------
// Monthly testing window and swimmer comparisons (graded repeat sets with the
// workbook scoring: points 1/2/3 per rep below/at/above age level, and points
// per age year = level × reps ÷ age). Worked out by the database.
// ---------------------------------------------------------------------------
export interface WindowRow {
  result_id: string; swimmer_id: string; full_name: string; squad_id: string | null; squad_name: string | null; session_date: string;
  level_key: string; level_no: number | null; level_label: string | null; age: number | null; value: number; max_reps: number | null;
  points: number | null; points_per_age: number | null; vs_age: "below" | "at" | "above" | null; set_completed: boolean | null; benchmark: number | null;
}
export interface SwimmerCompare {
  protocol_id: string; code: string; name: string; month: string; session_date: string; level_label: string | null; age: number | null;
  value: number; max_reps: number | null; points: number | null; points_per_age: number | null; vs_age: "below" | "at" | "above" | null;
  set_completed: boolean | null; benchmark: number | null; squad_name: string | null;
  squad_n: number; squad_avg_ppa: number | null; squad_avg_points: number | null;
  age_n: number; age_avg_ppa: number | null; age_avg_points: number | null;
  history: { date: string; level: string | null; age: number | null; value: number; max_reps: number | null; points: number | null; ppa: number | null; vs_age: string | null; completed: boolean | null }[];
}
export const VS_AGE_LABEL: Record<string, string> = { below: "Below age level", at: "At age level", above: "Above age level" };

const num = (x: unknown) => (x == null ? null : Number(x));

/** First and last day of the calendar month holding `iso` (YYYY-MM-DD). */
export function monthRange(iso: string): { from: string; to: string } {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}
export const monthLabel = (iso: string) => new Date(iso.slice(0, 7) + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export async function loadWindowMonths(protocolId: string): Promise<{ month: string; swimmers: number }[]> {
  const { data, error } = await db.rpc("mm_window_months", { p_protocol: protocolId });
  fail(error);
  return ((data ?? []) as { month: string; swimmers: number }[]).map(m => ({ month: m.month, swimmers: Number(m.swimmers) }));
}
export async function loadWindowRows(protocolId: string, month: string): Promise<WindowRow[]> {
  const { from, to } = monthRange(month);
  const { data, error } = await db.rpc("mm_window_rows", { p_protocol: protocolId, p_from: from, p_to: to });
  fail(error);
  return ((data ?? []) as WindowRow[]).map(r => ({
    ...r, value: Number(r.value), max_reps: num(r.max_reps), points: num(r.points), points_per_age: num(r.points_per_age), benchmark: num(r.benchmark)
  }));
}
export async function loadSwimmerCompare(swimmerId: string): Promise<SwimmerCompare[]> {
  const { data, error } = await db.rpc("mm_swimmer_compare", { p_swimmer: swimmerId });
  fail(error);
  return ((data ?? []) as SwimmerCompare[]).map(r => ({
    ...r, value: Number(r.value), max_reps: num(r.max_reps), points: num(r.points), points_per_age: num(r.points_per_age), benchmark: num(r.benchmark),
    squad_avg_ppa: num(r.squad_avg_ppa), squad_avg_points: num(r.squad_avg_points), age_avg_ppa: num(r.age_avg_ppa), age_avg_points: num(r.age_avg_points),
    history: (r.history ?? []).map(h => ({ ...h, value: Number(h.value), max_reps: num(h.max_reps), points: num(h.points), ppa: num(h.ppa) }))
  }));
}

/** Round to 2 dp for display. */
export const fmt2 = (x: number | null | undefined) => (x == null ? "–" : (Math.round(x * 100) / 100).toFixed(2));
/** Signed difference and percentage against an average, e.g. "+0.54 (+25%)". */
export function vsAverage(mine: number | null | undefined, avg: number | null | undefined, dp = 2, same = "level with the average"): { text: string; dir: "up" | "down" | "same" | null } {
  if (mine == null || avg == null) return { text: "–", dir: null };
  const d = mine - avg;
  const f = (x: number) => (Math.round(Math.abs(x) * 10 ** dp) / 10 ** dp).toFixed(dp);
  const pct = avg ? Math.round((d / avg) * 100) : null;
  if (Math.abs(d) < 0.5 * 10 ** -dp) return { text: same, dir: "same" };
  return { text: `${d > 0 ? "+" : "−"}${f(d)}${pct != null ? ` (${d > 0 ? "+" : "−"}${Math.abs(pct)}%)` : ""}`, dir: d > 0 ? "up" : "down" };
}
