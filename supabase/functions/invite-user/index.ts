// invite-user — create (or find) an account, grant a role, return a sign-in link.
// Called from the Coach Tools "Users & roles" screen by a signed-in admin.
// Role rows are written with the CALLER's session, so the database's own
// permission rules decide what they may grant (club admins: own club only;
// only a real superadmin can grant superadmin).
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = "https://swimmers-gb.netlify.app/";
const ROLES = ["superadmin", "club_admin", "head_coach", "coach", "helper", "parent", "swimmer"];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "POST only" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // The caller, with their own permissions.
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user: me }, error: meErr } = await caller.auth.getUser();
  if (meErr || !me) return reply(401, { error: "Please sign in again." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "Bad request." }); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim().slice(0, 120) || null;
  const role = String(body.role ?? "");
  const club = body.club ? String(body.club) : null;
  const squadIds = Array.isArray(body.squad_ids) ? body.squad_ids.map(String) : [];
  const swimmerIds = Array.isArray(body.swimmer_ids) ? body.swimmer_ids.map(String) : [];
  const redirectTo = typeof body.redirect_to === "string" &&
    (body.redirect_to.startsWith(APP_URL) || body.redirect_to.startsWith("http://localhost"))
    ? body.redirect_to : APP_URL;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: "Enter a valid email address." });
  if (!ROLES.includes(role)) return reply(400, { error: "Choose a role." });
  if (role !== "superadmin" && !club) return reply(400, { error: "Choose a club." });
  if ((role === "coach" || role === "helper") && !squadIds.length) return reply(400, { error: "Tick at least one squad." });
  if ((role === "parent" || role === "swimmer") && !swimmerIds.length) return reply(400, { error: "Pick the linked swimmer." });

  const { data: allowed, error: grantErr } = await caller.rpc("can_grant_role", { p_role: role, p_club: club });
  if (grantErr) return reply(500, { error: grantErr.message });
  if (allowed !== true) return reply(403, { error: "You can't give that role in that club." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Create the account and an invite link, or find the existing account.
  let userId: string | null = null;
  let link: string | null = null;
  let existing = false;
  const inv = await admin.auth.admin.generateLink({
    type: "invite", email, options: { redirectTo, data: fullName ? { full_name: fullName } : undefined },
  });
  if (!inv.error && inv.data?.user) {
    userId = inv.data.user.id;
    link = inv.data.properties?.action_link ?? null;
  } else {
    existing = true;
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return reply(500, { error: error.message });
      const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (hit) userId = hit.id;
      if (data.users.length < 200) break;
    }
    if (!userId) return reply(500, { error: inv.error?.message ?? "Could not create the account." });
    // Existing account that never finished sign-up: give them a fresh link.
    const { data: u } = await admin.auth.admin.getUserById(userId);
    if (u?.user && !u.user.last_sign_in_at) {
      const again = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
      if (!again.error) link = again.data.properties?.action_link ?? null;
    }
  }

  // Directory entry (service role; clients cannot write this table).
  await admin.from("app_users").upsert({
    user_id: userId, email, ...(fullName ? { full_name: fullName } : {}),
    ...(existing ? {} : { invited_by: me.id, invited_at: new Date().toISOString() }),
    ...(link ? { last_link_at: new Date().toISOString() } : {}),
  }, { onConflict: "user_id" });

  // Role + links, written as the caller so the database enforces what they may grant.
  const r1 = await caller.from("user_roles").upsert({ user_id: userId, role, club }, { onConflict: "user_id,role" });
  if (r1.error) return reply(403, { error: "Account ready, but the role was refused: " + r1.error.message, user_id: userId, link });
  if (squadIds.length) {
    const r2 = await caller.from("user_squads").upsert(
      squadIds.map((s) => ({ user_id: userId, squad_id: s })), { onConflict: "user_id,squad_id", ignoreDuplicates: true });
    if (r2.error) return reply(403, { error: "Role saved, but squads were refused: " + r2.error.message, user_id: userId, link });
  }
  if (swimmerIds.length) {
    const r3 = await caller.from("user_swimmers").upsert(
      swimmerIds.map((s) => ({ user_id: userId, swimmer_id: s, relationship: role === "swimmer" ? "swimmer" : "parent" })),
      { onConflict: "user_id,swimmer_id", ignoreDuplicates: true });
    if (r3.error) return reply(403, { error: "Role saved, but the swimmer link was refused: " + r3.error.message, user_id: userId, link });
  }

  return reply(200, { user_id: userId, existing, link });
});
