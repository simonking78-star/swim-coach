import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClubPicker } from "../../club/ClubPicker";
import { Modal } from "../../components/Modal";
import { TargetList, TargetPicker, TermUsageBlock } from "../../components/vocabParts";
import { loadTermTargets, loadTerms, removeTerm, saveTerm, saveTermTargets, TERM_TYPE_LABEL, TERM_TYPES, type Term, type TermType } from "../../lib/vocab";
import { useCoachName } from "../../lib/util";

// Club terms (A-154): the shorthand coaches write in session plans that isn't a drill or skill —
// strokes, kit, effort words, set types. Same club-wide list as Drills & Skills; any name or
// "other name" here is recognised in every coach's plans.

const OTHER_TYPES = TERM_TYPES.filter(([t]) => t !== "drill" && t !== "skill");
export const useVocabTerms = (club: string | null) =>
  useQuery({ queryKey: ["vocab_terms", club], enabled: !!club, staleTime: 5 * 60 * 1000, queryFn: () => loadTerms(club!) });

export function ClubTerms({ club, editable, reviewer }: { club: string | null; editable: boolean; reviewer: boolean }) {
  const terms = useVocabTerms(club);
  const [q, setQ] = useState("");
  const [type, setType] = useState<TermType | null>(null);
  const [editing, setEditing] = useState<Term | "new" | null>(null);
  const [info, setInfo] = useState<Term | null>(null);
  const t = q.trim().toLowerCase();
  const list = (terms.data ?? []).filter(x => x.term_type !== "drill" && x.term_type !== "skill")
    .filter(x => (!type || x.term_type === type) && (!t || [x.term, x.full_form ?? "", x.meaning ?? "", ...x.aliases].some(s => s.toLowerCase().includes(t))));
  const types = OTHER_TYPES.filter(([k]) => (terms.data ?? []).some(x => x.term_type === k));

  return (
    <>
      <section className="card filter-bar" aria-label="Filters">
        <ClubPicker />
        <div className="filter-fields">
          <div className="ff-search">
            <label htmlFor="ct-search">Search</label>
            <input id="ct-search" type="search" placeholder="Search terms and meanings…" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {types.length > 1 && (
            <div className="chip-row ff-chips" role="group" aria-label="Type">
              {[null, ...types.map(([k]) => k)].map(k => (
                <button key={k ?? "all"} type="button" className={"filter-chip" + (type === k ? " on" : "")} aria-pressed={type === k} onClick={() => setType(k)}>{k ? TERM_TYPE_LABEL[k] : "All"}</button>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="card">
        <div className="flex-row">
          <h2 className="card-title">Club terms {terms.data && <span className="dim">({list.length})</span>}</h2>
          {editable && <button type="button" className="btn small primary" onClick={() => setEditing("new")}>+ New term</button>}
        </div>
        <p className="hint">Shorthand coaches use in session plans, such as SFK or IMO. Every coach's plans are read with these meanings.</p>
        {terms.isLoading && <p className="dim">Loading…</p>}
        {terms.error && <p className="msg error">Couldn't load the club's terms. <button type="button" className="link-btn" onClick={() => terms.refetch()}>Try again</button></p>}
        {terms.data && !list.length && <p className="dim">{t || type ? "No terms match." : "No club terms yet. Coaches add them when they explain a word in a plan, or add one here."}</p>}
        <ul className="feed">
          {list.map(x => (
            <li key={x.id}>
              <div className="flex-row">
                <button type="button" className="link-btn" onClick={() => setInfo(x)}><strong>{x.term}</strong>{x.full_form ? ` — ${x.full_form}` : ""}</button>
                {editable && <button type="button" className="link-btn" onClick={() => setEditing(x)} aria-label={`Edit ${x.term}`}>Edit</button>}
              </div>
              <div className="feed-meta dim"><span className="chip">{TERM_TYPE_LABEL[x.term_type]}</span>{x.stroke && <span>{x.stroke}</span>}{!!x.aliases.length && <span>also {x.aliases.join(", ")}</span>}</div>
              {x.meaning && <p>{x.meaning}</p>}
            </li>
          ))}
        </ul>
      </section>
      {info && (
        <Modal open onClose={() => setInfo(null)} title={info.term}>
          <p className="drill-stroke">{[TERM_TYPE_LABEL[info.term_type], info.stroke].filter(Boolean).join(" · ")}</p>
          <dl className="di-list">
            {info.full_form && <div><dt>In full</dt><dd>{info.full_form}</dd></div>}
            <div><dt>Meaning</dt><dd className={info.meaning ? undefined : "dim"}>{info.meaning || "—"}</dd></div>
            {!!info.aliases.length && <div><dt>Also written as</dt><dd>{info.aliases.join(", ")}</dd></div>}
          </dl>
          <TargetList termId={info.id} />
          <TermUsageBlock termId={info.id} club={club} />
        </Modal>
      )}
      {editing && club && <TermEditModal club={club} term={editing === "new" ? null : editing} reviewer={reviewer} onClose={() => setEditing(null)} />}
    </>
  );
}

export function TermEditModal({ club, term, reviewer, onClose }: { club: string; term: Term | null; reviewer: boolean; onClose: () => void }) {
  const coach = useCoachName();
  const qc = useQueryClient();
  const [d, setD] = useState({
    term: term?.term ?? "", full_form: term?.full_form ?? "", meaning: term?.meaning ?? "", aliases: (term?.aliases ?? []).join(", "),
    term_type: (term?.term_type ?? "other") as TermType, stroke: term?.stroke ?? ""
  });
  const [targets, setTargets] = useState<Record<string, "primary" | "secondary">>({});
  const tt = useQuery({ queryKey: ["term_targets_edit", term?.id], enabled: !!term, staleTime: 0, queryFn: () => loadTermTargets([term!.id]) });
  useEffect(() => { if (tt.data) setTargets(Object.fromEntries(tt.data.map(r => [r.target_id, r.weight]))); }, [tt.data]);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setD(x => ({ ...x, [k]: e.target.value }));
  const refresh = () => { ["vocab_terms", "vocab_review", "drills_full"].forEach(k => qc.invalidateQueries({ queryKey: [k, club] })); qc.invalidateQueries({ queryKey: ["term_targets"] }); };

  const save = async () => {
    setMsg(null);
    if (!d.term.trim()) { setMsg({ text: "Give the term.", error: true }); return; }
    if (!d.meaning.trim()) { setMsg({ text: "Say what it means.", error: true }); return; }
    setBusy(true);
    try {
      const saved = await saveTerm(club, term?.id ?? null, { ...d, details: {} }, { reviewer, coach });
      await saveTermTargets(saved.id, targets);
      refresh();
      setMsg({ text: "Saved." });
      setTimeout(onClose, 450);
    } catch (e) { console.error(e); setMsg({ text: "Save failed — " + ((e as Error).message || "please try again."), error: true }); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!term) return;
    setBusy(true);
    try { await removeTerm(term.id); refresh(); onClose(); }
    catch (e) { console.error(e); setMsg({ text: "Remove failed — " + ((e as Error).message || "please try again."), error: true }); setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={term ? "Edit club term" : "New club term"}>
      <label htmlFor="te-term">Term, as coaches write it</label>
      <input id="te-term" type="text" value={d.term} placeholder="e.g. SFK" onChange={set("term")} />
      <label htmlFor="te-full">In full <span className="dim">(optional)</span></label>
      <input id="te-full" type="text" value={d.full_form} placeholder="e.g. Streamline fly kick" onChange={set("full_form")} />
      <label htmlFor="te-meaning">What it means</label>
      <textarea id="te-meaning" rows={2} value={d.meaning} placeholder="How a coach should read it in a plan" onChange={set("meaning")} />
      <label htmlFor="te-type">Type</label>
      <select id="te-type" value={d.term_type} onChange={set("term_type")}>
        {OTHER_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <p className="hint">A drill or skill goes in the Drills &amp; skills tab instead.</p>
      <label htmlFor="te-aliases">Also written as <span className="dim">(comma separated, optional)</span></label>
      <input id="te-aliases" type="text" value={d.aliases} placeholder="e.g. S/F/K, str fly kick" onChange={set("aliases")} />
      <details className="peri">
        <summary>What it develops <span className="dim">(optional)</span></summary>
        {term && tt.isLoading ? <p className="dim">Loading…</p> : <TargetPicker value={targets} onChange={setTargets} disabled={busy} />}
      </details>
      <button type="button" className="btn primary wide" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      {term && !confirmDel && <button type="button" className="btn wide danger-outline" onClick={() => setConfirmDel(true)} disabled={busy}>Remove from the club's terms</button>}
      {term && confirmDel && (
        <div className="confirm-box" role="alert">
          <p>Remove this term? Plans that used it keep their history, but new plans won't be read with this meaning.</p>
          <div className="btn-row">
            <button type="button" className="btn danger" onClick={del} disabled={busy}>Yes, remove</button>
            <button type="button" className="btn" onClick={() => setConfirmDel(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className={"msg" + (msg.error ? " error" : "")} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
    </Modal>
  );
}
