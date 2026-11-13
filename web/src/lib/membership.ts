import type { SupabaseClient } from "@supabase/supabase-js";
import { sb } from "./supabase";
import { calcAge } from "./results";
import { clubIdOf, flatSquad, SWIMMER_SQUAD } from "./clubs";
import { summarise, type AttMark } from "./attendance";
import { isoAdd, todayLocal } from "./util";

// Membership administration: account holders, athletes, guardians, medical, fees,
// Swim England registration. Spec: claude/specs/membership-admin.md.
// Migration 20261113150000_membership_admin.sql adds these tables; until the generated
// types are refreshed they are reached through an untyped client.
const db = sb as unknown as SupabaseClient;

export type AccountStatus = "pending" | "live" | "suspended" | "resigned";
export const ACCOUNT_STATUS: { key: AccountStatus; label: string }[] = [
  { key: "pending", label: "Pending new" }, { key: "live", label: "Live" },
  { key: "suspended", label: "Suspended" }, { key: "resigned", label: "Resigned" }
];
export const statusLabel = (s: string) => ACCOUNT_STATUS.find(x => x.key === s)?.label ?? s;

/** Club volunteer / committee roles held by an account holder (not app permissions). */
export const CLUB_ROLES = ["Committee", "Welfare officer", "Team manager", "Official", "Volunteer", "Gala helper", "Coach", "Teacher"];

export interface Account {
  id: string; club_id: string; account_ref: string | null; title: string | null;
  first_name: string; last_name: string; email: string | null; phone_mobile: string | null; phone_other: string | null;
  address_line1: string | null; address_line2: string | null; town: string | null; county: string | null; postcode: string | null;
  status: AccountStatus; status_changed_on: string; applied_on: string | null; joined_on: string | null; resigned_on: string | null;
  club_roles: string[]; user_id: string | null; notes: string | null; updated_at: string;
}
export interface Guardian { id?: string; account_id?: string; full_name: string; relationship: string | null; phone: string | null; email: string | null; is_primary: boolean; }
export interface Fee {
  id?: string; account_id: string; swimmer_id: string | null; fee_type: "membership" | "squad" | "other"; description: string | null;
  amount: number; period_start: string | null; period_end: string | null; due_on: string | null;
  status: "due" | "paid" | "overdue" | "waived" | "refunded"; paid_on: string | null; method: string | null; notes: string | null;
}
export const FEE_STATUS = ["due", "paid", "overdue", "waived", "refunded"] as const;
export const FEE_METHODS = [["direct_debit", "Direct debit"], ["standing_order", "Standing order"], ["bank_transfer", "Bank transfer"], ["card", "Card"], ["cash", "Cash"], ["other", "Other"]] as const;

export interface Medical {
  swimmer_id: string; conditions: string | null; medication: string | null; allergies: string | null; other_notes: string | null;
  gp_name: string | null; gp_phone: string | null; consent_emergency_treatment: boolean | null; reviewed_on: string | null;
}
export interface EmergencyContact { id?: string; swimmer_id?: string; priority: number; full_name: string; relationship: string | null; phone: string; phone_alt: string | null; }
export interface SeReg { id?: string; swimmer_id: string; reg_year: number; category: "1" | "2" | "3"; status: "pending" | "registered" | "lapsed" | "transferred"; registered_on: string | null; expires_on: string | null; notes: string | null; }

/** Swim England membership year shown by default: the calendar year. */
export const currentRegYear = () => new Date().getFullYear();
export const fullName = (a: Pick<Account, "first_name" | "last_name" | "title">) => [a.title, a.first_name, a.last_name].filter(Boolean).join(" ");
export const money = (n: number) => "£" + n.toFixed(2);
export const outstanding = (fees: Pick<Fee, "status" | "amount">[]) => fees.filter(f => f.status === "due" || f.status === "overdue").reduce((s, f) => s + Number(f.amount), 0);
export const yearOf = (dob: string | null) => (dob ? Number(dob.slice(0, 4)) : null);

const check = <T,>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data as T; };

// ---------- Accounts ----------
export interface AccountRow extends Account {
  athletes: { id: string; full_name: string }[];
  guardians: number;
  owed: number;
  appRoles: string[];
}
export async function loadAccounts(club: string): Promise<AccountRow[]> {
  const cid = clubIdOf(club);
  const [a, s, g, f] = await Promise.all([
    db.from("member_accounts").select("*").eq("club_id", cid).order("last_name").order("first_name"),
    db.from("swimmers").select("id, full_name, account_id").eq("club_id", cid).eq("active", true).not("account_id", "is", null),
    db.from("member_guardians").select("account_id").eq("club_id", cid),
    db.from("member_fees").select("account_id, status, amount").eq("club_id", cid).in("status", ["due", "overdue"])
  ]);
  const accounts = check(a) as Account[];
  const users = accounts.map(x => x.user_id).filter((x): x is string => !!x);
  // App roles are readable to club admins only; others just see none.
  const roles = users.length ? await db.from("user_roles").select("user_id, role").in("user_id", users) : { data: [], error: null };
  const byAcc = <T extends { account_id: string }>(rows: T[]) => rows.reduce((m, r) => ((m[r.account_id] ||= []).push(r), m), {} as Record<string, T[]>);
  const kids = byAcc((check(s) ?? []) as { id: string; full_name: string; account_id: string }[]);
  const gs = byAcc((check(g) ?? []) as { account_id: string }[]);
  const fs = byAcc((check(f) ?? []) as { account_id: string; status: Fee["status"]; amount: number }[]);
  const rs = ((roles.data ?? []) as { user_id: string; role: string }[]);
  return accounts.map(x => ({
    ...x,
    athletes: (kids[x.id] ?? []).map(k => ({ id: k.id, full_name: k.full_name })),
    guardians: gs[x.id]?.length ?? 0,
    owed: outstanding(fs[x.id] ?? []),
    appRoles: rs.filter(r => r.user_id === x.user_id).map(r => r.role)
  }));
}

export async function loadAccount(id: string) {
  const [a, g, s, f] = await Promise.all([
    db.from("member_accounts").select("*").eq("id", id).single(),
    db.from("member_guardians").select("*").eq("account_id", id).order("is_primary", { ascending: false }),
    db.from("swimmers").select(`id, full_name, date_of_birth, active, ${SWIMMER_SQUAD}`).eq("account_id", id).order("full_name"),
    db.from("member_fees").select("*").eq("account_id", id).order("due_on", { ascending: false, nullsFirst: false })
  ]);
  type RawKid = { id: string; full_name: string; date_of_birth: string | null; active: boolean; sq: { name: string } | null };
  return {
    account: check(a) as Account,
    guardians: (check(g) ?? []) as Guardian[],
    athletes: flatSquad((check(s) ?? []) as unknown as RawKid[]).map(k => ({ ...k, age: calcAge(k.date_of_birth) })),
    fees: (check(f) ?? []) as Fee[]
  };
}

export type AccountDraft = Omit<Account, "id" | "club_id" | "updated_at" | "status_changed_on"> & { status_changed_on?: string };
export function blankAccount(): AccountDraft {
  return { account_ref: null, title: null, first_name: "", last_name: "", email: null, phone_mobile: null, phone_other: null,
    address_line1: null, address_line2: null, town: null, county: null, postcode: null, status: "pending",
    applied_on: todayLocal().date, joined_on: null, resigned_on: null, club_roles: [], user_id: null, notes: null };
}
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export function validateAccount(a: AccountDraft, guardians: Guardian[]): string | null {
  if (!a.first_name.trim() || !a.last_name.trim()) return "Enter the account holder's first and last name.";
  if (a.email && !validEmail(a.email.trim())) return "The account email doesn't look right.";
  if (!a.email && !a.phone_mobile && !a.phone_other) return "Add at least one way to contact the account holder (email or phone).";
  for (const g of guardians) {
    if (!g.full_name.trim()) return "Every guardian needs a name (or remove the empty row).";
    if (g.email && !validEmail(g.email.trim())) return `The email for ${g.full_name} doesn't look right.`;
  }
  return null;
}

const tidy = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? (v.trim() || null) : v])) as T;

/** Saves the account, its guardians (replace-by-diff) and its fees. Returns the account id. */
export async function saveAccount(club: string, id: string | null, draft: AccountDraft, prevStatus: AccountStatus | null,
                                  guardians: Guardian[], fees: Fee[], removedFees: string[]): Promise<string> {
  const row: Record<string, unknown> = tidy({ ...draft });
  row.first_name = draft.first_name.trim(); row.last_name = draft.last_name.trim();
  if (prevStatus !== draft.status) {
    row.status_changed_on = todayLocal().date;
    if (draft.status === "live" && !draft.joined_on) row.joined_on = todayLocal().date;
    if (draft.status === "resigned" && !draft.resigned_on) row.resigned_on = todayLocal().date;
  }
  let accId = id;
  if (id) check(await db.from("member_accounts").update(row).eq("id", id).select("id").single());
  else accId = (check(await db.from("member_accounts").insert({ ...row, club_id: clubIdOf(club) }).select("id").single()) as { id: string }).id;

  // Guardians: delete removed, upsert the rest.
  const existing = (check(await db.from("member_guardians").select("id").eq("account_id", accId!)) ?? []) as { id: string }[];
  const keep = new Set(guardians.map(g => g.id).filter(Boolean));
  const gone = existing.map(e => e.id).filter(x => !keep.has(x));
  if (gone.length) check(await db.from("member_guardians").delete().in("id", gone));
  for (const g of guardians) {
    const body = tidy({ full_name: g.full_name, relationship: g.relationship, phone: g.phone, email: g.email, is_primary: g.is_primary });
    if (g.id) check(await db.from("member_guardians").update(body).eq("id", g.id));
    else check(await db.from("member_guardians").insert({ ...body, account_id: accId, club_id: clubIdOf(club) }));
  }
  await saveFees(club, accId!, fees, removedFees);
  return accId!;
}

export async function saveFees(club: string, accountId: string, fees: Fee[], removed: string[]) {
  if (removed.length) check(await db.from("member_fees").delete().in("id", removed));
  for (const f of fees) {
    if (!(Number(f.amount) >= 0)) throw new Error("Each fee needs an amount.");
    const body = tidy({ swimmer_id: f.swimmer_id, fee_type: f.fee_type, description: f.description, amount: Number(f.amount),
      period_start: f.period_start, period_end: f.period_end, due_on: f.due_on, status: f.status,
      paid_on: f.status === "paid" ? (f.paid_on || todayLocal().date) : f.paid_on, method: f.method, notes: f.notes });
    if (f.id) check(await db.from("member_fees").update(body).eq("id", f.id));
    else check(await db.from("member_fees").insert({ ...body, account_id: accountId, club_id: clubIdOf(club) }));
  }
}

export async function setAccountStatus(id: string, status: AccountStatus, note?: string) {
  const today = todayLocal().date;
  const body: Record<string, unknown> = { status, status_changed_on: today };
  if (status === "live") body.joined_on = today;
  if (status === "resigned") body.resigned_on = today;
  if (note) {
    const cur = (check(await db.from("member_accounts").select("notes").eq("id", id).single()) as { notes: string | null }).notes;
    body.notes = [cur, `${today}: ${note}`].filter(Boolean).join("\n");
  }
  check(await db.from("member_accounts").update(body).eq("id", id));
}

/** Account options for linking an athlete. */
export async function loadAccountOptions(club: string) {
  const r = await db.from("member_accounts").select("id, first_name, last_name, title, status").eq("club_id", clubIdOf(club)).neq("status", "resigned").order("last_name");
  return ((check(r) ?? []) as Pick<Account, "id" | "first_name" | "last_name" | "title" | "status">[]).map(a => ({ id: a.id, label: `${a.last_name}, ${a.first_name}` + (a.status === "pending" ? " (pending)" : "") }));
}

// ---------- Athletes ----------
export interface AthleteRow {
  id: string; full_name: string; date_of_birth: string | null; age: number | null; yob: number | null; gender: string | null;
  squad: string | null; squad_id: string | null; swim_england_id: string | null; joined_club_on: string | null;
  account_id: string | null; account: string | null; account_status: string | null;
  pbs: number; seStatus: string | null; seCategory: string | null; medical: "yes" | "none" | "unknown" | null;
  active: boolean; inactive_on: string | null;
}
export async function loadAthletes(club: string, withMedical: boolean): Promise<AthleteRow[]> {
  const cid = clubIdOf(club), yr = currentRegYear();
  const [s, a, r] = await Promise.all([
    db.from("swimmers").select(`id, full_name, date_of_birth, gender, squad_id, swim_england_id, joined_club_on, account_id, ${SWIMMER_SQUAD}`).eq("club_id", cid).eq("active", true).order("full_name"),
    db.from("member_accounts").select("id, first_name, last_name, status").eq("club_id", cid),
    db.from("swim_england_registrations").select("swimmer_id, status, category").eq("club_id", cid).eq("reg_year", yr)
  ]);
  // PB counts by swimmer (results can carry an old club, so match on swimmer, in chunks).
  const ids = ((check(s) ?? []) as { id: string }[]).map(x => x.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 80) chunks.push(ids.slice(i, i + 80));
  const pbRows = (await Promise.all(chunks.map(c => db.from("swim_results").select("swimmer_id").eq("is_pb", true).in("swimmer_id", c).limit(5000))))
    .flatMap(x => (check(x) ?? []) as { swimmer_id: string }[]);
  const med = withMedical ? await db.from("swimmer_medical").select("swimmer_id, conditions, medication, allergies").eq("club_id", cid) : null;
  type Raw = Omit<AthleteRow, "squad" | "age" | "yob" | "account" | "account_status" | "pbs" | "seStatus" | "seCategory" | "medical" | "active" | "inactive_on"> & { sq: { name: string } | null };
  const accs = new Map(((check(a) ?? []) as { id: string; first_name: string; last_name: string; status: string }[]).map(x => [x.id, x]));
  const pbs: Record<string, number> = {};
  for (const x of pbRows) pbs[x.swimmer_id] = (pbs[x.swimmer_id] ?? 0) + 1;
  const regs = new Map(((check(r) ?? []) as { swimmer_id: string; status: string; category: string }[]).map(x => [x.swimmer_id, x]));
  const meds = med ? new Map(((check(med) ?? []) as { swimmer_id: string; conditions: string | null; medication: string | null; allergies: string | null }[]).map(x => [x.swimmer_id, x])) : null;
  return flatSquad((check(s) ?? []) as unknown as Raw[]).map(x => {
    const acc = x.account_id ? accs.get(x.account_id) : undefined;
    const m = meds?.get(x.id);
    return {
      ...x, age: calcAge(x.date_of_birth), yob: yearOf(x.date_of_birth),
      account: acc ? `${acc.last_name}, ${acc.first_name}` : null, account_status: acc?.status ?? null,
      pbs: pbs[x.id] ?? 0, seStatus: regs.get(x.id)?.status ?? null, seCategory: regs.get(x.id)?.category ?? null,
      medical: !meds ? null : !m ? "unknown" : (m.conditions || m.medication || m.allergies) ? "yes" : "none",
      active: true, inactive_on: null
    };
  });
}

export interface AthleteDetail {
  id: string; full_name: string; date_of_birth: string | null; gender: string | null; squad_id: string | null; squad: string | null;
  swim_england_id: string | null; joined_club_on: string | null; account_id: string | null; active: boolean; club_id: string;
}
export async function loadAthlete(id: string) {
  const [s, m, pb] = await Promise.all([
    db.from("swimmers").select(`id, full_name, date_of_birth, gender, squad_id, swim_england_id, joined_club_on, account_id, active, club_id, ${SWIMMER_SQUAD}`).eq("id", id).single(),
    db.from("squad_memberships").select("id, joined_squad_on, ended_on, squad:squads(name)").eq("swimmer_id", id).order("joined_squad_on", { ascending: false }),
    db.from("swim_results").select("id", { count: "exact", head: true }).eq("swimmer_id", id).eq("is_pb", true)
  ]);
  const [athlete] = flatSquad([check(s) as unknown as AthleteDetail & { sq: { name: string } | null }]);
  return {
    athlete: athlete as AthleteDetail,
    history: ((check(m) ?? []) as unknown as { id: string; joined_squad_on: string; ended_on: string | null; squad: { name: string } | null }[])
      .map(h => ({ id: h.id, squad: h.squad?.name ?? "—", joined: h.joined_squad_on, left: h.ended_on })),
    pbCount: pb.count ?? 0
  };
}
export async function saveAthlete(id: string, d: Pick<AthleteDetail, "full_name" | "date_of_birth" | "gender" | "swim_england_id" | "joined_club_on" | "account_id">) {
  if (!d.full_name.trim()) throw new Error("Enter the athlete's name.");
  const body = tidy({ ...d, full_name: d.full_name.trim(), year_of_birth: yearOf(d.date_of_birth) });
  check(await db.from("swimmers").update(body).eq("id", id));
}

export async function loadMedical(swimmerId: string) {
  const [m, e] = await Promise.all([
    db.from("swimmer_medical").select("*").eq("swimmer_id", swimmerId).maybeSingle(),
    db.from("swimmer_emergency_contacts").select("*").eq("swimmer_id", swimmerId).order("priority")
  ]);
  return { medical: check(m) as Medical | null, contacts: (check(e) ?? []) as EmergencyContact[], denied: false };
}
export async function saveMedical(swimmerId: string, m: Medical, contacts: EmergencyContact[]) {
  for (const c of contacts) if (!c.full_name.trim() || !c.phone.trim()) throw new Error("Each emergency contact needs a name and phone number.");
  const body = tidy({ ...m, swimmer_id: swimmerId });
  check(await db.from("swimmer_medical").upsert({ ...body, club_id: "00000000-0000-0000-0000-000000000000" }, { onConflict: "swimmer_id" }));
  const existing = (check(await db.from("swimmer_emergency_contacts").select("id").eq("swimmer_id", swimmerId)) ?? []) as { id: string }[];
  const keep = new Set(contacts.map(c => c.id).filter(Boolean));
  const gone = existing.map(x => x.id).filter(x => !keep.has(x));
  if (gone.length) check(await db.from("swimmer_emergency_contacts").delete().in("id", gone));
  for (const [i, c] of contacts.entries()) {
    const b = tidy({ priority: i + 1, full_name: c.full_name, relationship: c.relationship, phone: c.phone, phone_alt: c.phone_alt });
    if (c.id) check(await db.from("swimmer_emergency_contacts").update(b).eq("id", c.id));
    // club_id is filled from the swimmer by a trigger; the placeholder satisfies NOT NULL.
    else check(await db.from("swimmer_emergency_contacts").insert({ ...b, swimmer_id: swimmerId, club_id: "00000000-0000-0000-0000-000000000000" }));
  }
}

export async function loadSwimmerFees(swimmerId: string) {
  return (check(await db.from("member_fees").select("*").eq("swimmer_id", swimmerId).order("due_on", { ascending: false, nullsFirst: false })) ?? []) as Fee[];
}

// ---------- Swim England registration ----------
export async function loadSeRegs(swimmerId: string) {
  return (check(await db.from("swim_england_registrations").select("*").eq("swimmer_id", swimmerId).order("reg_year", { ascending: false })) ?? []) as SeReg[];
}
export async function saveSeReg(r: SeReg) {
  const body = tidy({ swimmer_id: r.swimmer_id, reg_year: Number(r.reg_year), category: r.category, status: r.status, registered_on: r.registered_on, expires_on: r.expires_on, notes: r.notes });
  if (r.id) check(await db.from("swim_england_registrations").update(body).eq("id", r.id));
  else check(await db.from("swim_england_registrations").insert({ ...body, club_id: "00000000-0000-0000-0000-000000000000" }));
}
export interface RegRow { swimmer_id: string; full_name: string; squad: string | null; swim_england_id: string | null; yob: number | null; account: string | null; reg: SeReg | null; }
export async function loadRegistrations(club: string, year: number): Promise<RegRow[]> {
  const cid = clubIdOf(club);
  const [s, r, a] = await Promise.all([
    db.from("swimmers").select(`id, full_name, date_of_birth, swim_england_id, account_id, ${SWIMMER_SQUAD}`).eq("club_id", cid).eq("active", true).order("full_name"),
    db.from("swim_england_registrations").select("*").eq("club_id", cid).eq("reg_year", year),
    db.from("member_accounts").select("id, first_name, last_name").eq("club_id", cid)
  ]);
  const regs = new Map(((check(r) ?? []) as SeReg[]).map(x => [x.swimmer_id, x]));
  const accs = new Map(((check(a) ?? []) as { id: string; first_name: string; last_name: string }[]).map(x => [x.id, `${x.last_name}, ${x.first_name}`]));
  type Raw = { id: string; full_name: string; date_of_birth: string | null; swim_england_id: string | null; account_id: string | null; sq: { name: string } | null };
  return flatSquad((check(s) ?? []) as unknown as Raw[]).map(x => ({
    swimmer_id: x.id, full_name: x.full_name, squad: x.squad, swim_england_id: x.swim_england_id, yob: yearOf(x.date_of_birth),
    account: x.account_id ? accs.get(x.account_id) ?? null : null, reg: regs.get(x.id) ?? null
  }));
}

// ---------- Athlete attendance (date range) ----------
export interface AttRecord { session_date: string; session_time: string; status: string | null; present: boolean | null; minutes_attended: number | null; session_minutes: number | null; note: string | null; }
export async function loadAthleteAttendance(swimmerId: string, from: string, to: string) {
  const r = await db.from("attendance_records")
    .select("session_date, session_time, status, present, minutes_attended, session_minutes, note")
    .eq("swimmer_id", swimmerId).gte("session_date", from).lte("session_date", to)
    .order("session_date", { ascending: false }).order("session_time", { ascending: false });
  const rows = (check(r) ?? []) as AttRecord[];
  const s = summarise(rows as AttMark[]);
  const partial = rows.filter(x => x.status === "partial").length;
  const notAttended = rows.filter(x => x.status ? x.status === "out" : x.present === false).length;
  const full = rows.filter(x => x.status ? x.status === "in" : x.present === true).length;
  return { rows: rows as AttRecord[], summary: { ...s, partial, notAttended, full } };
}
export const last90 = () => { const t = todayLocal().date; return { from: isoAdd(t, -89), to: t }; };

// ---------- CSV ----------
export function toCsv(head: string[], rows: (string | number | null)[][]): string {
  const q = (v: string | number | null) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [head, ...rows].map(r => r.map(q).join(",")).join("\r\n");
}
