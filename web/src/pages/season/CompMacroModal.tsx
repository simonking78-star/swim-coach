import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../components/Modal";
import { CompDocsField, StatusMsg } from "../../components/seasonParts";
import {
  DESIGNATIONS, fmtRange, removeCompFromMacro, saveCompToMacro, validateCompMacro,
  type ClubCompInfo, type CompMacroDraft, type Competition
} from "../../lib/season";
import { invalidateSeason, usePlanningLists, useSeasons } from "./Planning";

// From the Competitions page: put a scraped meet into a macro of a season plan, with its
// type for that macro, the club's website link, notes and documents. The meet is added to
// the season plan first if it isn't there yet (season_competitions), then linked
// (macro_competitions). Link, notes and documents belong to the club's copy of the meet,
// so they show wherever that meet shows in the plan.

export function CompMacroModal({ comp, club, info, onClose, onSaved }: {
  comp: Competition | null; club: string | null; info: ClubCompInfo[]; onClose: () => void; onSaved: (text: string) => void;
}) {
  return (
    <Modal open={!!comp} onClose={onClose} title="Add to macro">
      {comp && club && <Body comp={comp} club={club} info={info} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function Body({ comp, club, info, onClose, onSaved }: { comp: Competition; club: string; info: ClubCompInfo[]; onClose: () => void; onSaved: (text: string) => void }) {
  const qc = useQueryClient();
  const seasons = useSeasons(club);
  const end = comp.date_end && comp.date_end >= comp.date_start ? comp.date_end : comp.date_start;
  // Season plans the meet falls in (by its first day); the plan it's already in comes first.
  const covering = useMemo(() => (seasons.data ?? []).filter(s => s.start_date <= comp.date_start && s.finish_date >= comp.date_start), [seasons.data, comp.date_start]);
  const [seasonId, setSeasonId] = useState("");
  const lists = usePlanningLists(seasonId || null);
  const current = info.find(i => i.seasonId === seasonId) ?? null;

  const [macroId, setMacroId] = useState("");
  const [designation, setDesignation] = useState("");
  const [course, setCourse] = useState(comp.course || "");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (seasonId || !seasons.data) return;
    const pre = info.find(i => covering.some(s => s.id === i.seasonId));
    setSeasonId(pre?.seasonId || covering[0]?.id || "");
  }, [seasons.data, covering, info, seasonId]);

  // When the plan changes, start from the club's copy in that plan (if any).
  useEffect(() => {
    setUrl(current?.url ?? comp.website_url ?? "");
    setNotes(current?.notes ?? "");
    setCourse(current?.course || comp.course || "");
    setRemoved(new Set());
    setMacroId(""); setDesignation("");
  }, [seasonId]); // eslint-disable-line react-hooks/exhaustive-deps

  const macros = lists.data?.macros ?? [];
  const existingLink = current?.links.find(l => l.macroId === macroId) ?? null;
  const chooseMacro = (id: string) => {
    setMacroId(id);
    const l = current?.links.find(x => x.macroId === id);
    if (l) setDesignation(l.designation);
  };

  const save = async () => {
    setMsg(null);
    const d: CompMacroDraft = { competition: comp, seasonId, seasonCompId: current?.seasonCompId ?? null, macroId, designation, course, url, notes, files, removeDocIds: [...removed] };
    const bad = validateCompMacro(d);
    if (bad) { setMsg({ text: bad, error: true }); return; }
    setBusy(true);
    try {
      await saveCompToMacro(club, d);
      invalidateSeason(qc, club);
      qc.invalidateQueries({ queryKey: ["club_comp_info"] });
      const m = macros.find(x => x.id === macroId);
      onSaved(`${comp.name} saved to ${m?.title || "the macro"} as ${DESIGNATIONS[designation]}.`);
    } catch (e) { console.error(e); setMsg({ text: "Could not save: " + (e as Error).message, error: true }); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!current || !existingLink) return;
    setBusy(true); setMsg(null);
    try {
      await removeCompFromMacro(macroId, current.seasonCompId);
      invalidateSeason(qc, club);
      qc.invalidateQueries({ queryKey: ["club_comp_info"] });
      onSaved(`${comp.name} taken out of ${existingLink.macroTitle}. It stays in the season plan.`);
    } catch (e) { setMsg({ text: "Could not remove: " + (e as Error).message, error: true }); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-body">
      <p><strong>{comp.name}</strong><span className="dim small block">{fmtRange(comp.date_start, end)}{comp.level ? ` · L${comp.level}` : ""}{comp.course ? ` · ${comp.course}` : ""}</span></p>
      {seasons.isLoading && <p className="dim">Loading season plans…</p>}
      {seasons.error && <p className="msg error">Couldn't load season plans.</p>}
      {seasons.data && !covering.length && (
        <p className="notice warn">No season plan covers {fmtRange(comp.date_start)}. <Link to="/season/plan?season=new" onClick={onClose}>Create a season plan</Link> first, then add macros to it.</p>
      )}
      {covering.length > 0 && (
        <>
          <label htmlFor="cm-season">Season plan</label>
          <select id="cm-season" value={seasonId} onChange={e => setSeasonId(e.target.value)}>
            {covering.map(s => <option key={s.id} value={s.id}>{s.title} ({fmtRange(s.start_date, s.finish_date)})</option>)}
          </select>
          {current ? <p className="hint">Already in this plan{current.links.length ? ` — in ${current.links.map(l => `${l.macroTitle} (${DESIGNATIONS[l.designation] || l.designation})`).join(", ")}` : ", not in a macro yet"}.</p>
            : <p className="hint">Not in this plan yet — it will be added when you save.</p>}

          <label htmlFor="cm-macro">Macro</label>
          <select id="cm-macro" value={macroId} onChange={e => chooseMacro(e.target.value)} disabled={lists.isLoading}>
            <option value="">{lists.isLoading ? "Loading…" : macros.length ? "Choose a macro…" : "No macros in this plan"}</option>
            {macros.map(m => {
              const sq = (m.macro_squads || []).filter(x => x.is_active).map(x => x.squads?.name).filter(Boolean).join(", ");
              const linked = current?.links.some(l => l.macroId === m.id);
              return <option key={m.id} value={m.id}>{m.title}{sq ? ` — ${sq}` : ""}{linked ? " ✓" : ""}</option>;
            })}
          </select>
          {lists.data && !macros.length && <p className="hint"><Link to={`/season/macro/new?season=${seasonId}`} onClick={onClose}>Add a macro</Link> to this plan first.</p>}

          <div className="field-pair">
            <div><label htmlFor="cm-type">Type for this macro</label>
              <select id="cm-type" value={designation} onChange={e => setDesignation(e.target.value)}>
                <option value="">Choose…</option>
                {Object.entries(DESIGNATIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div><label htmlFor="cm-course">Course</label>
              <select id="cm-course" value={course} onChange={e => setCourse(e.target.value)} disabled={!!current}>
                <option value="">—</option><option value="SC">SC</option><option value="LC">LC</option>
              </select></div>
          </div>

          <label htmlFor="cm-url">Website link</label>
          <input id="cm-url" type="url" inputMode="url" placeholder="https://" value={url} onChange={e => setUrl(e.target.value)} />
          <label htmlFor="cm-notes">Notes</label>
          <textarea id="cm-notes" rows={4} value={notes} placeholder="e.g. entries via club, warm-up times, travel, who's going" onChange={e => setNotes(e.target.value)} />
          <CompDocsField saved={current?.docs ?? []} removed={removed} files={files} onFiles={setFiles}
            onToggleRemove={id => setRemoved(r => { const n = new Set(r); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />

          <div className="btn-row gap-top">
            <button type="button" className="btn primary" onClick={save} disabled={busy || !macros.length}>{busy ? (files.length ? "Uploading…" : "Saving…") : existingLink ? "Save changes" : "Add to macro"}</button>
            {existingLink && <button type="button" className="btn" onClick={remove} disabled={busy}>Take out of {existingLink.macroTitle}</button>}
            <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
          <StatusMsg msg={msg} />
        </>
      )}
    </div>
  );
}
