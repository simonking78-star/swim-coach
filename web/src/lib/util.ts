import { useQuery } from "@tanstack/react-query";
import { sb } from "./supabase";
import { useAuth } from "../auth/AuthProvider";
import { clubIdSafe } from "./clubs";

/** Usage log, same table and event names as the current app. Never blocks. */
export function logEvent(userId: string | undefined, club: string | null, type: string, name: string, detail?: object) {
  if (!userId) return;
  // The club is logged by id; the database records the name alongside it (app_events keeps the name as a log).
  sb.from("app_events").insert({ user_id: userId, club_id: clubIdSafe(club), event_type: type, event_name: name, detail: (detail ?? null) as never } as never)
    .then(({ error }) => { if (error) console.error("logEvent:", error); });
}

/** Name recorded against attendance marks and feedback: the user's own name, else their email. */
export async function coachName(userId: string, email: string | undefined): Promise<string> {
  const { data } = await sb.from("app_users").select("full_name").eq("user_id", userId).maybeSingle();
  const n = (data?.full_name as string | null)?.trim();
  return n || email?.split("@")[0] || "Coach";
}

export function useCoachName(): string {
  const { session } = useAuth();
  const q = useQuery({
    queryKey: ["coach_name", session?.user.id],
    enabled: !!session,
    staleTime: Infinity,
    queryFn: () => coachName(session!.user.id, session!.user.email)
  });
  return q.data ?? session?.user.email?.split("@")[0] ?? "Coach";
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function todayLocal(): { date: string; time: string } {
  const d = new Date();
  return { date: isoOf(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function isoAdd(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

/** "Mon, 19 Oct 2026" */
export function fmtDay(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
/** "19 Oct 2026" — as the current app shows feedback dates. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
/** "19/10" */
export function fmtDdMm(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16));
}
