import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { deleteDrill, loadPeri, MESOS, periKey, PHASES, saveDrill, type DrillDraft, type FullDrill } from "../lib/drills";
import { useCoachName } from "../lib/util";
import { Modal } from "./Modal";
import { useDrills } from "./drillParts";

// Create / edit a drill or skill in the club's Drills & Skills library.
// Used by the library page and, for "create new", by the feedback forms'
// remedial-action picker (which passes initialName and onSaved).

export const emptyDrillDraft = (): DrillDraft => ({ stroke: "", name: "", pseudonyms: "", purpose: "", blabt: "", biomech: "", equipment: "", regression: "", progression: "", peri: {} });

export interface SavedDrill { id: string; drill_name: string; stroke: string | null; }

export function DrillEditModal({ drill, club, onClose, initialName, initialStroke, onSaved }: {
  drill: FullDrill | null; club: string; onClose: () => void;
  /** New drills only: pre-fill from what the coach typed / the feedback stroke. */
  initialName?: string; initialStroke?: string;
  /** Called with the saved drill before the modal closes. */
  onSaved?: (d: SavedDrill) => void;
}) {
  const coach = useCoachName();
  const qc = useQueryClient();
  const [d, setD] = useState<DrillDraft>(() => drill ? {
    stroke: drill.stroke || "", name: drill.drill_name || "", pseudonyms: (drill.pseudonyms || []).join(", "),
    purpose: drill.primary_purpose || "", blabt: drill.blabt || "", biomech: drill.biomechanical || "", equipment: drill.equipment || "",
    regression: drill.regression || "", progression: drill.progression || "", peri: {}
  } : { ...emptyDrillDraft(), name: initialName ?? "", stroke: initialStroke ?? "" });
  const [periReady, setPeriReady] = useState(!drill);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const library = useDrills(club);
  const strokeOptions = useMemo(() => [...new Set([...(library.data ?? []).map(x => x.stroke).filter((s): s is string => !!s),
    "Frontcrawl", "Backstroke", "Breaststroke", "Butterfly", "Turn - Frontcrawl", "Turn - Backstroke", "Turn - Breaststroke", "Turn - Butterfly", "Dive", "Underwater", "Transition"])].sort(), [library.data]);

  // Load the drill's periodisation grid once.
  useEffect(() => {
    if (!drill) return;
    loadPeri(drill.id).then(rows => {
      const peri: DrillDraft["peri"] = {};
      rows.forEach(r => { peri[periKey(r.meso, r.phase_type)] = { placement: r.session_plan_placement || "", distance: r.distance_m != null ? String(r.distance_m) : "" }; });
      setD(x => ({ ...x, peri })); setPeriReady(true);
    }).catch(e => { console.error(e); setPeriReady(true); });
  }, [drill]);

  const set = (k: keyof Omit<DrillDraft, "peri">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD(x => ({ ...x, [k]: e.target.value }));
  const setPeri = (meso: string, phase: string, f: "placement" | "distance", v: string) =>
    setD(x => { const key = periKey(meso, phase); const cur = x.peri[key] ?? { placement: "", distance: "" }; return { ...x, peri: { ...x.peri, [key]: { ...cur, [f]: v } } }; });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["drills_full", club] }); qc.invalidateQueries({ queryKey: ["drills", club] }); };

  const save = async () => {
    setMsg(null);
    if (!d.name.trim()) { setMsg({ text: "Give it a name.", error: true }); return; }
    setBusy(true);
    try {
      const id = await saveDrill(club, drill?.id ?? null, d, coach);
      qc.invalidateQueries({ queryKey: ["drill_peri", id] });
      refresh();
      setMsg({ text: "Saved to Drills & Skills." });
      onSaved?.({ id, drill_name: d.name.trim(), stroke: d.stroke.trim() || null });
      setTimeout(onClose, 450);
    } catch (e) { console.error(e); setMsg({ text: "Save failed — " + ((e as Error).message || "please try again."), error: true }); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!drill) return;
    setBusy(true);
    try { await deleteDrill(drill.id); refresh(); onClose(); }
    catch (e) { console.error(e); setMsg({ text: "Delete failed — " + ((e as Error).message || "please try again."), error: true }); setBusy(false); }
  };

  const field = (id: string, label: string, k: keyof Omit<DrillDraft, "peri">, ph: string, area = false) => (
    <>
      <label htmlFor={id}>{label}</label>
      {area ? <textarea id={id} rows={2} value={d[k]} placeholder={ph} onChange={set(k)} /> : <input id={id} type="text" value={d[k]} placeholder={ph} onChange={set(k)} />}
    </>
  );

  return (
    <Modal open onClose={onClose} title={drill ? "Edit drill / skill" : "New drill / skill"}>
      <label htmlFor="de-stroke">Stroke / skill</label>
      <input id="de-stroke" type="text" list="de-stroke-list" autoComplete="off" value={d.stroke} placeholder="e.g. Frontcrawl, Turn - Backstroke" onChange={set("stroke")} />
      <datalist id="de-stroke-list">{strokeOptions.map(s => <option key={s} value={s} />)}</datalist>
      <p className="hint">Pick a stroke for a drill, or a skill (e.g. a turn, dive or underwater) — or type a new one.</p>
      {field("de-name", "Name", "name", "e.g. Zip")}
      {field("de-pseudo", "Pseudonyms (comma separated)", "pseudonyms", "Finger drag, Thumb drag")}
      {field("de-purpose", "Primary purpose", "purpose", "What this drill develops", true)}
      {field("de-blabt", "BLABT / focus", "blabt", "e.g. Arms, Body")}
      {field("de-biomech", "Biomechanical", "biomech", "Biomechanical notes", true)}
      {field("de-equip", "Equipment", "equipment", "e.g. Fins (optional)", true)}
      {field("de-regress", "Regression", "regression", "Easier variant to step back to", true)}
      {field("de-progress", "Progression", "progression", "What this links into / builds towards", true)}

      <details open className="peri">
        <summary>Periodisation recommendations</summary>
        {!periReady ? <p className="dim">Loading…</p> : (
          <div className="table-wrap">
            <table className="data peri-grid">
              <caption className="sr-only">Placement and distance per meso cycle and phase</caption>
              <thead><tr><th scope="col">Phase</th>{MESOS.map(m => <th key={m} scope="col">{m}</th>)}</tr></thead>
              <tbody>
                {PHASES.map(ph => (
                  <tr key={ph}>
                    <th scope="row">{ph}</th>
                    {MESOS.map(m => {
                      const c = d.peri[periKey(m, ph)];
                      return (
                        <td key={m}>
                          <input type="text" aria-label={`${m} ${ph} placement`} placeholder="Placement" value={c?.placement ?? ""} onChange={e => setPeri(m, ph, "placement", e.target.value)} />
                          <input type="number" inputMode="numeric" aria-label={`${m} ${ph} distance in metres`} placeholder="m" value={c?.distance ?? ""} onChange={e => setPeri(m, ph, "distance", e.target.value)} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">Placement (e.g. Warm-up, pre-set) + distance in metres, per meso cycle.</p>
      </details>

      <button type="button" className="btn primary wide" onClick={save} disabled={busy || !periReady}>{busy ? "Saving…" : "Save drill"}</button>
      {drill && !confirmDel && <button type="button" className="btn wide danger-outline" onClick={() => setConfirmDel(true)} disabled={busy}>Delete drill</button>}
      {drill && confirmDel && (
        <div className="confirm-box" role="alert">
          <p>Delete this drill? This also removes its periodisation recommendations and archived set-line drafts.</p>
          <div className="btn-row">
            <button type="button" className="btn danger" onClick={del} disabled={busy}>Yes, delete</button>
            <button type="button" className="btn" onClick={() => setConfirmDel(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className={"msg" + (msg.error ? " error" : "")} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
    </Modal>
  );
}

