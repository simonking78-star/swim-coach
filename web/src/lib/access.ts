// Roles × sections matrix — a copy of ACCESS_MATRIX in coach-tools-deploy/index.html
// (agreed 2026-09-30, claude/specs/role-based-access.md). The database enforces it
// through RLS; this layer only hides what a role can't use and labels read-only screens.

export type Role = "superadmin" | "club_admin" | "head_coach" | "coach" | "helper" | "parent" | "swimmer";
export type Section =
  | "attendance" | "feedback" | "plans" | "timetables" | "season"
  | "roster" | "stats" | "stopwatch" | "admin" | "appdev";
/** E edit · SE edit own squads · R read · SR read own squads · CR read own child/self · N none */
export type Level = "E" | "SE" | "R" | "SR" | "CR" | "N";

export const ACCESS_MATRIX: Record<Section, Partial<Record<Role, Level>>> = {
  attendance: { superadmin: "E", club_admin: "E", head_coach: "E", coach: "E", helper: "SE" },
  feedback:   { superadmin: "E", club_admin: "E", head_coach: "E", coach: "SE", parent: "CR", swimmer: "CR" },
  plans:      { superadmin: "E", club_admin: "E", head_coach: "E", coach: "E", helper: "R" },
  timetables: { superadmin: "E", club_admin: "E", head_coach: "E", coach: "R", helper: "R", parent: "R", swimmer: "R" },
  season:     { superadmin: "E", club_admin: "E", head_coach: "E", coach: "R" },
  roster:     { superadmin: "E", club_admin: "E", head_coach: "R", coach: "SR", helper: "SR", parent: "CR" },
  stats:      { superadmin: "E", club_admin: "R", head_coach: "R", coach: "R", parent: "CR", swimmer: "CR" },
  stopwatch:  { superadmin: "E", club_admin: "E", head_coach: "E", coach: "E", helper: "E" },
  admin:      { superadmin: "E", club_admin: "E" },
  appdev:     { superadmin: "E" }
};

const RANK: Record<Level, number> = { N: 0, CR: 1, SR: 2, R: 3, SE: 4, E: 5 };

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "Superadmin", club_admin: "Club admin", head_coach: "Head coach", coach: "Coach",
  helper: "Helper", parent: "Parent", swimmer: "Swimmer"
};

export const LEVEL_NOTE: Partial<Record<Level, string>> = {
  R: "Read only for your role — changes will be refused.",
  SR: "Read only, and only for your own squads.",
  SE: "You can change records for your own squads only.",
  CR: "Read only — your own child / your own record."
};

/** Shape returned by the public.my_access() RPC. */
export interface Access {
  real_superadmin?: boolean;
  testing?: { role: Role; club: string | null; squad_ids?: string[]; swimmer_ids?: string[]; expires_at: string } | null;
  roles: { role: Role; club: string | null }[];
  squads?: unknown[];
  swimmers?: unknown[];
}

/** Highest level any of the user's roles gives for a section. */
export function sectionLevel(access: Access | null, section: Section): Level {
  if (!access) return "N";
  let best: Level = "N";
  for (const r of access.roles || []) {
    const lv = ACCESS_MATRIX[section][r.role] || "N";
    if (RANK[lv] > RANK[best]) best = lv;
  }
  return best;
}

export const canEdit = (lv: Level) => lv === "E" || lv === "SE";

export function roleSummary(access: Access | null): string {
  if (!access || !access.roles?.length) return "no role yet";
  return access.roles
    .map(r => `${ROLE_LABEL[r.role] ?? r.role} · ${r.club ?? "all clubs"}`)
    .join("; ");
}

/** Clubs the user is limited to, or null when any role covers all clubs. */
export function allowedClubs(access: Access | null): string[] | null {
  const roles = access?.roles || [];
  if (!roles.length || roles.some(r => !r.club)) return null;
  return [...new Set(roles.map(r => r.club as string))];
}
