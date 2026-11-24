// ai-assist (A-156): one endpoint for Coach Tools' AI drafting features.
// v1 purpose: feedback_digest — a parent-friendly DRAFT from a swimmer's feedback for a period.
// It returns a draft only; saving, coach approval and release are A-159.
// Access: the swimmer and the feedback are read with the caller's own token, so RLS decides
// what they can see. Names go out as [Swimmer n]; only the first name is used.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { makeRedactor } from "./_redact.ts";
import { callAI } from "./_ai.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (v: unknown, n: number) => String(v ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").slice(0, n).trim();

const digestTool = {
  name: "record_digest",
  description: "Record the draft parent update and anything the coach must check.",
  input_schema: {
    type: "object",
    properties: {
      going_well: { type: "string", description: "1-3 sentences" },
      working_on: { type: "string", description: "1-3 sentences: the next focus" },
      help_at_home: { type: "string", description: "1-2 simple, practical suggestions" },
      coach_checks: {
        type: "array", items: { type: "string" },
        description: "Things the coach must check before sending: thin notes, anything left out (health, welfare, family), contradictions",
      },
      source_count_used: { type: "integer" },
    },
    required: ["going_well", "working_on", "help_at_home", "coach_checks"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: u } = await user.auth.getUser();
  if (!u?.user) return json({ error: "Please sign in again." }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (body?.purpose !== "feedback_digest") return json({ error: "Unknown AI task." }, 400);

  const swimmerId = String(body?.swimmer_id ?? "");
  const from = String(body?.from ?? ""), to = String(body?.to ?? "");
  if (!UUID.test(swimmerId) || !DATE.test(from) || !DATE.test(to) || from > to) {
    return json({ error: "Choose a swimmer and a date range." }, 400);
  }

  // Read with the caller's token: if RLS hides the swimmer, the caller can't summarise them.
  const { data: sw } = await user.from("swimmers").select("id, full_name, club_id, active").eq("id", swimmerId).maybeSingle();
  if (!sw || !sw.active) return json({ error: "You can't see this swimmer." }, 403);

  const { data: notes, error: nErr } = await user.from("swimmer_feedback")
    .select("id, session_date, category, criterion, status, observation, remedial_action, note, measure_code, measure_value")
    .eq("swimmer_id", swimmerId).gte("session_date", from).lte("session_date", to)
    .order("session_date").limit(80);
  if (nErr) return json({ error: "Couldn't read the feedback." }, 500);
  if (!notes?.length) return json({ error: "No feedback for this swimmer in that period." }, 422);

  // Names to hide: everyone in the club (other swimmers may be mentioned), parents too.
  const { data: people } = await admin.from("swimmers").select("full_name, parent_name").eq("club_id", sw.club_id).limit(5000);
  const names = (people ?? []).flatMap((p: any) => [p.full_name, ...String(p.parent_name ?? "").split(/\s*(?:&|\band\b|,|\/)\s*/i)]).filter(Boolean);
  const red = makeRedactor(names);

  const firstName = String(sw.full_name).trim().split(/\s+/)[0];
  const lines = notes.map((n: any) => [
    n.session_date,
    n.category && `[${clip(n.category, 30)}]`,
    n.criterion && `${clip(n.criterion, 60)}${n.status ? ": " + clip(n.status, 30) : ""}`,
    n.observation && `Saw: ${clip(n.observation, 400)}`,
    n.remedial_action && `Next: ${clip(n.remedial_action, 300)}`,
    n.note && `Note: ${clip(n.note, 400)}`,
    n.measure_code && `Measure ${clip(n.measure_code, 20)} = ${clip(n.measure_value, 20)}`,
  ].filter(Boolean).join(" | "));

  // The swimmer's own first name is always hidden, even when it is also an everyday word (Max, Will)
  // that the shared redactor leaves alone.
  const ownRe = new RegExp(`(?<![\\p{L}])${firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "giu");
  const hideOwn = (s: string) => s.replace(ownRe, "[Swimmer 0]");
  const msg = hideOwn(`Swimmer's first name: ${red.redact(firstName)}\nPeriod: ${from} to ${to}\nNumber of notes: ${notes.length}\n\n<notes>\n${red.redact(lines.join("\n"))}\n</notes>`);

  const r = await callAI({
    admin, clubId: sw.club_id, userId: u.user.id, purpose: "feedback_digest",
    userMessage: msg, tool: digestTool, redactor: red,
    sourceTable: "swimmer_feedback", sourceIds: notes.map((n: any) => n.id), subjectId: sw.id,
  });
  if (!r.ok) return json({ error: r.message, status: r.status }, r.status === "over_budget" ? 429 : r.status === "refused" ? 403 : 502);

  const showOwn = (v: any): any => typeof v === "string" ? v.replace(/\[\s*Swimmer\s+0\s*\]/gi, firstName)
    : Array.isArray(v) ? v.map(showOwn) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, showOwn(x)])) : v;
  return json({
    draft: showOwn(r.output), source_ids: notes.map((n: any) => n.id),
    prompt_version: r.promptVersion, model: r.model, ai_run_id: r.runId, names_hidden: r.namesHidden,
    note: "Draft only. A coach must edit and approve before anything reaches a parent.",
  });
});
