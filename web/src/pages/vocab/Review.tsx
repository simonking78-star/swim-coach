import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { useCanReview, useReviewQueue } from "../../components/vocabParts";
import { approveTerm, keepMerge, mergeTerm, rejectTerm, requestReview, TERM_TYPE_LABEL, type ReviewItem } from "../../lib/vocab";
import { fmtDate } from "../../lib/util";
import { useVocabTerms } from "./ClubTerms";

// Review new club terms (A-154). Head coach, club admin and superadmin only.
// Coaches' new drills and terms are used straight away; this list is where the head coach
// confirms them. Claude has already compared each one with the club's list:
//   distinct  — a genuinely new term
//   duplicate — same meaning as an existing entry under a different name (obvious ones were merged automatically)
//   conflict  — the same name already means something else
// The coach is never told whether a term was approved, merged or rejected.

const VERDICT: Record<string, { label: string; cls: string }> = {
  distinct: { label: "New term", cls: "verdict-ok" },
  duplicate: { label: "Likely duplicate", cls: "verdict-dup" },
  conflict: { label: "Clash with an existing term", cls: "verdict-clash" }
};

export function VocabReview() {
  const { club } = useClub();
  const reviewer = useCanReview(club);
  const queue = useReviewQueue(club, reviewer.data === true);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  if (reviewer.isLoading) return <p className="dim">Loading…</p>;
  if (reviewer.data !== true) return (
    <>
      <Back />
      <div className="page-head"><h1>Review new terms</h1></div>
      <p className="notice warn">Only the head coach or a club admin reviews new terms.</p>
    </>
  );

  const items = queue.data ?? [];
  const merged = items.filter(i => i.status === "merged");
  const pending = items.filter(i => i.status === "pending");
  const unchecked = pending.filter(i => !i.claude_checked_at).length;

  const run = async (id: string, f: () => Promise<void>, done: string) => {
    setBusy(id); setMsg(null);
    try {
      await f();
      ["vocab_review", "vocab_terms", "drills_full", "drills"].forEach(k => qc.invalidateQueries({ queryKey: [k, club] }));
      setMsg({ text: done });
    } catch (e) {
      console.error(e);
      const m = (e as Error).message || "";
      setMsg({ text: m.includes("approved_unique") ? "The club already has an approved entry with that name. Merge into it, or rename this one first." : "That didn't save — " + (m || "please try again."), error: true });
    }
    finally { setBusy(null); }
  };

  return (
    <>
      <Back />
      <div className="page-head row">
        <div>
          <h1>Review new terms</h1>
          <p className="dim">Drills and shorthand coaches have added. They're already in use; coaches aren't told what you decide.</p>
        </div>
        <ClubPicker />
      </div>
      {msg && <p className={"msg" + (msg.error ? " error" : "")} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
      {queue.isLoading && <p className="dim">Loading…</p>}
      {queue.error && <p className="msg error">Couldn't load the review list. <button type="button" className="link-btn" onClick={() => queue.refetch()}>Try again</button></p>}
      {queue.data && !items.length && <p className="notice">Nothing to review. New terms from coaches will appear here.</p>}
      {unchecked > 0 && (
        <p className="hint">{unchecked} {unchecked === 1 ? "entry hasn't" : "entries haven't"} been checked by Claude yet. <button type="button" className="link-btn" onClick={() => { requestReview(club!); setTimeout(() => queue.refetch(), 8000); }}>Check now</button></p>
      )}

      {pending.length > 0 && (
        <section aria-labelledby="rv-pending">
          <h2 id="rv-pending" className="section-title">To decide <span className="dim">({pending.length})</span></h2>
          {pending.map(i => <PendingCard key={i.id} item={i} club={club} busy={busy === i.id} run={run} />)}
        </section>
      )}

      {merged.length > 0 && (
        <section aria-labelledby="rv-merged" className="gap-top">
          <h2 id="rv-merged" className="section-title">Merged automatically <span className="dim">({merged.length})</span></h2>
          <p className="hint">Claude was sure these meant the same as an existing entry, so they now count as that entry. Keep the merge, or undo it.</p>
          {merged.map(i => (
            <section key={i.id} className="card review-card">
              <h3 className="card-title">{i.term} <span className="dim">→ merged into</span> {i.merged_into_term ?? "an existing entry"}</h3>
              {i.meaning && <p><span className="dim">Coach's meaning:</span> {i.meaning}</p>}
              {i.claude_reason && <p className="hint">{i.claude_reason}</p>}
              <div className="btn-row">
                <button type="button" className="btn small primary" disabled={busy === i.id} onClick={() => run(i.id, () => keepMerge(i.id), `Kept "${i.term}" as another name for ${i.merged_into_term}.`)}>Keep merge</button>
                <button type="button" className="btn small" disabled={busy === i.id} onClick={() => run(i.id, () => approveTerm(i.id), `"${i.term}" is now its own entry.`)}>Undo — keep separate</button>
                <button type="button" className="btn small danger-outline" disabled={busy === i.id} onClick={() => run(i.id, () => rejectTerm(i.id), `"${i.term}" removed.`)}>Reject</button>
              </div>
            </section>
          ))}
        </section>
      )}
    </>
  );
}

function PendingCard({ item: i, club, busy, run }: {
  item: ReviewItem; club: string | null; busy: boolean;
  run: (id: string, f: () => Promise<void>, done: string) => Promise<void>;
}) {
  const terms = useVocabTerms(club);
  const [into, setInto] = useState(i.claude_match_id ?? "");
  const [meaning, setMeaning] = useState(i.meaning ?? "");
  const v = i.claude_verdict ? VERDICT[i.claude_verdict] : null;
  const options = (terms.data ?? []).filter(t => t.id !== i.id && t.status === "approved").sort((a, b) => a.term.localeCompare(b.term));
  const intoName = options.find(t => t.id === into)?.term;
  return (
    <section className="card review-card">
      <div className="flex-row">
        <h3 className="card-title">{i.term}</h3>
        <span className="chip">{TERM_TYPE_LABEL[i.term_type]}{i.stroke ? ` · ${i.stroke}` : ""}</span>
      </div>
      <p className="dim small">Added {fmtDate(i.created_at.slice(0, 10))}</p>
      {v ? <p><span className={"chip " + v.cls}>{v.label}</span>{i.match_term && <> — compared with <strong>{i.match_term}</strong>{i.match_meaning ? `: ${i.match_meaning}` : ""}</>}</p>
         : <p className="hint">Not checked by Claude yet.</p>}
      {i.claude_reason && <p className="hint">{i.claude_reason}</p>}
      {!!i.suggested_targets.length && (
        <p className="small"><span className="dim">Claude suggests it develops:</span> {i.suggested_targets.map(t => t.target + (t.weight === "secondary" ? " (also)" : "")).join(", ")}</p>
      )}
      <label htmlFor={`rv-m-${i.id}`}>Meaning</label>
      <textarea id={`rv-m-${i.id}`} rows={2} value={meaning} onChange={e => setMeaning(e.target.value)} />
      <div className="btn-row">
        <button type="button" className="btn small primary" disabled={busy || !meaning.trim()}
          onClick={() => run(i.id, () => approveTerm(i.id, meaning), `"${i.term}" approved.`)}>Approve</button>
        <button type="button" className="btn small danger-outline" disabled={busy}
          onClick={() => run(i.id, () => rejectTerm(i.id), `"${i.term}" removed.`)}>Reject</button>
      </div>
      <label htmlFor={`rv-into-${i.id}`}>Or merge into an existing entry</label>
      <div className="flex-row">
        <select id={`rv-into-${i.id}`} value={into} onChange={e => setInto(e.target.value)}>
          <option value="">— choose —</option>
          {options.map(t => <option key={t.id} value={t.id}>{t.term}{t.stroke ? ` (${t.stroke})` : ""}</option>)}
        </select>
        <button type="button" className="btn small" disabled={busy || !into}
          onClick={() => run(i.id, () => mergeTerm(i.id, into), `"${i.term}" now counts as ${intoName}.`)}>Merge</button>
      </div>
      {i.claude_verdict === "conflict" && <p className="hint">A clash means the same word is used for two things. Approve under a clearer name (edit it in Club terms or Drills &amp; Skills), or merge it if the coach meant the existing entry.</p>}
    </section>
  );
}

function Back() {
  return <p><Link to="/drills" className="link-btn">← Drills &amp; Skills</Link></p>;
}
