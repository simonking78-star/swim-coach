import { Line } from "react-chartjs-2";
import "../../lib/chartSetup";
import { C } from "../../lib/chartSetup";
import { fmtDate } from "../../lib/util";
import { BANDS, type Panels } from "../../lib/seasonBoard";
import type { BoardSquad } from "./SeasonBoard";

// Training data · Metrics data · Competition data (A-138 to A-140).
// Figures come from public.season_plan_panels() and are aggregates only — no swimmer names.

const pct = (a: number, c: number) => (c ? Math.round((100 * a) / c) : null);
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((n, r) => n + (f(r) || 0), 0);
const fmtPct = (n: number | null) => (n == null ? "—" : n + "%");
function Delta({ now, before, unit = "", pts }: { now: number | null; before: number | null; unit?: string; pts?: boolean }) {
  if (now == null || before == null) return <span className="dim">—</span>;
  const d = Math.round((now - before) * 10) / 10;
  return <span className={d > 0 ? "up" : d < 0 ? "down" : "dim"}>{d > 0 ? "▲ " : d < 0 ? "▼ " : ""}{Math.abs(d)}{pts ? " pts" : unit}</span>;
}

export function SeasonPanels({ panels, squads, squadFilter, isAdmin, onStandard, onRegister, canRegister }: {
  panels: Panels; squads: BoardSquad[]; squadFilter: Set<string>; isAdmin: boolean; canRegister: boolean;
  onStandard: () => void; onRegister: (compId: string) => void;
}) {
  const inF = (id: string | null) => (id ? squadFilter.has(id) : squadFilter.size === squads.length);
  const name = (id: string | null) => (id ? squads.find(s => s.id === id)?.name ?? "Other squad" : "No squad");
  const prev = panels.prev;
  const prevLabel = prev ? `${prev.title} (to ${fmtDate(prev.to)})` : null;
  const shown = squads.filter(s => squadFilter.has(s.id));

  // ---- Training data ------------------------------------------------------------------
  const att = (sid: string, period: "this" | "prev") => panels.attendance.find(a => a.squad_id === sid && a.period === period);
  const trainingRows = shown.map(sq => {
    const t = att(sq.id, "this"), p = att(sq.id, "prev");
    const ses = panels.sessions.find(s => s.squad_id === sq.id);
    return { sq, now: t ? pct(t.attended, t.counted) : null, before: p ? pct(p.attended, p.counted) : null, ses };
  }).filter(r => r.now != null || r.before != null || (r.ses && (r.ses.available || r.ses.plans_season)));
  const tot = (period: "this" | "prev") => { const rows = panels.attendance.filter(a => a.period === period && inF(a.squad_id)); return pct(sum(rows, r => r.attended), sum(rows, r => r.counted)); };

  // ---- Metrics data -------------------------------------------------------------------
  const weekly = (period: "this" | "prev") => {
    const rows = panels.weekly.filter(w => w.period === period && inF(w.squad_id));
    const byWeek = new Map<number, { m: number; h: number; n: number }>();
    for (const r of rows) { const x = byWeek.get(r.week) || { m: 0, h: 0, n: 0 }; x.m += r.metres; x.h += r.hours; x.n += r.swimmers; byWeek.set(r.week, x); }
    return byWeek;
  };
  const wNow = weekly("this"), wPrev = weekly("prev");
  const maxWeek = Math.max(0, ...wNow.keys(), ...wPrev.keys());
  const labels = Array.from({ length: maxWeek }, (_, i) => "W" + (i + 1));
  const series = (m: Map<number, { m: number; h: number; n: number }>, f: (x: { m: number; h: number; n: number }) => number) =>
    labels.map((_, i) => { const x = m.get(i + 1); return x && x.n ? Math.round(f(x) * 10) / 10 : null; });
  const avg = (period: "this" | "prev", f: (r: Panels["attendance"][number]) => number) => {
    const rows = panels.attendance.filter(a => a.period === period && inF(a.squad_id));
    const sw = sum(rows, r => r.swimmer_weeks);
    return sw ? Math.round((sum(rows, f) / sw) * 10) / 10 : null;
  };
  const mNow = avg("this", r => r.metres), mPrev = avg("prev", r => r.metres);
  const hNow = avg("this", r => r.hours), hPrev = avg("prev", r => r.hours);
  const noMetres = !sum(panels.attendance.filter(a => inF(a.squad_id)), r => r.metres);
  const chart = (title: string, now: (number | null)[], before: (number | null)[], unit: string) => (
    <div className="sp-chart">
      <Line aria-label={title} role="img"
        data={{ labels, datasets: [
          { label: "This season", data: now, borderColor: C.navy, backgroundColor: C.navy, spanGaps: true, tension: 0.25, pointRadius: 2 },
          ...(prev ? [{ label: "Last season", data: before, borderColor: C.accent, backgroundColor: C.accent, borderDash: [5, 4], spanGaps: true, tension: 0.25, pointRadius: 2 }] : [])
        ] }}
        options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y} ${unit}` } } },
          scales: { y: { beginAtZero: true, grid: { color: C.grid }, title: { display: true, text: unit } }, x: { grid: { display: false } } } }} />
    </div>
  );
  const tests = panels.tests.filter(t => inF(t.squad_id));
  const testKeys = [...new Set(tests.map(t => `${t.template_name}|${t.level ?? ""}`))].sort();
  const testSquads = [...new Set(tests.map(t => t.squad_id))];

  // ---- Competition data ---------------------------------------------------------------
  const bandRow = (rows: { squad_id: string | null; band: number; n: number }[] | undefined) => BANDS.map((_, i) => sum((rows || []).filter(r => r.band === i + 1 && inF(r.squad_id)), r => r.n));
  const bs = bandRow(panels.band_swimmers), be = bandRow(panels.band_events);
  const unscored = sum((panels.band_unscored || []).filter(r => inF(r.squad_id)), r => r.n);
  const nc = panels.non_competitors.filter(r => inF(r.squad_id));
  const next = panels.next_comp;
  const nextRows = next ? next.squads.filter(r => inF(r.squad_id)) : [];
  const elig = sum(nextRows, r => r.eligible), reg = sum(nextRows, r => r.registered);

  return (
    <div className="sp-grid">
      <section className="card sp" aria-labelledby="sp-train">
        <h2 id="sp-train" className="card-title">Training data</h2>
        <p className="dim small">{prevLabel ? <>Like for like with <strong>{prevLabel}</strong>.</> : "No previous season on record, so there's nothing to compare with yet."}</p>
        <div className="sp-kpis">
          <div><span className="k">{fmtPct(tot("this"))}</span><span className="l">attendance this season</span></div>
          {prev && <div><span className="k"><Delta now={tot("this")} before={tot("prev")} pts /></span><span className="l">vs {fmtPct(tot("prev"))} last season</span></div>}
        </div>
        {trainingRows.length ? (
          <div className="table-scroll"><table className="data">
            <thead><tr><th>Squad</th><th className="num">Attend.</th>{prev && <th className="num" title="Same weeks last season">Last</th>}{prev && <th className="num">Change</th>}<th className="num" title="Timetabled sessions with a register marked, of all timetabled so far">Sessions</th><th className="num" title="Session plans written so far, of sessions run">Plans</th></tr></thead>
            <tbody>
              {trainingRows.map(r => (
                <tr key={r.sq.id}>
                  <th>{r.sq.name}</th>
                  <td className="num">{fmtPct(r.now)}</td>
                  {prev && <td className="num">{fmtPct(r.before)}</td>}
                  {prev && <td className="num"><Delta now={r.now} before={r.before} pts /></td>}
                  <td className="num">{r.ses ? `${r.ses.completed} / ${r.ses.available}` : "—"}</td>
                  <td className="num" title={r.ses ? `${r.ses.plans_season} written for the whole season` : undefined}>{r.ses ? `${r.ses.plans} / ${r.ses.completed || r.ses.available}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <p className="dim">No registers or timetabled sessions yet for these squads.</p>}
        <p className="hint">Excused is left out; part attendance counts by the fraction attended. Sessions = timetabled sessions with a register marked, of those timetabled so far. Plans = session plans written, of sessions run.</p>
      </section>

      <section className="card sp" aria-labelledby="sp-metrics">
        <h2 id="sp-metrics" className="card-title">Metrics data</h2>
        <div className="sp-kpis">
          <div><span className="k">{mNow == null ? "—" : Math.round(mNow).toLocaleString() + " m"}</span><span className="l">a swimmer a week{prev && <> · <Delta now={mNow} before={mPrev} unit=" m" /></>}</span></div>
          <div><span className="k">{hNow == null ? "—" : hNow + " h"}</span><span className="l">a swimmer a week{prev && <> · <Delta now={hNow} before={hPrev} unit=" h" /></>}</span></div>
        </div>
        {noMetres && <p className="notice small">No metres recorded yet: link registers to a session plan, or record distance on the register, and volume will show here.</p>}
        {labels.length > 0 && <>
          {chart("Average metres per swimmer per week", series(wNow, x => x.m / x.n), series(wPrev, x => x.m / x.n), "m")}
          {chart("Average hours per swimmer per week", series(wNow, x => x.h / x.n), series(wPrev, x => x.h / x.n), "h")}
        </>}
        <h3 className="sec-title">Club test sets by squad</h3>
        {testKeys.length ? (
          <div className="table-scroll">
            <table className="data">
              <thead><tr><th>Test set · level</th>{testSquads.map(s => <th key={s ?? "none"} className="num">{name(s)}</th>)}</tr></thead>
              <tbody>
                {testKeys.map(k => {
                  const [tn, lv] = k.split("|");
                  return (
                    <tr key={k}>
                      <th>{tn}{lv ? ` · L${lv}` : ""}</th>
                      {testSquads.map(s => {
                        const t = tests.find(x => x.template_name === tn && String(x.level ?? "") === lv && x.squad_id === s);
                        return <td key={s ?? "none"} className="num" title={t && t.median != null ? `Range ${t.min}–${t.max}` : undefined}>{!t ? "" : t.median == null ? <span className="dim">n={t.n}</span> : <>{Math.round(t.median)} <span className="dim small">n={t.n}</span></>}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="dim">No test sets recorded this season.</p>}
        <p className="hint">Median score; hidden when fewer than 3 swimmers took the set.</p>
      </section>

      <section className="card sp" aria-labelledby="sp-comp">
        <div className="row">
          <h2 id="sp-comp" className="card-title">Competition data</h2>
          {isAdmin && <button type="button" className="btn small" onClick={onStandard}>{panels.standard ? "Change standard" : "Set standard"}</button>}
        </div>
        {!panels.standard ? (
          <p className="notice warn">Competition standard not set — {isAdmin ? "choose which county times count as CQT and CCT for this season." : "ask your club admin to set which county times count as CQT and CCT."}</p>
        ) : (
          <>
            <p className="dim small">{panels.standard.county} standard · best times in the last 12 months · age at {fmtDate(panels.standard.age_at)}</p>
            <table className="data">
              <thead><tr><th /><th className="num">Swimmers</th><th className="num">Events</th></tr></thead>
              <tbody>
                {BANDS.map((b, i) => <tr key={b} className={"band b" + (i + 1)}><th>{b}</th><td className="num">{bs[i]}</td><td className="num">{be[i]}</td></tr>)}
              </tbody>
            </table>
            {unscored > 0 && <p className="notice small">{unscored} swimmer{unscored === 1 ? "" : "s"} with recent swims can't be banded: gender or birth year missing on their record.</p>}
          </>
        )}
        <h3 className="sec-title">Next competition</h3>
        {next ? (
          <>
            <p><strong>{next.name}</strong> · {fmtDate(next.date)}</p>
            <div className="sp-kpis">
              <div><span className="k">{reg}</span><span className="l">registered</span></div>
              <div><span className="k">{Math.max(0, elig - reg)}</span><span className="l">not registered</span></div>
            </div>
            {canRegister && <button type="button" className="btn small" onClick={() => onRegister(next.id)}>Record registrations</button>}
          </>
        ) : <p className="dim">No competitions left this season.</p>}
        <h3 className="sec-title">Non-competitors</h3>
        <p><span className="k-inline">{sum(nc, r => r.n)}</span> swimmer{sum(nc, r => r.n) === 1 ? " has" : "s have"} no competitive swim this season.</p>
      </section>
    </div>
  );
}
