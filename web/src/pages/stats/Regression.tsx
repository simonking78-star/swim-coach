import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import type { ChartDataset, ChartOptions } from "chart.js";
import { C } from "../../lib/chartSetup";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { sb } from "../../lib/supabase";
import { lccqtVal, lccqtlcVal, wcqtVal, type Sex } from "../../lib/cqt";
import { secToTime } from "../../lib/results";
import { LAST_STANDARD_YEAR, forecastCrossing, projection, steppedStandard, toPoints, trend, trendFlags, type RegRow } from "../../lib/regression";
import { fmtDate } from "../../lib/util";
import { StatsBack } from "./StatsHub";
import { clubIdOf, SWIMMER_SQUAD, flatSquad } from "../../lib/clubs";

interface Sw { id: string; full_name: string; squad: string | null; date_of_birth: string | null; gender: string | null; }

export default function Regression() {
  const { club } = useClub();
  const [q, setQ] = useState("");
  const [sw, setSw] = useState<Sw | null>(null);
  const [event, setEvent] = useState("");
  const [sexPick, setSex] = useState<Sex | null>(null);

  const swimmers = useQuery({
    queryKey: ["reg_swimmers", club], enabled: !!club,
    queryFn: async () => {
      const { data, error } = await sb.from("swimmers").select(`id, full_name, date_of_birth, gender, ${SWIMMER_SQUAD}`).eq("active", true).eq("club_id", clubIdOf(club!)).order("full_name");
      if (error) throw error;
      return flatSquad((data ?? []) as unknown as (Omit<Sw, "squad"> & { sq: { name: string } | null })[]) as Sw[];
    }
  });
  const rows = useQuery({
    queryKey: ["reg_rows", sw?.id], enabled: !!sw,
    queryFn: async () => {
      // A swimmer's whole career in one go (PostgREST would otherwise stop at 1000 rows).
      const { data, error } = await sb.from("swim_results").select("event, course, swim_time_display, meet_date, meet_name, age_at_swim, is_pb")
        .eq("swimmer_id", sw!.id).order("meet_date", { ascending: true }).limit(5000);
      if (error) throw error;
      return (data ?? []) as RegRow[];
    }
  });

  // Sex for the standards: the coach's pick, else the swimmer's recorded gender.
  const recorded: Sex | null = /^f/i.test(sw?.gender ?? "") ? "female" : /^m/i.test(sw?.gender ?? "") ? "male" : null;
  const sex = sexPick ?? recorded;
  const events = useMemo(() => [...new Set((rows.data ?? []).map(r => r.event))].sort(), [rows.data]);
  const t = q.trim().toLowerCase();
  const hits = t ? (swimmers.data ?? []).filter(s => s.full_name.toLowerCase().includes(t)).slice(0, 25) : [];

  const pick = (s: Sw) => { setSw(s); setQ(""); setEvent(""); setSex(null); };

  return (
    <>
      <StatsBack />
      <div className="page-head"><h1><span aria-hidden="true">📈</span> Regression Analysis</h1><p className="dim">A swimmer's trend in one event against Sussex county qualifying times</p></div>

      <section className="card">
        <h2 className="card-title">Swimmer &amp; event</h2>
        <ClubPicker />
        {sw ? (
          <div className="selected-pill">
            <span><strong>{sw.full_name}</strong>{sw.squad && <span className="dim"> · {sw.squad}</span>}</span>
            <button type="button" className="link-btn" onClick={() => setSw(null)}>Change</button>
          </div>
        ) : (
          <div className="search-box">
            <label htmlFor="reg-search">Swimmer</label>
            <input id="reg-search" type="search" autoComplete="off" placeholder={swimmers.isLoading ? "Loading swimmers…" : "Start typing a name…"} value={q} onChange={e => setQ(e.target.value)} />
            {t && (
              <ul className="search-results">
                {hits.length === 0 && <li className="dim">No matches</li>}
                {hits.map(s => <li key={s.id}><button type="button" onClick={() => pick(s)}><span>{s.full_name}</span>{s.squad && <span className="chip">{s.squad}</span>}</button></li>)}
              </ul>
            )}
          </div>
        )}
        {sw && (
          <>
            <div className="field-pair">
              <div>
                <label htmlFor="reg-event">Event</label>
                <select id="reg-event" value={event} onChange={e => setEvent(e.target.value)} disabled={!events.length}>
                  <option value="">— choose —</option>
                  {events.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <fieldset className="choice-set tight">
                <legend>Sex <span className="dim">(for standards)</span></legend>
                <div className="seg seg-2">
                  {(["female", "male"] as Sex[]).map(s => (
                    <button key={s} type="button" className={"seg-btn" + (sex === s ? " on" : "")} aria-pressed={sex === s} onClick={() => setSex(s)}>{s === "female" ? "Female" : "Male"}</button>
                  ))}
                </div>
              </fieldset>
            </div>
            {!sw.date_of_birth && <p className="notice warn">No date of birth on file for this swimmer — county-standard lines and forecasts need one (add it via Admin).</p>}
          </>
        )}
      </section>

      {sw && rows.isLoading && <p className="dim">Loading results…</p>}
      {sw && rows.error && <p className="msg error">Couldn't load results.</p>}
      {sw && rows.data && events.length === 0 && <section className="card"><p className="dim">No race results on record for this swimmer yet.</p></section>}
      {sw && rows.data && events.length > 0 && (!event || !sex) && <section className="card"><p className="dim">Choose an event{sex ? "" : " and sex"} above to draw the chart.</p></section>}
      {sw && rows.data && event && sex && <RegressionResult sw={sw} event={event} sex={sex} rows={rows.data.filter(r => r.event === event)} />}
    </>
  );
}

function RegressionResult({ sw, event, sex, rows }: { sw: Sw; event: string; sex: Sex; rows: RegRow[] }) {
  const sc = toPoints(rows.filter(r => r.course === "SC"));
  const lc = toPoints(rows.filter(r => r.course === "LC"));
  if (!sc.length && !lc.length) return <section className="card"><p className="dim">No readable times on record for this event.</p></section>;

  const birthYear = sw.date_of_birth ? +sw.date_of_birth.slice(0, 4) : null;
  const scReg = trend(sc), lcReg = trend(lc);
  const firstYear = Math.floor(Math.min(...[...sc, ...lc].map(p => p.x)));
  const flags = trendFlags(sc, lc, scReg, lcReg);

  type DS = ChartDataset<"line", { x: number; y: number }[]>;
  const ds: DS[] = [];
  const swims = (label: string, pts: typeof sc, col: string, style: "circle" | "triangle"): DS => ({
    label, data: pts, showLine: true, fill: false, tension: 0, borderColor: col, borderWidth: 2, backgroundColor: col,
    pointRadius: pts.map(p => (p.is_pb ? 6.5 : 5)), pointStyle: style, pointBorderColor: pts.map(p => (p.is_pb ? C.pb : "#fff")), pointBorderWidth: 1.5
  });
  const dashed = (label: string, data: { x: number; y: number }[], col: string, dash: number[], w = 1.5): DS =>
    ({ label, data, borderColor: col, borderDash: dash, borderWidth: w, pointRadius: 0, fill: false });

  if (sc.length) ds.push(swims("SC swims", sc, C.sc, "circle"));
  if (lc.length) ds.push(swims("LC swims", lc, C.lc, "triangle"));
  if (scReg && scReg.slope < 0) { const p = projection(scReg, sc[sc.length - 1].x); if (p.length) ds.push(dashed("SC projection", p, "rgba(42,120,214,.45)", [4, 2], 1.8)); }
  if (lcReg && lcReg.slope < 0) { const p = projection(lcReg, lc[lc.length - 1].x); if (p.length) ds.push(dashed("LC projection", p, "rgba(15,122,62,.45)", [4, 2], 1.8)); }

  const forecasts: string[] = [];
  if (birthYear) {
    const w = steppedStandard(firstYear, sex, event, birthYear, wcqtVal);
    if ((sc.length || lc.length) && w.length) ds.push(dashed("WCQT", w, C.wcqt, [5, 3]));
    if (sc.length) { const l = steppedStandard(firstYear, sex, event, birthYear, lccqtVal); if (l.length) ds.push(dashed("LCCQT", l, C.lccqt, [2, 3], 1.4)); }
    if (lc.length) { const l = steppedStandard(firstYear, sex, event, birthYear, lccqtlcVal); if (l.length) ds.push(dashed("LCCQTLC", l, C.lccqtlc, [3, 2], 1.4)); }
    if (scReg && scReg.slope < 0) {
      const from = sc[sc.length - 1].x;
      const yW = forecastCrossing(scReg, from, sex, event, birthYear, wcqtVal); if (yW) forecasts.push(`WCQT (from SC trend): ~${yW}`);
      const yL = forecastCrossing(scReg, from, sex, event, birthYear, lccqtVal); if (yL) forecasts.push(`LCCQT (from SC trend): ~${yL}`);
    }
    if (lcReg && lcReg.slope < 0) {
      const from = lc[lc.length - 1].x;
      const yW = forecastCrossing(lcReg, from, sex, event, birthYear, wcqtVal); if (yW) forecasts.push(`WCQT (from LC trend): ~${yW}`);
      const yL = forecastCrossing(lcReg, from, sex, event, birthYear, lccqtlcVal); if (yL) forecasts.push(`LCCQTLC (from LC trend): ~${yL}`);
    }
  }

  const options: ChartOptions<"line"> = {
    responsive: true, maintainAspectRatio: false, parsing: false, animation: false,
    scales: {
      x: { type: "linear", min: firstYear, max: LAST_STANDARD_YEAR + 0.5, ticks: { callback: v => (Math.round(+v) === +v ? String(Math.round(+v)) : "") }, grid: { color: C.grid } },
      y: { ticks: { callback: v => secToTime(+v) }, grid: { color: C.grid } }
    },
    plugins: {
      legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: c => `${c.dataset.label}: ${secToTime(c.parsed.y)}` } }
    }
  };

  const attempts = [...sc.map(p => ({ ...p, course: "SC" })), ...lc.map(p => ({ ...p, course: "LC" }))]
    .sort((a, b) => b.meet_date.localeCompare(a.meet_date) || b.x - a.x);
  const n = sc.length + lc.length;

  return (
    <>
      <section className="card">
        <h2 className="card-title">{sw.full_name} — {event} {sc.length > 0 && <span className="course SC">SC</span>} {lc.length > 0 && <span className="course LC">LC</span>}</h2>
        <p className="dim small">{n} race{n === 1 ? "" : "s"} on record · {sex === "female" ? "Female" : "Male"} standards</p>
        {forecasts.length > 0 && <div className="chip-row">{forecasts.map(f => <span key={f} className="forecast">{f}</span>)}</div>}
        <div className="chart-wrap tall" role="img" aria-label={`Times in ${event} with trend and county standards`}><Line data={{ datasets: ds }} options={options} /></div>
        {(flags.length > 0 || !birthYear) && (
          <ul className="flags">
            {!birthYear && <li>No date of birth on file — county-standard lines and forecasts are unavailable for this swimmer.</li>}
            {flags.map(f => <li key={f}>{f}</li>)}
          </ul>
        )}
      </section>
      <section className="card">
        <h2 className="card-title">All attempts — {event} <span className="dim">({attempts.length})</span></h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th scope="col">Date</th><th scope="col">Course</th><th scope="col">Time</th><th scope="col">Meet</th></tr></thead>
            <tbody>
              {attempts.map((a, i) => (
                <tr key={i}>
                  <td className="nowrap">{fmtDate(a.meet_date)}</td>
                  <td><span className={"course " + a.course}>{a.course}</span></td>
                  <td className="nowrap"><strong>{secToTime(a.y)}</strong> {a.is_pb && <span className="pb-tag">PB</span>}</td>
                  <td>{a.meet_name ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
