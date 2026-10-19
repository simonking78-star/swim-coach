import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { ClubPicker } from "../club/ClubPicker";
import { canEdit, LEVEL_NOTE, sectionLevel } from "../lib/access";
import { deleteDrill, filterDrills, loadPeri, MESOS, periKey, PHASES, saveDrill, type DrillDraft, type FullDrill } from "../lib/drills";
import { appendDrillsToPlan, createPlanWithDrills } from "../lib/plans";
import { exportDrillPdf } from "../lib/planPdf";
import { fmtDate, logEvent, useCoachName } from "../lib/util";
import { Modal } from "../components/Modal";
import { DrillInfoModal, useDrills } from "../components/drillParts";
import { usePlans } from "./plans/PlanList";

// Drills & Skills library: stroke filter, search, info pop-up, create/edit with
// periodisation, export to PDF, and attach selected drills to a session plan.

const emptyDraft = (): DrillDraft => ({ stroke: "", name: "", pseudonyms: "", purpose: "", blabt: "", biomech: "", equipment: "", regression: "", progression: "", peri: {} });

export function Drills() {
  const { access, session } = useAuth();
  const level = sectionLevel(access, "plans");
  const editable = canEdit(level);
  const { club } = useClub();
  const drills = useDrills(club);
  const [stroke, setStroke] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [infoId, setInfoId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FullDrill | "new" | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const all = drills.data ?? [];
  const strokes = useMemo(() => [...new Set(all.map(d => d.stroke).filter((s): s is string => !!s))].sort(), [all]);
  const shown = filterDrills(all, stroke, q);

  if (level === "N") return <><div className="page-head"><h1>Drills &amp; Skills</h1></div><p className="notice warn">Your role doesn't have access to the drills library.</p></>;

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exportPdf = async (d: FullDrill) => { setExporting(d.id); try { await exportDrillPdf(d); } catch (e) { console.error(e); } finally { setExporting(null); } };

  return (
    <>
      <div className="page-head row">
        <div>
          <h1><span aria-hidden="true">🧩</span> Drills &amp; Skills</h1>
          <p className="dim">The club's drills library{editable ? " — select drills to attach them to a session plan" : ""}</p>
        </div>
        {editable && <button type="button" className="btn primary" onClick={() => setEditing("new")}>+ New drill</button>}
      </div>
      {LEVEL_NOTE[level] && <p className="notice">{LEVEL_NOTE[level]}</p>}

      <section className="card">
        <ClubPicker />
        <label htmlFor="dl-search">Search</label>
        <input id="dl-search" type="search" placeholder="Search drills, pseudonyms…" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
        <div className="chip-row" role="group" aria-label="Stroke">
          {[null, ...strokes].map(s => (
            <button key={s ?? "all"} type="button" className={"filter-chip" + (stroke === s ? " on" : "")} aria-pressed={stroke === s} onClick={() => setStroke(s)}>{s ?? "All"}</button>
          ))}
        </div>
      </section>

      <section aria-labelledby="dl-head" className="drill-section">
        <h2 id="dl-head" className="section-title">Drills {drills.data && <span className="dim">({shown.length})</span>}</h2>
        {drills.isLoading && <p className="dim">Loading drills…</p>}
        {drills.error && <p className="msg error">Couldn't load drills. <button type="button" className="link-btn" onClick={() => drills.refetch()}>Try again</button></p>}
        {drills.data && !shown.length && <p className="dim">No drills match.</p>}
        <ul className="drill-grid">
          {shown.map(d => {
            const on = selected.has(d.id);
            return (
              <li key={d.id} className={"drill-tile" + (on ? " selected" : "")}>
                <div className="drill-tile-top">
                  {editable
                    ? <label className="drill-check"><input type="checkbox" checked={on} onChange={() => toggle(d.id)} /><span className="sr-only">Select {d.drill_name}</span></label>
                    : <span />}
                  <span className="drill-tile-actions">
                    {editable && <button type="button" className="link-btn" onClick={() => setEditing(d)} aria-label={`Edit ${d.drill_name}`}>Edit</button>}
                    <button type="button" className="link-btn" onClick={() => exportPdf(d)} disabled={exporting === d.id} aria-label={`Export ${d.drill_name} as PDF`}>{exporting === d.id ? "…" : "Export"}</button>
                  </span>
                </div>
                <button type="button" className="drill-tile-main" onClick={() => setInfoId(d.id)}>
                  {d.stroke && <span className="drill-stroke">{d.stroke}</span>}
                  <span className="drill-name">{d.drill_name}</span>
                  {d.primary_purpose && <span className="drill-purpose">{d.primary_purpose}</span>}
                  {!!d.pseudonyms?.length && <span className="drill-aka">aka {d.pseudonyms.join(", ")}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {selected.size > 0 && (
        <div className="attach-bar" role="region" aria-label="Selected drills">
          <span><strong>{selected.size}</strong> selected</span>
          <span className="btn-row">
            <button type="button" className="btn small" onClick={() => setSelected(new Set())}>Clear</button>
            <button type="button" className="btn small primary" onClick={() => setAttaching(true)}>Attach to plan</button>
          </span>
        </div>
      )}

      <DrillInfoModal drillId={infoId} list={all} onClose={() => setInfoId(null)} />
      {editing && <DrillEditModal drill={editing === "new" ? null : editing} club={club!} onClose={() => setEditing(null)} />}
      {attaching && <AttachModal drills={all.filter(d => selected.has(d.id))} club={club!} userId={session?.user.id}
        onClose={() => setAttaching(false)} onDone={() => setSelected(new Set())} />}
    </>
  );
}

function DrillEditModal({ drill, club, onClose }: { drill: FullDrill | null; club: string; onClose: () => void }) {
  const coach = useCoachName();
  const qc = useQueryClient();
  const [d, setD] = useState<DrillDraft>(() => drill ? {
    stroke: drill.stroke || "", name: drill.drill_name || "", pseudonyms: (drill.pseudonyms || []).join(", "),
    purpose: drill.primary_purpose || "", blabt: drill.blabt || "", biomech: drill.biomechanical || "", equipment: drill.equipment || "",
    regression: drill.regression || "", progression: drill.progression || "", peri: {}
  } : emptyDraft());
  const [periReady, setPeriReady] = useState(!drill);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

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
    if (!d.name.trim()) { setMsg({ text: "Give the drill a name.", error: true }); return; }
    setBusy(true);
    try {
      const id = await saveDrill(club, drill?.id ?? null, d, coach);
      qc.invalidateQueries({ queryKey: ["drill_peri", id] });
      refresh();
      setMsg({ text: "Drill saved." });
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
    <Modal open onClose={onClose} title={drill ? "Edit drill" : "New drill"}>
      {field("de-stroke", "Stroke / Skills", "stroke", "e.g. Frontcrawl")}
      {field("de-name", "Drill name", "name", "e.g. Zip")}
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

function AttachModal({ drills, club, userId, onClose, onDone }: { drills: FullDrill[]; club: string; userId?: string; onClose: () => void; onDone: () => void }) {
  const coach = useCoachName();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const plans = usePlans(club);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [planId, setPlanId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean; planId?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const n = drills.length;
  const ordered = (plans.data ?? []).slice().sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));

  const go = async () => {
    setMsg(null);
    const blocks = drills.map(d => ({ type: "drill" as const, drill_id: d.id, drill_name: d.drill_name }));
    if (mode === "existing" && !planId) { setMsg({ text: "Choose a plan.", error: true }); return; }
    if (mode === "new" && !title.trim()) { setMsg({ text: "Give the new plan a name.", error: true }); return; }
    setBusy(true);
    try {
      const id = mode === "existing" ? (await appendDrillsToPlan(planId, blocks), planId) : await createPlanWithDrills(club, title.trim(), date || null, blocks, coach);
      logEvent(userId, club, "core_task", "drills_attach", { plan_id: id, count: n, mode });
      qc.invalidateQueries({ queryKey: ["plans", club] });
      qc.invalidateQueries({ queryKey: ["plan", id] });
      onDone();
      setMsg({ text: "Attached.", planId: id });
    } catch (e) { console.error(e); setMsg({ text: "Attach failed — " + ((e as Error).message || "please try again."), error: true }); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Attach ${n} drill${n > 1 ? "s" : ""}`}>
      <div className="seg seg-2" role="group" aria-label="Attach to">
        <button type="button" className={"seg-btn" + (mode === "existing" ? " on" : "")} aria-pressed={mode === "existing"} onClick={() => setMode("existing")}>Existing plan</button>
        <button type="button" className={"seg-btn" + (mode === "new" ? " on" : "")} aria-pressed={mode === "new"} onClick={() => setMode("new")}>New plan</button>
      </div>
      {mode === "existing" ? (
        <>
          <label htmlFor="at-plan">Plan</label>
          <select id="at-plan" value={planId} onChange={e => setPlanId(e.target.value)}>
            <option value="">{plans.isLoading ? "Loading plans…" : plans.error ? "— could not load plans —" : "— choose a plan —"}</option>
            {ordered.map(p => <option key={p.id} value={p.id}>{p.title}{p.intended_date ? ` (${fmtDate(p.intended_date)})` : ""}</option>)}
          </select>
        </>
      ) : (
        <>
          <label htmlFor="at-title">New plan name</label>
          <input id="at-title" type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Fly drills block" />
          <label htmlFor="at-date">Session date <span className="dim">(optional)</span></label>
          <input id="at-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <p className="hint">Open the plan afterwards to set its squad.</p>
        </>
      )}
      {!msg?.planId && <button type="button" className="btn primary wide" onClick={go} disabled={busy}>{busy ? "Attaching…" : "Attach"}</button>}
      {msg && <p className={"msg" + (msg.error ? " error" : "")} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
      {msg?.planId && (
        <div className="btn-row gap-top">
          <button type="button" className="btn primary" onClick={() => navigate(`/sessions/${msg.planId}`)}>Open the plan</button>
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>
      )}
    </Modal>
  );
}
