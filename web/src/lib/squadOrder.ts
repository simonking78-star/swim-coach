import { sb } from "./supabase";

// Squad order and Club Awards squads (migration 20261125170000_squad_order_and_award_squads).
// squads.sort_order is the club's own order (set by a head coach or above in Admin → Manage squads);
// every squad list in the app reads squads through loadClubSquads() so they all follow it.
// squads.club_awards marks the squads that use the Club Awards scheme.
// Until the database has the update, lists fall back to name order and every squad counts as in the scheme.

/** True when the database hasn't had the squad-order update yet. */
const orderMissing = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return !!x && (x.code === "42703" || x.code === "PGRST204" || x.code === "PGRST202" || /sort_order|club_awards|set_squad_order|set_award_squads/.test(x.message ?? ""));
};

type Ordered = { name: string; sort_order?: number | null };
export function bySquadOrder(a: Ordered, b: Ordered) {
  const x = a.sort_order ?? Number.MAX_SAFE_INTEGER, y = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  return x !== y ? x - y : a.name.localeCompare(b.name);
}

/** Squads of one club in the club's order. `cols` must include name; sort_order and club_awards are added. */
export async function loadClubSquads<T extends { name: string }>(clubId: string, cols: string): Promise<(T & { sort_order: number | null; club_awards: boolean })[]> {
  const full = await sb.from("squads").select(`${cols}, sort_order, club_awards`).eq("club_id", clubId).order("name");
  if (!full.error) return ((full.data ?? []) as unknown as (T & { sort_order: number | null; club_awards: boolean })[]).sort(bySquadOrder);
  if (!orderMissing(full.error)) throw full.error;
  const old = await sb.from("squads").select(cols).eq("club_id", clubId).order("name");
  if (old.error) throw old.error;
  return ((old.data ?? []) as unknown as T[]).map(r => ({ ...r, sort_order: null, club_awards: true }));
}

/** True once the database has sort_order / club_awards. */
export async function squadOrderReady(clubId: string): Promise<boolean> {
  const { error } = await sb.from("squads").select("sort_order, club_awards").eq("club_id", clubId).limit(1);
  if (!error) return true;
  if (orderMissing(error)) return false;
  throw error;
}

const rpcError = (e: unknown) => orderMissing(e)
  ? new Error("This needs the latest database update (migration squad_order_and_award_squads) first.")
  : (e as Error);

/** Every squad id of the club, first to last. Head coach, club admin or development admin only. */
export async function saveSquadOrder(clubId: string, ids: string[]): Promise<void> {
  const { error } = await sb.rpc("set_squad_order" as never, { p_club: clubId, p_ids: ids } as never);
  if (error) throw rpcError(error);
}

/** The squads that use Club Awards; every other squad at the club is switched off. */
export async function saveAwardSquads(clubId: string, ids: string[]): Promise<void> {
  const { error } = await sb.rpc("set_award_squads" as never, { p_club: clubId, p_ids: ids } as never);
  if (error) throw rpcError(error);
}
