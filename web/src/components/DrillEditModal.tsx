import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { deleteDrill, saveDrill, type DrillDraft, type FullDrill } from "../lib/drills";
import { loadTermTargets } from "../lib/vocab";
import { useCoachName } from "../lib/util";
import { Modal } from "./Modal";
import { useDrills } from "./drillParts";
import { TargetPicker, useCanReview } from "./vocabParts";

// Create / edit a drill or skill in the club's Drills & Skills library (the club vocabulary, A-154).
// Used by the library page and, for "create new", by the feedback forms'
// remedial-action picker (which passes initialName and onSaved).
// "What it develops" replaces the old periodisation grid: how much a drill is used, and when,
// now comes from the dated session plans themselves.

export const emptyDrillDraft = (): DrillDraft => ({ kind: "drill", stroke: "", name: "", pseudonyms: "", purpose: "", blabt: "", biomech: "", equipment: "", regression: "", progression: "", targets: {} });

export interface SavedDrill { id: string; drill_name: string; stroke: string | null; }

const SKILL_HINT = /^(turn|dive|start|underwater|transition|finish|relay|breakout)/i;

export function DrillEditModal({ drill, club, onClose, initialName, initialStroke, onSaved }: {
  drill: FullDrill | null; club: string; onClose: () => void;
  /** New drills only: pre-fill from what the coach typed / the feedback stroke. */
  initialName?: string; initialStroke?: string;
  /** Called with the saved drill (its drills_library id) before the modal closes. */
  onSaved?: (d: SavedDrill) => void;
}) {
  const coach = useCoachName();
  const qc = useQueryClient();
  const reviewer = useCanReview(club);
  const [d, setD] = useState<DrillDraft>(() => drill ? {
    kind: drill.term_type ?? "drill", stroke: drill.stroke || "", name: drill.drill_name || "", pseudonyms: (drill.pseudonyms || []).join(", "),
    purpose: drill.primary_purpose || "", blabt: drill.blabt || "", biomech: drill.biomechanical || "", equipment: drill.equipment || "",
    regression: drill.regression || "", progression: drill.progression || "", targets: {}
  } : { ...emptyDrillDraft(), name: initialName ?? "", stroke: initialStroke ?? "", kind: SKILL_HINT.test(initialStroke ?? "") ? "skill" : "drill" });
  const [targetsReady, setTargetsReady] = useState(!drill?.term_id);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const library = useDrills(club);
  const strokeOptions = useMemo(() => [...new Set([...(library.data ?? []).map(x => x.stroke).filter((s): s is string => !!s),
    "Frontcrawl", "Backstroke", "Breaststroke", "Butterfly", "Turn - Frontcrawl", "Turn - Backstroke", "Turn - Breaststroke", "Turn - Butterfly", "Dive", "Underwater", "Transition"])].sort(), [library.data]);

  // Load what the drill develops once.
  useEffect(() => {
    if (!drill?.term_id) return;
    loadTermTargets([drill.term_id]).then(rows => {
      setD(x => ({ ...x, targets: Object.fromEntries(rows.map(r => [r.target_id, r.weight])) }));
      setTargetsReady(true);
    }).catch(e => { console.error(e); setTargetsReady(true); });
  }, [drill]);

  const set = (k: keyof Omit<DrillDraft, "targets" | "kind">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD(x => ({ ...x, [k]: e.target.value }));
  const refresh = () => {
    ["drills_full", "drills", "vocab_terms", "vocab_review"].forEach(k => qc.invalidateQueries({ queryKey: [k, club] }));
    qc.invalidateQueries({ queryKey: ["term_targets"] });
    if (drill) qc.invalidateQueries({ queryKey: ["drill", drill.id] });
  };

  const save = async () => {
    setMsg(null);
    if (!d.name.trim()) { setMsg({ text: "Give it a name.", error: true }); return; }
    setBusy(true);
    try {
      const id = await saveDrill(club, drill, d, { coach, reviewer: reviewer.data === true });
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
    try { await deleteDrill(drill); refresh(); onClose(); }
    catch (e) { console.error(e); setMsg({ text: "Remove failed — " + ((e as Error).message || "please try again."), error: true }); setBusy(false); }
  };

  const field = (id: string, label: string, k: keyof Omit<DrillDraft, "targets" | "kind">, ph: string, area = false) => (
    <>
      <label htmlFor={id}>{label}</label>
      {area ? <textarea id={id} rows={2} value={d[k]} placeholder={ph} onChange={set(k)} /> : <input id={id} type="text" value={d[k]} placeholder={ph} onChange={set(k)} />}
    </>
  );

  return (
    <Modal open onClose={onClose} title={drill ? "Edit drill / skill" : "New drill / skill"}>
      <div className="seg seg-2" role="group" aria-label="Drill or skill">
        <button type="button" className={"seg-btn" + (d.kind === "drill" ? " on" : "")} aria-pressed={d.kind === "drill"} onClick={() => setD(x => ({ ...x, kind: "drill" }))}>Drill</button>
        <button type="button" className={"seg-btn" + (d.kind === "skill" ? " on" : "")} aria-pressed={d.kind === "skill"} onClick={() => setD(x => ({ ...x, kind: "skill" }))}>Skill</button>
      </div>
      <label htmlFor="de-stroke">Stroke / skill area</label>
      <input id="de-stroke" type="text" list="de-stroke-list" autoComplete="off" value={d.stroke} placeholder="e.g. Frontcrawl, Turn - Backstroke" onChange={set("stroke")} />
      <datalist id="de-stroke-list">{strokeOptions.map(s => <option key={s} value={s} />)}</datalist>
      {field("de-name", "Name", "name", "e.g. Zip")}
      {field("de-pseudo", "Other names coaches use (comma separated)", "pseudonyms", "Finger drag, Thumb drag")}
      <p className="hint">Any of these names in a session plan is counted as this drill.</p>
      {field("de-purpose", "Primary purpose", "purpose", "What this drill develops", true)}
      {field("de-blabt", "BLABT / focus", "blabt", "e.g. Arms, Body")}
      {field("de-biomech", "Biomechanical", "biomech", "Biomechanical notes", true)}
      {field("de-equip", "Equipment", "equipment", "e.g. Fins (optional)", true)}
      {field("de-regress", "Regression", "regression", "Easier variant to step back to", true)}
      {field("de-progress", "Progression", "progression", "What this links into / builds towards", true)}

      <details open className="peri">
        <summary>What it develops</summary>
        {targetsReady ? <TargetPicker value={d.targets} onChange={targets => setD(x => ({ ...x, targets }))} disabled={busy} /> : <p className="dim">Loading…</p>}
      </details>

      <button type="button" className="btn primary wide" onClick={save} disabled={busy || !targetsReady}>{busy ? "Saving…" : "Save"}</button>
      {drill && !confirmDel && <button type="button" className="btn wide danger-outline" onClick={() => setConfirmDel(true)} disabled={busy}>Remove from the library</button>}
      {drill && confirmDel && (
        <div className="confirm-box" role="alert">
          <p>Remove this from Drills &amp; Skills? Plans and feedback that used it keep their history.</p>
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
