// Swim-time helpers — same maths as the current app (parseTimeStr, decYear,
// secToTime, linreg, swpBestTimes), shared by Swimmers and Statistics.

/** "1:05.32" → 65.32; "32.15" → 32.15; invalid/zero → null */
export function parseTimeStr(s: string | null | undefined): number | null {
  if (!s) return null;
  const parts = String(s).trim().split(":").map(Number);
  if (!parts.length || parts.some(isNaN)) return null;
  let secs = 0;
  for (const p of parts) secs = secs * 60 + p;
  return secs > 0 ? secs : null;
}

/** 2026-07-02 → 2026.5 (fraction of the year), for time-based x axes. */
export function decYear(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const start = new Date(d.getFullYear(), 0, 1).getTime();
  const end = new Date(d.getFullYear() + 1, 0, 1).getTime();
  return d.getFullYear() + (d.getTime() - start) / (end - start);
}

/** 65.32 → "1:05.32"; 32.15 → "32.15s" */
export function secToTime(v: number | null | undefined): string {
  if (v == null || v <= 0) return "";
  const m = Math.floor(v / 60);
  const s = (v % 60).toFixed(2).padStart(5, "0");
  return m > 0 ? `${m}:${s}` : `${(+v).toFixed(2)}s`;
}

export interface Pt { x: number; y: number; }
/** Least-squares line; null with fewer than two points or no x spread. */
export function linreg(points: Pt[]): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const d = n * sxx - sx * sx;
  if (!d) return null;
  const slope = (n * sxy - sx * sy) / d;
  return { slope, intercept: (sy - slope * sx) / n };
}

export interface ResultRow {
  event: string;
  course: "SC" | "LC" | string;
  swim_time_display: string | null;
  meet_date: string;
  meet_name?: string | null;
  is_pb?: boolean | null;
}

/** Fastest swim on record per event and course (not only the is_pb flag), with its date. */
export function bestTimes(results: ResultRow[]): Record<string, { secs: number; time: string; date: string }> {
  const best: Record<string, { secs: number; time: string; date: string }> = {};
  for (const r of results) {
    const secs = parseTimeStr(r.swim_time_display);
    if (secs == null) continue;
    const k = `${r.event}|${r.course}`;
    const b = best[k];
    if (!b || secs < b.secs || (secs === b.secs && r.meet_date < b.date)) best[k] = { secs, time: r.swim_time_display!, date: r.meet_date };
  }
  return best;
}

/** Events in the swimmer-report PDF, in this order. */
export const PB_EVENTS: [string, string][] = [
  ["50 Free", "50m Freestyle"], ["50 Back", "50m Backstroke"], ["50 Breast", "50m Breaststroke"], ["50 Fly", "50m Butterfly"],
  ["100 Free", "100m Freestyle"], ["100 Back", "100m Backstroke"], ["100 Breast", "100m Breaststroke"], ["100 Fly", "100m Butterfly"],
  ["100 IM", "100m Individual Medley"],
  ["200 Free", "200m Freestyle"], ["200 Back", "200m Backstroke"], ["200 Breast", "200m Breaststroke"], ["200 Fly", "200m Butterfly"],
  ["200 IM", "200m Individual Medley"],
  ["400 Free", "400m Freestyle"], ["800 Free", "800m Freestyle"], ["1500 Free", "1500m Freestyle"]
];

/** Age in whole years today. */
export function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob + "T00:00:00"), t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
  return age;
}
