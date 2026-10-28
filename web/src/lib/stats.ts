import { useQuery } from "@tanstack/react-query";
import { sb } from "./supabase";
import { clubIdOf } from "./clubs";

/** Shape returned by public.home_stats(p_club) — counts run under the caller's RLS. */
export interface SquadStats {
  id: string;
  name: string;
  swimmers: number;
  swimmer_feedback: number;
  swimmer_feedback_30d: number;
  squad_feedback: number;
  squad_feedback_30d: number;
}
export interface HomeStats {
  clubs: number;
  swimmers: number;
  pbs: number;
  feedback: number;
  feedback_30d: number;
  squads: SquadStats[];
}

export function useHomeStats(club: string | null) {
  return useQuery({
    queryKey: ["home_stats", club],
    staleTime: 60 * 1000,
    queryFn: async () => {
      // The club-id version (p_club_id) is newer than the generated types (migration 20261024120000).
      const rpc = sb.rpc.bind(sb) as unknown as (fn: string, args: object) => ReturnType<typeof sb.rpc>;
      const { data, error } = await rpc("home_stats", { p_club_id: club ? clubIdOf(club) : null });
      if (error) throw error;
      return data as unknown as HomeStats;
    }
  });
}

export interface SquadFeedbackEntry {
  id: string;
  coach: string | null;
  session_date: string;
  category: string;
  observation: string;
  remedial_action: string | null;
  created_at: string;
}

export function useSquadFeedback(squadId: string | null, limit = 8) {
  return useQuery({
    queryKey: ["squad_feedback", squadId, limit],
    enabled: !!squadId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("squad_feedback")
        .select("id, coach, session_date, category, observation, remedial_action, created_at")
        .eq("squad_id", squadId!)
        .eq("is_active", true)
        .order("session_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as SquadFeedbackEntry[];
    }
  });
}

const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-GB");
/** 1,284 below 10,000; 12.9K above. */
export const fmtCount = (n: number) => (n >= 10000 ? compact.format(n) : full.format(n));

export const fmtDate = (d: string) =>
  new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
