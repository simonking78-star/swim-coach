import { sb } from "./supabase";
import { looksOffline, queueWrite } from "./offline";
import { clubIdOf, clubCols } from "./clubs";

// Test & Assess (claude/specs/test-and-assess.md).
// A template is a model of one or more rounds. Each round has distance,
// repetitions and an optional interval (the swim time each rep is sent off on);
// a template may vary those by age, from a youngest to an oldest age level.
// Score = age × test level × reps completed (summed over rounds), where age is
// the Swim England age (test year − year of birth) and the test level is the
// age set swum (or the template's fixed level when it doesn't vary by age).
// The database works the score out too (test_results trigger); the copy here
// is for live display only.

export interface RoundValues { reps: number; distance: number; interval: number | null; }
export interface RoundGen { reps: number; repStep: number; distance: number; distanceStep: number; interval: number | null; intervalStep: number; }
export interface Round {
  key: string;
  name: string;
  stroke: string;
  restAfterSec: number;
  /** keyed by age ("8".."18") when the template varies by age, else by "all" */
  values: Record<string, RoundValues>;
  gen?: RoundGen;
}
export interface TestModel { ageBanded: boolean; minAge: number; maxAge: number; fixedLevel: number; rounds: Round[]; }

export interface Template {
  id: string; club: string; name: string; description: string | null; model: TestModel;
  active: boolean; version: number; updated_at: string;
}
export interface TestSession {
  id: string; template_id: string; template_name: string; model: TestModel; club: string;
  session_date: string; group_type: "club" | "squad" | "swimmers"; squad_id: string | null; squad_name: string | null;
  swimmer_ids: string[]; status: "live" | "closed"; clock_started_at: string | null; created_at: string; closed_at: string | null;
}
export interface RoundDone { done: number | null; reps: number; }
export interface TestResult {
  id?: string; session_id: string; swimmer_id: string; template_id?: string; template_name?: string; club?: string;
  session_date?: string; year_of_birth: number | null; age?: number | null; level: number | null;
  rounds: Record<string, RoundDone>; reps_done?: number | null; reps_total?: number | null; score?: number | null;
  note?: string | null; recorded_by?: string | null; updated_at?: string;
}
export interface TestSwimmer {
  id: string; full_name: string; squad: string | null; squad_id: string | null;
  year_of_birth: number | null; date_of_birth: string | null;
}

// ---------------------------------------------------------------------------
// Pure model helpers
// ---------------------------------------------------------------------------
export const range = (a: number, b: number) => { const r: number[] = []; for (let i = a; i <= b; i++) r.push(i); return r; };
export const levelKeys = (m: TestModel) => (m.ageBanded ? range(m.minAge, m.maxAge).map(String) : ["all"]);
export const levelOptions = (m: TestModel) => (m.ageBanded ? range(m.minAge, m.maxAge) : [m.fixedLevel]);

export function valuesFor(m: TestModel, r: Round, level: number | null): RoundValues {
  const key = m.ageBanded ? String(clampLevel(m, level ?? m.minAge)) : "all";
  return r.values[key] ?? { reps: 1, distance: 100, interval: null };
}
export const clampLevel = (m: TestModel, n: number) => (m.ageBanded ? Math.min(m.maxAge, Math.max(m.minAge, Math.round(n))) : m.fixedLevel);

/** Swim England age: age on 31 December of the test year. */
export const swimAge = (yob: number | null | undefined, isoDate: string) => (yob ? Number(isoDate.slice(0, 4)) - yob : null);
export const yobOf = (s: { year_of_birth: number | null; date_of_birth: string | null }) =>
  s.year_of_birth ?? (s.date_of_birth ? Number(s.date_of_birth.slice(0, 4)) : null);

/** The level a swimmer tests at by default: their own age, kept inside the template's ages. */
export const defaultLevel = (m: TestModel, age: number | null) => (m.ageBanded ? (age == null ? null : clampLevel(m, age)) : m.fixedLevel);

export const repsDone = (rounds: Record<string, RoundDone>) => Object.values(rounds).reduce((a, r) => a + (r.done ?? 0), 0);
export const score = (age: number | null, level: number | null, done: number) => (age == null || level == null ? null : age * level * done);

/** Full-set score for a swimmer of age `age` at `level`. */
export function fullScore(m: TestModel, level: number, age = level) {
  return score(age, level, m.rounds.reduce((a, r) => a + valuesFor(m, r, level).reps, 0)) ?? 0;
}

export function totals(m: TestModel, level: number) {
  let dist = 0, secs = 0, reps = 0, timed = true;
  m.rounds.forEach((r, i) => {
    const v = valuesFor(m, r, level);
    dist += v.reps * v.distance; reps += v.reps;
    if (v.interval) secs += v.reps * v.interval; else timed = false;
    if (i < m.rounds.length - 1) secs += r.restAfterSec || 0;
  });
  return { dist, secs: timed ? secs : null, reps };
}

export function genValues(g: RoundGen, minAge: number, maxAge: number): Record<string, RoundValues> {
  const out: Record<string, RoundValues> = {};
  for (const a of range(minAge, maxAge)) {
    const i = a - minAge;
    out[String(a)] = {
      reps: Math.max(1, Math.round(g.reps + g.repStep * i)),
      distance: Math.max(1, Math.round(g.distance + g.distanceStep * i)),
      interval: g.interval == null ? null : Math.max(5, Math.round(g.interval - g.intervalStep * i))
    };
  }
  return out;
}

/** Fill gaps so every level has values (e.g. after the age range is widened). */
export function normaliseModel(raw: unknown): TestModel {
  const d = (raw ?? {}) as Partial<TestModel>;
  const m: TestModel = {
    ageBanded: !!d.ageBanded,
    minAge: Number(d.minAge ?? 8), maxAge: Number(d.maxAge ?? 18),
    fixedLevel: Number(d.fixedLevel ?? 1) || 1,
    rounds: Array.isArray(d.rounds) ? d.rounds.map((r, i) => ({
      key: r.key || `r${i + 1}`, name: r.name || `Round ${i + 1}`, stroke: r.stroke || "Freestyle",
      restAfterSec: Number(r.restAfterSec ?? 0), values: { ...(r.values ?? {}) }, gen: r.gen
    })) : []
  };
  if (m.maxAge < m.minAge) m.maxAge = m.minAge;
  for (const r of m.rounds) {
    const any = Object.values(r.values)[0] ?? { reps: 1, distance: 100, interval: null };
    for (const k of levelKeys(m)) if (!r.values[k]) r.values[k] = { ...any };
  }
  return m;
}

export function newRound(m: TestModel, copyFrom?: Round): Round {
  const used = new Set(m.rounds.map(r => r.key));
  let n = m.rounds.length + 1; while (used.has(`r${n}`)) n++;
  const base = copyFrom ? JSON.parse(JSON.stringify(copyFrom)) as Round : null;
  const values: Record<string, RoundValues> = {};
  for (const k of levelKeys(m)) values[k] = base?.values[k] ?? { reps: 4, distance: 100, interval: 120 };
  return { key: `r${n}`, name: `Round ${m.rounds.length + 1}`, stroke: base?.stroke ?? "Freestyle", restAfterSec: 60, values, gen: base?.gen };
}

export function blankModel(): TestModel {
  const m: TestModel = { ageBanded: false, minAge: 8, maxAge: 18, fixedLevel: 1, rounds: [] };
  m.rounds.push(newRound(m));
  m.rounds[0].name = "Round 1";
  return m;
}

/** Where a swimmer is on the shared pace clock. Rounds without an interval can't be clocked. */
export type Phase =
  | { kind: "swim"; key: string; round: number; rep: number; reps: number; left: number }
  | { kind: "rest"; left: number; nextKey: string }
  | { kind: "untimed"; key: string }
  | { kind: "done" };
export function phaseAt(m: TestModel, level: number, elapsedSec: number): Phase {
  let t = elapsedSec;
  for (let i = 0; i < m.rounds.length; i++) {
    const r = m.rounds[i], v = valuesFor(m, r, level);
    if (!v.interval) return { kind: "untimed", key: r.key };
    const dur = v.reps * v.interval;
    if (t < dur) return { kind: "swim", key: r.key, round: i, rep: Math.floor(t / v.interval) + 1, reps: v.reps, left: v.interval - (t % v.interval) };
    t -= dur;
    if (i < m.rounds.length - 1) {
      const rest = r.restAfterSec || 0;
      if (t < rest) return { kind: "rest", left: rest - t, nextKey: m.rounds[i + 1].key };
      t -= rest;
    }
  }
  return { kind: "done" };
}
export const clockable = (m: TestModel) => m.rounds.length > 0 && levelOptions(m).every(l => m.rounds.every(r => !!valuesFor(m, r, l).interval));

export function mmss(sec: number | null | undefined): string {
  if (sec == null) return "–";
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
/** "1:55" → 115; "95" → 95; "" → null */
export function parseMmss(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
export const roundLabel = (r: Round, v: RoundValues) => `${v.reps} × ${v.distance} ${r.stroke === "Individual Medley" ? "IM" : r.stroke}${v.interval ? ` @ ${mmss(v.interval)}` : ""}`;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const TPL_COLS = "id, club, name, description, model, active, version, updated_at";

export async function loadTemplates(club: string, includeOff = false): Promise<Template[]> {
  let q = sb.from("test_set_templates").select(TPL_COLS).eq("club_id", clubIdOf(club)).order("name");
  if (!includeOff) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(t => ({ ...(t as unknown as Template), model: normaliseModel(t.model) }));
}
export async function loadTemplate(id: string): Promise<Template | null> {
  const { data, error } = await sb.from("test_set_templates").select(TPL_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { ...(data as unknown as Template), model: normaliseModel(data.model) } : null;
}
export async function saveTemplate(t: { id?: string; club: string; name: string; description: string | null; model: TestModel; active?: boolean; version?: number }): Promise<string> {
  const row = { ...clubCols(t.club), name: t.name.trim(), description: t.description?.trim() || null, model: t.model as never, active: t.active ?? true };
  if (t.id) {
    const { error } = await sb.from("test_set_templates").update({ ...row, version: (t.version ?? 1) + 1 }).eq("id", t.id);
    if (error) throw friendly(error);
    return t.id;
  }
  const { data, error } = await sb.from("test_set_templates").insert(row).select("id").single();
  if (error) throw friendly(error);
  return data.id;
}
export async function setTemplateActive(id: string, active: boolean) {
  const { error } = await sb.from("test_set_templates").update({ active }).eq("id", id);
  if (error) throw error;
}
function friendly(e: { message: string; code?: string }) {
  if (e.code === "23505") return new Error("There is already a template with that name in this club.");
  return new Error(e.message);
}

const SW_COLS = "id, full_name, squad, squad_id, year_of_birth, date_of_birth";
export async function loadClubSwimmers(club: string): Promise<TestSwimmer[]> {
  const { data, error } = await sb.from("swimmers").select(SW_COLS).eq("club_id", clubIdOf(club)).eq("active", true).order("full_name");
  if (error) throw error;
  return (data ?? []) as TestSwimmer[];
}
export async function loadSwimmersByIds(ids: string[]): Promise<TestSwimmer[]> {
  if (!ids.length) return [];
  const out: TestSwimmer[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await sb.from("swimmers").select(SW_COLS).in("id", ids.slice(i, i + 150));
    if (error) throw error;
    out.push(...((data ?? []) as TestSwimmer[]));
  }
  return out.sort((a, b) => a.full_name.localeCompare(b.full_name));
}
export async function loadSquads(club: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await sb.from("squads").select("id, name").eq("club_id", clubIdOf(club)).order("name");
  if (error) throw error;
  return data ?? [];
}

/** Fills in a missing year of birth (never overwrites a known one). */
export async function setBirthYear(swimmerId: string, year: number): Promise<number | null> {
  const { data, error } = await sb.rpc("set_swimmer_birth_year", { p_swimmer: swimmerId, p_year: year });
  if (error) throw error;
  return (data as number | null) ?? null;
}

const SES_COLS = "id, template_id, template_name, model, club, session_date, group_type, squad_id, squad_name, swimmer_ids, status, clock_started_at, created_at, closed_at";
const toSession = (d: unknown) => { const s = d as TestSession; return { ...s, model: normaliseModel(s.model), swimmer_ids: s.swimmer_ids ?? [] }; };

export async function loadSessions(club: string, opts: { status?: "live" | "closed"; templateId?: string; limit?: number } = {}): Promise<TestSession[]> {
  let q = sb.from("test_sessions").select(SES_COLS).eq("club_id", clubIdOf(club)).order("session_date", { ascending: false }).order("created_at", { ascending: false });
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.templateId) q = q.eq("template_id", opts.templateId);
  const { data, error } = await q.limit(opts.limit ?? 200);
  if (error) throw error;
  return (data ?? []).map(toSession);
}
export async function loadSession(id: string): Promise<TestSession | null> {
  const { data, error } = await sb.from("test_sessions").select(SES_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toSession(data) : null;
}
export async function createSession(s: { template: Template; club: string; date: string; group_type: TestSession["group_type"]; squad_id: string | null; squad_name: string | null; swimmer_ids: string[] }): Promise<string> {
  const { data, error } = await sb.from("test_sessions").insert({
    template_id: s.template.id, template_name: s.template.name, model: s.template.model as never, ...clubCols(s.club),
    session_date: s.date, group_type: s.group_type, squad_id: s.squad_id, squad_name: s.squad_name, swimmer_ids: s.swimmer_ids
  }).select("id").single();
  if (error) throw error;
  return data.id;
}
export async function updateSession(id: string, patch: Partial<Pick<TestSession, "status" | "clock_started_at" | "closed_at" | "swimmer_ids">>) {
  const { error } = await sb.from("test_sessions").update(patch).eq("id", id);
  if (error) throw error;
}

const RES_COLS = "id, session_id, swimmer_id, template_id, template_name, club, session_date, year_of_birth, age, level, rounds, reps_done, reps_total, score, note, recorded_by, updated_at";
export async function loadSessionResults(sessionId: string): Promise<TestResult[]> {
  const { data, error } = await sb.from("test_results").select(RES_COLS).eq("session_id", sessionId);
  if (error) throw error;
  return (data ?? []) as unknown as TestResult[];
}
export async function loadResults(club: string, templateId: string): Promise<TestResult[]> {
  const out: TestResult[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("test_results").select(RES_COLS).eq("club_id", clubIdOf(club)).eq("template_id", templateId)
      .order("session_date").range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as TestResult[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}
/** Templates that have results in this club (including switched-off ones), for Statistics. */
export async function loadTemplatesWithResults(club: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await sb.from("test_results").select("template_id, template_name").eq("club_id", clubIdOf(club)).limit(5000);
  if (error) throw error;
  const m = new Map<string, string>();
  for (const r of data ?? []) m.set(r.template_id, r.template_name);
  return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Saves one swimmer's result. Offline, it is queued and sent when the connection returns. */
export async function saveResult(r: TestResult): Promise<"saved" | "queued"> {
  const payload = {
    session_id: r.session_id, swimmer_id: r.swimmer_id, year_of_birth: r.year_of_birth, level: r.level,
    rounds: r.rounds, note: r.note ?? null, recorded_by: r.recorded_by ?? null
  };
  // template, club, date, age and score are filled by the database
  const { error } = await sb.from("test_results").upsert(payload as never, { onConflict: "session_id,swimmer_id" });
  if (!error) return "saved";
  if (looksOffline(error)) { await queueWrite("test_results", payload, { onConflict: "session_id,swimmer_id" }); return "queued"; }
  throw error;
}
export async function removeResult(sessionId: string, swimmerId: string) {
  const { error } = await sb.from("test_results").delete().eq("session_id", sessionId).eq("swimmer_id", swimmerId);
  if (error) throw error;
}

/** Standard competition ranking (ties share a place). */
export function rankBy<T>(rows: T[], val: (r: T) => number | null | undefined): (T & { rank: number | null })[] {
  const sorted = [...rows].sort((a, b) => (val(b) ?? -1) - (val(a) ?? -1));
  let last: number | null = null, rank = 0;
  return sorted.map((r, i) => {
    const v = val(r);
    if (v == null) return { ...r, rank: null };
    if (last === null || v !== last) { rank = i + 1; last = v; }
    return { ...r, rank };
  });
}
