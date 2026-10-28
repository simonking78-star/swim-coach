import { useEffect, useState } from "react";
import { sb } from "./supabase";
import { looksOffline, queueWrite } from "./offline";
import { isoAdd, uuid } from "./util";
import { clubIdOf, clubCols, squadIdOf, SWIMMER_SQUAD, flatSquad } from "./clubs";

// Feedback — swimmer and squad. Same tables, values and rules as the current
// app's viewFeedback (fbSwimmerMode / fbSquadMode).

/** Stored category values (kept exactly as the current app saves them). */
export const CATEGORIES = ["Free", "Back", "Breast", "Fly", "Dive", "Transition", "Touch turn", "Tumble turn", "Training mindset", "Racing mindset"];
export const CATEGORY_LABEL: Record<string, string> = { Free: "Freestyle", Back: "Backstroke", Breast: "Breaststroke", Fly: "Butterfly" };
export const catLabel = (c: string | null | undefined) => (c ? CATEGORY_LABEL[c] ?? c : "");

export const STATUSES = ["Not discussed", "Started", "Developing", "Embedded"] as const;
export type FbStatus = (typeof STATUSES)[number];
export type EntryType = "status" | "note";

export const MAX_FILE_MB = 100;
const BUCKET = "feedback-media";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------
export interface Media { path?: string; url?: string; type: "image" | "video"; name?: string; }

export interface SwimmerLite { id: string; full_name: string; squad: string | null; squad_id: string | null; }

export interface FbEntry {
  id: string;
  thread_id: string;
  entry_type: EntryType;
  category: string;
  criterion: string | null;
  status: string | null;
  observation: string | null;
  remedial_action: string | null;
  /** Drills & skills chosen as the remedial action (swimmer feedback only). */
  remedial_drill_ids?: string[] | null;
  note: string | null;
  media: Media[] | null;
  session_date: string;
  created_at: string;
  coach?: string | null;
}

export interface Thread<T extends FbEntry = FbEntry> { id: string; entries: T[]; /* newest first */ }

/**
 * Group entries (already newest-first) into strings by thread_id. A stroke
 * filter keeps a string when its latest entry matches, as the current app does.
 */
export function toThreads<T extends FbEntry>(rows: T[], stroke: string | null): Thread<T>[] {
  const by = new Map<string, T[]>();
  for (const r of rows) { const l = by.get(r.thread_id); l ? l.push(r) : by.set(r.thread_id, [r]); }
  let list = [...by.entries()].map(([id, entries]) => ({ id, entries }));
  if (stroke) list = list.filter(t => t.entries[0].category === stroke);
  return list.sort((a, b) =>
    (b.entries[0].session_date + b.entries[0].created_at).localeCompare(a.entries[0].session_date + a.entries[0].created_at));
}

// ---------------------------------------------------------------------------
// Swimmer feedback
// ---------------------------------------------------------------------------
export async function loadFbSwimmers(club: string, squad: string | null): Promise<SwimmerLite[]> {
  let q = sb.from("swimmers").select(`id, full_name, squad_id, ${SWIMMER_SQUAD}`).eq("active", true).eq("club_id", clubIdOf(club)).order("full_name");
  if (squad) q = q.eq("squad_id", await squadIdOf(club, squad));
  const { data, error } = await q;
  if (error) throw error;
  return flatSquad((data ?? []) as unknown as { id: string; full_name: string; squad_id: string | null; sq: { name: string } | null }[]);
}

const FB_COLS = "id, thread_id, entry_type, category, criterion, status, observation, remedial_action, remedial_drill_ids, note, media, session_date, created_at, coach";

export async function loadSwimmerHistory(swimmerId: string): Promise<FbEntry[]> {
  const { data, error } = await sb.from("swimmer_feedback").select(FB_COLS)
    .eq("swimmer_id", swimmerId)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FbEntry[];
}

export interface RecentEntry extends FbEntry { swimmer_id: string; swimmer_name: string; }
export async function loadRecentSwimmerFeedback(club: string): Promise<RecentEntry[]> {
  const { data, error } = await sb.from("swimmer_feedback")
    .select(FB_COLS + ", swimmer_id, swimmers!inner(full_name, club_id)")
    .eq("swimmers.club_id", clubIdOf(club))
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) throw error;
  return ((data ?? []) as unknown as (FbEntry & { swimmer_id: string; swimmers: { full_name: string } | null })[])
    .map(r => ({ ...r, swimmer_name: r.swimmers?.full_name ?? "Unknown swimmer" }));
}

/** Criteria already used for this stroke/skill (across all swimmers), for suggestions. */
export async function loadCriteria(category: string): Promise<string[]> {
  const { data, error } = await sb.from("swimmer_feedback").select("criterion").eq("category", category).not("criterion", "is", null);
  if (error) throw error;
  return [...new Set((data ?? []).map(r => (r.criterion as string)?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export interface SwimmerFbDraft {
  swimmerId: string;
  threadId: string | null; // null = start a new string
  entryType: EntryType;
  category: string;
  criterion: string;
  status: string | null;
  observation: string;
  /** Readable remedial action: chosen drill names plus any cue. */
  remedial: string;
  remedialDrillIds: string[];
  notes: string;
  date: string;
  planId: string;
  files: File[];
  coach: string;
}

export function validateSwimmerDraft(d: SwimmerFbDraft): string | null {
  if (!d.category) return "Choose a stroke or skill.";
  if (!d.date) return "Set a date.";
  if (!d.observation.trim()) return "Enter an observation — what did you see?";
  if (d.entryType === "status") {
    if (!d.criterion.trim()) return "Enter a criterion.";
    if (!d.status) return "Pick a status.";
  }
  return null;
}

/** Photos and videos go to the private bucket; only the path is stored. */
export async function uploadMedia(swimmerId: string, files: File[], onProgress?: (i: number, n: number) => void): Promise<Media[]> {
  const out: Media[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.(i + 1, files.length);
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${swimmerId}/${Date.now()}-${i}-${safe}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
    if (error) throw new Error(`Upload failed for ${f.name}: ${error.message}`);
    out.push({ path, type: f.type.startsWith("video/") ? "video" : "image", name: f.name });
  }
  return out;
}

/** Always adds a new dated entry — never overwrites one. */
export async function saveSwimmerFeedback(d: SwimmerFbDraft, onProgress?: (i: number, n: number) => void): Promise<"saved" | "queued"> {
  const media = d.files.length ? await uploadMedia(d.swimmerId, d.files, onProgress) : [];
  const row: Record<string, unknown> = {
    swimmer_id: d.swimmerId,
    entry_type: d.entryType,
    category: d.category,
    observation: d.observation.trim(),
    remedial_action: d.remedial.trim() || null,
    remedial_drill_ids: d.remedialDrillIds,
    note: d.notes.trim() || null,
    session_plan_id: d.planId || null,
    session_date: d.date,
    thread_id: d.threadId || uuid(),
    coach: d.coach,
    media
  };
  if (d.entryType === "status") { row.criterion = d.criterion.trim(); row.status = d.status; }
  const { error } = await sb.from("swimmer_feedback").insert(row as never);
  if (error && looksOffline(error) && !d.files.length) {
    // Text-only entries can wait for a signal; one with media needed a live upload first.
    await queueWrite("swimmer_feedback", row);
    return "queued";
  }
  if (error) throw error;
  return "saved";
}

// ---------------------------------------------------------------------------
// Private media: short-lived signed links
// ---------------------------------------------------------------------------
/** Path in the bucket; older entries stored a public URL, so recover it from that. */
export function mediaPath(m: Media): string | null {
  if (m.path) return m.path;
  const i = (m.url || "").indexOf(`/${BUCKET}/`);
  return i < 0 ? null : decodeURIComponent(m.url!.slice(i + BUCKET.length + 2).split("?")[0]);
}

const signedCache = new Map<string, { url: string; until: number }>();
export function useSignedUrls(media: Media[] | null | undefined): Record<string, string> {
  const paths = (media ?? []).map(mediaPath).filter(Boolean) as string[];
  const key = paths.join("|");
  const [urls, setUrls] = useState<Record<string, string>>(() => fromCache(paths));
  useEffect(() => {
    if (!paths.length) return;
    const now = Date.now();
    const missing = paths.filter(p => !(signedCache.get(p)?.until! > now));
    if (!missing.length) { setUrls(fromCache(paths)); return; }
    let live = true;
    sb.storage.from(BUCKET).createSignedUrls(missing, 3600).then(({ data, error }) => {
      if (error) { console.error(error); return; }
      for (const d of data ?? []) if (d.signedUrl && d.path) signedCache.set(d.path, { url: d.signedUrl, until: now + 50 * 60 * 1000 });
      if (live) setUrls(fromCache(paths));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
function fromCache(paths: string[]) {
  const out: Record<string, string> = {};
  for (const p of paths) { const c = signedCache.get(p); if (c) out[p] = c.url; }
  return out;
}

// ---------------------------------------------------------------------------
// Squad feedback
// ---------------------------------------------------------------------------
export interface SquadLite { id: string; name: string; entries: number; }

export async function loadFbSquads(club: string): Promise<SquadLite[]> {
  const [sq, fb] = await Promise.all([
    sb.from("squads").select("id, name").eq("club_id", clubIdOf(club)).order("name"),
    sb.from("squad_feedback").select("squad_id").eq("club_id", clubIdOf(club)).eq("is_active", true)
  ]);
  if (sq.error) throw sq.error;
  const counts = new Map<string, number>();
  for (const r of fb.data ?? []) counts.set(r.squad_id as string, (counts.get(r.squad_id as string) ?? 0) + 1);
  return (sq.data ?? []).map(s => ({ id: s.id as string, name: s.name as string, entries: counts.get(s.id as string) ?? 0 }));
}

export interface Drill { id: string; drill_name: string; stroke: string | null; pseudonyms?: string[] | null; }
export interface SquadFbEntry extends FbEntry {
  drill_id: string | null;
  drills_library: Drill | null;
  squad_drill_weeks: { micro_id: string; is_active: boolean }[] | null;
}

export async function loadSquadHistory(squadId: string): Promise<SquadFbEntry[]> {
  const { data, error } = await sb.from("squad_feedback")
    .select("id, thread_id, entry_type, category, criterion, status, observation, remedial_action, note, session_date, created_at, coach, drill_id, drills_library(id, drill_name, stroke), squad_drill_weeks(micro_id, is_active)")
    .eq("squad_id", squadId).eq("is_active", true)
    .order("session_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({ ...(r as unknown as SquadFbEntry), media: [] }));
}

export interface RecentSquadEntry { id: string; squad_id: string; squad_name: string; category: string; criterion: string | null; status: string | null; observation: string; session_date: string; drill_name: string | null; }
export async function loadRecentSquadFeedback(club: string): Promise<RecentSquadEntry[]> {
  const { data, error } = await sb.from("squad_feedback")
    .select("id, squad_id, category, criterion, status, observation, session_date, squads(name), drills_library(drill_name)")
    .eq("club_id", clubIdOf(club)).eq("is_active", true)
    .order("created_at", { ascending: false }).limit(12);
  if (error) throw error;
  type Raw = Omit<RecentSquadEntry, "squad_name" | "drill_name"> & { squads: { name: string } | null; drills_library: { drill_name: string } | null };
  return ((data ?? []) as unknown as Raw[]).map(r => ({ ...r, squad_name: r.squads?.name ?? "Squad", drill_name: r.drills_library?.drill_name ?? null }));
}

export async function loadDrills(club: string): Promise<Drill[]> {
  const { data, error } = await sb.from("drills_library").select("id, drill_name, stroke, pseudonyms").eq("club_id", clubIdOf(club)).order("stroke").order("drill_name");
  if (error) throw error;
  return (data ?? []) as unknown as Drill[];
}

export function searchDrills(drills: Drill[], q: string): Drill[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  return drills.filter(d => (d.drill_name || "").toLowerCase().includes(t) || (d.stroke || "").toLowerCase().includes(t) ||
    (d.pseudonyms || []).some(p => (p || "").toLowerCase().includes(t))).slice(0, 12);
}

/** A squad's season weeks: micro-cycles of active macros (in active seasons) that include the squad. */
export interface SeasonWeek { id: string; week_no: number; week_commencing: string; qes_focus: string | null; macroTitle: string; }
export const QES: Record<string, string> = { quality: "Quality", endurance: "Endurance", sprint: "Sprint" };

export async function loadSquadWeeks(club: string, squadId: string): Promise<SeasonWeek[]> {
  const { data: seasons, error: se } = await sb.from("seasons").select("id").eq("club_id", clubIdOf(club)).eq("is_active", true);
  if (se) throw se;
  const ids = (seasons ?? []).map(s => s.id as string);
  if (!ids.length) return [];
  const { data, error } = await sb.from("macros")
    .select("id, title, macro_squads(squad_id, is_active), micros(id, week_no, week_commencing, qes_focus, is_active)")
    .in("season_id", ids).eq("is_active", true);
  if (error) throw error;
  type M = { title: string; macro_squads: { squad_id: string; is_active: boolean }[]; micros: { id: string; week_no: number; week_commencing: string | null; qes_focus: string | null; is_active: boolean }[] };
  const out: SeasonWeek[] = [];
  for (const m of (data ?? []) as unknown as M[]) {
    if (!(m.macro_squads || []).some(x => x.squad_id === squadId && x.is_active)) continue;
    for (const mi of m.micros || []) {
      if (mi.is_active && mi.week_commencing) out.push({ id: mi.id, week_no: mi.week_no, week_commencing: mi.week_commencing, qes_focus: mi.qes_focus, macroTitle: m.title });
    }
  }
  return out.sort((a, b) => a.week_commencing.localeCompare(b.week_commencing));
}
export const weekIsPast = (w: SeasonWeek, today: string) => isoAdd(w.week_commencing, 6) < today;
export const weekIsNow = (w: SeasonWeek, today: string) => w.week_commencing <= today && isoAdd(w.week_commencing, 6) >= today;

export interface SquadFbDraft {
  club: string;
  squadId: string;
  threadId: string | null;
  entryType: EntryType;
  category: string;
  criterion: string;
  status: string | null;
  observation: string;
  remedial: string;
  notes: string;
  drill: Drill | null;
  weeks: string[];          // micro ids
  date: string;
  planId: string;
  coach: string;
  /** ids of earlier entries in the same string, whose week links are retired */
  previousIds: string[];
}

export function validateSquadDraft(d: SquadFbDraft): string | null {
  if (!d.category) return "Choose a stroke or skill.";
  if (!d.date) return "Set a date.";
  if (!d.observation.trim()) return "Enter an observation — what did you see across the squad?";
  if (d.entryType === "status") {
    if (!d.criterion.trim()) return "Enter a criterion.";
    if (!d.status) return "Pick the squad's status.";
  }
  return null;
}

/** Adds a dated entry; only the newest entry in a string drives the season weeks. */
export async function saveSquadFeedback(d: SquadFbDraft): Promise<{ weeksLinked: number }> {
  const row: Record<string, unknown> = {
    ...clubCols(d.club), squad_id: d.squadId, entry_type: d.entryType, category: d.category,
    observation: d.observation.trim(),
    remedial_action: d.remedial.trim() || null,
    note: d.notes.trim() || null,
    drill_id: d.drill?.id ?? null,
    session_plan_id: d.planId || null,
    session_date: d.date,
    coach: d.coach
  };
  if (d.threadId) row.thread_id = d.threadId;
  if (d.entryType === "status") { row.criterion = d.criterion.trim(); row.status = d.status; }

  const { data: saved, error } = await sb.from("squad_feedback").insert(row as never).select("id, thread_id").single();
  if (error) throw error;
  if (d.previousIds.length) {
    const { error: ue } = await sb.from("squad_drill_weeks").update({ is_active: false } as never).in("squad_feedback_id", d.previousIds).eq("is_active", true);
    if (ue) throw ue;
  }
  const weeks = d.drill ? d.weeks : [];
  if (weeks.length) {
    const { error: we } = await sb.from("squad_drill_weeks").insert(weeks.map(mid => ({
      squad_feedback_id: (saved as { id: string }).id, squad_id: d.squadId, drill_id: d.drill!.id, micro_id: mid, ...clubCols(d.club)
    })) as never);
    if (we) throw we;
  }
  return { weeksLinked: weeks.length };
}
