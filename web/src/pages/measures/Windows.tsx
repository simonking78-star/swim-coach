import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { WINDOW_KIND, loadProtocols, loadWindows } from "../../lib/measures";
import { loadSquads } from "../../lib/tests";
import { fmtDate, todayLocal } from "../../lib/util";
import { MBack, NoAccess, useMeasuresAccess } from "./Measures";

// Testing windows are planned in the Season Planner (season_windows, kind
// test_set) — one list for both sections (claude/specs/metrics-season-link.md).
// This page lists them for coaches running tests; adding and changing them is
// done on the Season Plan page (Test windows).

export function Windows() {
  const { canView, canPublish } = useMeasuresAccess();
  const { club } = useClub();
  const q = useQuery({ queryKey: ["mm_windows", club], enabled: !!club && canView, queryFn: () => loadWindows(club!) });
  const protocols = useQuery({ queryKey: ["mm_protocols", club], enabled: !!club && canView, queryFn: () => loadProtocols(club!) });
  const squads = useQuery({ queryKey: ["test_squads", club], enabled: !!club && canView, queryFn: () => loadSquads(club!) });
  if (!canView) return <><MBack /><NoAccess /></>;
  const code = new Map((protocols.data ?? []).map(p => [p.id, p.code]));
  const sq = new Map((squads.data ?? []).map(s => [s.id, s.name]));
  const today = todayLocal().date;
  const list = q.data ?? [];
  const upcoming = list.filter(w => w.ends_on >= today), past = list.filter(w => w.ends_on < today);
  const row = (w: (typeof list)[number]) => (
    <li key={w.id}><strong>{w.name}</strong> {w.kind && <span className="chip">{WINDOW_KIND[w.kind] ?? w.kind}</span>}
      <div className="feed-meta dim">
        {fmtDate(w.starts_on)}{w.ends_on !== w.starts_on ? ` – ${fmtDate(w.ends_on)}` : ""}
        {" · "}{w.protocol_ids.length ? w.protocol_ids.map(id => code.get(id) ?? "?").join(", ") : "any test"}
        {" · "}{w.squad_ids?.length ? w.squad_ids.map(id => sq.get(id) ?? "?").join(", ") : "all squads on the plan"}
        {w.season_title ? ` · ${w.season_title}` : ""}
      </div>
      {w.note && <div className="small">{w.note}</div>}
    </li>
  );
  return (
    <>
      <MBack />
      <div className="page-head row"><div><h1>Testing windows</h1><p className="dim">Planned in the Season Plan. Tests can still be run on any date, except fixed-date ones.</p></div><ClubPicker /></div>
      <p className="notice">{canPublish ? <>Add or change windows on the <Link to="/season">Season Plan</Link> page with <strong>Test windows</strong>.</> : <>Windows are set by the head coach on the <Link to="/season">Season Plan</Link>.</>}</p>
      {q.isLoading ? <p className="dim">Loading…</p> : q.error ? <p className="msg error">Couldn't load the windows: {(q.error as Error).message}</p> : !list.length ? <p className="dim">No test windows on the season plan yet.</p> : <>
        {upcoming.length > 0 && <><h2 className="sec-title">Now and coming up</h2><ul className="feed card">{upcoming.map(row)}</ul></>}
        {past.length > 0 && <><h2 className="sec-title">Earlier this season</h2><ul className="feed card">{past.map(row)}</ul></>}
      </>}
    </>
  );
}
