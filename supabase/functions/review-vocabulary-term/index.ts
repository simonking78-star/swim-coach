// review-vocabulary-term (A-154)
// POST { club_id, term, meaning, term_type?, stroke?, full_form? }  -> saves a coach's new term (pending) and has Claude review it.
// POST { club_id, review_pending: true }                             -> reviews unchecked pending terms for the club.
// The coach only ever gets { saved: true, term_id }: approval is silent. Verdicts are for the head coach's review queue.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { reviewPending, reviewTerm } from "./_review.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const TYPES = ["drill", "skill", "stroke", "equipment", "intensity", "set_type", "other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await user.auth.getUser();
  if (!u?.user) return json({ error: "Please sign in again." }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const clubId = /^[0-9a-f-]{36}$/i.test(String(body?.club_id ?? "")) ? String(body.club_id) : null;
  if (!clubId) return json({ error: "club_id is required" }, 400);

  if (body?.review_pending) {
    // Only someone who can write plans for this club can trigger reviews.
    const { data: can } = await user.rpc("can_write_plans_for", { p_club: clubId });
    if (can !== true) return json({ error: "Not allowed" }, 403);
    EdgeRuntime.waitUntil(reviewPending(admin, clubId, 10));
    return json({ queued: true });
  }

  const term = String(body?.term ?? "").trim().slice(0, 60);
  const meaning = String(body?.meaning ?? "").trim().slice(0, 600);
  if (!term || !meaning) return json({ error: "Give the term and what it means." }, 400);
  const termType = TYPES.includes(body?.term_type) ? body.term_type : "other";

  // Insert as the coach, so the club's permissions (RLS) decide whether they may add terms.
  const { data: row, error } = await user.from("vocabulary_terms").insert({
    club_id: clubId, term, meaning, term_type: termType,
    stroke: body?.stroke ? String(body.stroke).slice(0, 30) : null,
    full_form: body?.full_form ? String(body.full_form).slice(0, 120) : null,
    status: "pending", created_by: u.user.id,
  }).select("id").single();
  if (error || !row) return json({ error: "Couldn't save that term." }, 403);

  EdgeRuntime.waitUntil(reviewTerm(admin, row.id).catch((e) => console.error("review failed", e)));
  return json({ saved: true, term_id: row.id });
});
