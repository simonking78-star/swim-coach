import { sb } from "./supabase";
import { fmtDate } from "./util";
import { clubIdOf } from "./clubs";

// Monthly Squad Review — one row per squad per month from
// public.squad_month_review (live) and public.squad_month_snapshots (frozen at
// month-end; used for closed months). Squad totals only. The database applies
// the same visibility rule as the app (coach = own squads).

export const METRICS = [
  { k: "attendance_pct", label: "Attendance %", fmt: "pct1" },
  { k: "hours_trained", label: "Hours trained (squad total)", fmt: "dec1" },
  { k: "hours_per_swimmer", label: "Hours trained per swimmer", fmt: "dec1" },
  { k: "present", label: "Sessions attended", fmt: "dec1" },
  { k: "members", label: "Swimmers", fmt: "int" },
  { k: "sessions", label: "Sessions", fmt: "int" },
  { k: "swims", label: "Race swims", fmt: "int" },
  { k: "pbs", label: "PBs", fmt: "int" },
  { k: "median_improvement_pct", label: "Median time gain %", fmt: "pct2" },
  { k: "skill_score", label: "Skill score (0–3)", fmt: "dec2" },
  { k: "skill_moves_up", label: "Skill steps up", fmt: "int" },
  { k: "positive_feedback_pct", label: "Developing/Embedded %", fmt: "pct1" },
  { k: "feedback_entries", label: "Feedback entries", fmt: "int" },
  { k: "drills_worked", label: "Squad drills", fmt: "int" }
] as const;
export type MetricKey = (typeof METRICS)[number]["k"];
export type Fmt = "pct1" | "pct2" | "dec1" | "dec2" | "int";

export const NUM = ["members", "sessions", "marks", "present", "attendance_pct", "swimmers_attending", "swims", "swimmers_raced",
  "pbs", "improved_swims", "avg_improvement_pct", "median_improvement_pct", "status_entries", "st_not_discussed", "st_started",
  "st_developing", "st_embedded", "skill_score", "skill_moves_up", "skill_moves_down", "feedback_entries", "feedback_notes",
  "positive_feedback_pct", "squad_entries", "drills_worked", "excused", "hours_trained", "hours_per_swimmer"] as const;

export type ReviewRow = { squad_id: string; squad_name: string; month: string; mk: string; source: string } & Record<(typeof NUM)[number], number | null>;

export const metric = (k: string) => METRICS.find(m => m.k === k) ?? METRICS[0];
export const monthKey = (d: string) => String(d).slice(0, 7);
export function monthLabel(k: string) {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
export function prevKey(k: string) {
  const [y, m] = k.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function fmt(v: number | null | undefined, f: Fmt | string): string {
  if (v == null || isNaN(v)) return "–";
  if (f === "pct1") return v.toFixed(1) + "%";
  if (f === "pct2") return (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  if (f === "dec2") return v.toFixed(2);
  if (f === "dec1") return v.toFixed(1);
  return String(Math.round(v));
}
export const hasData = (r: ReviewRow | undefined) => !!r && ((r.marks ?? 0) > 0 || (r.swims ?? 0) > 0 || (r.feedback_entries ?? 0) > 0);

/** Change against last month, or null when there's nothing to compare. */
export function delta(cur: ReviewRow | undefined, prev: ReviewRow | undefined, key: string, f: string): { dir: "up" | "down" | "flat"; text: string } | null {
  const c = cur?.[key as keyof ReviewRow] as number | null | undefined, p = prev?.[key as keyof ReviewRow] as number | null | undefined;
  if (c == null || p == null || !hasData(prev)) return null;
  const d = c - p;
  if (Math.abs(d) < 0.005) return { dir: "flat", text: "= last month" };
  const txt = f === "int" ? String(Math.round(d)) : d.toFixed(f === "dec2" || f === "pct2" ? 2 : 1);
  return { dir: d > 0 ? "up" : "down", text: `${d > 0 ? "▲ +" : "▼ "}${txt}${f.startsWith("pct") ? " pts" : ""}` };
}

export class ReviewNotInstalled extends Error {}

/** The last 13 months (current month live; closed months frozen where a snapshot exists). */
export async function loadReview(club: string): Promise<ReviewRow[]> {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const curKey = iso(now).slice(0, 7);
  const rpc = sb.rpc.bind(sb) as unknown as (fn: string, a: object) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const [live, snap] = await Promise.all([
    rpc("squad_month_figures", { p_club_id: clubIdOf(club), p_from: iso(from), p_to: iso(now) }),
    sb.from("squad_month_snapshots").select("squad_id,month,metrics,generated_at").eq("club_id", clubIdOf(club)).gte("month", iso(from))
  ]);
  if (live.error) {
    if (/squad_month_figures|function/i.test(live.error.message || "")) throw new ReviewNotInstalled("The monthly review isn't installed in the database yet.");
    throw new Error(live.error.message);
  }
  const frozen = new Map<string, { metrics: Record<string, unknown>; generated_at: string }>();
  for (const s of (snap.data ?? []) as { squad_id: string; month: string; metrics: Record<string, unknown>; generated_at: string }[]) frozen.set(`${s.squad_id}|${monthKey(s.month)}`, s);
  return ((live.data ?? []) as Record<string, unknown>[]).map(r => {
    const mk = monthKey(r.month as string);
    const f = mk < curKey ? frozen.get(`${r.squad_id}|${mk}`) : undefined;
    const row: Record<string, unknown> = f ? { squad_id: r.squad_id, month: r.month, squad_name: r.squad_name, ...f.metrics } : { ...r };
    for (const k of NUM) row[k] = row[k] == null ? null : Number(row[k]);
    row.mk = mk;
    row.source = f ? "frozen " + fmtDate(String(f.generated_at).slice(0, 10)) : "live";
    return row as ReviewRow;
  });
}

export function toCsv(club: string, rows: ReviewRow[]): string {
  const cols = ["month", "squad_name", ...NUM, "source"];
  const q = (v: unknown) => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return [["club", ...cols].join(",")].concat(rows.map(r => [club, ...cols.map(c => (c === "month" ? r.mk : r[c as keyof ReviewRow]))].map(q).join(","))).join("\n");
}
