import { sb } from "./supabase";

// Stopwatch — same behaviour as the current app's viewStopwatch.
// The clock is Date.now()-based, so it keeps true time when the phone locks
// or the app is backgrounded, and the state lives in localStorage under the
// SAME key and shape as the current app: a set started in either version
// carries on in the other, and a reload mid-set loses nothing.
// Posted times go to stopwatch_times (training), never swim_results, so meet
// PBs and qualifying-time analysis are unaffected.

export const SW_KEY = "coachToolsStopwatch";

export interface SwState {
  acc: number;                 // ms banked before the current run
  runStart: number | null;     // Date.now() when the current run began; null = stopped
  taps: number[];              // elapsed ms at each Rep tap (and resume boundary)
  stopAt: number | null;       // elapsed ms when last stopped
  rowSwimmer: Record<string, string>;
  posted: Record<string, boolean>;
  ticked: Record<string, boolean>;
}

export const blank = (): SwState => ({ acc: 0, runStart: null, taps: [], stopAt: null, rowSwimmer: {}, posted: {}, ticked: {} });

export function loadState(): SwState {
  try { const v = JSON.parse(localStorage.getItem(SW_KEY) || "null"); if (v && Array.isArray(v.taps)) return { ...blank(), ...v }; } catch { /* corrupt or unavailable */ }
  return blank();
}
export function saveState(s: SwState) { try { localStorage.setItem(SW_KEY, JSON.stringify(s)); } catch { /* unavailable */ } }

export const running = (s: SwState) => s.runStart != null;
export const elapsed = (s: SwState, now = Date.now()) => s.acc + (s.runStart != null ? now - s.runStart : 0);

export function start(s: SwState, defaultSwimmer: string, now = Date.now()): SwState {
  const n = { ...s, taps: [...s.taps], rowSwimmer: { ...s.rowSwimmer } };
  // Resuming: the pause point becomes a rep boundary so row keys stay stable.
  if (n.stopAt != null && n.stopAt > 0 && n.taps[n.taps.length - 1] !== n.stopAt) {
    n.taps.push(n.stopAt);
    const k = String(n.taps.length - 1);
    if (n.rowSwimmer[k] == null) n.rowSwimmer[k] = defaultSwimmer;
  }
  n.runStart = now; n.stopAt = null;
  return n;
}
export function stop(s: SwState, now = Date.now()): SwState {
  if (s.runStart == null) return s;
  const acc = s.acc + (now - s.runStart);
  return { ...s, acc, runStart: null, stopAt: acc };
}
export function rep(s: SwState, defaultSwimmer: string, now = Date.now()): SwState {
  if (s.runStart == null) return s;
  const taps = [...s.taps, elapsed(s, now)];
  return { ...s, taps, rowSwimmer: { ...s.rowSwimmer, [String(taps.length - 1)]: defaultSwimmer } };
}

export interface SwEntry { key: string; n: number; elapsed: number; lap: number; isStop: boolean; }
/** Every Rep tap plus the Stop point (when stopped and not already a tap). */
export function entries(s: SwState): SwEntry[] {
  const pts = s.taps.slice();
  let stopAdded = false;
  if (!running(s) && s.stopAt != null && (!pts.length || pts[pts.length - 1] !== s.stopAt)) { pts.push(s.stopAt); stopAdded = true; }
  return pts.map((e, i) => ({ key: String(i), n: i + 1, elapsed: e, lap: e - (i ? pts[i - 1] : 0), isStop: stopAdded && i === pts.length - 1 }));
}

/** Stopwatch-style truncation to hundredths. Face: 00:00.00 */
export function fmtFace(ms: number): string {
  const cs = Math.floor(ms / 10), h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, sec = Math.floor(cs / 100) % 60, c = cs % 100;
  const p = (n: number) => String(n).padStart(2, "0");
  return (h ? h + ":" : "") + p(m) + ":" + p(sec) + "." + p(c);
}
/** Stored and listed: 32.15 / 1:05.32 */
export function fmtSwim(ms: number): string {
  const cs = Math.floor(ms / 10), m = Math.floor(cs / 6000), sec = Math.floor(cs / 100) % 60, c = cs % 100;
  const p = (n: number) => String(n).padStart(2, "0");
  return m ? `${m}:${p(sec)}.${p(c)}` : `${sec}.${p(c)}`;
}
export const truncMs = (ms: number) => Math.floor(ms / 10) * 10;

// Stored values kept exactly as the current app saves them.
export const STROKES: { value: string; label: string }[] = [
  { value: "Freestyle", label: "Freestyle" }, { value: "Backstroke", label: "Backstroke" },
  { value: "Breaststroke", label: "Breaststroke" }, { value: "Butterfly", label: "Butterfly" },
  { value: "Individual Medley", label: "IM" }, { value: "Kick", label: "Kick" },
  { value: "Drill", label: "Drill" }, { value: "Pull", label: "Pull" }
];
export const DISTANCES = [15, 25, 50, 75, 100, 150, 200, 400, 800, 1500];

export interface PostRow {
  key: string;
  swimmer_id: string; club_id: string; squad_id: string | null; stroke: string; distance_m: number; course: "SC" | "LC";
  time_ms: number; time_display: string; time_type: "lap" | "elapsed" | "total";
  rep_number: number | null; rep_count: number; note: string | null; session_date: string;
}

/** Club and squad are sent by id; the database fills their names until Phase 6 drops the copies. */
export async function postTimes(rows: PostRow[]) {
  const { error } = await sb.from("stopwatch_times").insert(rows.map(({ key: _k, ...r }) => r) as never);
  if (error) throw error;
}
