import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import type { FbEntry, SwimmerLite } from "../lib/feedback";
import { askAIForDraft, defaultPeriod, draftToText, loadDigests, saveDraft, updateDigest, type AIDraft, type Digest } from "../lib/digests";
import { fmtDate, logEvent } from "../lib/util";
import { EntryBody } from "./feedbackParts";

// A-159 Feedback → swimmer → Parent update.
// Phone: one column — period, draft/editor, notes used, earlier updates.
// Desktop (≥900px): editor on the left, the feedback notes the AI used on the right,
// so the coach can check every sentence against the source while editing.
// Nothing here reaches a parent yet: approved updates wait for release (A-160/A-161).

const STATUS_LABEL: Record<string, string> = { draft: "Draft", approved: "Approved", withdrawn: "Withdrawn" };

export function ParentUpdates({ swimmer, history }: { swimmer: SwimmerLite; history: FbEntry[] }) {
  const { session } = useAuth();
  const { club } = useClub();
  const qc = useQueryClient();
  const [period, setPeriod] = useState(defaultPeriod());
  const [ai, setAi] = useState<AIDraft | null>(null);
  const [current, setCurrent] = useState<Digest | null>(null);   // saved row being edited
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<null | "ai" | "save" | "approve" | "withdraw">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const digests = useQuery({ queryKey: ["digests", swimmer.id], queryFn: () => loadDigests(swimmer.id) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["digests", swimmer.id] });

  const inPeriod = useMemo(() => history.filter(e => e.session_date >= period.from && e.session_date <= period.to), [history, period]);
  const sourceIds = current?.source_ids ?? ai?.source_ids ?? null;
  const usedNotes = sourceIds ? history.filter(e => sourceIds.includes(e.id)) : inPeriod;
  const checks = (current?.draft ?? ai?.draft)?.coach_checks ?? [];
  const editing = !!ai || current?.status === "draft";
  const dirty = current ? text !== current.text : !!ai;

  async function draftWithAI() {
    setBusy("ai"); setMsg(null); setCurrent(null);
    try {
      const d = await askAIForDraft(swimmer.id, period.from, period.to);
      setAi(d); setText(draftToText(d.draft));
      logEvent(session?.user.id, club, "core_task", "parent_update_drafted", { notes: d.source_ids.length });
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  async function save(approve: boolean) {
    if (!club) return;
    setBusy(approve ? "approve" : "save"); setMsg(null);
    try {
      let row = current;
      if (!row && ai) row = await saveDraft({ club, swimmerId: swimmer.id, from: period.from, to: period.to, ai, text });
      else if (row && text !== row.text) row = await updateDigest(row.id, { text });
      if (row && approve) row = await updateDigest(row.id, { status: "approved" });
      setAi(null);
      if (approve) { setCurrent(null); setText(""); setMsg({ kind: "ok", text: "Approved. It will go to the parent once sending is switched on." }); }
      else { setCurrent(row); setMsg({ kind: "ok", text: "Draft saved." }); }
      refresh();
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  async function withdraw(d: Digest) {
    if (!confirm(d.status === "approved" ? "Withdraw this approved update? It won't be sent." : "Discard this draft?")) return;
    setBusy("withdraw"); setMsg(null);
    try { await updateDigest(d.id, { status: "withdrawn" }); if (current?.id === d.id) { setCurrent(null); setText(""); } refresh(); }
    catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
    finally { setBusy(null); }
  }

  function open(d: Digest) { setAi(null); setCurrent(d); setText(d.text); setPeriod({ from: d.period_from, to: d.period_to }); setMsg(null); scrollTo(0, 0); }
  function discardUnsaved() { setAi(null); setText(""); setMsg(null); }

  const earlier = (digests.data ?? []).filter(d => d.id !== current?.id);

  return (
    <div className="card pu">
      <div className="card-head">
        <h2 className="card-title">Parent update</h2>
        <span className="chip">Coach only</span>
      </div>
      <p className="hint">The AI drafts a short update for {swimmer.full_name.split(" ")[0]}'s parent from your feedback notes. You edit and approve it. Nothing is sent yet.</p>

      {!editing && (
        <div className="pu-period">
          <label>From<input type="date" value={period.from} max={period.to} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} /></label>
          <label>To<input type="date" value={period.to} min={period.from} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} /></label>
          <button type="button" className="btn primary" onClick={draftWithAI} disabled={busy !== null || inPeriod.length === 0}>
            {busy === "ai" ? "Drafting…" : "Draft with AI"}
          </button>
          <span className="dim pu-count">{inPeriod.length} note{inPeriod.length === 1 ? "" : "s"} in this period</span>
        </div>
      )}

      {msg && <p className={"msg" + (msg.kind === "error" ? " error" : "")} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</p>}

      {editing && (
        <div className="pu-layout">
          <div className="pu-editor">
            <p className="dim">{fmtDate(period.from)} – {fmtDate(period.to)}{current ? ` · saved draft, last changed ${fmtDate(current.updated_at)}` : " · not saved yet"}</p>
            {checks.length > 0 && (
              <div className="notice warn">
                <strong>Check before approving</strong>
                <ul>{checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </div>
            )}
            <label htmlFor="pu-text">Message to the parent</label>
            <textarea id="pu-text" rows={10} value={text} onChange={e => setText(e.target.value)} />
            <p className="hint">{text.trim().split(/\s+/).filter(Boolean).length} words · aim for 120–180. Only facts from your notes; no comparisons with other swimmers.</p>
            <div className="btn-row">
              <button type="button" className="btn primary" onClick={() => save(true)} disabled={busy !== null || text.trim().length < 20}>{busy === "approve" ? "Approving…" : "Approve"}</button>
              <button type="button" className="btn" onClick={() => save(false)} disabled={busy !== null || !dirty}>{busy === "save" ? "Saving…" : "Save draft"}</button>
              {ai && !current && <button type="button" className="link-btn" onClick={discardUnsaved} disabled={busy !== null}>Discard</button>}
              {current && <button type="button" className="link-btn" onClick={() => withdraw(current)} disabled={busy !== null}>Discard draft</button>}
            </div>
          </div>
          <aside className="pu-sources" aria-label="Notes the draft was built from">
            <h3 className="sub-title">Notes used ({usedNotes.length})</h3>
            {usedNotes.length === 0 && <p className="dim">No notes in this period.</p>}
            {usedNotes.map(e => <div key={e.id} className="recent-item"><EntryBody e={e} /></div>)}
          </aside>
        </div>
      )}

      <h3 className="sub-title" style={{ marginTop: 16 }}>Earlier updates</h3>
      {digests.isLoading && <p className="dim">Loading…</p>}
      {digests.error && <p className="msg error">Couldn't load earlier updates.</p>}
      {digests.data && earlier.length === 0 && <p className="dim">None yet.</p>}
      <ul className="pu-list">
        {earlier.map(d => (
          <li key={d.id} className={"pu-item " + d.status}>
            <div className="pu-item-head">
              <span className={"badge " + d.status}>{STATUS_LABEL[d.status]}</span>
              <span className="dim">{fmtDate(d.period_from)} – {fmtDate(d.period_to)} · {d.status === "approved" && d.approved_at ? `approved ${fmtDate(d.approved_at)}` : `saved ${fmtDate(d.updated_at)}`}</span>
            </div>
            <p className="pu-text">{d.text}</p>
            <div className="btn-row">
              {d.status === "draft" && <button type="button" className="btn small" onClick={() => open(d)} disabled={busy !== null}>Continue editing</button>}
              {d.status !== "withdrawn" && <button type="button" className="link-btn" onClick={() => withdraw(d)} disabled={busy !== null}>{d.status === "approved" ? "Withdraw" : "Discard"}</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
