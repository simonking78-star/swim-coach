import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import "../../lib/chartSetup";
import { C } from "../../lib/chartSetup";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { sectionLevel } from "../../lib/access";
import {
  loadResults, loadSessions, loadSwimmersByIds, loadTemplatesWithResults, rankBy, type TestResult, type TestSession
} from "../../lib/tests";
import { sessionPdf } from "../../lib/testPdf";
import { fmtDate, fmtDdMm } from "../../lib/util";
import { StatsBack } from "./StatsHub";

// Statistics → Test results: the Test & Assess archive. Per swimmer, every
// test on a template with the change since the previous one; per test
// session, everyone's result. Placings and ranked exports are for the head
// coach, club admin and superadmin only.

const LEAD = ["superadmin", "club_admin", "head_coach"];

export default function TestResults() {
  const { access } = useAuth();
  const st = sectionLevel(access, "stats");
  const own = st === "CR"; // parent / swimmer: their own record only
  const lead = (access?.roles ?? []).some(r => LEAD.includes(r.role));
  const { club } = useClub();
  const [params, setParams] = useSearchParams();
  const templateId = params.get("template") ?? "";
  const sessionId = params.get("session") ?? "";
  const [mode, setMode] = useState<"swimmer" | "session">(sessionId && !own ? "session" : "swimmer");
  const [swimmerId, setSwimmerId] = useState("");
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  const tpls = useQuery({ queryKey: ["test_tpls_results", club], enabled: !!club, queryFn: () => loadTemplatesWithResults(club!) });
  useEffect(() => { if (!templateId && tpls.data?.length) set("template", tpls.data[0].id); }, [tpls.data, templateId]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useQuery({ queryKey: ["test_results_all", club, templateId], enabled: !!club && !!templateId, queryFn: () => loadResults(club!, templateId) });
  const sessions = useQuery({ queryKey: ["test_sessions_tpl", club, templateId], enabled: !!club && !!templateId && !own, queryFn: () => loadSessions(club!, { templateId }) });
  const ids = useMemo(() => [...new Set((res.data ?? []).map(r => r.swimmer_id))], [res.data]);
  const names = useQuery({ queryKey: ["test_result_swimmers", ids.join(",")], enabled: ids.length > 0, queryFn: () => loadSwimmersByIds(ids) });
  const nameOf = useMemo(() => new Map((names.data ?? []).map(s => [s.id, s])), [names.data]);

  if (st === "N") return <><StatsBack /><p className="notice warn">Your role doesn't have access to statistics.</p></>;

  const all = res.data ?? [];
  // Each swimmer's results in date order, so "previous" is their last test on this template.
  const bySwimmer = new Map<string, TestResult[]>();
  for (const r of all) (bySwimmer.get(r.swimmer_id) ?? bySwimmer.set(r.swimmer_id, []).get(r.swimmer_id)!).push(r);
  const prevOf = (r: TestResult) => { const l = bySwimmer.get(r.swimmer_id) ?? []; const i = l.indexOf(r); return i > 0 ? l[i - 1] : null; };
  const change = (r: TestResult) => { const p = prevOf(r); return p && p.score != null && r.score != null ? r.score - p.score : null; };

  return (
    <>
      <StatsBack />
      <div className="page-head row">
        <div><h1><span aria-hidden="true">🎯</span> Test results</h1><p className="dim">Test &amp; Assess archive: progress over time and each test's results</p></div>
        <ClubPicker />
      </div>
      {tpls.isLoading ? <p className="dim">Loading…</p>
        : !tpls.data?.length ? <div className="card"><p>No test results for {club} yet.</p>{!own && <Link to="/tests" className="btn">Go to Test &amp; Assess</Link>}</div>
        : (
          <>
            <div className="field-pair">
              <label>Test set<select value={templateId} onChange={e => { set("template", e.target.value); set("session", ""); }}>
                {tpls.data.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></label>
              {!own && (
                <fieldset className="choice-set" style={{ marginTop: 12 }}>
                  <legend>View</legend>
                  <div className="seg seg-2">
                    <button type="button" className={"seg-btn" + (mode === "swimmer" ? " on" : "")} aria-pressed={mode === "swimmer"} onClick={() => setMode("swimmer")}>Swimmer</button>
                    <button type="button" className={"seg-btn" + (mode === "session" ? " on" : "")} aria-pressed={mode === "session"} onClick={() => setMode("session")}>Test session</button>
                  </div>
                </fieldset>
              )}
            </div>
            {res.isLoading ? <p className="dim">Loading…</p>
              : mode === "swimmer" || own
                ? <SwimmerView all={all} bySwimmer={bySwimmer} nameOf={nameOf} swimmerId={swimmerId} setSwimmerId={setSwimmerId} change={change} lead={lead} />
                : <SessionView sessions={sessions.data ?? []} sessionId={sessionId} setSession={v => set("session", v)} all={all} nameOf={nameOf} change={change} lead={lead} club={club!} />}
          </>
        )}
    </>
  );
}

type NameMap = Map<string, { full_name: string; squad: string | null }>;

function SwimmerView({ all, bySwimmer, nameOf, swimmerId, setSwimmerId, change, lead }: {
  all: TestResult[]; bySwimmer: Map<string, TestResult[]>; nameOf: NameMap; swimmerId: string; setSwimmerId: (v: string) => void;
  change: (r: TestResult) => number | null; lead: boolean;
}) {
  const ids = [...bySwimmer.keys()].sort((a, b) => (nameOf.get(a)?.full_name ?? "").localeCompare(nameOf.get(b)?.full_name ?? ""));
  const sid = swimmerId && bySwimmer.has(swimmerId) ? swimmerId : ids[0];
  if (!sid) return <p className="dim">No results yet.</p>;
  const mine = bySwimmer.get(sid)!;
  const last = mine[mine.length - 1];
  const best = mine.reduce((a, b) => ((b.score ?? -1) > (a.score ?? -1) ? b : a));
  const d = change(last);
  // Current position: everyone's latest result on this template, and within the latest session.
  const latest = [...bySwimmer.values()].map(l => l[l.length - 1]);
  const overall = rankBy(latest, r => r.score).find(r => r.swimmer_id === sid);
  const inSession = rankBy(all.filter(r => r.session_id === last.session_id), r => r.score).find(r => r.swimmer_id === sid);
  const sessionCount = all.filter(r => r.session_id === last.session_id && r.score != null).length;
  const pctFull = last.reps_total ? Math.round((last.reps_done ?? 0) / last.reps_total * 100) : null;

  return (
    <>
      {ids.length > 1 && (
        <label>Swimmer<select value={sid} onChange={e => setSwimmerId(e.target.value)}>
          {ids.map(i => <option key={i} value={i}>{nameOf.get(i)?.full_name ?? "…"}</option>)}
        </select></label>
      )}
      <div className="stat-row" style={{ marginTop: 14 }}>
        <div className="stat"><span className="stat-label">Latest score</span><span className="stat-value">{last.score ?? "–"}</span><span className="stat-note">{fmtDate(last.session_date ?? "")}</span></div>
        <div className="stat"><span className="stat-label">Change since last test</span><span className={"stat-value " + (d == null ? "" : d >= 0 ? "up" : "down")}>{d == null ? "–" : (d >= 0 ? "+" : "") + d}</span><span className="stat-note">{mine.length > 1 ? `vs ${fmtDate(mine[mine.length - 2].session_date ?? "")}` : "First test"}</span></div>
        <div className="stat"><span className="stat-label">Reps completed</span><span className="stat-value">{last.reps_done ?? 0}/{last.reps_total ?? 0}</span><span className="stat-note">{pctFull != null ? `${pctFull}% of the age ${last.level} set` : ""}</span></div>
        <div className="stat"><span className="stat-label">Best</span><span className="stat-value">{best.score ?? "–"}</span><span className="stat-note">{mine.length} test{mine.length === 1 ? "" : "s"}</span></div>
        {lead && overall?.rank != null && <div className="stat lead-stat"><span className="stat-label">Current position</span><span className="stat-value">{overall.rank}<small> of {latest.filter(r => r.score != null).length}</small></span><span className="stat-note">Latest test of every swimmer · head coach view</span></div>}
        {lead && inSession?.rank != null && <div className="stat lead-stat"><span className="stat-label">Place on {fmtDdMm(last.session_date ?? "")}</span><span className="stat-value">{inSession.rank}<small> of {sessionCount}</small></span><span className="stat-note">In that test session</span></div>}
      </div>
      {mine.length > 1 && (
        <section className="card chart-card">
          <h2>Score over time</h2>
          <div style={{ height: 240 }}>
            <Line data={{
              labels: mine.map(r => fmtDdMm(r.session_date ?? "")),
              datasets: [{ label: "Score", data: mine.map(r => r.score), borderColor: C.a, backgroundColor: C.a, tension: 0, pointRadius: 4 }]
            }} options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false, grid: { color: C.grid } }, x: { grid: { display: false } } } }} />
          </div>
        </section>
      )}
      <div className="table-wrap card" style={{ marginTop: 14 }}>
        <table className="data">
          <thead><tr><th>Date</th><th className="num">Age</th><th className="num">Level</th><th className="num">Reps</th><th className="num">Score</th><th className="num">Change</th></tr></thead>
          <tbody>{[...mine].reverse().map(r => { const c = change(r); return (
            <tr key={r.session_id}><td>{fmtDate(r.session_date ?? "")}</td><td className="num">{r.age ?? "–"}</td><td className="num">{r.level ?? "–"}</td>
              <td className="num">{r.reps_done ?? 0}/{r.reps_total ?? 0}</td><td className="num"><strong>{r.score ?? "–"}</strong></td>
              <td className={"num " + (c == null ? "" : c >= 0 ? "up" : "down")}>{c == null ? "–" : (c >= 0 ? "+" : "") + c}</td></tr>
          ); })}</tbody>
        </table>
      </div>
      {mine.some(r => r.score == null) && <p className="hint">A test without a score is missing the swimmer's year of birth.</p>}
    </>
  );
}

function SessionView({ sessions, sessionId, setSession, all, nameOf, change, lead, club }: {
  sessions: TestSession[]; sessionId: string; setSession: (v: string) => void; all: TestResult[]; nameOf: NameMap;
  change: (r: TestResult) => number | null; lead: boolean; club: string;
}) {
  const withResults = sessions.filter(s => all.some(r => r.session_id === s.id));
  const s = withResults.find(x => x.id === sessionId) ?? withResults[0];
  if (!s) return <p className="dim">No test sessions with results yet.</p>;
  const rows = all.filter(r => r.session_id === s.id);
  const ranked = rankBy(rows, r => r.score);
  const ordered = lead ? ranked : [...ranked].sort((a, b) => (nameOf.get(a.swimmer_id)?.full_name ?? "").localeCompare(nameOf.get(b.swimmer_id)?.full_name ?? ""));
  const scored = rows.filter(r => r.score != null);
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.score!, 0) / scored.length) : null;
  const improved = rows.filter(r => (change(r) ?? 0) > 0).length, compared = rows.filter(r => change(r) != null).length;
  const group = s.group_type === "club" ? "Whole club" : s.group_type === "squad" ? (s.squad_name ?? "Squad") : "Chosen swimmers";
  const roundCell = (r: TestResult, key: string) => { const x = r.rounds?.[key]; return x ? `${x.done ?? "-"}/${x.reps}` : "-"; };

  const pdf = () => sessionPdf({
    title: s.template_name, club, date: s.session_date, group, model: s.model, ranked: lead,
    rows: ordered.map(r => ({ rank: r.rank, name: nameOf.get(r.swimmer_id)?.full_name ?? "", squad: nameOf.get(r.swimmer_id)?.squad ?? "", age: r.age ?? null, level: r.level ?? null,
      rounds: s.model.rounds.map(k => roundCell(r, k.key)), score: r.score ?? null, change: change(r) }))
  });

  return (
    <>
      <div className="field-pair">
        <label>Test session<select value={s.id} onChange={e => setSession(e.target.value)}>
          {withResults.map(x => <option key={x.id} value={x.id}>{fmtDate(x.session_date)} · {x.group_type === "squad" ? x.squad_name : x.group_type === "club" ? "Whole club" : "Chosen swimmers"}{x.status === "live" ? " (live)" : ""}</option>)}
        </select></label>
        <div className="pdf-cell"><button className="btn" onClick={pdf}>Export PDF{lead ? " (ranked)" : ""}</button></div>
      </div>
      <div className="stat-row" style={{ marginTop: 14 }}>
        <div className="stat"><span className="stat-label">Swimmers</span><span className="stat-value">{rows.length}</span><span className="stat-note">{group}</span></div>
        <div className="stat"><span className="stat-label">Average score</span><span className="stat-value">{avg ?? "–"}</span><span className="stat-note">{scored.length} scored</span></div>
        <div className="stat"><span className="stat-label">Improved</span><span className="stat-value">{compared ? `${improved}/${compared}` : "–"}</span><span className="stat-note">vs their previous test</span></div>
        <div className="stat"><span className="stat-label">Full sets</span><span className="stat-value">{rows.filter(r => r.reps_total && r.reps_done === r.reps_total).length}</span><span className="stat-note">every rep completed</span></div>
      </div>
      <div className="table-wrap card" style={{ marginTop: 14 }}>
        <table className="data">
          <thead><tr>{lead && <th className="num">Rank</th>}<th>Swimmer</th><th>Squad</th><th className="num">Age</th><th className="num">Level</th>
            {s.model.rounds.map(r => <th key={r.key} className="num">{r.name}</th>)}<th className="num">Score</th><th className="num">Change</th></tr></thead>
          <tbody>{ordered.map(r => { const c = change(r); const n = nameOf.get(r.swimmer_id); return (
            <tr key={r.swimmer_id}>{lead && <td className="num">{r.rank ?? "–"}</td>}<th scope="row">{n?.full_name ?? "…"}</th><td>{n?.squad ?? "–"}</td>
              <td className="num">{r.age ?? "–"}</td><td className="num">{r.level ?? "–"}</td>
              {s.model.rounds.map(k => <td key={k.key} className="num">{roundCell(r, k.key)}</td>)}
              <td className="num"><strong>{r.score ?? "–"}</strong></td>
              <td className={"num " + (c == null ? "" : c >= 0 ? "up" : "down")}>{c == null ? "–" : (c >= 0 ? "+" : "") + c}</td></tr>
          ); })}</tbody>
        </table>
      </div>
      {lead && <p className="hint">Ranks and the ranked PDF are shown to the head coach, club admin and superadmin only.</p>}
    </>
  );
}
