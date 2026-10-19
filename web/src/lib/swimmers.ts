import { sb } from "./supabase";
import { attWeight, type AttStatus } from "./attendance";
import { calcAge, type ResultRow } from "./results";
import { isoAdd, todayLocal } from "./util";
import type { FbEntry } from "./feedback";

// Swimmers roster and profile — same data and rules as the current app's
// viewSwimmers / viewSwimmerProfile. RLS decides which swimmers a role sees
// (a coach only their squads, a parent only their child).

export interface RosterSwimmer {
  id: string; full_name: string; squad: string | null; date_of_birth: string | null; gender: string | null;
  swim_england_id: string | null; joined_club_on: string | null;
  parent_name: string | null; parent_phone: string | null; parent_email: string | null;
  age: number | null;
}

export async function loadRoster(club: string): Promise<RosterSwimmer[]> {
  const { data, error } = await sb.from("swimmers")
    .select("id, full_name, squad, date_of_birth, gender, swim_england_id, joined_club_on, parent_name, parent_phone, parent_email")
    .eq("club", club).eq("active", true).order("full_name");
  if (error) throw error;
  return ((data ?? []) as unknown as Omit<RosterSwimmer, "age">[]).map(s => ({ ...s, age: calcAge(s.date_of_birth) }));
}

export async function loadSwimmer(id: string): Promise<RosterSwimmer | null> {
  const { data, error } = await sb.from("swimmers")
    .select("id, full_name, squad, date_of_birth, gender, swim_england_id, joined_club_on, parent_name, parent_phone, parent_email")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { ...(data as unknown as Omit<RosterSwimmer, "age">), age: calcAge((data as { date_of_birth: string | null }).date_of_birth) } : null;
}

/** Sessions present in the last 30 days, per swimmer (only fetched when that column is on). */
export async function loadRecentSessions(): Promise<Record<string, number>> {
  const since = isoAdd(todayLocal().date, -30);
  const { data, error } = await sb.from("attendance_records").select("swimmer_id").gte("session_date", since).eq("present", true).limit(20000);
  if (error) throw error;
  const m: Record<string, number> = {};
  for (const r of data ?? []) m[r.swimmer_id] = (m[r.swimmer_id] ?? 0) + 1;
  return m;
}

/** Most recent feedback date per swimmer (only fetched when that column is on). */
export async function loadLastFeedback(): Promise<Record<string, string>> {
  const { data, error } = await sb.from("swimmer_feedback").select("swimmer_id, session_date").limit(20000);
  if (error) throw error;
  const m: Record<string, string> = {};
  for (const r of data ?? []) if (r.session_date && (!m[r.swimmer_id] || r.session_date > m[r.swimmer_id])) m[r.swimmer_id] = r.session_date;
  return m;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
interface AttRow { session_date: string; status: string | null; present: boolean; minutes_attended: number | null; session_minutes: number | null; }

/**
 * Weighted sessions attended in the last 30 and 90 days: a partial session
 * counts as its fraction of the session; rows from before status existed use
 * the present flag.
 */
export async function loadAttendanceSummary(swimmerId: string): Promise<{ d30: number; d90: number }> {
  const today = todayLocal().date;
  const since90 = isoAdd(today, -90), since30 = isoAdd(today, -30);
  const { data, error } = await sb.from("attendance_records")
    .select("session_date, status, present, minutes_attended, session_minutes")
    .eq("swimmer_id", swimmerId).gte("session_date", since90);
  if (error) throw error;
  const rows = (data ?? []) as AttRow[];
  const w = (r: AttRow) => r.status ? (attWeight(r.status as AttStatus, r.minutes_attended, r.session_minutes ?? 60) ?? 0) : (r.present ? 1 : 0);
  const sum = (rs: AttRow[]) => Math.round(rs.reduce((a, r) => a + w(r), 0) * 10) / 10;
  return { d90: sum(rows), d30: sum(rows.filter(r => r.session_date >= since30)) };
}

export async function loadResults(swimmerId: string): Promise<ResultRow[]> {
  const { data, error } = await sb.from("swim_results")
    .select("event, course, swim_time_display, meet_date, meet_name, is_pb")
    .eq("swimmer_id", swimmerId).order("meet_date", { ascending: true }).limit(5000);
  if (error) throw error;
  return (data ?? []) as ResultRow[];
}

export async function loadFeedbackArchive(swimmerId: string): Promise<FbEntry[]> {
  const { data, error } = await sb.from("swimmer_feedback")
    .select("id, thread_id, entry_type, category, criterion, status, observation, remedial_action, note, media, session_date, created_at, coach")
    .eq("swimmer_id", swimmerId)
    .order("session_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FbEntry[];
}

export interface SwTime { id: string; stroke: string; distance_m: number; course: string; time_display: string; time_type: string; rep_number: number | null; rep_count: number | null; note: string | null; session_date: string; }
export async function loadStopwatchTimes(swimmerId: string): Promise<SwTime[]> {
  const { data, error } = await sb.from("stopwatch_times")
    .select("id, stroke, distance_m, course, time_display, time_type, rep_number, rep_count, note, session_date")
    .eq("swimmer_id", swimmerId)
    .order("session_date", { ascending: false }).order("recorded_at", { ascending: false }).order("rep_number", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as SwTime[];
}
export async function deleteStopwatchTime(id: string) {
  const { error } = await sb.from("stopwatch_times").delete().eq("id", id);
  if (error) throw error;
}
export function swTimeLabel(r: SwTime): string {
  return r.time_type === "total" ? `Total of ${r.rep_count} reps`
    : (r.rep_count ?? 0) > 1 ? `Rep ${r.rep_number}/${r.rep_count}${r.time_type === "elapsed" ? " (elapsed)" : ""}` : "";
}

/** Everything the swimmer-report PDF needs (all attendance, all results, all feedback). */
export async function loadReportData(swimmerId: string) {
  const [at, rs, fb] = await Promise.all([
    sb.from("attendance_records").select("session_date, present").eq("swimmer_id", swimmerId).limit(10000),
    sb.from("swim_results").select("event, course, swim_time_display, meet_date").eq("swimmer_id", swimmerId).limit(10000),
    sb.from("swimmer_feedback").select("id, thread_id, entry_type, category, criterion, status, observation, remedial_action, note, media, session_date, created_at").eq("swimmer_id", swimmerId)
  ]);
  for (const r of [at, rs, fb]) if (r.error) throw r.error;
  return {
    attendance: (at.data ?? []) as { session_date: string; present: boolean }[],
    results: (rs.data ?? []) as ResultRow[],
    feedback: (fb.data ?? []) as unknown as FbEntry[]
  };
}
