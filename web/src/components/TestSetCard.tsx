import { useQuery } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import "../lib/chartSetup";
import { C } from "../lib/chartSetup";
import { VS_AGE_LABEL, fmt2, loadSwimmerCompare, monthLabel, vsAverage, type SwimmerCompare } from "../lib/measures";
import { fmtDate, fmtDdMm } from "../lib/util";
import { CompareBars, VS_COLOUR } from "./TestWindowCharts";

// Swimmer profile → Test sets. The swimmer's latest graded test set, set against
// the average of the REST of their squad and of their age group tested in the
// same month, and against the at-age benchmark. The averages come from the
// database (mm_swimmer_compare), so a parent sees them without seeing anyone
// else's result. No positions or ranks.

export function compareLines(c: SwimmerCompare) {
  const squad = vsAverage(c.points_per_age, c.squad_avg_ppa);
  const age = vsAverage(c.points_per_age, c.age_avg_ppa);
  const bench = vsAverage(c.points_per_age, c.benchmark, 2, "on the benchmark");
  return { squad, age, bench };
}

function Dir({ v }: { v: { text: string; dir: string | null } }) {
  return <span className={v.dir === "up" ? "up" : v.dir === "down" ? "down" : ""}><strong>{v.text}</strong></span>;
}

function OneProtocol({ c }: { c: SwimmerCompare }) {
  const { squad, age, bench } = compareLines(c);
  const hist = c.history;
  return (
    <div className="test-set-block">
      <h3 className="sub-title">{c.code} · {c.name}</h3>
      <p className="dim">Latest: {fmtDate(c.session_date)} · {c.level_label ?? ""}{c.squad_name ? ` · tested in ${c.squad_name}` : ""} · age {c.age ?? "?"}</p>
      <div className="stat-row">
        <div className="stat"><span className="stat-label">Reps completed</span><span className="stat-value">{c.value}/{c.max_reps ?? "?"}</span><span className="stat-note">{c.set_completed ? "Set completed" : "Set not completed"}</span></div>
        <div className="stat"><span className="stat-label">Points</span><span className="stat-value">{c.points ?? "–"}</span><span className="stat-note">{c.vs_age ? VS_AGE_LABEL[c.vs_age] : ""}</span></div>
        <div className="stat"><span className="stat-label">Points per age year</span><span className="stat-value">{fmt2(c.points_per_age)}</span><span className="stat-note">level × reps ÷ age</span></div>
        <div className="stat"><span className="stat-label">At-age benchmark</span><span className="stat-value">{fmt2(c.benchmark)}</span><span className="stat-note">{bench.dir ? bench.text : "–"}</span></div>
      </div>

      <h4 className="sub-title" style={{ marginTop: 14 }}>Compared with others tested in {monthLabel(c.month)}</h4>
      <CompareBars bars={[
        { label: "This swimmer", value: c.points_per_age, colour: VS_COLOUR[c.vs_age ?? "at"] },
        { label: `Rest of ${c.squad_name ?? "squad"}`, note: `${c.squad_n} swimmer${c.squad_n === 1 ? "" : "s"}`, value: c.squad_avg_ppa, colour: "#b9c7d8" },
        { label: `Age ${c.age ?? "?"} average`, note: `${c.age_n} other${c.age_n === 1 ? "" : "s"}`, value: c.age_avg_ppa, colour: "#d6dee8" },
        { label: "At-age benchmark", value: c.benchmark, colour: C.navy }
      ]} />
      <ul className="compare-list">
        <li>Against the rest of {c.squad_name ?? "their squad"}: {c.squad_n ? <><Dir v={squad} /> points per age year (squad average {fmt2(c.squad_avg_ppa)}, {c.squad_n} swimmer{c.squad_n === 1 ? "" : "s"}; average points {c.squad_avg_points ?? "–"})</> : <span className="dim">no one else in the squad was tested that month</span>}</li>
        <li>Against other {c.age ?? "?"}-year-olds: {c.age_n ? <><Dir v={age} /> points per age year (age-group average {fmt2(c.age_avg_ppa)}, {c.age_n} swimmer{c.age_n === 1 ? "" : "s"}, all squads; average points {c.age_avg_points ?? "–"})</> : <span className="dim">no one else of that age was tested that month</span>}</li>
      </ul>

      {hist.length > 1 && (
        <>
          <h4 className="sub-title" style={{ marginTop: 14 }}>Over time</h4>
          <div style={{ height: 200 }}>
            <Line data={{ labels: hist.map(h => fmtDdMm(h.date)), datasets: [{ label: "Points per age year", data: hist.map(h => h.ppa), borderColor: C.a, backgroundColor: C.a, tension: 0, pointRadius: 4 }] }}
              options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: C.grid } }, x: { grid: { display: false } } } }} />
          </div>
        </>
      )}
      <div className="table-wrap">
        <table className="data">
          <caption className="sr-only">Test history</caption>
          <thead><tr><th>Date</th><th>Level</th><th className="num">Age</th><th className="num">Reps</th><th className="num">Points</th><th className="num">Pts / age yr</th></tr></thead>
          <tbody>{[...hist].reverse().map((h, i) => (
            <tr key={i}><td>{fmtDate(h.date)}</td><td>{h.level ?? "–"}</td><td className="num">{h.age ?? "–"}</td>
              <td className="num">{h.value}/{h.max_reps ?? "?"}{h.completed ? " ✓" : ""}</td><td className="num">{h.points ?? "–"}</td><td className="num">{fmt2(h.ppa)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

export default function TestSetCard({ swimmerId }: { swimmerId: string }) {
  const q = useQuery({ queryKey: ["mm_compare", swimmerId], queryFn: () => loadSwimmerCompare(swimmerId) });
  return (
    <section className="card">
      <h2 className="card-title">Test sets</h2>
      {q.isLoading ? <p className="dim">Loading…</p>
        : q.error ? <p className="msg error">Couldn't load test sets.</p>
        : !q.data?.length ? <p className="dim">No graded test set on record yet.</p>
        : q.data.map(c => <OneProtocol key={c.protocol_id} c={c} />)}
      <p className="hint">Points per age year = level × reps completed ÷ age. Squad and age-group averages leave this swimmer out and use each swimmer's latest test in the same month.</p>
    </section>
  );
}
