import { sb } from "./supabase";
import { looksOffline, queueWrite } from "./offline";

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
  time: string;           // HH:MM
  pool: Pool;
  planId: string | null;
  sessionMinutes: number; // from the squad's timetable, else 60
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

export function tally(list: AttSwimmer[], sessionMinutes: number) {
  const c = { in: 0, out: 0, excused: 0, partial: 0, unmarked: 0 };
  let sum = 0, n = 0;
  for (const s of list) {
    if (s.status === null) { c.unmarked++; continue; }
    c[s.status]++;
    const w = attWeight(s.status, s.minutes_attended, sessionMinutes);
    if (w !== null) { sum += w; n++; }
  }
  return { ...c, pct: n ? Math.round((100 * sum) / n) : null };
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
  const { data, error } = await sb.from("squads").select("name").eq("club", club).order("name");
  if (error) throw error;
  return [...new Set((data ?? []).map(r => r.name as string))];
}

export interface PlanOption { id: string; label: string; }
export async function loadPlanOptions(club: string): Promise<PlanOption[]> {
  const { data, error } = await sb.from("session_plans")
    .select("id, title, intended_date, total_distance_m")
    .eq("club", club)
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

/**
 * Planned length of the session from the squad's weekly timetable (needed for
 * partial-attendance minutes). Only for a single-squad register with a
 * matching day and start time; otherwise 60.
 */
export async function resolveSessionMinutes(date: string, time: string, squad: string, club: string): Promise<number> {
  if (squad === WHOLE_CLUB) return 60;
  type Row = { season_start: string; season_end: string;
    timetable_sessions: { day_of_week: number; start_time: string; end_time: string | null; is_active: boolean | null }[] };
  const { data, error } = await sb.from("timetables")
    .select("id, season_start, season_end, squads!inner(name, club), timetable_sessions(day_of_week, start_time, end_time, is_active)")
    .eq("is_active", true).eq("squads.club", club).eq("squads.name", squad);
  if (error || !data) return 60;
  const t = (data as unknown as Row[]).find(x => x.season_start <= date && x.season_end >= date);
  if (!t) return 60;
  const dow = isoDow(date);
  const slot = (t.timetable_sessions || []).find(s =>
    s.is_active !== false && s.day_of_week === dow && s.start_time.slice(0, 5) === time.slice(0, 5));
  if (!slot?.end_time) return 60;
  const [sh, sm] = slot.start_time.split(":").map(Number);
  const [eh, em] = slot.end_time.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? mins : 60;
}

/** Active swimmers in scope, with any mark already saved for this exact session. */
export async function loadRegister(s: Pick<AttSession, "club" | "squad" | "date" | "time" | "pool">): Promise<AttSwimmer[]> {
  let q = sb.from("swimmers").select("id, full_name, squad").eq("active", true).eq("club", s.club).order("full_name");
  if (s.squad !== WHOLE_CLUB) q = q.eq("squad", s.squad);
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
    minutes_attended: status === "partial" ? minutes : null,
    session_minutes: status === "partial" ? session.sessionMinutes : null,
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

/** Usage log, same table and event names as the current app. Never blocks. */
export function logEvent(userId: string | undefined, club: string | null, type: string, name: string, detail?: object) {
  if (!userId) return;
  sb.from("app_events").insert({ user_id: userId, club, event_type: type, event_name: name, detail: (detail ?? null) as never } as never)
    .then(({ error }) => { if (error) console.error("logEvent:", error); });
}

/** Name recorded against each mark: the user's own name, else their email. */
export async function coachName(userId: string, email: string | undefined): Promise<string> {
  const { data } = await sb.from("app_users").select("full_name").eq("user_id", userId).maybeSingle();
  const n = (data?.full_name as string | null)?.trim();
  return n || email?.split("@")[0] || "Coach";
}

export function fmtDay(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function todayLocal(): { date: string; time: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
