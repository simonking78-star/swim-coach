import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Production values are the defaults (the publishable key is safe in the browser;
// RLS is the real control). Deploy previews override both to the staging project.
const url = import.meta.env.VITE_SUPABASE_URL || "https://nxlgeykipnvswyeshrbl.supabase.co";
const key = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_BYuKct-F0f4H04Gl_S58uQ_gKzuW_Ff";

export const sb = createClient<Database>(url, key);
export const SUPABASE_URL = url;
