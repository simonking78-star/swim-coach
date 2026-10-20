import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { sb } from "../lib/supabase";
import { allowedClubs } from "../lib/access";
import { useAuth } from "../auth/AuthProvider";

// Same localStorage key as the current app, so both remember the same club.
const STORE_KEY = "coachToolsClub";

interface ClubState { clubs: string[]; coachingClubs: string[]; club: string | null; setClub: (c: string) => void; }
const ClubContext = createContext<ClubState | null>(null);

function readStored(): string | null {
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}

export function ClubProvider({ children }: { children: ReactNode }) {
  const { access, session } = useAuth();
  const [club, setClubState] = useState<string | null>(readStored);

  // Coaching clubs = clubs with squads set up. An all-clubs account (superadmin) also sees every
  // other club with swimmers on file (the results archive), as the classic app did.
  const allClubs = !!access && !allowedClubs(access);
  const q = useQuery({
    queryKey: ["coaching_clubs", session?.user.id, allClubs],
    enabled: !!session && !!access,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await sb.from("squads").select("club");
      if (error) throw error;
      const coaching = [...new Set((data ?? []).map(r => r.club).filter(Boolean) as string[])].sort();
      if (!allClubs) return { coaching, other: [] as string[] };
      const seen = new Set<string>();
      for (let from = 0; ; from += 1000) { // PostgREST returns at most 1,000 rows a request
        const { data: rows, error: e2 } = await sb.from("swimmers").select("club").not("club", "is", null).order("club").range(from, from + 999);
        if (e2) throw e2;
        (rows ?? []).forEach(r => seen.add(r.club as string));
        if (!rows || rows.length < 1000) break;
      }
      return { coaching, other: [...seen].filter(c => !coaching.includes(c)).sort() };
    }
  });

  const clubs = useMemo(() => {
    const limit = allowedClubs(access);
    if (limit) return limit.slice().sort();
    return [...(q.data?.coaching ?? []), ...(q.data?.other ?? [])];
  }, [q.data, access]);
  const coachingClubs = q.data?.coaching ?? [];

  useEffect(() => {
    if (clubs.length && (!club || !clubs.includes(club))) setClubState(clubs[0]);
  }, [clubs, club]);

  const setClub = (c: string) => {
    setClubState(c);
    try { localStorage.setItem(STORE_KEY, c); } catch { /* storage unavailable */ }
  };

  return <ClubContext.Provider value={{ clubs, coachingClubs, club, setClub }}>{children}</ClubContext.Provider>;
}

export function useClub(): ClubState {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error("useClub must be used inside ClubProvider");
  return ctx;
}
