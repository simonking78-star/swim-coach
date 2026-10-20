import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { canEdit, sectionLevel } from "../../lib/access";
import { DESIGNATIONS, fmtRange, saveMacro, validateMacro, type MacroDraft } from "../../lib/season";
import { StatusMsg } from "../../components/seasonParts";
import { usePlanSquads } from "../plans/PlanList";
import { invalidateSeason, useActiveSeason, usePlanningLists } from "./Planning";

// Add / edit a macro-cycle: squads, title, the season competitions it builds
// towards (with a designation each), Head Coach note, and number of weeks.

export function MacroForm() {
  const { id } = useParams();
  const { access } = useAuth();
  const level = sectionLevel(access, "season");
  const { club } = useClub();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { season, isLoading } = useActiveSeason(club);
  const lists = usePlanningLists(season?.id);
  const squads = usePlanSquads(club);
  const existing = id ? lists.data?.macros.find(m => m.id === id) : undefined;

  const [d, setD] = useState<MacroDraft>({ id: null, title: "", note: "", count: "", squads: new Set(), prevSquads: new Set(), comps: {}, prevComps: new Set() });
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const filled = useRef(false);

  useEffect(() => {
    if (filled.current || !existing) return;
    filled.current = true;
    const sq = (existing.macro_squads || []).filter(x => x.is_active).map(x => x.squad_id);
    const mc = (existing.macro_competitions || []).filter(x => x.is_active);
    setD({ id: existing.id, title: existing.title, note: existing.head_coach_note || "", count: String(existing.micro_count || ""),
      squads: new Set(sq), prevSquads: new Set(sq), comps: Object.fromEntries(mc.map(x => [x.season_competition_id, x.designation])), prevComps: new Set(mc.map(x => x.season_competition_id)) });
  }, [existing]);

  const crumb = <p className="crumb"><Link to="/season/plan">‹ Planning</Link></p>;

  const stateH1 = <h1>{id ? "Edit macro" : "Add macro"}</h1>;
  if (!canEdit(level)) return <>{crumb}{stateH1}<p className="notice warn">Season planning is read only for your role.</p></>;
  if (isLoading || lists.isLoading) return <>{crumb}{stateH1}<p className="dim">Loading…</p></>;
  if (!season) return <>{crumb}{stateH1}<p className="notice warn">Save a season under Planning first.</p></>;
  if (id && !existing) return <>{crumb}{stateH1}<p className="msg error">Couldn't find that macro-cycle.</p></>;

  const save = async () => {
    setMsg(null);
    const bad = validateMacro(d);
    if (bad) { setMsg({ text: bad, error: true }); return; }
    setBusy(true);
    try {
      const copy = { ...d, squads: new Set(d.squads), prevSquads: new Set(d.prevSquads), comps: { ...d.comps }, prevComps: new Set(d.prevComps) };
      const macroId = await saveMacro(season.id, copy);
      setD(copy);
      invalidateSeason(qc, club);
      qc.invalidateQueries({ queryKey: ["micro_weeks", macroId] });
      navigate(`/season/macro/${macroId}/weeks`);
    } catch (e) { console.error(e); setMsg({ text: "Could not save: " + (e as Error).message, error: true }); }
    finally { setBusy(false); }
  };

  return (
    <>
      {crumb}
      <div className="page-head"><h1>{id ? "Edit macro" : "Add macro"}</h1><p className="dim">{season.title}</p></div>
      <section className="card">
        <fieldset className="plain-fieldset">
          <legend>Squads</legend>
          {squads.isLoading && <p className="dim">Loading squads…</p>}
          <div className="check-grid">
            {(squads.data ?? []).map(s => (
              <label key={s.id} className={"skill" + (d.squads.has(s.id) ? " on" : "")}>
                <input type="checkbox" checked={d.squads.has(s.id)} onChange={e => setD(x => { const n = new Set(x.squads); if (e.target.checked) n.add(s.id); else n.delete(s.id); return { ...x, squads: n }; })} />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor="mf-title">Macro title</label>
        <input id="mf-title" type="text" value={d.title} placeholder="e.g. Autumn build to County SC" onChange={e => setD(x => ({ ...x, title: e.target.value }))} />
        <fieldset className="plain-fieldset">
          <legend>Season competitions</legend>
          {!lists.data?.comps.length && <p className="dim">No competitions in this season yet.</p>}
          <ul className="pl-list">
            {(lists.data?.comps ?? []).map(c => (
              <li key={c.id}>
                <div><div className="meet-name">{c.name}</div><div className="dim small">{fmtRange(c.date_from, c.date_to)}</div></div>
                <select aria-label={`Designation for ${c.name}`} value={d.comps[c.id] || ""} onChange={e => setD(x => { const comps = { ...x.comps }; if (e.target.value) comps[c.id] = e.target.value; else delete comps[c.id]; return { ...x, comps }; })}>
                  <option value="">— not in macro —</option>
                  {Object.entries(DESIGNATIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </fieldset>
        <label htmlFor="mf-note">Head Coach note</label>
        <textarea id="mf-note" rows={4} value={d.note} onChange={e => setD(x => ({ ...x, note: e.target.value }))} />
        <label htmlFor="mf-count">Micro-cycles <span className="dim">(number of weeks)</span></label>
        <input id="mf-count" type="number" min={1} max={52} inputMode="numeric" value={d.count} onChange={e => setD(x => ({ ...x, count: e.target.value }))} />
        <button type="button" className="btn primary wide" onClick={save} disabled={busy}>{busy ? "Saving…" : id ? "Save & open weeks" : "Add micro-cycles"}</button>
        <StatusMsg msg={msg} />
      </section>
    </>
  );
}
