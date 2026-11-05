import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { WINDOW_KIND, loadProtocols, loadWindows, removeWindow, saveWindow } from "../../lib/measures";
import { fmtDate, todayLocal } from "../../lib/util";
import { ConfirmButton } from "../tests/RunTest";
import { MBack, NoAccess, useMeasuresAccess } from "./Measures";

// Testing windows: planned date ranges for the season's battery (baseline,
// mid- and end-macro, novelty sets) and the one fixed T15–T30 day. They are
// for planning and reminders — a result never needs one — except for a
// protocol marked "fixed date only", which can only be run inside its window.

export function Windows() {
  const { canView, canPublish } = useMeasuresAccess();
  const { club } = useClub();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mm_windows", club], enabled: !!club && canView, queryFn: () => loadWindows(club!) });
  const protocols = useQuery({ queryKey: ["mm_protocols", club], enabled: !!club && canView, queryFn: () => loadProtocols(club!) });
  const blank = { name: "", kind: "baseline", starts_on: todayLocal().date, ends_on: todayLocal().date, protocol_ids: [] as string[] };
  const [f, setF] = useState<typeof blank | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!canView) return <><MBack /><NoAccess /></>;
  const code = new Map((protocols.data ?? []).map(p => [p.id, p.code]));
  const save = async () => {
    if (!f) return;
    if (!f.name.trim()) { setErr("Give the window a name."); return; }
    if (f.ends_on < f.starts_on) { setErr("The end date is before the start."); return; }
    try { await saveWindow(club!, f); setF(null); setErr(null); qc.invalidateQueries({ queryKey: ["mm_windows"] }); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <>
      <MBack />
      <div className="page-head row"><div><h1>Testing windows</h1><p className="dim">Planned testing dates. Tests can still be run on any date, except fixed-date ones.</p></div><ClubPicker /></div>
      {canPublish && !f && <button className="btn primary" onClick={() => setF(blank)}>Add a window</button>}
      {f && (
        <section className="card">
          <div className="field-pair">
            <label>Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Baseline, macro 2" /></label>
            <label>Kind<select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{Object.entries(WINDOW_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
          <div className="field-pair">
            <label>From<input type="date" value={f.starts_on} onChange={e => setF({ ...f, starts_on: e.target.value })} /></label>
            <label>To<input type="date" value={f.ends_on} onChange={e => setF({ ...f, ends_on: e.target.value })} /></label>
          </div>
          <fieldset className="choice-set"><legend>Tests in this window</legend>
            {(protocols.data ?? []).filter(p => p.status !== "retired").map(p => (
              <label key={p.id} className="inline check-inline"><input type="checkbox" checked={f.protocol_ids.includes(p.id)}
                onChange={e => setF({ ...f, protocol_ids: e.target.checked ? [...f.protocol_ids, p.id] : f.protocol_ids.filter(x => x !== p.id) })} /> {p.code} {p.name}</label>))}
          </fieldset>
          {err && <p className="msg error">{err}</p>}
          <div className="done-actions"><button className="btn" onClick={() => { setF(null); setErr(null); }}>Cancel</button><button className="btn primary" onClick={save}>Save</button></div>
        </section>
      )}
      {q.isLoading ? <p className="dim">Loading…</p> : !q.data?.length ? <p className="dim">No windows yet.</p> : (
        <ul className="feed card">{q.data.map(w => (
          <li key={w.id}><strong>{w.name}</strong> <span className="chip">{WINDOW_KIND[w.kind] ?? w.kind}</span>
            <div className="feed-meta dim">{fmtDate(w.starts_on)}{w.ends_on !== w.starts_on ? ` – ${fmtDate(w.ends_on)}` : ""}{w.protocol_ids.length ? " · " + w.protocol_ids.map(id => code.get(id) ?? "?").join(", ") : ""}</div>
            {canPublish && <ConfirmButton className="link-btn" label="Remove" confirm="Tap again to remove" onConfirm={async () => { await removeWindow(w.id); qc.invalidateQueries({ queryKey: ["mm_windows"] }); }} />}</li>
        ))}</ul>
      )}
    </>
  );
}
