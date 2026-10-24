import { sb } from "./supabase";

// Club and squad ids (club-and-squad-normalisation, Phase 5).
// Screens still choose clubs and squads by name, which are unique; these helpers
// turn a name into its id so every query filters, and every insert writes, by id.
// ClubProvider loads the club list once at sign-in and calls rememberClubs().

export interface Club { id: string; name: string; is_coaching: boolean; club_code: string | null; }

let byName = new Map<string, Club>();
let byId = new Map<string, Club>();

export async function loadClubs(): Promise<Club[]> {
  const { data, error } = await sb.from("clubs").select("id, name, is_coaching, club_code").order("name");
  if (error) throw error;
  return (data ?? []) as Club[];
}

export function rememberClubs(list: Club[]) {
  byName = new Map(list.map(c => [c.name, c]));
  byId = new Map(list.map(c => [c.id, c]));
}

/** Id for a club name. Throws if the club list hasn't loaded or the name is unknown. */
export function clubIdOf(name: string): string {
  const c = byName.get(name);
  if (!c) throw new Error(`Club "${name}" isn't in the club list. Reload the app and try again.`);
  return c.id;
}

/** Id for a club name, or null when there is no club (e.g. an all-clubs role). */
export const clubIdOrNull = (name: string | null | undefined): string | null => (name ? clubIdOf(name) : null);

/** Club name and id together, for inserts: `{ ...clubCols(club), … }`. */
export const clubCols = (name: string) => ({ club: name, club_id: clubIdOf(name) });

export const clubNameOf = (id: string | null | undefined): string | null => (id ? byId.get(id)?.name ?? null : null);

const squadIds = new Map<string, string>();

/** Id for a squad name within a club (squad names are unique per club). */
export async function squadIdOf(club: string, squad: string): Promise<string> {
  const clubId = clubIdOf(club);
  const key = `${clubId}|${squad}`;
  const hit = squadIds.get(key);
  if (hit) return hit;
  const { data, error } = await sb.from("squads").select("id").eq("club_id", clubId).eq("name", squad).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Squad "${squad}" isn't in ${club}. Reload the app and try again.`);
  squadIds.set(key, data.id as string);
  return data.id as string;
}

/** Forget cached squad ids, e.g. after a squad is renamed. */
export const forgetSquadIds = () => squadIds.clear();
