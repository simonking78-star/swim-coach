import { lazyPage } from "../../lib/lazyPage";
import { Suspense, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import {
  FLAG_LABEL, VS_AGE_LABEL, fmt2, fmtSecs, loadGapProtocols, loadGapWindowRows, loadProtocols, loadWindowMonths, loadWindowRows, monthLabel,
  type GapRow, type MeasureRule
} from "../../lib/measures";
import { fmtDate } from "../../lib/util";
import { MBack, NoAccess, useMeasuresAccess } from "./Measures";
import { StatsBack } from "../stats/StatsHub";

const WindowChart = lazyPage(() => import("../../components/TestWindowCharts"));
const GapChart = lazyPage(() => import("../../components/TestWindowCharts").then(x => ({ default: x.GapWindowChart })));

// Monthly testing window: every swimmer tested on a graded repeat set in one
// calendar month (their latest result that month), as in the RRSC Test Set
// Timings workbook chart — a bar per swimmer (points per age year) grouped by
// age, with the at-age benchmark line. Squad and age-group averages sit under
// it. Shown in Metrics & Measures and in Statistics; parents and swimmers see
// their own child's comparison on the swimmer profile instead.

const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

function groupBy<R, K>(rows: R[], key: (r: R) => K) {
  const m = new Map<K, R[]>();
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
  const gapQ = useQuery({ queryKey: ["mm_gap_protocols", club], enabled: !!club && canView, queryFn: () => loadGapProtocols(club!) });
  const gapMeasure = new Map((gapQ.data ?? []).map(g => [g.protocol.id, g.measure] as [string, MeasureRule]));
  const repsProtocols = useMemo(() => [
    ...(protocols.data ?? []).filter(p => p.kind === "reps" && p.status !== "draft"),
    ...(gapQ.data ?? []).map(g => g.protocol)
  ], [protocols.data, gapQ.data]);
  useEffect(() => { if (!pid && repsProtocols.length) set("protocol", repsProtocols[0].id); }, [pid, repsProtocols]); // eslint-disable-line react-hooks/exhaustive-deps
  const isGap = gapMeasure.has(pid);
  const months = useQuery({ queryKey: ["mm_window_months", pid], enabled: !!pid, queryFn: () => loadWindowMonths(pid) });
  useEffect(() => { if (pid && !month && months.data?.length) set("month", months.data[0].month); }, [pid, month, months.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowsQ = useQuery({ queryKey: ["mm_window_rows", pid, month], enabled: !!pid && !!month && !!gapQ.data && !isGap, queryFn: () => loadWindowRows(pid, month) });
  const gapRowsQ = useQuery({ queryKey: ["mm_gap_rows", pid, month], enabled: !!pid && !!month && isGap, queryFn: () => loadGapWindowRows(pid, month) });

  const back = from === "stats" ? <StatsBack /> : <MBack />;
  if (!canView || ownOnly) return <>{back}{ownOnly
    ? <p className="notice">Your swimmer's test results, with their squad and age-group comparison, are on their profile under <strong>Test sets</strong>.</p>
    : <NoAccess />}</>;

  const gapRows = gapRowsQ.data ?? [];
  const all = rowsQ.data ?? [];
  const scored = all.filter(r => r.points_per_age != null);
  const squads = [...new Set([...all, ...gapRows].map(r => r.squad_name ?? "No squad"))].sort();
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
          <p className="dim">Everyone tested in a month: graded test sets against the at-age benchmark, and paired tests (like the 50m Kick) against their target gap.</p></div>
        <ClubPicker />
      </div>

      {protocols.isLoading || gapQ.isLoading ? <p className="dim">Loading…</p>
        : !repsProtocols.length ? <div className="card"><p>No graded or paired test sets have been run for {club} yet.</p><Link className="btn" to="/measures/run">Run a test</Link></div>
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

            {isGap ? <GapWindow rows={squad ? gapRows.filter(r => (r.squad_name ?? "No squad") === squad) : gapRows} all={gapRows}
                code={p?.code ?? ""} month={month} squad={squad} measure={gapMeasure.get(pid)!} loading={gapRowsQ.isLoading} error={gapRowsQ.error as Error | null} />
              : rowsQ.isLoading ? <p className="dim">Loading…</p>
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

/** Monthly window for a paired timed test: both times, the gap and the target. */
function GapWindow({ rows, all, code, month, squad, measure, loading, error }: {
  rows: GapRow[]; all: GapRow[]; code: string; month: string; squad: string; measure: MeasureRule; loading: boolean; error: Error | null;
}) {
  const variants = measure.variants ?? [];
  const target = measure.target_gap_s ?? null;
  const dp = measure.precision ?? 0;
  if (loading) return <p className="dim">Loading…</p>;
  if (error) return <p className="msg error">{error.message}</p>;
  if (!rows.length) return <p className="dim">No results in this window.</p>;
  const complete = rows.filter(r => r.gap != null);
  const inTarget = target == null ? [] : complete.filter(r => (r.gap as number) <= target);
  const dates = [...new Set(rows.map(r => r.session_date))].sort();
  const vAvg = (rs: GapRow[], k: string) => avg(rs.map(r => r.times[k] ?? null));
  const bySquad = groupBy(all, r => r.squad_name ?? "No squad");
  const byAge = groupBy(rows, r => r.age ?? -1);
  const avgRow = (label: string, rs: GapRow[]) => (
    <tr key={label}><th scope="row">{label}</th><td className="num">{rs.length}</td>
      {variants.map(vr => <td key={vr.key} className="num">{fmtSecs(vAvg(rs, vr.key), 1)}</td>)}
      <td className="num"><strong>{fmtSecs(avg(rs.map(r => r.gap)), 1)}</strong></td>
      {target != null && <td className="num">{rs.filter(r => r.gap != null && r.gap <= target).length}</td>}</tr>
  );
  const head = (first: string) => (
    <thead><tr><th>{first}</th><th className="num">Swimmers</th>{variants.map(vr => <th key={vr.key} className="num">{vr.label}</th>)}
      <th className="num">Gap</th>{target != null && <th className="num">Within {target} s</th>}</tr></thead>
  );
  return (
    <>
      <div className="stat-row" style={{ marginTop: 14 }}>
        <div className="stat"><span className="stat-label">Swimmers tested</span><span className="stat-value">{rows.length}</span><span className="stat-note">{dates.map(d => fmtDate(d)).join(", ")}</span></div>
        {variants.map(vr => (
          <div key={vr.key} className="stat"><span className="stat-label">Average {vr.label.toLowerCase()}</span><span className="stat-value">{fmtSecs(vAvg(rows, vr.key), 1)}</span><span className="stat-note">{squad || "all squads"}</span></div>
        ))}
        <div className="stat"><span className="stat-label">Average gap</span><span className="stat-value">{fmtSecs(avg(complete.map(r => r.gap)), 1)}</span>
          <span className="stat-note">{target != null ? `target about ${target} s` : "no fins − fins"}</span></div>
        {target != null && <div className="stat"><span className="stat-label">Within target gap</span><span className="stat-value">{inTarget.length}</span><span className="stat-note">of {complete.length} with both times</span></div>}
      </div>

      <section className="card chart-card" style={{ marginTop: 14 }}>
        <h2>{code} · {monthLabel(month)}{squad ? ` · ${squad}` : ""}</h2>
        <Suspense fallback={<p className="dim">Loading chart…</p>}><GapChart rows={rows} variants={variants} target={target} /></Suspense>
        <p className="hint">Bars: each swimmer's {variants.map(v => v.label.toLowerCase()).join(" and ")} 50 m time. Dots: the gap between them.
          {target != null && <> Dashed line: the {target} s target gap — closing the gap means the kick without fins is getting stronger.</>} Grouped by age, then by name.</p>
      </section>

      <div className="profile-grid" style={{ marginTop: 14 }}>
        <section className="card">
          <h2 className="card-title">Squad averages</h2>
          <div className="table-wrap"><table className="data">{head("Squad")}
            <tbody>{[...bySquad.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([s, rs]) => avgRow(s, rs))}</tbody></table></div>
        </section>
        <section className="card">
          <h2 className="card-title">Age-group averages{squad ? ` · ${squad}` : ""}</h2>
          <div className="table-wrap"><table className="data">{head("Age")}
            <tbody>{[...byAge.entries()].sort((a, b) => a[0] - b[0]).map(([a, rs]) => avgRow(a < 0 ? "Unknown" : String(a), rs))}</tbody></table></div>
        </section>
      </div>

      <div className="table-wrap card" style={{ marginTop: 14 }}>
        <table className="data">
          <caption className="sr-only">Results in this window, by age then name</caption>
          <thead><tr><th>Swimmer</th><th>Squad</th><th className="num">Age</th>{variants.map(vr => <th key={vr.key} className="num">{vr.label}</th>)}
            <th className="num">Gap</th><th>Since last test</th><th>Date</th></tr></thead>
          <tbody>{[...rows].sort((a, b) => (a.age ?? 99) - (b.age ?? 99) || a.full_name.localeCompare(b.full_name)).map(r => (
            <tr key={r.result_id}>
              <th scope="row"><Link to={`/swimmers/${r.swimmer_id}`}>{r.full_name}</Link></th><td>{r.squad_name ?? "–"}</td><td className="num">{r.age ?? "–"}</td>
              {variants.map(vr => <td key={vr.key} className="num">{fmtSecs(r.times[vr.key], dp)}</td>)}
              <td className="num"><strong>{fmtSecs(r.gap, dp)}</strong>{target != null && r.gap != null && r.gap <= target ? " ✓" : ""}</td>
              <td>{r.change_prev == null ? (r.flag ? FLAG_LABEL[r.flag] : "–") : `${r.change_prev > 0 ? "gap closed by" : r.change_prev < 0 ? "gap opened by" : "no change"}${r.change_prev ? " " + fmtSecs(Math.abs(r.change_prev), dp) : ""}`}</td>
              <td>{fmtDate(r.session_date)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="hint">One result per swimmer: their latest in the month. Gap = time without fins − time with fins; ✓ = within the target. "Since last test" appears once the test is closed.</p>
    </>
  );
}

export function StatsMonthlyWindow() { return <MonthlyWindow from="stats" />; }
