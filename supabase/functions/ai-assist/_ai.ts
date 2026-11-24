// A-156 AI gateway core. Every AI call in Coach Tools goes through callAI():
//  - prompt template from ai_prompts (active version for the purpose)
//  - monthly token cap per club (ai_budgets; default 2M tokens)
//  - names swapped for [Swimmer n] before the call, swapped back after (makeRedactor)
//  - one ai_runs row per call: ids, counts, status. Prompt and answer text are not stored.
// The Anthropic key lives only in the ANTHROPIC_API_KEY edge secret.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { Redactor } from "./_redact.ts";

export type AICall = {
  admin: SupabaseClient;          // service-role client (log, budget, prompts)
  clubId: string;
  userId: string;
  purpose: string;
  userMessage: string;            // already redacted by the caller
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  redactor: Redactor;
  sourceTable?: string;
  sourceIds?: string[];
  subjectId?: string;
};

export type AIResult =
  | { ok: true; output: any; promptVersion: number; model: string; runId: string; namesHidden: number }
  | { ok: false; status: "over_budget" | "api_error" | "no_output" | "refused"; message: string; runId?: string };

async function log(c: AICall, row: Record<string, unknown>) {
  const { data, error } = await c.admin.from("ai_runs").insert({
    club_id: c.clubId, user_id: c.userId, purpose: c.purpose,
    source_table: c.sourceTable ?? null, source_ids: c.sourceIds ?? [], subject_id: c.subjectId ?? null,
    names_hidden: c.redactor.count(), ...row,
  }).select("id").single();
  if (error) console.error("ai_runs insert", error.message);
  return data?.id as string | undefined;
}

export async function callAI(c: AICall): Promise<AIResult> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { ok: false, status: "refused", message: "AI isn't set up yet (missing API key)." };

  const { data: prompt } = await c.admin.from("ai_prompts")
    .select("version, model, system, max_tokens").eq("purpose", c.purpose).eq("active", true).maybeSingle();
  if (!prompt) return { ok: false, status: "refused", message: "This AI feature isn't switched on yet." };

  const { data: budget } = await c.admin.from("ai_budgets").select("monthly_token_cap, enabled").eq("club_id", c.clubId).maybeSingle();
  if (budget && !budget.enabled) return { ok: false, status: "refused", message: "AI is switched off for this club." };
  const cap = Number(budget?.monthly_token_cap ?? 2_000_000);
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const { data: runs } = await c.admin.from("ai_runs").select("input_tokens, output_tokens")
    .eq("club_id", c.clubId).gte("created_at", monthStart.toISOString()).limit(20000);
  const used = (runs ?? []).reduce((s: number, r: any) => s + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0);
  if (used >= cap) {
    const runId = await log(c, { status: "over_budget", prompt_version: prompt.version, model: prompt.model });
    return { ok: false, status: "over_budget", message: "This month's AI allowance for the club is used up.", runId };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: prompt.model, max_tokens: prompt.max_tokens, system: prompt.system,
      tools: [c.tool], tool_choice: { type: "tool", name: c.tool.name },
      messages: [{ role: "user", content: c.userMessage }],
    }),
  });
  if (!res.ok) {
    console.error("AI API error", res.status, (await res.text()).slice(0, 300));
    const runId = await log(c, { status: "api_error", error: `http_${res.status}`, prompt_version: prompt.version, model: prompt.model });
    return { ok: false, status: "api_error", message: `The AI couldn't answer (${res.status}). Try again in a moment.`, runId };
  }
  const out = await res.json();
  const use = (out.content ?? []).find((x: any) => x.type === "tool_use");
  const row = {
    prompt_version: prompt.version, model: prompt.model,
    input_tokens: out.usage?.input_tokens ?? null, output_tokens: out.usage?.output_tokens ?? null,
  };
  if (!use) {
    const runId = await log(c, { ...row, status: "no_output" });
    return { ok: false, status: "no_output", message: "The AI didn't return a draft. Try again.", runId };
  }
  const runId = await log(c, { ...row, status: "ok" });
  return { ok: true, output: c.redactor.restore(use.input), promptVersion: prompt.version, model: prompt.model, runId: runId ?? "", namesHidden: c.redactor.count() };
}
