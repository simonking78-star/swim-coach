import { sb } from "./supabase";
import { clubIdOf, clubCols } from "./clubs";

// Drills & Skills library — same data and rules as the current app's
// viewDrillsLibrary (drills_library + drill_periodisation).

export interface FullDrill {
  id: string; stroke: string | null; drill_name: string; pseudonyms: string[] | null;
  primary_purpose: string | null; blabt: string | null; biomechanical: string | null; equipment: string | null;
  regression: string | null; progression: string | null; club?: string | null;
}
export interface Peri { meso: string; phase_type: string; session_plan_placement: string | null; distance_m: number | null; }

export const MESOS = ["Meso 1", "Meso 2", "Meso 3"];
export const PHASES = ["Quality", "Endurance", "Sprint"];

export async function loadAllDrills(club: string): Promise<FullDrill[]> {
  const { data, error } = await sb.from("drills_library").select("*").eq("club_id", clubIdOf(club)).order("stroke").order("drill_name");
  if (error) throw error;
  return (data ?? []) as unknown as FullDrill[];
}
export async function loadDrill(id: string): Promise<FullDrill | null> {
  const { data, error } = await sb.from("drills_library").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as FullDrill | null;
}
export async function loadPeri(drillId: string): Promise<Peri[]> {
  const { data, error } = await sb.from("drill_periodisation").select("meso, phase_type, session_plan_placement, distance_m").eq("drill_id", drillId);
  if (error) throw error;
  return (data ?? []) as Peri[];
}

export function filterDrills(list: FullDrill[], stroke: string | null, q: string): FullDrill[] {
  const t = q.trim().toLowerCase();
  return list.filter(d => (!stroke || d.stroke === stroke) && (!t ||
    (d.drill_name || "").toLowerCase().includes(t) || (d.stroke || "").toLowerCase().includes(t) ||
    (d.pseudonyms || []).some(p => p.toLowerCase().includes(t))));
}

// ---- Set-line prediction: match the word(s) being typed against names and pseudonyms ----
export function lastToken(val: string): string {
  const m = (val || "").match(/([A-Za-z][A-Za-z' -]*)$/);
  return m ? m[1].trim() : "";
}
export function matchDrills(list: FullDrill[], token: string): FullDrill[] {
  const tl = token.toLowerCase();
  if (tl.length < 2) return [];
  return list.filter(d => [d.drill_name, ...(d.pseudonyms || [])].filter(Boolean).some(t => t.toLowerCase().startsWith(tl) || t.toLowerCase().includes(tl))).slice(0, 6);
}
/** Replace the token being typed with the drill's name. */
export function applyMatch(val: string, token: string, name: string): string {
  return val.slice(0, val.length - token.length) + name;
}

export interface DrillDraft {
  stroke: string; name: string; pseudonyms: string; purpose: string; blabt: string; biomech: string;
  equipment: string; regression: string; progression: string;
  peri: Record<string, { placement: string; distance: string }>; // key "Meso 1|Quality"
}
export const periKey = (meso: string, phase: string) => `${meso}|${phase}`;

export async function saveDrill(club: string, id: string | null, d: DrillDraft, coach: string): Promise<string> {
  const pseudonyms = d.pseudonyms.split(",").map(s => s.trim()).filter(Boolean);
  const n = (s: string) => s.trim() || null;
  const payload = {
    stroke: n(d.stroke), drill_name: d.name.trim(), pseudonyms: pseudonyms.length ? pseudonyms : null,
    primary_purpose: n(d.purpose), blabt: n(d.blabt), biomechanical: n(d.biomech), equipment: n(d.equipment),
    regression: n(d.regression), progression: n(d.progression), updated_at: new Date().toISOString()
  };
  let drillId = id;
  if (id) {
    const { error } = await sb.from("drills_library").update(payload as never).eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await sb.from("drills_library").insert({ ...payload, ...clubCols(club), coach } as never).select("id").single();
    if (error) throw error;
    drillId = (data as { id: string }).id;
  }
  const rows: (Peri & { drill_id: string })[] = [];
  for (const meso of MESOS) for (const phase of PHASES) {
    const c = d.peri[periKey(meso, phase)];
    const placement = c?.placement.trim() ?? "", dist = c?.distance.trim() ?? "";
    if (placement || dist) rows.push({ drill_id: drillId!, meso, phase_type: phase, session_plan_placement: placement || null, distance_m: dist ? Number(dist) : null });
  }
  const { error: de } = await sb.from("drill_periodisation").delete().eq("drill_id", drillId!);
  if (de) throw de;
  if (rows.length) { const { error: ie } = await sb.from("drill_periodisation").insert(rows as never); if (ie) throw ie; }
  return drillId!;
}

export async function deleteDrill(id: string) {
  const { error } = await sb.from("drills_library").delete().eq("id", id);
  if (error) throw error;
}
