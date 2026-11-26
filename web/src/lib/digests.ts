import type { SupabaseClient } from "@supabase/supabase-js";
import { sb } from "./supabase";
import { clubIdOf } from "./clubs";

// A-159 Parent updates: the AI drafts a short update for a swimmer's parent from the
// coach's own feedback (edge function ai-assist), the coach edits and approves it.
// Coach-only: parents see nothing until release (A-160/A-161).

const db = sb as unknown as SupabaseClient;

export interface DigestDraft { going_well: string; working_on: string; help_at_home: string; coach_checks: string[] }
export interface AIDraft { draft: DigestDraft; source_ids: string[]; prompt_version: number; model: string; ai_run_id: string; names_hidden: number }
export type DigestStatus = "draft" | "approved" | "withdrawn";
export interface Digest {
  id: string; swimmer_id: string; period_from: string; period_to: string; source_ids: string[];
  draft: DigestDraft; text: string; status: DigestStatus;
  created_at: string; updated_at: string; approved_at: string | null; withdrawn_at: string | null;
}

/** The three parts as one editable message. */
export const draftToText = (d: DigestDraft) =>
  [d.going_well, d.working_on, d.help_at_home].map(s => (s ?? "").trim()).filter(Boolean).join("\n\n");

/** Default period: the last 8 weeks up to today. */
export function defaultPeriod(today = new Date()): { from: string; to: string } {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const from = new Date(today); from.setDate(from.getDate() - 56);
  return { from: iso(from), to: iso(today) };
}

export async function askAIForDraft(swimmerId: string, from: string, to: string): Promise<AIDraft> {
  const { data, error } = await sb.functions.invoke("ai-assist", { body: { purpose: "feedback_digest", swimmer_id: swimmerId, from, to } });
  if (error) {
    let msg = error.message;
    try { const body = await (error as { context?: Response }).context?.json(); if (body?.error) msg = body.error; } catch { /* keep message */ }
    throw new Error(msg);
  }
  if (!data?.draft) throw new Error((data as { error?: string })?.error || "The AI didn't return a draft. Try again.");
  return data as AIDraft;
}

const COLS = "id, swimmer_id, period_from, period_to, source_ids, draft, text, status, created_at, updated_at, approved_at, withdrawn_at";

export async function loadDigests(swimmerId: string): Promise<Digest[]> {
  const { data, error } = await db.from("feedback_digests").select(COLS).eq("swimmer_id", swimmerId).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as Digest[];
}

export async function saveDraft(args: { club: string; swimmerId: string; from: string; to: string; ai: AIDraft; text: string }): Promise<Digest> {
  const { data, error } = await db.from("feedback_digests").insert({
    club_id: clubIdOf(args.club), swimmer_id: args.swimmerId, period_from: args.from, period_to: args.to,
    source_ids: args.ai.source_ids, ai_run_id: args.ai.ai_run_id || null, prompt_version: args.ai.prompt_version,
    draft: args.ai.draft, text: args.text
  }).select(COLS).single();
  if (error) throw new Error(error.message);
  return data as Digest;
}

export async function updateDigest(id: string, patch: { text?: string; status?: DigestStatus }): Promise<Digest> {
  const { data, error } = await db.from("feedback_digests").update(patch).eq("id", id).select(COLS).single();
  if (error) throw new Error(error.message);
  return data as Digest;
}
