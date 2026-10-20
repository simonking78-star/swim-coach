import { sb } from "./supabase";

// App dev specs: a read-only in-app copy of the project's spec docs, for
// Simon to review without leaving the app. Content is pushed in from the
// project by Claude whenever a spec changes -- not a live sync.

export interface DevSpec { id: string; title: string; content: string; updated_at: string; }

export async function loadDevSpecs(): Promise<DevSpec[]> {
  const { data, error } = await sb.from("app_dev_specs").select("*").order("title");
  if (error) throw error;
  return (data ?? []) as DevSpec[];
}
