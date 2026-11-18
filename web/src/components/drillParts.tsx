import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "./Modal";
import { filterDrills, loadAllDrills, loadDrill, type FullDrill } from "../lib/drills";
import { TargetList, TermUsageBlock } from "./vocabParts";

/** The club's full drills library, shared by the library, the plan editor and the drill pop-ups. */
export function useDrills(club: string | null) {
  return useQuery({ queryKey: ["drills_full", club], enabled: !!club, staleTime: 5 * 60 * 1000, queryFn: () => loadAllDrills(club!) });
}

/** Read-only drill pop-up: details, what it develops, and how much it has been used in plans (A-154). */
export function DrillInfoModal({ drillId, list, club, onClose }: { drillId: string | null; list?: FullDrill[]; club?: string | null; onClose: () => void }) {
  const fromList = list?.find(d => d.id === drillId) ?? null;
  const drill = useQuery({ queryKey: ["drill", drillId], enabled: !!drillId && !fromList, queryFn: () => loadDrill(drillId!) });
  const d = fromList ?? drill.data ?? null;
  const rows: [string, string | null][] = d ? [
    ...(d.pseudonyms?.length ? [["Also known as", d.pseudonyms.join(", ")] as [string, string]] : []),
    ["Primary purpose", d.primary_purpose], ["BLABT / focus", d.blabt], ["Biomechanical", d.biomechanical],
    ["Equipment", d.equipment], ["Regression", d.regression], ["Progression", d.progression]
  ] : [];
  return (
    <Modal open={!!drillId} onClose={onClose} title={d?.drill_name ?? "Drill"}>
      {!d && drill.isLoading && <p className="dim">Loading…</p>}
      {!d && drill.error && <p className="msg error">Couldn't load this drill.</p>}
      {d && (
        <>
          <p className="drill-stroke">{[d.term_type === "skill" ? "Skill" : "Drill", d.stroke].filter(Boolean).join(" · ")}</p>
          <dl className="di-list">
            {rows.map(([label, val]) => (
              <div key={label}><dt>{label}</dt><dd className={val ? undefined : "dim"}>{val || "—"}</dd></div>
            ))}
          </dl>
          <TargetList termId={d.term_id} />
          <TermUsageBlock termId={d.term_id} club={club ?? null} />
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
