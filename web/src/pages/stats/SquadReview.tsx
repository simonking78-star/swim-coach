import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, Line } from "react-chartjs-2";
import { C } from "../../lib/chartSetup";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import {
  METRICS, ReviewNotInstalled, delta, fmt, hasData, loadReview, metric, monthLabel, prevKey, toCsv, type ReviewRow
} from "../../lib/squadReview";
import { fmtDate, todayLocal } from "../../lib/util";
import { StatsBack } from "./StatsHub";

export default function SquadReview() {
  const { club } = useClub();
  const q = useQuery({ queryKey: ["squad_review", club], enabled: !!club, retry: (n, e) => !(e instanceof ReviewNotInstalled) && n < 2, queryFn: () => loadReview(club!) });
  const rows = q.data ?? [];
  const [month, setMonth] = useState<string | null>(null);
  const [metricKey, setMetric] = useState<string>("attendance_pct");
  const [mode, setMode] = useState<"squads" | "trend">("squads");
  const [squadId, setSquadId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const months = useMemo(() => [...new Set(rows.map(r => r.mk))].sort().reverse(), [rows]);
  const squads = useMemo(() => [...new Map(rows.map(r => [r.squad_id, r.squad_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);

  // Defaults: last full month if it has data, else the latest month with data; the busiest squad.
  useEffect(() => {
    if (!rows.length) return;
    if (!month || !months.includes(month)) {
      const withData = months.filter(k => rows.some(r => r.mk === k && hasData(r)));
      setMonth(months[1] && withData.includes(months[1]) ? months[1] : withData[0] ?? months[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, months]);
  useEffect(() => {
    if (!rows.length || !month) return;
    if (!squadId || !squads.some(([id]) => id === squadId)) {
      const score = (r: ReviewRow) => (r.marks ?? 0) + (r.swims ?? 0) + (r.feedback_entries ?? 0);
      const busiest = rows.filter(r => r.mk === month).sort((a, b) => score(b) - score(a))[0];
      setSquadId(busiest?.squad_id ?? squads[0]?.[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, month, squads]);

  const exportRows = (): ReviewRow[] => mode === "trend"
    ? rows.filter(r => r.squad_id === squadId).sort((a, b) => a.mk.localeCompare(b.mk))
    : rows.filter(r => r.mk === month && hasData(r)).sort((a, b) => a.squad_name.localeCompare(b.squad_name));

  const downloadCsv = () => {
    const ex = exportRows();
    if (!ex.length) { setNotice("Nothing to export for this view."); return; }
    setNotice(null);
    const blob = new Blob([toCsv(club!, ex)], { type: "text/csv" });
    const a = document.createElement("a");
    const tag = mode === "trend" ? (ex[0].squad_name || "squad").replace(/\W+/g, "_") : month;
    a.href = URL.createObjectURL(blob);
    a.download = `Squad_Review_${club!.replace(/\W+/g, "_")}_${tag}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const print = () => {
    if (!exportRows().length) { setNotice("Nothing to print for this view."); return; }
    setNotice(null);
    document.body.classList.add("print-review");
    const done = () => { document.body.classList.remove("print-review"); removeEventListener("afterprint", done); };
    addEventListener("afterprint", done);
    print_();
    setTimeout(done, 30000);
  };

  return (
    <>
      <StatsBack />
      <div className="page-head"><h1><span aria-hidden="true">📅</span> Monthly Squad Review</h1><p className="dim">Attendance, race times, skills and feedback by squad, month on month</p></div>

      <section className="card">
        <ClubPicker />
        <div className="field-pair">
          <div><label htmlFor="sqr-month">Month</label>
            <select id="sqr-month" value={month ?? ""} onChange={e => setMonth(e.target.value)} disabled={!months.length}>
              {months.map((k, i) => <option key={k} value={k}>{monthLabel(k)}{i === 0 ? " (so far)" : ""}</option>)}
            </select></div>
          <div><label htmlFor="sqr-metric">Chart</label>
            <select id="sqr-metric" value={metricKey} onChange={e => setMetric(e.target.value)}>{METRICS.map(m => <option key={m.k} value={m.k}>{m.label}</option>)}</select></div>
        </div>
        <div className="seg seg-2 gap-top">
          <button type="button" className={"seg-btn" + (mode === "squads" ? " on" : "")} aria-pressed={mode === "squads"} onClick={() => setMode("squads")}>Squad vs squad</button>
          <button type="button" className={"seg-btn" + (mode === "trend" ? " on" : "")} aria-pressed={mode === "trend"} onClick={() => setMode("trend")}>Month on month</button>
        </div>
        {mode === "trend" && (
          <><label htmlFor="sqr-squad">Squad</label>
            <select id="sqr-squad" value={squadId ?? ""} onChange={e => setSquadId(e.target.value)}>{squads.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></>
        )}
      </section>

      {q.isLoading && <p className="dim">Loading…</p>}
      {q.error && <section className="card"><p className="dim">{q.error instanceof ReviewNotInstalled ? q.error.message : "Couldn't load the review: " + (q.error as Error).message}</p></section>}
      {q.data && !rows.length && <section className="card"><p className="dim">No squads you can see in this club.</p></section>}
      {rows.length > 0 && month && (mode === "squads"
        ? <BySquad rows={rows} month={month} metricKey={metricKey} club={club!} />
        : <Trend rows={rows} squadId={squadId} metricKey={metricKey} club={club!} />)}

      <section className="card no-print">
        <div className="btn-row">
          <button type="button" className="btn" onClick={downloadCsv} disabled={!rows.length}>Download CSV</button>
          <button type="button" className="btn" onClick={print} disabled={!rows.length}>Print / PDF summary</button>
        </div>
        {notice && <p className="msg error" role="alert">{notice}</p>}
        <p className="hint">Exports are squad totals only — no swimmer is named — so they can go to club admins and parents.</p>
        <details className="defs">
          <summary>How each figure is worked out</summary>
          <dl>
            <dt>Swimmers</dt><dd>Squad members during the month (squad history where recorded, otherwise current squad).</dd>
            <dt>Sessions attended</dt><dd>In = 1, Partial = minutes attended ÷ session length, Out = 0. Excused is left out. Session length comes from the weekly timetable, or the start and finish entered for a session that isn't timetabled.</dd>
            <dt>Attendance %</dt><dd>Sessions attended ÷ sessions that count (In, Out and Partial marks) for squad members that month. Sessions = distinct registers.</dd>
            <dt>Hours trained</dt><dd>In = the whole session, Partial = the minutes attended, Out = 0, Excused left out. Shown as the squad total and per swimmer who attended.</dd>
            <dt>PBs</dt><dd>Swims flagged PB, or faster than the swimmer's previous best in that event and course.</dd>
            <dt>Median time gain %</dt><dd>For swims with an earlier best in the same event and course: (previous best − time) ÷ previous best. Negative = slower than best. Shown with the number of swims (n); treat n &lt; 5 with caution.</dd>
            <dt>Skill score</dt><dd>Average of status entries (swimmer and squad feedback) that month: Not discussed 0, Started 1, Developing 2, Embedded 3.</dd>
            <dt>Skill steps up / down</dt><dd>Criteria whose latest status this month is higher / lower than their last status before the month.</dd>
            <dt>Developing/Embedded %</dt><dd>Share of status entries at Developing or Embedded — used as the feedback tone. Free-text notes are counted but not scored.</dd>
            <dt>Squad drills</dt><dd>Distinct drills named in squad feedback that month.</dd>
            <dt>Frozen / live</dt><dd>Closed months are frozen at month-end so shared reports don't change; the current month is live.</dd>
          </dl>
        </details>
      </section>

      {rows.length > 0 && <PrintSheet club={club!} rows={exportRows()} trend={mode === "trend"} month={month} />}
    </>
  );
}

const print_ = () => window.print();

function Delta({ cur, prev, k, f }: { cur: ReviewRow; prev?: ReviewRow; k: string; f: string }) {
  const d = delta(cur, prev, k, f);
  return d ? <span className={"delta " + d.dir}>{d.text}</span> : null;
}

function BySquad({ rows, month, metricKey, club }: { rows: ReviewRow[]; month: string; metricKey: string; club: string }) {
  const m = metric(metricKey), pk = prevKey(month);
  const all = rows.filter(r => r.mk === month);
  const shown = all.filter(hasData).sort((a, b) => a.squad_name.localeCompare(b.squad_name));
  if (!shown.length) return <section className="card"><p className="dim">Nothing recorded for any squad in {monthLabel(month)}.</p></section>;
  const prev = (r: ReviewRow) => rows.find(x => x.squad_id === r.squad_id && x.mk === pk);
  const chartRows = shown.filter(r => r[m.k] != null);
  const sources = [...new Set(shown.map(r => r.source))];
  const cell = (r: ReviewRow, k: keyof ReviewRow, f: string, n?: string | number | null) => (
    <td className="num">{fmt(r[k] as number | null, f)}{n != null && <span className="cell-sub">n={n}</span>}<Delta cur={r} prev={prev(r)} k={k as string} f={f} /></td>
  );
  return (
    <>
      <section className="card">
        <h2 className="card-title">{m.label} · {monthLabel(month)}</h2>
        <p className="dim small">{club} · squads with activity this month</p>
        {chartRows.length ? (
          <div className="chart-wrap" style={{ height: Math.max(140, chartRows.length * 34 + 40) }}>
            <Bar
              data={{ labels: chartRows.map(r => r.squad_name), datasets: [{ label: m.label, data: chartRows.map(r => r[m.k] as number), backgroundColor: C.accent, borderRadius: 4, maxBarThickness: 22 }] }}
              options={{ indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${m.label}: ${fmt(c.parsed.x, m.fmt)}` } } },
                scales: { x: { beginAtZero: true, ticks: { maxTicksLimit: 6, callback: v => (m.fmt.startsWith("pct") ? `${+(+v).toFixed(2)}%` : +(+v).toFixed(2)) } }, y: { ticks: { font: { size: 11 } } } } }}
            />
          </div>
        ) : <p className="dim">No {m.label.toLowerCase()} recorded this month.</p>}
      </section>
      <section className="card">
        <h2 className="card-title">Squad summary</h2>
        <p className="dim small">Arrows compare with {monthLabel(pk)}</p>
        <div className="table-wrap">
          <table className="data review">
            <thead><tr><th scope="col">Squad</th><th scope="col" className="num">Attend.</th><th scope="col" className="num">Hours</th><th scope="col" className="num">PBs</th><th scope="col" className="num">Time gain</th><th scope="col" className="num">Skill</th><th scope="col" className="num">Feedback</th></tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.squad_id}>
                  <th scope="row">{r.squad_name}<span className="cell-sub">{r.members} swimmers · {r.sessions} sessions{r.excused ? ` · ${r.excused} excused` : ""}</span></th>
                  <td className="num">{fmt(r.attendance_pct, "pct1")}{r.marks ? <span className="cell-sub">{fmt(r.present, "dec1")} of {r.marks}</span> : null}<Delta cur={r} prev={prev(r)} k="attendance_pct" f="pct1" /></td>
                  <td className="num">{fmt(r.hours_trained, "dec1")}{r.hours_per_swimmer != null && <span className="cell-sub">{fmt(r.hours_per_swimmer, "dec1")} each</span>}<Delta cur={r} prev={prev(r)} k="hours_trained" f="dec1" /></td>
                  {cell(r, "pbs", "int")}
                  {cell(r, "median_improvement_pct", "pct2", r.swims ? `${r.improved_swims}/${r.swims}` : null)}
                  {cell(r, "skill_score", "dec2", r.status_entries || null)}
                  {cell(r, "feedback_entries", "int")}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.some(r => (r.swims ?? 0) > 0 && (r.swims ?? 0) < 5) && <ul className="flags"><li>Some squads raced fewer than 5 times — treat their time gain as a rough guide.</li></ul>}
        <p className="hint">{all.length - shown.length > 0 && `${all.length - shown.length} squad${all.length - shown.length === 1 ? "" : "s"} with nothing recorded hidden. `}Figures: {sources.join(", ")}.</p>
      </section>
    </>
  );
}

function Trend({ rows, squadId, metricKey, club }: { rows: ReviewRow[]; squadId: string | null; metricKey: string; club: string }) {
  const m = metric(metricKey);
  const mine = rows.filter(r => r.squad_id === squadId).sort((a, b) => a.mk.localeCompare(b.mk));
  if (!mine.length) return <section className="card"><p className="dim">Choose a squad.</p></section>;
  const first = mine.findIndex(hasData);
  const shown = first < 0 ? mine : mine.slice(first);
  const name = mine[0].squad_name;
  const clubAvg = shown.map(r => {
    const vals = rows.filter(x => x.mk === r.mk && hasData(x) && x[m.k] != null).map(x => x[m.k] as number);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  return (
    <>
      <section className="card">
        <h2 className="card-title">{name} · {m.label}</h2>
        <p className="dim small">Month on month, with the average of all active squads in {club}</p>
        <div className="chart-wrap tall">
          <Line
            data={{ labels: shown.map(r => monthLabel(r.mk)), datasets: [
              { label: name, data: shown.map(r => r[m.k] as number | null), borderColor: C.navy, backgroundColor: C.navy, tension: 0.25, spanGaps: true },
              { label: "Club squad average", data: clubAvg, borderColor: C.accent, backgroundColor: C.accent, borderDash: [5, 4], tension: 0.25, spanGaps: true, pointRadius: 2 }
            ] }}
            options={{ responsive: true, maintainAspectRatio: false, animation: false,
              plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt(c.parsed.y, m.fmt)}` } } },
              scales: { y: { beginAtZero: m.k !== "median_improvement_pct", grace: "10%", ticks: { maxTicksLimit: 6, callback: v => (m.fmt.startsWith("pct") ? `${+(+v).toFixed(2)}%` : +(+v).toFixed(2)) } } } }}
          />
        </div>
      </section>
      <section className="card">
        <h2 className="card-title">{name} by month</h2>
        <div className="table-wrap">
          <table className="data review">
            <thead><tr><th scope="col">Month</th><th className="num">Swimmers</th><th className="num">Attend.</th><th className="num">Sessions</th><th className="num">Hours</th><th className="num">Swims</th><th className="num">PBs</th><th className="num">Time gain</th><th className="num">Skill</th><th className="num">Steps ↑/↓</th><th className="num">Dev/Emb</th><th className="num">Feedback</th><th className="num">Drills</th></tr></thead>
            <tbody>
              {shown.slice().reverse().map(r => (
                <tr key={r.mk}>
                  <th scope="row" className="nowrap">{monthLabel(r.mk)}<span className="cell-sub">{r.source}</span></th>
                  <td className="num">{r.members}</td><td className="num">{fmt(r.attendance_pct, "pct1")}</td><td className="num">{fmt(r.present, "dec1")}</td><td className="num">{fmt(r.hours_trained, "dec1")}</td><td className="num">{r.swims}</td><td className="num">{r.pbs}</td>
                  <td className="num">{fmt(r.median_improvement_pct, "pct2")}</td><td className="num">{fmt(r.skill_score, "dec2")}</td>
                  <td className="num">{r.skill_moves_up}/{r.skill_moves_down}</td><td className="num">{fmt(r.positive_feedback_pct, "pct1")}</td>
                  <td className="num">{r.feedback_entries}</td><td className="num">{r.drills_worked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/** Shown only when printing: squad totals, no swimmer named. */
function PrintSheet({ club, rows, trend, month }: { club: string; rows: ReviewRow[]; trend: boolean; month: string | null }) {
  if (!rows.length) return null;
  const sum = (k: keyof ReviewRow) => rows.reduce((a, r) => a + ((r[k] as number) ?? 0), 0);
  const mk = sum("marks"), pr = sum("present"), hrs = sum("hours_trained");
  const title = trend ? `${rows[0].squad_name} — month on month` : `All squads — ${month ? monthLabel(month) : ""}`;
  return (
    <div className="print-sheet" aria-hidden="true">
      <h2>{club} · Monthly Squad Review</h2>
      <p>{title} · printed {fmtDate(todayLocal().date)}</p>
      <p>{trend ? "Across these months" : "This month"}: attendance {mk ? ((100 * pr) / mk).toFixed(1) + "%" : "–"} ({pr.toFixed(1)} sessions attended of {mk}), {hrs.toFixed(1)} hours trained; {sum("pbs")} PBs from {sum("swims")} race swims.</p>
      <table>
        <thead><tr><th>{trend ? "Month" : "Squad"}</th><th>Swimmers</th><th>Attendance</th><th>Sessions attended</th><th>Hours trained</th><th>Swims</th><th>PBs</th><th>Median time gain</th><th>Skill score</th><th>Dev/Emb</th><th>Feedback</th></tr></thead>
        <tbody>{rows.filter(hasData).map(r => (
          <tr key={r.squad_id + r.mk}><td>{trend ? monthLabel(r.mk) : r.squad_name}</td><td>{r.members}</td><td>{fmt(r.attendance_pct, "pct1")}</td><td>{fmt(r.present, "dec1")}</td><td>{fmt(r.hours_trained, "dec1")}</td><td>{r.swims}</td><td>{r.pbs}</td>
            <td>{fmt(r.median_improvement_pct, "pct2")}</td><td>{fmt(r.skill_score, "dec2")}</td><td>{fmt(r.positive_feedback_pct, "pct1")}</td><td>{r.feedback_entries}</td></tr>
        ))}</tbody>
      </table>
      <p className="small">Squad totals only; no individual swimmer is identified. Time gain = change against each swimmer's previous best in the same event and course. Skill score: Not discussed 0 – Embedded 3.</p>
    </div>
  );
}
