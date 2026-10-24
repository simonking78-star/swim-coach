import { sb } from "./supabase";
import { looksOffline, queueWrite } from "./offline";
import { fmtDay } from "./util";
import { clubIdOf, squadIdOf } from "./clubs";
export { coachName, fmtDay, logEvent, todayLocal } from "./util";

// Attendance register — same behaviour and data as the current app's
// viewAttendanceSetup / viewAttendanceMark / viewAttendanceDone.

export type AttStatus = "in" | "out" | "excused" | "partial";
export type Pool = "17m" | "25m" | "50m";
export const POOLS: Pool[] = ["17m", "25m", "50m"];
export const WHOLE_CLUB = "ALL";

export interface AttSession {
  club: string;
  squad: string;          // squad name, or WHOLE_CLUB
  date: string;           // YYYY-MM-DD
  time: string;           // start, HH:MM
  endTime: string;        // finish, HH:MM
  timetableSessionId: string | null; // the weekly timetable slot; null = not timetabled (times confirmed by the coach)
  pool: Pool;
  planId: string | null;
  sessionMinutes: number; // finish − start: the base for hours trained and fractional attendance
  mode: "swipe" | "tick";
  coach: string;
}

export interface AttSwimmer {
  id: string;
  full_name: string;
  status: AttStatus | null;        // null = not marked this session
  minutes_attended: number | null;
}

/**
 * Weight of one mark in the attendance %. Mirrors public.attendance_weight()
 * in the database and attWeight() in the current app — keep all three in step.
 * Excused and unmarked count on neither side.
 */
export function attWeight(status: AttStatus | null, minutes: number | null, sessionMinutes: number): number | null {
  if (status === "in") return 1;
  if (status === "out") return 0;
  if (status === "partial") return Math.min(1, Math.max(0, (minutes || 0) / (sessionMinutes || 60)));
  return null;
}

/** One attendance record as stored (status may be missing on rows from before it existed). */
export interface AttMark { status: string | null; present?: boolean | null; minutes_attended: number | null; session_minutes: number | null; }

/** The weight of a stored mark: the fraction rule, falling back to the present flag on old rows. */
export function markWeight(r: AttMark): number | null {
  if (r.status) return attWeight(r.status as AttStatus, r.minutes_attended, r.session_minutes ?? 60);
  return r.present == null ? null : r.present ? 1 : 0;
}

/**
 * THE attendance summary used everywhere. Two measures from the same marks:
 *   hours    = In: whole session · Partial: minutes attended · Out: 0
 *   attended = sessions attended in fractions: In 1 · Partial minutes ÷ length · Out 0
 * Excused is left out of both, and of counted (the sessions that count).
 */
export function summarise(rows: AttMark[]) {
  let attended = 0, counted = 0, excused = 0, minutes = 0;
  for (const r of rows) {
    const w = markWeight(r);
    if (w == null) { excused++; continue; }
    attended += w; counted++;
    minutes += r.status ? attMinutes(r.status as AttStatus, r.minutes_attended, r.session_minutes ?? 60) ?? 0 : w * (r.session_minutes ?? 60);
  }
  return {
    attended: Math.round(attended * 10) / 10, counted, excused,
    missed: Math.round((counted - attended) * 10) / 10,
    pct: counted ? Math.round((100 * attended) / counted) : null,
    hours: Math.round((minutes / 60) * 10) / 10
  };
}
export const fmtSessions = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Minutes trained for one mark — mirrors public.attendance_minutes():
 * In = whole session, Partial = minutes attended (up to the session length),
 * Out = 0, Excused/unmarked = not counted.
 */
export function attMinutes(status: AttStatus | null, minutes: number | null, sessionMinutes: number): number | null {
  if (status === "in") return sessionMinutes || 60;
  if (status === "out") return 0;
  if (status === "partial") return Math.min(sessionMinutes || 60, Math.max(0, minutes || 0));
  return null;
}

export function tally(list: AttSwimmer[], sessionMinutes: number) {
  const c = { in: 0, out: 0, excused: 0, partial: 0, unmarked: 0 };
  let sum = 0, n = 0, mins = 0;
  for (const s of list) {
    if (s.status === null) { c.unmarked++; continue; }
    c[s.status]++;
    const w = attWeight(s.status, s.minutes_attended, sessionMinutes);
    if (w !== null) { sum += w; n++; }
    mins += attMinutes(s.status, s.minutes_attended, sessionMinutes) ?? 0;
  }
  return { ...c, pct: n ? Math.round((100 * sum) / n) : null, sessions: Math.round(sum * 10) / 10, hours: Math.round((mins / 60) * 10) / 10 };
}

/** Short label for a mark: ✓ / ✕ / Exc / 30m. */
export function markLabel(s: Pick<AttSwimmer, "status" | "minutes_attended">): string {
  if (!s.status) return "";
  if (s.status === "in") return "✓";
  if (s.status === "out") return "✕";
  if (s.status === "excused") return "Exc";
  return `${s.minutes_attended || 0}m`;
}

/** Tick-list tap cycle: unmarked/In/partial → Out → Excused → In. */
export function nextTickStatus(cur: AttStatus | null): AttStatus {
  if (cur === null || cur === "in" || cur === "partial") return "out";
  if (cur === "out") return "excused";
  return "in";
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
export async function loadSquadNames(club: string): Promise<string[]> {
  const { data, error } = await sb.from("squads").select("name").eq("club_id", clubIdOf(club)).order("name");
  if (error) throw error;
  return [...new Set((data ?? []).map(r => r.name as string))];
}

export interface PlanOption { id: string; label: string; }
export async function loadPlanOptions(club: string): Promise<PlanOption[]> {
  const { data, error } = await sb.from("session_plans")
    .select("id, title, intended_date, total_distance_m")
    .eq("club_id", clubIdOf(club))
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(p => {
    const bits = [p.title as string];
    if (p.intended_date) bits.push(fmtDay(p.intended_date as string));
    if (p.total_distance_m) bits.push(`${p.total_distance_m}m`);
    return { id: p.id as string, label: bits.join(" · ") };
  });
}

const isoDow = (iso: string) => { const g = new Date(iso + "T00:00:00").getDay(); return g === 0 ? 7 : g; }; // Mon=1
export const minutesBetween = (start: string, end: string) => {
  const [sh, sm] = start.split(":").map(Number), [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
};

/** One weekly timetable slot that falls on a given date. */
export interface Slot { id: string; squad: string; start: string; end: string; pool: Pool | null; minutes: number; }

/**
 * The timetabled sessions on this date: the squad's own, or every squad's in
 * the club for a whole-club register. Only active timetables whose season
 * covers the date, and only slots with a finish time.
 */
export async function loadSlots(club: string, squad: string, date: string): Promise<Slot[]> {
  if (!date) return [];
  type Row = { season_start: string; season_end: string; squads: { name: string; club: string };
    timetable_sessions: { id: string; day_of_week: number; start_time: string; end_time: string | null; pool_size: string | null; is_active: boolean | null }[] };
  let q = sb.from("timetables")
    .select("season_start, season_end, squads!inner(name, club), timetable_sessions(id, day_of_week, start_time, end_time, pool_size, is_active)")
    .eq("is_active", true).eq("squads.club_id", clubIdOf(club)).lte("season_start", date).gte("season_end", date);
  if (squad !== WHOLE_CLUB) q = q.eq("squads.name", squad);
  const { data, error } = await q;
  if (error) throw error;
  const dow = isoDow(date);
  const out: Slot[] = [];
  for (const t of (data ?? []) as unknown as Row[]) {
    for (const s of t.timetable_sessions || []) {
      if (s.is_active === false || s.day_of_week !== dow || !s.end_time) continue;
      const start = s.start_time.slice(0, 5), end = s.end_time.slice(0, 5);
      out.push({ id: s.id, squad: t.squads.name, start, end, pool: (POOLS as string[]).includes(s.pool_size ?? "") ? (s.pool_size as Pool) : null, minutes: minutesBetween(start, end) });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.squad.localeCompare(b.squad));
}

/** Active swimmers in scope, with any mark already saved for this exact session. */
export async function loadRegister(s: Pick<AttSession, "club" | "squad" | "date" | "time" | "pool">): Promise<AttSwimmer[]> {
  let q = sb.from("swimmers").select("id, full_name, squad").eq("active", true).eq("club_id", clubIdOf(s.club)).order("full_name");
  if (s.squad !== WHOLE_CLUB) q = q.eq("squad_id", await squadIdOf(s.club, s.squad));
  const { data: swimmers, error } = await q;
  if (error) throw error;

  const { data: existing, error: eErr } = await sb.from("attendance_records")
    .select("swimmer_id, status, minutes_attended")
    .eq("session_date", s.date).eq("session_time", s.time + ":00").eq("pool_size", s.pool);
  if (eErr) console.error(eErr);
  const byId = new Map((existing ?? []).map(r => [r.swimmer_id, r]));

  return (swimmers ?? []).map(sw => {
    const ex = byId.get(sw.id);
    return {
      id: sw.id,
      full_name: sw.full_name as string,
      status: (ex?.status as AttStatus | null) ?? null,
      minutes_attended: ex?.minutes_attended ?? null
    };
  });
}

// ---------------------------------------------------------------------------
// Saving — every change saved at once with its own timestamp
// ---------------------------------------------------------------------------
const ON_CONFLICT = "swimmer_id,session_date,session_time,pool_size";

export type SaveResult = "saved" | "queued" | "failed";

/** club_id is filled by the database (trigger) from the swimmer's squad. */
export async function saveMark(session: AttSession, swimmerId: string, status: AttStatus, minutes: number | null = null): Promise<SaveResult> {
  const payload = {
    swimmer_id: swimmerId,
    session_date: session.date,
    session_time: session.time + ":00",
    pool_size: session.pool,
    status,
    minutes_attended: status === "partial" ? Math.min(session.sessionMinutes, Math.max(0, minutes ?? 0)) : null,
    session_minutes: session.sessionMinutes,
    session_end_time: session.endTime + ":00",
    timetable_session_id: session.timetableSessionId,
    present: status === "in" || status === "partial",
    session_plan_id: session.planId,
    marked_at: new Date().toISOString(),
    coach: session.coach
  };
  const { error } = await sb.from("attendance_records").upsert(payload as never, { onConflict: ON_CONFLICT });
  if (error && looksOffline(error)) {
    // Natural-key upsert, so replaying it later can never duplicate a row.
    await queueWrite("attendance_records", payload, { onConflict: ON_CONFLICT });
    return "queued";
  }
  if (error) { console.error("Attendance save failed:", error); return "failed"; }
  return "saved";
}




