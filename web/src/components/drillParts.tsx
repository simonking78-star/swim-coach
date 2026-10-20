import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "./Modal";
import { filterDrills, loadAllDrills, loadDrill, loadPeri, MESOS, PHASES, type FullDrill } from "../lib/drills";

/** The club's full drills library, shared by the library, the plan editor and the drill pop-ups. */
export function useDrills(club: string | null) {
  return useQuery({ queryKey: ["drills_full", club], enabled: !!club, staleTime: 5 * 60 * 1000, queryFn: () => loadAllDrills(club!) });
}

/** Read-only drill pop-up, with its periodisation recommendations. */
export function DrillInfoModal({ drillId, list, onClose }: { drillId: string | null; list?: FullDrill[]; onClose: () => void }) {
  const fromList = list?.find(d => d.id === drillId) ?? null;
  const drill = useQuery({ queryKey: ["drill", drillId], enabled: !!drillId && !fromList, queryFn: () => loadDrill(drillId!) });
  const peri = useQuery({ queryKey: ["drill_peri", drillId], enabled: !!drillId, queryFn: () => loadPeri(drillId!) });
  const d = fromList ?? drill.data ?? null;
  const rows: [string, string | null][] = d ? [
    ...(d.pseudonyms?.length ? [["Also known as", d.pseudonyms.join(", ")] as [string, string]] : []),
    ["Primary purpose", d.primary_purpose], ["BLABT / focus", d.blabt], ["Biomechanical", d.biomechanical],
    ["Equipment", d.equipment], ["Regression", d.regression], ["Progression", d.progression]
  ] : [];
  const periRows = (peri.data ?? []).slice().sort((a, b) => MESOS.indexOf(a.meso) - MESOS.indexOf(b.meso) || PHASES.indexOf(a.phase_type) - PHASES.indexOf(b.phase_type));
  return (
    <Modal open={!!drillId} onClose={onClose} title={d?.drill_name ?? "Drill"}>
      {!d && drill.isLoading && <p className="dim">Loading…</p>}
      {!d && drill.error && <p className="msg error">Couldn't load this drill.</p>}
      {d && (
        <>
          {d.stroke && <p className="drill-stroke">{d.stroke}</p>}
          <dl className="di-list">
            {rows.map(([label, val]) => (
              <div key={label}><dt>{label}</dt><dd className={val ? undefined : "dim"}>{val || "—"}</dd></div>
            ))}
          </dl>
          {periRows.length > 0 && (
            <>
              <h3 className="di-sub">Periodisation recommendations</h3>
              <ul className="di-peri">
                {periRows.map(r => (
                  <li key={r.meso + r.phase_type}>
                    {r.meso} · {r.phase_type}{r.session_plan_placement ? ` — ${r.session_plan_placement}` : ""}{r.distance_m ? ` (${r.distance_m}m)` : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

/** Pick one drill from the library (plan editor's "+ Drill" / "Change drill"). */
export function DrillPickModal({ open, list, onPick, onClose }: { open: boolean; list: FullDrill[]; onPick: (d: FullDrill) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const shown = filterDrills(list, null, q).slice(0, 100);
  return (
    <Modal open={open} onClose={() => { setQ(""); onClose(); }} title="Add a drill">
      <label htmlFor="dp-search" className="sr-only">Search drills</label>
      <input id="dp-search" type="search" placeholder="Search drills…" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} autoFocus />
      <ul className="search-results tall">
        {shown.length === 0 && <li className="dim">No matches</li>}
        {shown.map(d => (
          <li key={d.id}>
            <button type="button" onClick={() => { setQ(""); onPick(d); }}>
              <span>{d.drill_name}</span><span className="chip">{d.stroke || ""}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
