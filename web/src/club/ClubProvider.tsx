import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { allowedClubs } from "../lib/access";
import { loadClubs, rememberClubs, clubIdOf } from "../lib/clubs";
import { useAuth } from "../auth/AuthProvider";
import { COACH_TOOLS } from "../lib/apps";

// Same localStorage key as the classic app, so both remember the same club (by name,
// until the classic app is retired in Phase 6).
const STORE_KEY = "coachToolsClub";

interface ClubState {
  clubs: string[];
  coachingClubs: string[];
  /** Selected club name; null until the club list has loaded, so ids are always available. */
  club: string | null;
  /** Selected club's id. */
  clubId: string | null;
  setClub: (c: string) => void;
}
const ClubContext = createContext<ClubState | null>(null);

function readStored(): string | null {
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}

export function ClubProvider({ children }: { children: ReactNode }) {
  const { access, session, clubsWith } = useAuth();
  const tools = clubsWith(COACH_TOOLS);
  const [club, setClubState] = useState<string | null>(readStored);

  // Coaching clubs = clubs that run squads in the app. An all-clubs account (superadmin) also sees
  // every club known only from results (the archive), as the classic app did.
  const allClubs = !!access && !allowedClubs(access);
  const q = useQuery({
    queryKey: ["clubs", session?.user.id],
    enabled: !!session && !!access,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const list = await loadClubs();
      rememberClubs(list);
      return list;
    }
  });

  // Feature gate: only clubs where this person has the Coach Tools app ("all" for a superadmin).
  const toolsKey = tools === "all" ? "all" : [...tools].sort().join(",");
  const coachingClubs = useMemo(() => (q.data ?? []).filter(c => c.is_coaching).map(c => c.name), [q.data]);
  const clubs = useMemo(() => {
    if (!q.data) return [];
    const ok = (name: string) => tools === "all" || q.data!.some(c => c.name === name && tools.has(c.id));
    const limit = allowedClubs(access);
    if (limit) return limit.filter(n => q.data!.some(c => c.name === n)).filter(ok).sort();
    const other = allClubs ? q.data.filter(c => !c.is_coaching).map(c => c.name) : [];
    return [...coachingClubs, ...other].filter(ok);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, access, allClubs, coachingClubs, toolsKey]);

  useEffect(() => {
    if (clubs.length && (!club || !clubs.includes(club))) setClubState(clubs[0]);
  }, [clubs, club]);

  const setClub = (c: string) => {
    setClubState(c);
    try { localStorage.setItem(STORE_KEY, c); } catch { /* storage unavailable */ }
  };

  // Only hand out a club once the list (and so its id) is known.
  const ready = !!club && clubs.includes(club);
  const value: ClubState = {
    clubs, coachingClubs, setClub,
    club: ready ? club : null,
    clubId: ready ? clubIdOf(club!) : null
  };
  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

export function useClub(): ClubState {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error("useClub must be used inside ClubProvider");
  return ctx;
}
