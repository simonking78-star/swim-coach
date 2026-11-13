import { Suspense, lazy, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import {
  VS_AGE_LABEL, fmt2, loadProtocols, loadWindowMonths, loadWindowRows, monthLabel, type WindowRow
} from "../../lib/measures";
import { fmtDate } from "../../lib/util";
import { MBack, NoAccess, useMeasuresAccess } from "./Measures";
import { StatsBack } from "../stats/StatsHub";

const WindowChart = lazy(() => import("../../components/TestWindowCharts"));

// Monthly testing window: every swimmer tested on a graded repeat set in one
// calendar month (their latest result that month), as in the RRSC Test Set
// Timings workbook chart — a bar per swimmer (points per age year) grouped by
// age, with the at-age benchmark line. Squad and age-group averages sit under
// it. Shown in Metrics & Measures and in Statistics; parents and swimmers see
// their own child's comparison on the swimmer profile instead.

const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

function groupBy<K>(rows: WindowRow[], key: (r: WindowRow) => K) {
  const m = new Map<K, WindowRow[]>();
  for (const r of rows) (m.get(key(r)) ?? m.set(key(r), []).get(key(r))!).push(r);
  return m;
}

export function MonthlyWindow({ from = "measures" }: { from?: "measures" | "stats" }) {
  const { canView, ownOnly } = useMeasuresAccess();
  const { club } = useClub();
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string) => setParams(prev => { const n = new URLSearchParams(prev); if (v) n.set(k, v); else n.delete(k); if (k === "protocol") { n.delete("month"); n.delete("squad"); } return n; }, { replace: true });
  const pid = params.get("protocol") ?? "";
  const month = params.get("month") ?? "";
  const squad = params.get("squad") ?? "";

  const protocols = useQuery({ queryKey: ["mm_protocols", club], enabled: !!club && canView, queryFn: () => loadProtocols(club!) });
  const repsProtocols = useMemo(() => (protocols.data ?? []).filter(p => p.kind === "reps" && p.status !== "draft"), [protocols.data]);
  useEffect(() => { if (!pid && repsProtocols.length) set("protocol", repsProtocols[0].id); }, [pid, repsProtocols]); // eslint-disable-line react-hooks/exhaustive-deps
  const months = useQuery({ queryKey: ["mm_window_months", pid], enabled: !!pid, queryFn: () => loadWindowMonths(pid) });
  useEffect(() => { if (pid && !month && months.data?.length) set("month", months.data[0].month); }, [pid, month, months.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowsQ = useQuery({ queryKey: ["mm_window_rows", pid, month], enabled: !!pid && !!month, queryFn: () => loadWindowRows(pid, month) });

  const back = from === "stats" ? <StatsBack /> : <MBack />;
  if (!canView || ownOnly) return <>{back}{ownOnly
    ? <p className="notice">Your swimmer's test results, with their squad and age-group comparison, are on their profile under <strong>Test sets</strong>.</p>
    : <NoAccess />}</>;

  const all = rowsQ.data ?? [];
  const scored = all.filter(r => r.points_per_age != null);
  const squads = [...new Set(all.map(r => r.squad_name ?? "No squad"))].sort();
  const rows = squad ? all.filter(r => (r.squad_name ?? "No squad") === squad) : all;
  const shown = rows.filter(r => r.points_per_age != null);
  const bySquad = groupBy(scored, r => r.squad_name ?? "No squad");
  const byAge = groupBy(shown, r => r.age ?? -1);
  const dates = [...new Set(rows.map(r => r.session_date))].sort();
  const p = repsProtocols.find(x => x.id === pid);

  return (
    <>
      {back}
      <div className="page-head row">
        <div><h1><span aria-hidden="true">📊</span> Monthly testing window</h1>
          <p className="dim">Everyone tested in a month on a graded test set: points per age year against the at-age benchmark.</p></div>
        <ClubPicker />
      </div>

      {protocols.isLoading ? <p className="dim">Loading…</p>
        : !repsProtocols.length ? <div className="card"><p>No graded test sets have been run for {club} yet.</p><Link className="btn" to="/measures/run">Run a test</Link></div>
        : (
          <>
            <div className="field-pair">
              <label>Test set<select value={pid} onChange={e => set("protocol", e.target.value)}>
                {repsProtocols.map(x => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></label>
              <label>Month<select value={month} onChange={e => set("month", e.target.value)} disabled={!months.data?.length}>
                {!months.data?.length && <option value="">No results yet</option>}
                {(months.data ?? []).map(m => <option key={m.month} value={m.month}>{monthLabel(m.month)} · {m.swimmers} swimmers</option>)}</select></label>
              <label>Squad<select value={squad} onChange={e => set("squad", e.target.value)}>
                <option value="">All squads</option>{squads.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
            </div>

            {rowsQ.isLoading ? <p className="dim">Loading…</p>
              : rowsQ.error ? <p className="msg error">{(rowsQ.error as Error).message}</p>
              : !rows.length ? <p className="dim">No results in this window.</p>
              : (
                <>
                  <div className="stat-row" style={{ marginTop: 14 }}>
                    <div className="stat"><span className="stat-label">Swimmers tested</span><span className="stat-value">{rows.length}</span><span className="stat-note">{dates.map(d => fmtDate(d)).join(", ")}</span></div>
                    <div className="stat"><span className="stat-label">Average points per age year</span><span className="stat-value">{fmt2(avg(shown.map(r => r.points_per_age)))}</span><span className="stat-note">{squad || "all squads"}</span></div>
                    <div className="stat"><span className="stat-label">At or above age level</span><span className="stat-value">{shown.filter(r => r.vs_age === "at" || r.vs_age === "above").length}</span><span className="stat-note">of {shown.length}</span></div>
                    <div className="stat"><span className="stat-label">Sets completed</span><span className="stat-value">{rows.filter(r => r.set_completed).length}</span><span className="stat-note">every rep of their level</span></div>
                  </div>

                  <section className="card chart-card" style={{ marginTop: 14 }}>
                    <h2>{p?.code} · {monthLabel(month)}{squad ? ` · ${squad}` : ""}</h2>
                    <Suspense fallback={<p className="dim">Loading chart…</p>}><WindowChart rows={shown} /></Suspense>
                    <p className="hint">Bars: each swimmer's points per age year (level × reps completed ÷ age), coloured
                      <span className="chip" style={{ background: "#8aa4c2", color: "#fff", margin: "0 4px" }}>below</span>
                      <span className="chip" style={{ background: "#2a78d6", color: "#fff", margin: "0 4px" }}>at</span>
                      <span className="chip" style={{ background: "#0f7a3e", color: "#fff", margin: "0 4px" }}>above</span>
                      their age level. Line: completing every rep at their own age level, ÷ age. Grouped by age, then by name.</p>
                  </section>

                  <div className="profile-grid" style={{ marginTop: 14 }}>
                    <section className="card">
                      <h2 className="card-title">Squad averages</h2>
                      <div className="table-wrap"><table className="data">
                        <thead><tr><th>Squad</th><th className="num">Swimmers</th><th className="num">Pts / age yr</th><th className="num">Points</th><th className="num">At/above age</th><th className="num">Completed</th></tr></thead>
                        <tbody>{[...bySquad.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([s, rs]) => (
                          <tr key={s}><th scope="row">{s}</th><td className="num">{rs.length}</td><td className="num">{fmt2(avg(rs.map(r => r.points_per_age)))}</td>
                            <td className="num">{fmt2(avg(rs.map(r => r.points)))}</td><td className="num">{rs.filter(r => r.vs_age !== "below").length}</td><td className="num">{rs.filter(r => r.set_completed).length}</td></tr>
                        ))}</tbody>
                      </table></div>
                    </section>
                    <section className="card">
                      <h2 className="card-title">Age-group averages{squad ? ` · ${squad}` : ""}</h2>
                      <div className="table-wrap"><table className="data">
                        <thead><tr><th>Age</th><th className="num">Swimmers</th><th className="num">Pts / age yr</th><th className="num">Benchmark</th><th className="num">Points</th></tr></thead>
                        <tbody>{[...byAge.entries()].sort((a, b) => a[0] - b[0]).map(([a, rs]) => (
                          <tr key={a}><th scope="row">{a < 0 ? "Unknown" : a}</th><td className="num">{rs.length}</td><td className="num">{fmt2(avg(rs.map(r => r.points_per_age)))}</td>
                            <td className="num">{fmt2(rs[0].benchmark)}</td><td className="num">{fmt2(avg(rs.map(r => r.points)))}</td></tr>
                        ))}</tbody>
                      </table></div>
                    </section>
                  </div>

                  <div className="table-wrap card" style={{ marginTop: 14 }}>
                    <table className="data">
                      <caption className="sr-only">Results in this window, by age then name</caption>
                      <thead><tr><th>Swimmer</th><th>Squad</th><th className="num">Age</th><th>Level</th><th className="num">Reps</th><th className="num">Points</th><th className="num">Pts / age yr</th><th>Vs age</th><th>Date</th></tr></thead>
                      <tbody>{[...rows].sort((a, b) => (a.age ?? 99) - (b.age ?? 99) || a.full_name.localeCompare(b.full_name)).map(r => (
                        <tr key={r.result_id}>
                          <th scope="row"><Link to={`/swimmers/${r.swimmer_id}`}>{r.full_name}</Link></th><td>{r.squad_name ?? "–"}</td><td className="num">{r.age ?? "–"}</td>
                          <td>{r.level_label ?? r.level_key}</td><td className="num">{r.value}/{r.max_reps ?? "?"}{r.set_completed ? " ✓" : ""}</td>
                          <td className="num">{r.points ?? "–"}</td><td className="num"><strong>{fmt2(r.points_per_age)}</strong></td>
                          <td>{r.vs_age ? VS_AGE_LABEL[r.vs_age] : "–"}</td><td>{fmtDate(r.session_date)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <p className="hint">One result per swimmer: their latest in the month. ✓ = every rep of their level completed. Points = reps × 1 (below age level), 2 (at) or 3 (above).</p>
                </>
              )}
          </>
        )}
    </>
  );
}

export function StatsMonthlyWindow() { return <MonthlyWindow from="stats" />; }
