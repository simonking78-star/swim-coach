import { sb } from "./supabase";
import { clubIdOf } from "./clubs";
import { loadTermByDrill, loadTerms, removeTerm, saveTerm, saveTermTargets, type Term } from "./vocab";

// Drills & Skills library (A-154). The club vocabulary (vocabulary_terms) is the master list; each drill
// or skill there is mirrored into drills_library by the database, and `id` below is always that
// drills_library id, so plan drill links, feedback remedial drills and season drill weeks keep working.
// Predefined periodisation (drill_periodisation) is retired: usage now comes from the session plans.

export interface FullDrill {
  id: string; stroke: string | null; drill_name: string; pseudonyms: string[] | null;
  primary_purpose: string | null; blabt: string | null; biomechanical: string | null; equipment: string | null;
  regression: string | null; progression: string | null; club?: string | null;
  /** vocabulary_terms id (absent only on the old-library fallback) */
  term_id?: string; term_type?: "drill" | "skill"; status?: "approved" | "pending";
}

function fromTerm(t: Term): FullDrill {
  const d = t.details ?? {};
  return {
    id: t.legacy_drill_id!, term_id: t.id, term_type: t.term_type === "skill" ? "skill" : "drill", status: t.status === "pending" ? "pending" : "approved",
    stroke: t.stroke, drill_name: t.term, pseudonyms: t.aliases?.length ? t.aliases : null,
    primary_purpose: d.purpose ?? t.meaning ?? null, blabt: d.blabt ?? null, biomechanical: d.biomechanical ?? null,
    equipment: d.equipment ?? null, regression: d.regression ?? null, progression: d.progression ?? null
  };
}
const missingTable = (e: unknown) => (e as { code?: string })?.code === "42P01" || (e as { code?: string })?.code === "PGRST205";

export async function loadAllDrills(club: string): Promise<FullDrill[]> {
  try {
    const terms = await loadTerms(club);
    return terms.filter(t => (t.term_type === "drill" || t.term_type === "skill") && t.legacy_drill_id).map(fromTerm)
      .sort((a, b) => (a.stroke ?? "").localeCompare(b.stroke ?? "") || a.drill_name.localeCompare(b.drill_name));
  } catch (e) {
    if (!missingTable(e)) throw e;
    // Database without the vocabulary yet: read the old library.
    const { data, error } = await sb.from("drills_library").select("*").eq("club_id", clubIdOf(club)).order("stroke").order("drill_name");
    if (error) throw error;
    return (data ?? []) as unknown as FullDrill[];
  }
}
export async function loadDrill(id: string): Promise<FullDrill | null> {
  try {
    const t = await loadTermByDrill(id);
    if (t) return fromTerm(t);
  } catch (e) { if (!missingTable(e)) throw e; }
  const { data, error } = await sb.from("drills_library").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as FullDrill | null;
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
  kind: "drill" | "skill"; stroke: string; name: string; pseudonyms: string; purpose: string; blabt: string; biomech: string;
  equipment: string; regression: string; progression: string;
  /** development_targets id → weight */
  targets: Record<string, "primary" | "secondary">;
}

/** Save to the club vocabulary. Returns the drills_library id the rest of the app links to. */
export async function saveDrill(club: string, drill: FullDrill | null, d: DrillDraft, opts: { coach: string; reviewer: boolean }): Promise<string> {
  const saved = await saveTerm(club, drill?.term_id ?? null, {
    term: d.name, aliases: d.pseudonyms, full_form: "", meaning: d.purpose, term_type: d.kind, stroke: d.stroke,
    details: { purpose: d.purpose, blabt: d.blabt, biomechanical: d.biomech, equipment: d.equipment, regression: d.regression, progression: d.progression }
  }, opts);
  await saveTermTargets(saved.id, d.targets);
  if (!saved.legacy_drill_id) throw new Error("Saved, but the drill link wasn't created. Reload and try again.");
  return saved.legacy_drill_id;
}

/** Take a drill out of the library. Plans and feedback that used it keep their history. */
export async function deleteDrill(drill: FullDrill) {
  if (!drill.term_id) throw new Error("This drill can't be removed here yet. Reload and try again.");
  await removeTerm(drill.term_id);
}
