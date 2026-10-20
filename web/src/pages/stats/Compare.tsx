import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import type { ChartDataset, ChartOptions } from "chart.js";
import { C } from "../../lib/chartSetup";
import { useClub } from "../../club/ClubProvider";
import {
  ALL_CLUBS, DISTANCES, OPEN_END, OPEN_START, buildGroup, fmtDayMs, fmtMonth, fmtPct, fmtRate, groupBySwimmer, groupSeries,
  loadAllSwimmers, loadEventRows, monthEnds, ms, normWindow, quantile, stats, swimsIn, yobLabel, yobOf,
  type CmpSwimmer, type Stats, type Yob
} from "../../lib/compare";
import { secToTime } from "../../lib/results";
import { isoAdd, todayLocal } from "../../lib/util";
import { StatsBack } from "./StatsHub";

type Mode = "swimmer" | "yob" | "squad";
type View = "time" | "imp";

export default function Compare() {
  const { club: appClub } = useClub();
  const today = todayLocal().date;
  const [stroke, setStroke] = useState("Freestyle");
  const [distance, setDistance] = useState(50);
  const [course, setCourse] = useState<"SC" | "LC">("SC");
  const [yobF, setYobF] = useState("");
  const [start, setStart] = useState(isoAdd(today, -365));
  const [end, setEnd] = useState(today);
  const [clubA, setClubA] = useState<string>(appClub ?? ALL_CLUBS);
  const [clubB, setClubB] = useState<string>(appClub ?? ALL_CLUBS);
  const [a, setA] = useState<CmpSwimmer | null>(null);
  const [b, setB] = useState<CmpSwimmer | null>(null);
  const [mode, setMode] = useState<Mode>("swimmer");
  const [scope, setScope] = useState<"club" | "all">("club");
  const [squadClub, setSquadClub] = useState<string>(appClub ?? "");
  const [squad, setSquad] = useState("");
  const [viewPick, setView] = useState<View>("imp");
  const view: View = mode === "swimmer" ? viewPick : "imp"; // group averages only make sense as % improvement

  const event = `${distance}m ${stroke}`;
  const swimmers = useQuery({ queryKey: ["cmp_swimmers"], staleTime: 10 * 60 * 1000, queryFn: loadAllSwimmers });
  const rowsQ = useQuery({ queryKey: ["cmp_rows", event, course], staleTime: 10 * 60 * 1000, queryFn: () => loadEventRows(event, course) });

  const byId = useMemo(() => new Map((swimmers.data ?? []).map(s => [s.id, s])), [swimmers.data]);
  const bySwimmer = useMemo(() => groupBySwimmer(rowsQ.data ?? []), [rowsQ.data]);
  const yobCache = useMemo(() => new Map<string, Yob | null>(), [bySwimmer, byId]);
  const yob = (id: string) => { if (!yobCache.has(id)) yobCache.set(id, yobOf(byId.get(id), bySwimmer.get(id))); return yobCache.get(id)!; };
  const w = normWindow(start, end);
  const clubMatch = (s: CmpSwimmer, c: string) => c === ALL_CLUBS || s.club === c;

  useEffect(() => { if (!DISTANCES[stroke].includes(distance)) setDistance(DISTANCES[stroke][0]); }, [stroke, distance]);

  // Clubs with a swim in this event and course (plus the app's club); squad clubs = clubs with squads recorded.
  const clubs = useMemo(() => {
    const set = new Set<string>(appClub ? [appClub] : []);
    bySwimmer.forEach((_, id) => { const s = byId.get(id); if (s?.club) set.add(s.club); });
    return [...set].sort((x, y) => x.localeCompare(y));
  }, [bySwimmer, byId, appClub]);
  const squadClubs = useMemo(() => [...new Set((swimmers.data ?? []).filter(s => s.squad && s.club).map(s => s.club!))].sort((x, y) => x.localeCompare(y)), [swimmers.data]);
  const squadsInClub = useMemo(() => [...new Set((swimmers.data ?? []).filter(s => s.club === squadClub && s.squad).map(s => s.squad!))].sort(), [swimmers.data, squadClub]);

  const candidates = (c: string) => {
    const out: (CmpSwimmer & { n: number })[] = [];
    bySwimmer.forEach((rows, id) => {
      const s = byId.get(id);
      if (!s || !clubMatch(s, c) || s.active === false) return;
      const n = swimsIn(rows, w).length;
      if (!n) return;
      if (yobF) { const y = yob(id); if (!y || String(y.year) !== yobF) return; }
      out.push({ ...s, n });
    });
    return out.sort((x, y) => x.full_name.localeCompare(y.full_name));
  };
  const years = useMemo(() => {
    const set = new Set<number>();
    bySwimmer.forEach((_, id) => { const s = byId.get(id); if (s && clubMatch(s, clubA)) { const y = yob(id); if (y) set.add(y.year); } });
    return [...set].sort((x, y) => y - x);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bySwimmer, byId, clubA]);

  const pickA = (s: CmpSwimmer) => {
    setA(s);
    // Default the squad comparison to the swimmer's own club and squad.
    if (s.club && squadClubs.includes(s.club)) { setSquadClub(s.club); setSquad(s.squad ?? ""); }
  };

  const loading = swimmers.isLoading || rowsQ.isLoading;
  const loadErr = swimmers.error || rowsQ.error;
  const candA = loading ? [] : candidates(clubA);
  const fromTxt = w.start === OPEN_START ? "the start of the records" : fmtDayMs(ms(w.start));
  const toTxt = w.end === OPEN_END ? "today" : fmtDayMs(ms(w.end));

  return (
    <>
      <StatsBack />
      <div className="page-head"><h1><span aria-hidden="true">⚖️</span> Swimmer Comparison</h1><p className="dim">A swimmer against another swimmer, their birth-year average or a squad average</p></div>

      <section className="card">
        <h2 className="card-title">Filters</h2>
        <div className="field-pair">
          <div><label htmlFor="cmp-stroke">Stroke</label>
            <select id="cmp-stroke" value={stroke} onChange={e => setStroke(e.target.value)}>{Object.keys(DISTANCES).map(s => <option key={s}>{s}</option>)}</select></div>
          <div><label htmlFor="cmp-dist">Distance</label>
            <select id="cmp-dist" value={distance} onChange={e => setDistance(+e.target.value)}>{DISTANCES[stroke].map(d => <option key={d} value={d}>{d}m</option>)}</select></div>
        </div>
        <div className="field-pair">
          <fieldset className="choice-set tight"><legend>Course</legend>
            <div className="seg seg-2">{(["SC", "LC"] as const).map(c => <button key={c} type="button" className={"seg-btn" + (course === c ? " on" : "")} aria-pressed={course === c} onClick={() => setCourse(c)}>{c}</button>)}</div>
          </fieldset>
          <div><label htmlFor="cmp-yob">Year of birth</label>
            <select id="cmp-yob" value={yobF} onChange={e => setYobF(e.target.value)}><option value="">All years</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
        </div>
        <div className="field-pair">
          <div><label htmlFor="cmp-from">From</label><input id="cmp-from" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><label htmlFor="cmp-to">To</label><input id="cmp-to" type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
        </div>
        {!loading && !loadErr && <p className="hint">{candA.length} swimmer{candA.length === 1 ? "" : "s"} {clubA === ALL_CLUBS ? "across all clubs" : `at ${clubA}`} with a {event} {course} swim between {fromTxt} and {toTxt}.</p>}
      </section>

      <section className="card">
        <h2 className="card-title">Swimmer</h2>
        <ClubSelect id="cmp-club-a" label="Club" value={clubA} clubs={clubs} onChange={setClubA} />
        <SwimmerPicker id="cmp-a" sel={a} onPick={pickA} onClear={() => setA(null)} candidates={candA} exclude={b?.id} appClub={appClub} club={clubA} yob={yob} disabled={loading} />

        <fieldset className="choice-set"><legend>Compare against</legend>
          <div className="seg seg-3">
            {([["swimmer", "Another swimmer"], ["yob", "Birth-year average"], ["squad", "Squad average"]] as [Mode, string][]).map(([m, l]) =>
              <button key={m} type="button" className={"seg-btn small-text" + (mode === m ? " on" : "")} aria-pressed={mode === m} onClick={() => setMode(m)}>{l}</button>)}
          </div>
        </fieldset>

        {mode === "swimmer" && (
          <>
            <ClubSelect id="cmp-club-b" label="Second swimmer's club" value={clubB} clubs={clubs} onChange={setClubB} />
            <SwimmerPicker id="cmp-b" sel={b} onPick={setB} onClear={() => setB(null)} candidates={loading ? [] : candidates(clubB)} exclude={a?.id} appClub={appClub} club={clubB} yob={yob} disabled={loading} placeholder="Second swimmer…" />
          </>
        )}
        {mode === "yob" && (
          <fieldset className="choice-set"><legend>Birth-year group drawn from</legend>
            <div className="seg seg-2">
              <button type="button" className={"seg-btn" + (scope === "club" ? " on" : "")} aria-pressed={scope === "club"} onClick={() => setScope("club")}>Swimmer's club</button>
              <button type="button" className={"seg-btn" + (scope === "all" ? " on" : "")} aria-pressed={scope === "all"} onClick={() => setScope("all")}>All clubs in the archive</button>
            </div>
          </fieldset>
        )}
        {mode === "squad" && (
          <div className="field-pair">
            <div><label htmlFor="cmp-sq-club">Club</label>
              <select id="cmp-sq-club" value={squadClub} onChange={e => { setSquadClub(e.target.value); setSquad(""); }}>
                {squadClubs.length ? squadClubs.map(c => <option key={c} value={c}>{c}</option>) : <option value="">No clubs have squads recorded</option>}
              </select></div>
            <div><label htmlFor="cmp-squad">Squad</label>
              <select id="cmp-squad" value={squad} onChange={e => setSquad(e.target.value)}><option value="">— choose —</option>{squadsInClub.map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
        )}
        {mode === "squad" && <p className="hint">Squad is each swimmer's current squad.</p>}

        <fieldset className="choice-set"><legend>Chart shows</legend>
          <div className="seg seg-2">
            <button type="button" className={"seg-btn" + (view === "time" ? " on" : "")} aria-pressed={view === "time"} disabled={mode !== "swimmer"} onClick={() => setView("time")}>Times</button>
            <button type="button" className={"seg-btn" + (view === "imp" ? " on" : "")} aria-pressed={view === "imp"} onClick={() => setView("imp")}>% improvement</button>
          </div>
        </fieldset>
        {mode !== "swimmer" && <p className="hint">Group averages are shown as % improvement — raw times from swimmers of different speeds can't be fairly averaged.</p>}
      </section>

      {loading && <p className="dim">Loading results…</p>}
      {loadErr && <p className="msg error">Couldn't load the results archive.</p>}
      {!loading && !loadErr && (
        <CompareResult
          {...{ a, b, mode, view, event, course, w, yobF, scope, squad, squadClub, bySwimmer, byId, yob }}
          allDates={(rowsQ.data ?? []).map(r => r.meet_date)}
        />
      )}
    </>
  );
}

function ClubSelect({ id, label, value, clubs, onChange }: { id: string; label: string; value: string; clubs: string[]; onChange: (c: string) => void }) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)}>
        <option value={ALL_CLUBS}>All clubs</option>
        {clubs.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </>
  );
}

function SwimmerPicker({ id, sel, onPick, onClear, candidates, exclude, appClub, club, yob, disabled, placeholder = "Start typing a name…" }: {
  id: string; sel: CmpSwimmer | null; onPick: (s: CmpSwimmer) => void; onClear: () => void;
  candidates: (CmpSwimmer & { n: number })[]; exclude?: string; appClub: string | null; club: string; yob: (id: string) => Yob | null; disabled: boolean; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  if (sel) return (
    <div className="selected-pill">
      <span><strong>{sel.full_name}</strong><span className="dim"> · {sel.club || "club unknown"}{sel.squad ? ` · ${sel.squad}` : ""}</span></span>
      <button type="button" className="link-btn" onClick={onClear}>Change</button>
    </div>
  );
  const t = q.trim().toLowerCase();
  const hits = t ? candidates.filter(s => s.id !== exclude && s.full_name.toLowerCase().includes(t)).slice(0, 25) : [];
  return (
    <div className="search-box">
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <input id={id} type="search" autoComplete="off" placeholder={disabled ? "Loading…" : placeholder} disabled={disabled} value={q} onChange={e => setQ(e.target.value)} />
      {t && (
        <ul className="search-results">
          {hits.length === 0 && <li className="dim">No swimmers with this event in the window</li>}
          {hits.map(s => (
            <li key={s.id}><button type="button" onClick={() => { setQ(""); onPick(s); }}>
              <span>{s.full_name}</span>
              <span className="chip-row tight">
                {(club === ALL_CLUBS || s.club !== appClub) && s.club && <span className="chip">{s.club}</span>}
                {s.squad && <span className="chip">{s.squad}</span>}
                <span className="chip">YoB {yobLabel(yob(s.id))}</span>
                <span className="chip">{s.n} swim{s.n === 1 ? "" : "s"}</span>
              </span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
type P = { x: number; y: number; meet?: string | null; t?: number; n?: number; carry?: boolean };

function CompareResult({ a, b, mode, view, event, course, w, yobF, scope, squad, squadClub, bySwimmer, byId, yob, allDates }: {
  a: CmpSwimmer | null; b: CmpSwimmer | null; mode: Mode; view: View; event: string; course: string; w: { start: string; end: string };
  yobF: string; scope: "club" | "all"; squad: string; squadClub: string;
  bySwimmer: Map<string, import("../../lib/compare").CmpRow[]>; byId: Map<string, CmpSwimmer>; yob: (id: string) => Yob | null; allDates: string[];
}) {
  if (!a) return <section className="card"><p className="dim">Choose a swimmer to start the comparison.</p></section>;
  if (mode === "swimmer" && !b) return <section className="card"><p className="dim">Choose a second swimmer to compare against.</p></section>;
  const aSt = stats(swimsIn(bySwimmer.get(a.id), w));
  if (!aSt) return <section className="card"><p className="dim">{a.full_name} has no {event} {course} swims in this window.</p></section>;

  const flags: string[] = [];
  if (aSt.n < 2 && view === "imp") flags.push(`${a.full_name} has only 1 swim in the window — improvement needs at least 2.`);
  const ds: ChartDataset<"line", P[]>[] = [];
  const table: { color: string; who: string; sub: string; n: string; firstBest: string; gainSub: string; gain: string; rate: string }[] = [];
  const endX = Math.min(ms(w.end === OPEN_END ? todayLocal().date : w.end), Date.now());

  const addSwimmer = (s: CmpSwimmer, st: Stats, col: string) => {
    if (view === "time") {
      ds.push({ label: s.full_name, data: st.pts.map(p => ({ x: p.x, y: p.t, meet: p.meet })), showLine: true, borderColor: col, backgroundColor: col, borderWidth: 2, pointRadius: 4, tension: 0, fill: false });
    } else {
      const line: P[] = st.pts.map(p => ({ x: p.x, y: p.bsf, meet: p.meet }));
      if (line.length && endX > line[line.length - 1].x) line.push({ x: endX, y: line[line.length - 1].y, carry: true });
      ds.push({ label: `${s.full_name} — best so far`, data: line, showLine: true, stepped: "before", borderColor: col, backgroundColor: col, borderWidth: 2.2,
        pointRadius: line.map(p => (p.carry ? 0 : 3)), fill: false });
      ds.push({ label: `${s.full_name} — each swim`, data: st.pts.map(p => ({ x: p.x, y: p.raw, meet: p.meet, t: p.t })), showLine: false, borderColor: col, backgroundColor: col + "55", pointRadius: 3.5, pointStyle: "rectRot" });
    }
    table.push({ color: col, who: s.full_name, sub: `${s.club ?? ""}${s.squad ? " · " + s.squad : ""} · YoB ${yobLabel(yob(s.id))}`, n: String(st.n),
      firstBest: `${secToTime(st.first)} → ${secToTime(st.best)}`, gainSub: st.impSec > 0 ? `−${st.impSec.toFixed(2)}s` : "no gain", gain: fmtPct(st.impPct), rate: fmtRate(st.ratePct) });
  };
  addSwimmer(a, aSt, C.a);

  let headline = "", sub = "";
  if (mode === "swimmer" && b) {
    const bSt = stats(swimsIn(bySwimmer.get(b.id), w));
    if (!bSt) flags.push(`${b.full_name} has no ${event} ${course} swims in this window.`);
    else {
      if (bSt.n < 2 && view === "imp") flags.push(`${b.full_name} has only 1 swim in the window — improvement needs at least 2.`);
      addSwimmer(b, bSt, C.b);
      if (aSt.n >= 2 && bSt.n >= 2) {
        const d = aSt.impPct - bSt.impPct;
        headline = `${a.full_name} improved ${fmtPct(aSt.impPct)} vs ${b.full_name} ${fmtPct(bSt.impPct)} — ${Math.abs(d).toFixed(1)} points ${d >= 0 ? "more" : "less"}.`;
      }
      const gap = aSt.best - bSt.best;
      sub = `Best times in window: ${secToTime(aSt.best)} vs ${secToTime(bSt.best)} (${gap <= 0 ? `${a.full_name} faster by ${Math.abs(gap).toFixed(2)}s` : `${b.full_name} faster by ${gap.toFixed(2)}s`}).`;
    }
  } else {
    let label = "", ids: string[] = [], err: string | null = null;
    if (mode === "yob") {
      const aY = yob(a.id);
      const year = yobF ? +yobF : aY?.year ?? null;
      if (!year) err = "No year of birth is on file or can be estimated for this swimmer — choose a year in the Year of birth filter.";
      else {
        bySwimmer.forEach((_, id) => {
          if (id === a.id) return;
          const s = byId.get(id);
          if (!s || (scope === "club" && s.club !== a.club)) return;
          if (yob(id)?.year === year) ids.push(id);
        });
        label = `Born ${year} · ${scope === "club" ? a.club || "club unknown" : "all clubs"}`;
      }
    } else {
      if (!squad) err = "Choose a squad to compare against.";
      else {
        bySwimmer.forEach((_, id) => {
          if (id === a.id) return;
          const s = byId.get(id);
          if (!s || s.club !== squadClub || s.squad !== squad) return;
          if (yobF && String(yob(id)?.year) !== yobF) return;
          ids.push(id);
        });
        label = `${squadClub} ${squad} squad${yobF ? ` · born ${yobF}` : ""}`;
      }
    }
    if (err) flags.push(err);
    else {
      const g = buildGroup(label, ids, bySwimmer, w, yob);
      if (!g.members.length) flags.push(`No-one in "${g.label}" has 2+ ${event} ${course} swims in this window, so there is no average to compare against.`);
      else {
        const s = groupSeries(g, monthEnds(w, allDates));
        if (g.members.length >= 4) {
          ds.push({ label: "Group middle 50% (low)", data: s.p25, showLine: true, borderWidth: 0, pointRadius: 0, fill: false, borderColor: "transparent" });
          ds.push({ label: "Group middle 50%", data: s.p75, showLine: true, borderWidth: 0, pointRadius: 0, fill: "-1", backgroundColor: "rgba(217,72,15,.12)", borderColor: "transparent" });
        }
        ds.push({ label: `${g.label} — average`, data: s.mean, showLine: true, borderColor: C.b, backgroundColor: C.b, borderWidth: 2.2, borderDash: [6, 3], pointRadius: 2.5, fill: false, tension: 0 });
        const imps = g.members.map(m => m.st.impPct).sort((x, y) => x - y);
        const avgImp = imps.reduce((x, y) => x + y, 0) / imps.length;
        const rates = g.members.map(m => m.st.ratePct).filter((v): v is number => v != null);
        const avgN = g.members.reduce((x, m) => x + m.st.n, 0) / g.members.length;
        table.push({ color: C.b, who: g.label, sub: `average of ${g.members.length} swimmer${g.members.length === 1 ? "" : "s"} · median ${fmtPct(quantile(imps, 0.5))}`,
          n: avgN.toFixed(1), firstBest: "—", gainSub: "", gain: fmtPct(avgImp), rate: fmtRate(rates.length ? rates.reduce((x, y) => x + y, 0) / rates.length : null) });
        if (aSt.n >= 2) {
          const d = aSt.impPct - avgImp;
          headline = `${a.full_name} improved ${fmtPct(aSt.impPct)} vs a group average of ${fmtPct(avgImp)} — ${Math.abs(d).toFixed(1)} points ${d >= 0 ? "above" : "below"} average.`;
          sub = `More improvement than ${imps.filter(v => v < aSt.impPct).length} of ${g.members.length} in the group.`;
        }
        if (g.members.length < 3) flags.push(`Small group (${g.members.length}) — treat the average as indicative only.`);
        if (g.excludedOneOff) flags.push(`${g.excludedOneOff} group member${g.excludedOneOff === 1 ? "" : "s"} with only one swim in the window ${g.excludedOneOff === 1 ? "is" : "are"} left out of the average.`);
        if (g.estCount && (mode === "yob" || yobF)) flags.push(`${g.estCount} of ${g.members.length} group members have no date of birth on file — their year of birth is estimated from ages on their results.`);
      }
    }
  }
  const aY = yob(a.id);
  if (yobF && (!aY || String(aY.year) !== yobF)) flags.push(`${a.full_name} (born ${yobLabel(aY)}) is outside the ${yobF} year-of-birth filter.`);
  if (mode === "yob" && aY?.est) flags.push(`${a.full_name}'s year of birth is estimated (${aY.year}) — add a date of birth via Admin to confirm.`);

  const xs = ds.flatMap(d => d.data.map(p => p.x));
  const LOW = "Group middle 50% (low)";
  const options: ChartOptions<"line"> = {
    responsive: true, maintainAspectRatio: false, parsing: false, animation: false,
    interaction: { mode: "nearest", intersect: false },
    scales: {
      x: { type: "linear", min: Math.min(...xs), max: Math.max(...xs), ticks: { maxTicksLimit: 7, callback: v => fmtMonth(+v) }, grid: { color: C.grid } },
      y: view === "imp"
        ? { ticks: { callback: v => (Number.isInteger(+v) ? (+v).toFixed(0) : (+v).toFixed(1)) + "%" }, title: { display: true, text: "Improvement" }, grid: { color: C.grid } }
        : { ticks: { callback: v => secToTime(+v) }, grid: { color: C.grid } }
    },
    plugins: {
      legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 }, filter: i => i.text !== LOW } },
      tooltip: {
        filter: i => i.dataset.label !== LOW && !(i.raw as P)?.carry,
        callbacks: {
          title: items => (items.length ? fmtDayMs(items[0].parsed.x ?? 0) : ""),
          label: c => {
            const r = (c.raw || {}) as P;
            const y = c.parsed.y ?? 0;
            if (view === "time") return `${c.dataset.label}: ${secToTime(y)}${r.meet ? " · " + r.meet : ""}`;
            if (c.dataset.label === "Group middle 50%") return `Group upper quartile: ${y.toFixed(1)}%`;
            return `${c.dataset.label}: ${y.toFixed(1)}%${r.t ? ` (${secToTime(r.t)})` : ""}${r.n ? ` · n=${r.n}` : ""}`;
          }
        }
      }
    }
  };
  const windowTxt = `${w.start === OPEN_START ? "all dates" : fmtDayMs(ms(w.start))} → ${w.end === OPEN_END ? "today" : fmtDayMs(ms(w.end))}`;

  return (
    <>
      <section className="card">
        <h2 className="card-title">{event} <span className={"course " + course}>{course}</span></h2>
        <p className="dim small">{windowTxt} · {view === "imp" ? "% faster than each swimmer's first swim in the window (higher is better)" : "race times (lower is faster)"}</p>
        {headline && <p className="headline">{headline}</p>}
        {sub && <p className="dim small">{sub}</p>}
        {ds.length > 0 && <div className="chart-wrap tall" role="img" aria-label="Comparison chart"><Line data={{ datasets: ds }} options={options} /></div>}
        {flags.length > 0 && <ul className="flags">{flags.map(f => <li key={f}>{f}</li>)}</ul>}
      </section>
      <section className="card">
        <h2 className="card-title">Summary</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th scope="col">Who</th><th scope="col" className="num">Swims</th><th scope="col">First → best</th><th scope="col" className="num">Gain · rate</th></tr></thead>
            <tbody>
              {table.map((r, i) => (
                <tr key={i}>
                  <th scope="row"><span className="dot" style={{ background: r.color }} aria-hidden="true" />{r.who}<span className="cell-sub">{r.sub}</span></th>
                  <td className="num">{r.n}</td>
                  <td className="nowrap">{r.firstBest}{r.gainSub && <span className="cell-sub">{r.gainSub}</span>}</td>
                  <td className="num"><strong>{r.gain}</strong><span className="cell-sub">{r.rate}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">First = first swim in the window. Improvement = first swim to best swim in the window. Rate = improvement ÷ months between first and last swim in the window.</p>
      </section>
    </>
  );
}
