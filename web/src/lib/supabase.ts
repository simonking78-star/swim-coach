import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { isSharedDevice } from "./device";

// Production values are the defaults (the publishable key is safe in the browser;
// RLS is the real control). Deploy previews override both to the staging project.
const url = import.meta.env.VITE_SUPABASE_URL || "https://nxlgeykipnvswyeshrbl.supabase.co";
const key = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_BYuKct-F0f4H04Gl_S58uQ_gKzuW_Ff";

// On a shared computer (A-118) the sign-in is kept in sessionStorage, so it ends when the
// tab or browser closes. Otherwise localStorage, as before — the same key the classic app reads.
const authStorage = {
  getItem: (k: string) => { try { return (isSharedDevice() ? sessionStorage : localStorage).getItem(k); } catch { return null; } },
  setItem: (k: string, v: string) => { try { (isSharedDevice() ? sessionStorage : localStorage).setItem(k, v); } catch { /* storage unavailable */ } },
  removeItem: (k: string) => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* storage unavailable */ } }
};

export const sb = createClient<Database>(url, key, { auth: { storage: authStorage } });
export const SUPABASE_URL = url;
/** Where supabase-js keeps the session (its default key for this project). */
export const AUTH_STORAGE_KEY = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
