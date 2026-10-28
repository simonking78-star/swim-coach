import { sb } from "./supabase";
import type { Role } from "./access";
import { todayLocal } from "./util";
import { clubIdOf, clubIdOrNull, clubCols, clubNameOf, forgetSquadIds, SWIMMER_SQUAD, flatSquad } from "./clubs";

// Admin: squads, members, squad and club moves, deactivate/reactivate, users & roles.
// Same tables, RPCs and rules as the current app.

export interface SquadRow { id: string; name: string; n: number; }
export async function loadSquadCounts(club: string): Promise<SquadRow[]> {
  const { data, error } = await sb.from("squads").select("id, name, swimmers(count)").eq("club_id", clubIdOf(club)).order("name");
  if (error) throw error;
  return ((data ?? []) as unknown as { id: string; name: string; swimmers: { count: number }[] }[]).map(q => ({ id: q.id, name: q.name, n: q.swimmers?.[0]?.count ?? 0 }));
}
export async function addSquad(club: string, name: string) {
  const { error } = await sb.from("squads").insert({ name, ...clubCols(club) } as never);
  if (error) throw new Error(error.message.includes("duplicate") ? "That squad already exists." : "Add failed — " + error.message);
}
export async function renameSquad(id: string, name: string) {
  const { error } = await sb.from("squads").update({ name } as never).eq("id", id);
  if (error) throw error;
  forgetSquadIds();
}

export interface PickSwimmer { id: string; full_name: string; squad: string | null; squad_id: string | null; club: string; }
export async function loadActiveSwimmers(club: string): Promise<PickSwimmer[]> {
  const { data, error } = await sb.from("swimmers").select(`id, full_name, squad_id, club_id, ${SWIMMER_SQUAD}`).eq("active", true).eq("club_id", clubIdOf(club)).order("full_name");
  if (error) throw error;
  type Raw = Omit<PickSwimmer, "squad" | "club"> & { club_id: string; sq: { name: string } | null };
  return flatSquad((data ?? []) as unknown as Raw[]).map(({ club_id, ...r }) => ({ ...r, club: clubNameOf(club_id) ?? club }));
}

export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export interface MemberDraft { full_name: string; dob: string; seId: string; squadId: string; joined: string; parentName: string; parentPhone: string; parentEmail: string; }
export function validateMember(m: MemberDraft): string | null {
  if (!m.full_name.trim()) return "Enter the swimmer's full name.";
  if (!m.dob) return "Enter the date of birth.";
  if (!m.squadId) return "Choose a squad.";
  if (!m.joined) return "Set the date joined club.";
  if (m.parentEmail.trim() && !validEmail(m.parentEmail.trim())) return "That email address doesn't look right.";
  return null;
}
/** Inserts the swimmer (a trigger fills the squad name) and opens a squad membership from today. */
export async function addMember(club: string, m: MemberDraft): Promise<string> {
  const { data, error } = await sb.from("swimmers").insert({
    full_name: m.full_name.trim(), date_of_birth: m.dob, squad_id: m.squadId, ...clubCols(club), swim_england_id: m.seId.trim() || null,
    joined_club_on: m.joined, parent_name: m.parentName.trim() || null, parent_phone: m.parentPhone.trim() || null,
    parent_email: m.parentEmail.trim() || null, active: true
  } as never).select("id").single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  const { error: me } = await sb.from("squad_memberships").insert({ swimmer_id: id, squad_id: m.squadId, joined_squad_on: todayLocal().date } as never);
  if (me) console.error(me);
  return id;
}

/** Date-stamped squad move: close the open membership, open a new one, set swimmers.squad_id. */
export async function moveToSquad(swimmerId: string, squadId: string, onDate: string) {
  const { error: ce } = await sb.from("squad_memberships").update({ ended_on: onDate } as never).eq("swimmer_id", swimmerId).is("ended_on", null);
  if (ce) console.error(ce);
  const { error: oe } = await sb.from("squad_memberships").insert({ swimmer_id: swimmerId, squad_id: squadId, joined_squad_on: onDate } as never);
  if (oe) throw oe;
  const { error: se } = await sb.from("swimmers").update({ squad_id: squadId } as never).eq("id", swimmerId);
  if (se) throw se;
}
/** Club move: close the open membership, open one in the new club's squad if chosen, set club + squad. */
export async function moveToClub(swimmerId: string, club: string, squadId: string | null, onDate: string) {
  const { error: ce } = await sb.from("squad_memberships").update({ ended_on: onDate } as never).eq("swimmer_id", swimmerId).is("ended_on", null);
  if (ce) console.error(ce);
  if (squadId) {
    const { error } = await sb.from("squad_memberships").insert({ swimmer_id: swimmerId, squad_id: squadId, joined_squad_on: onDate } as never);
    if (error) throw error;
  }
  const { error } = await sb.from("swimmers").update({ ...clubCols(club), squad_id: squadId } as never).eq("id", swimmerId);
  if (error) throw error;
}

export interface SwimmerDetail { full_name: string; date_of_birth: string | null; swim_england_id: string | null; squad: string | null; joined_club_on: string | null; parent_name: string | null; parent_phone: string | null; parent_email: string | null; since: string | null; }
export async function loadSwimmerDetail(id: string): Promise<SwimmerDetail> {
  const [s, m] = await Promise.all([
    sb.from("swimmers").select(`full_name, date_of_birth, swim_england_id, joined_club_on, parent_name, parent_phone, parent_email, ${SWIMMER_SQUAD}`).eq("id", id).single(),
    sb.from("squad_memberships").select("joined_squad_on").eq("swimmer_id", id).is("ended_on", null).order("joined_squad_on", { ascending: false }).limit(1)
  ]);
  if (s.error) throw s.error;
  const [d] = flatSquad([s.data as unknown as Omit<SwimmerDetail, "since" | "squad"> & { sq: { name: string } | null }]);
  return { ...d, since: ((m.data ?? []) as { joined_squad_on: string }[])[0]?.joined_squad_on ?? null };
}
export function timeIn(since: string | null, today = todayLocal().date): string {
  if (!since) return "";
  const days = Math.max(0, Math.floor((new Date(today + "T00:00:00").getTime() - new Date(since + "T00:00:00").getTime()) / 86400000));
  const months = Math.floor(days / 30.44);
  return months >= 1 ? `${months} month${months === 1 ? "" : "s"}` : `${days} day${days === 1 ? "" : "s"}`;
}

export async function loadUnassigned(club: string) {
  // No squad, by definition, so no squad name to read.
  const { data, error } = await sb.from("swimmers").select("id, full_name").eq("active", true).eq("club_id", clubIdOf(club)).is("squad_id", null).order("full_name");
  if (error) throw error;
  return ((data ?? []) as { id: string; full_name: string }[]).map(r => ({ ...r, squad: null as string | null }));
}
/** Every club on file (the results archive holds other clubs too). */
export async function loadAllClubs(): Promise<string[]> {
  const { data, error } = await sb.from("clubs").select("name").order("name");
  if (error) throw error;
  return (data ?? []).map(r => r.name as string);
}

// ---- Deactivate / reactivate (admin-only RPCs; the archive table itself is never read) ----
export interface ArchivedSwimmer { swimmer_id: string; full_name: string; anon_name: string; squad: string | null; squad_id: string | null; deactivated_on: string; reason: string | null; result_count: number; }
export async function loadDeactivated(club: string): Promise<ArchivedSwimmer[]> {
  const { data, error } = await (sb.rpc as unknown as (f: string, a: object) => ReturnType<typeof sb.rpc>)("list_deactivated_swimmers", { p_club_id: clubIdOf(club) });
  if (error) throw error;
  return (data ?? []) as ArchivedSwimmer[];
}
export async function deactivateSwimmer(id: string, reason: string) {
  const { error } = await sb.rpc("deactivate_swimmer", { p_swimmer: id, p_reason: reason.trim() || undefined });
  if (error) throw error;
}
export async function reactivateSwimmer(id: string, squadId: string | null) {
  const { error } = await sb.rpc("reactivate_swimmer", { p_swimmer: id, p_squad: squadId ?? undefined });
  if (error) throw error;
}

// ---- Users & roles ----
export const ROLE_HINT: Record<string, string> = {
  club_admin: "Everything for their club, including inviting people.",
  head_coach: "Edits attendance, feedback, plans, timetables and the season plan; roster read-only.",
  coach: "Edits attendance and plans; feedback for their own squads only; season plan read-only.",
  helper: "Marks attendance for their own squads and uses the stopwatch; plans read-only.",
  parent: "Reads their own children's feedback, results and timetables — link as many children as they have.",
  swimmer: "Reads their own feedback, results and timetables.",
  superadmin: "Everything, in every club, including App dev."
};
export const needsSquads = (r: string) => r === "coach" || r === "helper";
export const needsSwimmers = (r: string) => r === "parent" || r === "swimmer";

export interface Person {
  user_id: string; email: string; full_name: string | null;
  roles: { role: Role; club: string | null }[];
  squads: { squad_id: string; squads: { name: string; club: string } | null }[];
  kids: { swimmer_id: string; swimmers: { full_name: string; club: string } | null }[];
}
export async function loadPeople(me: string | undefined): Promise<Person[]> {
  const [u, r, s, w] = await Promise.all([
    sb.from("app_users").select("user_id, email, full_name, invited_at, last_link_at"),
    sb.from("user_roles").select("user_id, role, club_id"),
    sb.from("user_squads").select("user_id, squad_id, squads(name, club_id)"),
    sb.from("user_swimmers").select("user_id, swimmer_id, relationship, swimmers(full_name, club_id)")
  ]);
  const err = u.error || r.error || s.error || w.error;
  if (err) throw err;
  type U = { user_id: string; email: string; full_name: string | null };
  type R = { user_id: string; role: Role; club_id: string | null };
  type S = { user_id: string; squad_id: string; squads: { name: string; club_id: string } | null };
  type W = { user_id: string; swimmer_id: string; swimmers: { full_name: string; club_id: string | null } | null };
  // Club names come from the club list, not from copied text columns.
  return ((u.data ?? []) as U[]).map(p => ({
    ...p,
    roles: ((r.data ?? []) as R[]).filter(x => x.user_id === p.user_id).map(({ role, club_id }) => ({ role, club: clubNameOf(club_id) })),
    squads: ((s.data ?? []) as unknown as S[]).filter(x => x.user_id === p.user_id)
      .map(x => ({ squad_id: x.squad_id, squads: x.squads ? { name: x.squads.name, club: clubNameOf(x.squads.club_id) ?? "" } : null })),
    kids: ((w.data ?? []) as unknown as W[]).filter(x => x.user_id === p.user_id)
      .map(x => ({ swimmer_id: x.swimmer_id, swimmers: x.swimmers ? { full_name: x.swimmers.full_name, club: clubNameOf(x.swimmers.club_id) ?? "" } : null }))
  })).filter(p => p.roles.length || p.user_id === me)
    .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
}

export interface InvitePayload { full_name: string; email: string; role: string; club: string | null; squad_ids: string[]; swimmer_ids: string[]; redirect_to: string; }
/** What the invite-user function receives: the club by id (it still accepts a name from older app versions until Phase 6). */
type InviteBody = Omit<InvitePayload, "club"> & { club_id: string | null };
export class InviteError extends Error { link?: string; }
/** invite-user edge function (it holds the secret key). Returns a one-time sign-in link, or none for someone who has signed in before. */
export async function callInvite(payload: InvitePayload): Promise<{ link: string | null; existing?: boolean }> {
  const { club, ...rest } = payload;
  const body: InviteBody = { ...rest, club_id: clubIdOrNull(club) };
  const { data, error } = await sb.functions.invoke("invite-user", { body });
  if (!error) return data as { link: string | null; existing?: boolean };
  let msg = error.message, extra: { error?: string; link?: string } = {};
  try { extra = await (error as unknown as { context: Response }).context.json(); msg = extra.error || msg; } catch { /* not JSON */ }
  const e = new InviteError(msg);
  e.link = extra.link;
  throw e;
}
/** Remove one role (for that club only), then tidy that club's squad / swimmer links if no other role there still needs them. */
export async function removeRole(p: Person, role: string, club: string | null) {
  let q = sb.from("user_roles").delete().eq("user_id", p.user_id).eq("role", role);
  q = club ? q.eq("club_id", clubIdOf(club)) : q.is("club_id", null);
  const { error } = await q;
  if (error) throw error;
  const stillInClub = p.roles.some(x => !(x.role === role && x.club === club) && x.club === club);
  if (club && !stillInClub) {
    const sq = p.squads.filter(x => x.squads?.club === club).map(x => x.squad_id);
    const kids = p.kids.filter(k => k.swimmers?.club === club).map(k => k.swimmer_id);
    if (sq.length) await sb.from("user_squads").delete().eq("user_id", p.user_id).in("squad_id", sq);
    if (kids.length) await sb.from("user_swimmers").delete().eq("user_id", p.user_id).in("swimmer_id", kids);
  }
}
export async function unlinkSwimmer(userId: string, swimmerId: string) {
  const { error } = await sb.from("user_swimmers").delete().eq("user_id", userId).eq("swimmer_id", swimmerId);
  if (error) throw error;
}
export async function searchSwimmers(club: string | null, q: string, activeOnly: boolean) {
  let query = sb.from("swimmers").select(`id, full_name, ${SWIMMER_SQUAD}`).ilike("full_name", `%${q}%`).order("full_name").limit(8);
  if (club) query = query.eq("club_id", clubIdOf(club));
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return flatSquad((data ?? []) as unknown as { id: string; full_name: string; sq: { name: string } | null }[]);
}

// ---- Role test mode (real superadmin only) ----
export async function startRoleTest(userId: string, role: string, club: string | null, squadIds: string[], swimmerIds: string[]) {
  const row = { user_id: userId, role, club_id: clubIdOrNull(club), squad_ids: squadIds, swimmer_ids: swimmerIds, started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 8 * 3600e3).toISOString() };
  const { error } = await sb.from("role_test_mode").upsert(row as never);
  if (error) throw error;
}
export async function stopRoleTest(userId: string) {
  const { error } = await sb.from("role_test_mode").delete().eq("user_id", userId);
  if (error) throw error;
}

// ---- App dev action list ----
export const AD_MILESTONES: [string, string][] = [
  ["M0", "Baseline & spec"], ["M1", "Secure foundation"], ["M2", "Compliance pack"], ["M3", "Internal alpha"],
  ["M4", "Closed pilot"], ["M5", "Club rollout"], ["M6", "Multi-club & stores"], ["Later", "Later"]
];
export const AD_AREAS = ["Specification", "Integration", "Deployment", "Multi-user", "Payments", "Statistics", "Data capture", "Forums",
  "Membership", "Restricted access", "GDPR", "Android & iOS", "PWA", "Websites", "CRM"];
export const AD_STATUSES = ["todo", "doing", "blocked", "done", "dropped"];
export const AD_STATUS_LABEL: Record<string, string> = { todo: "To do", doing: "Doing", blocked: "Blocked", done: "Done", dropped: "Dropped" };
export const AD_PRIORITIES = ["Must", "Should", "Could", "Won't-now"];

export interface DevTask { id: string; title: string; milestone: string; area: string; priority: string; status: string; due_on: string | null; owner_role: string | null; gate: boolean; evidence: string | null; notes: string | null; }
export async function loadDevTasks(): Promise<DevTask[]> {
  const { data, error } = await sb.from("app_dev_tasks").select("*").order("id");
  if (error) throw error;
  return (data ?? []) as DevTask[];
}
export function gateScores(tasks: DevTask[]) {
  const out: Record<string, { done: number; total: number }> = {};
  for (const [m] of AD_MILESTONES) {
    const g = tasks.filter(t => t.milestone === m && t.gate && t.status !== "dropped");
    out[m] = { done: g.filter(t => t.status === "done").length, total: g.length };
  }
  return out;
}
export function currentMilestone(scores: ReturnType<typeof gateScores>): string {
  for (const [m] of AD_MILESTONES) {
    if (m === "Later") break;
    const s = scores[m];
    if (s.total && s.done < s.total) return m;
  }
  return "M6";
}
export function nextTaskId(tasks: DevTask[]): string {
  const n = tasks.reduce((mx, t) => Math.max(mx, parseInt(String(t.id).replace(/\D/g, ""), 10) || 0), 0);
  return "A-" + String(n + 1).padStart(3, "0");
}
export function validateTask(t: DevTask, isNew: boolean, tasks: DevTask[]): string | null {
  if (!t.title.trim()) return "Give the action a title.";
  if (t.status === "done" && !(t.evidence || "").trim()) return "Add evidence before marking this done.";
  if (isNew) {
    if (!/^A-\d{3,}$/.test(t.id)) return "ID must look like A-084.";
    if (tasks.some(x => x.id === t.id)) return `${t.id} already exists.`;
  }
  return null;
}
const clean = (t: DevTask) => ({
  title: t.title.trim(), milestone: t.milestone, area: t.area, priority: t.priority, status: t.status, due_on: t.due_on || null,
  owner_role: (t.owner_role || "").trim() || null, gate: t.gate, evidence: (t.evidence || "").trim() || null, notes: (t.notes || "").trim() || null
});
export async function addTask(t: DevTask) {
  const { error } = await sb.from("app_dev_tasks").insert({ id: t.id.trim().toUpperCase(), ...clean(t) } as never);
  if (error) throw error;
}
export async function saveTask(id: string, t: DevTask) {
  const { error } = await sb.from("app_dev_tasks").update(clean(t) as never).eq("id", id);
  if (error) throw error;
}
export async function setTaskStatus(id: string, status: string) {
  const { error } = await sb.from("app_dev_tasks").update({ status } as never).eq("id", id);
  if (error) throw error;
}
