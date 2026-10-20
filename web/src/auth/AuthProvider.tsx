import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "../lib/supabase";
import { sectionLevel, type Access, type Level, type Section } from "../lib/access";

interface AuthState {
  ready: boolean;              // first session check finished
  session: Session | null;
  access: Access | null;       // null until signed in and loaded
  accessLoading: boolean;
  recovery: boolean;           // arrived from a password-reset link
  clearRecovery: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Read the link type before supabase-js consumes the URL hash (invite / recovery links).
const LINK_TYPE = new URLSearchParams(location.hash.replace(/^#/, "")).get("type");

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [recovery, setRecovery] = useState(LINK_TYPE === "recovery" || LINK_TYPE === "invite");

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") qc.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const userId = session?.user.id ?? null;
  const accessQ = useQuery({
    queryKey: ["my_access", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await sb.rpc("my_access");
      if (error) throw error;
      return ((data as unknown) as Access) ?? { roles: [] };
    }
  });

  const value: AuthState = {
    ready,
    session,
    access: userId ? accessQ.data ?? (accessQ.isError ? { roles: [] } : null) : null,
    accessLoading: !!userId && accessQ.isLoading,
    recovery,
    clearRecovery: () => setRecovery(false),
    signOut: async () => { await sb.auth.signOut(); }
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** The signed-in user's level for a section of the app ("N" = hidden). */
export function usePermission(section: Section): Level {
  return sectionLevel(useAuth().access, section);
}
