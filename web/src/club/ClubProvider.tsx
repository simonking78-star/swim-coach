import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { sb } from "../lib/supabase";
import { allowedClubs } from "../lib/access";
import { useAuth } from "../auth/AuthProvider";

// Same localStorage key as the current app, so both remember the same club.
const STORE_KEY = "coachToolsClub";

interface ClubState { clubs: string[]; club: string | null; setClub: (c: string) => void; }
const ClubContext = createContext<ClubState | null>(null);

function readStored(): string | null {
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}

export function ClubProvider({ children }: { children: ReactNode }) {
  const { access, session } = useAuth();
  const [club, setClubState] = useState<string | null>(readStored);

  // Coaching clubs = clubs that have squads (the results archive also holds ~39 other clubs).
  const q = useQuery({
    queryKey: ["coaching_clubs", session?.user.id],
    enabled: !!session && !!access,
    queryFn: async () => {
      const { data, error } = await sb.from("squads").select("club");
      if (error) throw error;
      return [...new Set((data ?? []).map(r => r.club).filter(Boolean) as string[])].sort();
    }
  });

  const clubs = useMemo(() => {
    const limit = allowedClubs(access);
    const list = q.data ?? [];
    return limit ? limit.slice().sort() : list;
  }, [q.data, access]);

  useEffect(() => {
    if (clubs.length && (!club || !clubs.includes(club))) setClubState(clubs[0]);
  }, [clubs, club]);

  const setClub = (c: string) => {
    setClubState(c);
    try { localStorage.setItem(STORE_KEY, c); } catch { /* storage unavailable */ }
  };

  return <ClubContext.Provider value={{ clubs, club, setClub }}>{children}</ClubContext.Provider>;
}

export function useClub(): ClubState {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error("useClub must be used inside ClubProvider");
  return ctx;
}
