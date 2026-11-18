import { sb } from "./supabase";
import { clubIdOf } from "./clubs";

// Club vocabulary (A-154, claude spec "Unified vocabulary, drills and development analysis").
// One club-wide list of every drill, skill and shorthand a coach writes. Drills & Skills is the
// detailed view of the drill and skill entries. The database mirrors each drill/skill into
// drills_library (legacy_drill_id), so every older screen that links to a drill keeps working.
// What each entry develops is tagged against development_targets; how much it was used comes
// from plan_line_usage, which the database fills from every dated session plan.
//
// These tables are newer than the generated types, so they are reached through an untyped from().

const table = (t: string) => (sb.from.bind(sb) as unknown as (t: string) => ReturnType<typeof sb.from>)(t);
const rpc = (fn: string, args: Record<string, unknown>) =>
  (sb.rpc.bind(sb) as unknown as (f: string, a: Record<string, unknown>) => ReturnType<typeof sb.rpc>)(fn, args);

export type TermType = "drill" | "skill" | "stroke" | "equipment" | "intensity" | "set_type" | "other";
export type TermStatus = "pending" | "approved" | "rejected" | "merged";
export const TERM_TYPES: [TermType, string][] = [
  ["drill", "Drill"], ["skill", "Skill"], ["stroke", "Stroke"], ["equipment", "Equipment"],
  ["intensity", "Intensity / effort"], ["set_type", "Set type"], ["other", "Other"]
];
export const TERM_TYPE_LABEL = Object.fromEntries(TERM_TYPES) as Record<TermType, string>;

export interface TermDetails {
  purpose?: string; blabt?: string; biomechanical?: string; equipment?: string; regression?: string; progression?: string; coach?: string;
}
export interface Term {
  id: string; club_id: string; term: string; aliases: string[]; full_form: string | null; meaning: string | null;
  term_type: TermType; stroke: string | null; details: TermDetails; status: TermStatus; merged_into: string | null;
  legacy_drill_id: string | null; active: boolean; updated_at: string;
}
const TERM_COLS = "id, club_id, term, aliases, full_form, meaning, term_type, stroke, details, status, merged_into, legacy_drill_id, active, updated_at";

/** Every live entry for a club (approved and pending; rejected and merged entries are left out). */
export async function loadTerms(club: string): Promise<Term[]> {
  const { data, error } = await table("vocabulary_terms").select(TERM_COLS)
    .eq("club_id", clubIdOf(club)).eq("active", true).in("status", ["approved", "pending"])
    .order("term_type").order("stroke").order("term");
  if (error) throw error;
  return (data ?? []) as unknown as Term[];
}

export async function loadTermByDrill(drillId: string): Promise<Term | null> {
  const { data, error } = await table("vocabulary_terms").select(TERM_COLS).eq("legacy_drill_id", drillId).maybeSingle();
  if (error) throw error;
  return data as unknown as Term | null;
}

export interface TermDraft {
  term: string; aliases: string; full_form: string; meaning: string; term_type: TermType; stroke: string; details: TermDetails;
}

/** Create or update an entry. New entries from a reviewer are approved; anyone else's go to the review list
 *  (pending), are used at once, and are checked by Claude in the background. Returns the saved row. */
export async function saveTerm(club: string, id: string | null, d: TermDraft, opts: { reviewer: boolean; coach: string }): Promise<Term> {
  const clean = (s: string) => s.trim() || null;
  const details: TermDetails = {};
  for (const [k, v] of Object.entries(d.details)) if (typeof v === "string" && v.trim()) details[k as keyof TermDetails] = v.trim();
  if (!id && !details.coach) details.coach = opts.coach;
  const row = {
    term: d.term.trim(), aliases: d.aliases.split(",").map(s => s.trim()).filter(Boolean),
    full_form: clean(d.full_form), meaning: clean(d.meaning) ?? clean(details.purpose ?? ""), term_type: d.term_type,
    stroke: clean(d.stroke), details
  };
  const q = id
    ? table("vocabulary_terms").update(row as never).eq("id", id).select(TERM_COLS).single()
    : table("vocabulary_terms").insert({ ...row, club_id: clubIdOf(club), status: opts.reviewer ? "approved" : "pending" } as never).select(TERM_COLS).single();
  const { data, error } = await q;
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new Error(`"${row.term}" is already in the club's list${row.stroke ? ` for ${row.stroke}` : ""}.`);
    throw error;
  }
  const saved = data as unknown as Term;
  if (!id && saved.status === "pending") requestReview(club);
  return saved;
}

/** Remove an entry from the list. Nothing is deleted: it is switched off, and plans that used it keep their history. */
export async function removeTerm(id: string) {
  const { error } = await table("vocabulary_terms").update({ active: false } as never).eq("id", id);
  if (error) throw error;
}

/** Ask Claude to check any new entries (best effort; the planner also does this when it analyses a plan). */
export function requestReview(club: string) {
  sb.functions.invoke("review-vocabulary-term", { body: { club_id: clubIdOf(club), review_pending: true } })
    .then(({ error }) => { if (error) console.error("review-vocabulary-term:", error); });
}

// ---- Development targets ---------------------------------------------------
export type TargetGroup = "technical" | "skills" | "physical" | "mindset";
export const TARGET_GROUPS: [TargetGroup, string][] = [
  ["technical", "Technical"], ["skills", "Skills"], ["physical", "Physical"], ["mindset", "Mindset & race craft (OADF)"]
];
export interface Target { id: string; target_group: TargetGroup; name: string; oadf_domain: string | null; sort_order: number; work_tag: string | null; }
export interface TermTarget { term_id: string; target_id: string; weight: "primary" | "secondary"; suggested_by: string; confirmed: boolean; }

export async function loadTargets(): Promise<Target[]> {
  const { data, error } = await table("development_targets").select("id, target_group, name, oadf_domain, sort_order, work_tag")
    .eq("active", true).order("target_group").order("sort_order");
  if (error) throw error;
  return (data ?? []) as unknown as Target[];
}

export async function loadTermTargets(termIds: string[]): Promise<TermTarget[]> {
  if (!termIds.length) return [];
  const out: TermTarget[] = [];
  for (let i = 0; i < termIds.length; i += 200) {
    const { data, error } = await table("term_targets").select("term_id, target_id, weight, suggested_by, confirmed").in("term_id", termIds.slice(i, i + 200));
    if (error) throw error;
    out.push(...((data ?? []) as unknown as TermTarget[]));
  }
  return out;
}

/** Replace an entry's development targets with the coach's choice (confirmed, since a person chose them). */
export async function saveTermTargets(termId: string, picks: Record<string, "primary" | "secondary">) {
  const { error: de } = await table("term_targets").delete().eq("term_id", termId);
  if (de) throw de;
  const rows = Object.entries(picks).map(([target_id, weight]) => ({ term_id: termId, target_id, weight, suggested_by: "coach", confirmed: true }));
  if (rows.length) { const { error } = await table("term_targets").insert(rows as never); if (error) throw error; }
}

// ---- Usage from session plans ------------------------------------------------
export interface TermUsage { metres: number; lines: number; plans: number; last: string | null; bySquad: { squad_id: string | null; metres: number; plans: number }[]; }

/** How much an entry has been used in the club's dated session plans since a date (all time when from is null). */
export async function loadTermUsage(termId: string, from: string | null): Promise<TermUsage> {
  let q = table("plan_line_usage").select("session_plan_id, squad_id, plan_date, total_m").eq("term_id", termId);
  if (from) q = q.gte("plan_date", from);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  type R = { session_plan_id: string | null; squad_id: string | null; plan_date: string | null; total_m: number | null };
  const rows = (data ?? []) as unknown as R[];
  const plans = new Set<string>(), squads = new Map<string, { metres: number; plans: Set<string> }>();
  let metres = 0, last: string | null = null;
  for (const r of rows) {
    metres += r.total_m ?? 0;
    if (r.session_plan_id) plans.add(r.session_plan_id);
    if (r.plan_date && (!last || r.plan_date > last)) last = r.plan_date;
    const k = r.squad_id ?? "";
    const s = squads.get(k) ?? { metres: 0, plans: new Set<string>() };
    s.metres += r.total_m ?? 0; if (r.session_plan_id) s.plans.add(r.session_plan_id);
    squads.set(k, s);
  }
  return {
    metres, lines: rows.length, plans: plans.size, last,
    bySquad: [...squads.entries()].map(([k, s]) => ({ squad_id: k || null, metres: s.metres, plans: s.plans.size })).sort((a, b) => b.metres - a.metres)
  };
}

// ---- Head coach review -----------------------------------------------------------
export interface ReviewItem {
  id: string; club_id: string; term: string; meaning: string | null; term_type: TermType; stroke: string | null; status: TermStatus;
  auto_merged: boolean; claude_verdict: "distinct" | "duplicate" | "conflict" | null; claude_reason: string | null; claude_checked_at: string | null;
  claude_match_id: string | null; match_term: string | null; match_meaning: string | null;
  merged_into: string | null; merged_into_term: string | null; created_at: string;
  suggested_targets: { target: string; group: TargetGroup; weight: "primary" | "secondary" }[];
}

export async function canReview(club: string): Promise<boolean> {
  const { data, error } = await rpc("vocab_can_review", { p_club: clubIdOf(club) });
  if (error) { console.error("vocab_can_review:", error); return false; }
  return data === true;
}

export async function loadReviewQueue(club: string): Promise<ReviewItem[]> {
  const { data, error } = await table("vocabulary_review_queue").select("*").eq("club_id", clubIdOf(club)).order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as ReviewItem[];
}

async function act(fn: string, args: Record<string, unknown>) {
  const { error } = await rpc(fn, args);
  if (error) throw error;
}
export const approveTerm = (id: string, meaning?: string) => act("vocab_approve", { p_term: id, p_meaning: meaning ?? null });
export const mergeTerm = (id: string, into: string) => act("vocab_merge", { p_term: id, p_into: into });
export const rejectTerm = (id: string) => act("vocab_reject", { p_term: id });
export const keepMerge = (id: string) => act("vocab_ack_merge", { p_term: id });
