import { Suspense, lazy, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { canEdit, sectionLevel } from "../lib/access";
import { loadFbSwimmers } from "../lib/feedback";
import { parseTimeStr, type ResultRow } from "../lib/results";
import {
  deleteStopwatchTime, loadAttendanceMonths, monthName, loadFeedbackArchive, loadReportData, loadResults, loadStopwatchTimes, loadSwimmer, swTimeLabel
} from "../lib/swimmers";
import { shareSwimmerPdf } from "../lib/swimmerPdf";
import { fmtDate } from "../lib/util";
import { fmtSessions } from "../lib/attendance";
import { EntryBody } from "../components/feedbackParts";

const EventChart = lazy(() => import("../components/EventChart"));

export function SwimmerProfile() {
  const { id } = useParams();
  const { access } = useAuth();
  const { club } = useClub();
  const navigate = useNavigate();
  const [event, setEvent] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ busy: boolean; msg?: string }>({ busy: false });

  const swimmer = useQuery({ queryKey: ["swimmer", id], enabled: !!id, queryFn: () => loadSwimmer(id!) });
  const att = useQuery({ queryKey: ["swp_att", id], enabled: !!id, queryFn: () => loadAttendanceMonths(id!) });
  const results = useQuery({ queryKey: ["swp_results", id], enabled: !!id, queryFn: () => loadResults(id!) });
  const sw = swimmer.data;

  const makePdf = async () => {
    if (!sw) return;
    setPdf({ busy: true });
    try { await shareSwimmerPdf(sw, club ?? "", await loadReportData(sw.id)); setPdf({ busy: false }); }
    catch (e) { setPdf({ busy: false, msg: "Couldn't create the PDF — " + (e as Error).message }); }
  };

  if (sectionLevel(access, "roster") === "N") {
    return <><div className="page-head"><h1>Swimmer</h1></div><p className="notice warn">Your role doesn't have access to swimmer profiles.</p></>;
  }

  return (
    <>
      <p className="crumb"><Link to="/swimmers">‹ Swimmers</Link></p>
      <section className="card">
        <SwitchSwimmer currentId={id} onPick={sid => { setEvent(null); navigate(`/swimmers/${sid}`); }} />
        {swimmer.isLoading && <p className="dim">Loading…</p>}
        {swimmer.error && <p className="msg error">Couldn't load this swimmer.</p>}
        {swimmer.data === null && <p className="notice warn">This swimmer isn't on record, or your role can't see them.</p>}
        {sw && (
          <>
            <div className="profile-head">
              <div>
                <h1 className="profile-name">{sw.full_name}</h1>
                <p className="dim">{[sw.squad, sw.age != null ? `Age ${sw.age}` : null, sw.date_of_birth ? `Born ${sw.date_of_birth.slice(0, 4)}` : null].filter(Boolean).join(" · ")}</p>
              </div>
              <button type="button" className="btn small" onClick={makePdf} disabled={pdf.busy}>{pdf.busy ? "Building PDF…" : "PDF report"}</button>
            </div>
            {pdf.msg && <p className="msg error" role="alert">{pdf.msg}</p>}
            <p className="hint">The PDF covers attendance, personal bests and feedback.</p>
          </>
        )}
      </section>

      {sw && (
        <div className="profile-grid">
          <section className="card">
            <h2 className="card-title">Attendance</h2>
            {att.error && <p className="msg error">Couldn't load attendance.</p>}
            {!att.data && !att.error && <p className="dim">Loading…</p>}
            {att.data && (
              <>
                <div className="stat-row">
                  <div className="stat"><span className="stat-label">Hours trained · {monthName(att.data[0].month)}</span><span className="stat-value">{fmtSessions(att.data[0].hours)}</span><span className="stat-note">{fmtSessions(att.data[1].hours)} last month</span></div>
                  <div className="stat"><span className="stat-label">Sessions attended · {monthName(att.data[0].month)}</span><span className="stat-value">{fmtSessions(att.data[0].sessions)}</span><span className="stat-note">{att.data[0].pct != null ? `${att.data[0].pct}% of ${att.data[0].counted}` : "none marked"}</span></div>
                </div>
                <div className="table-wrap">
                  <table className="data">
                    <caption className="sr-only">Attendance by month</caption>
                    <thead><tr><th scope="col">Month</th><th scope="col" className="num">Hours</th><th scope="col" className="num">Sessions</th><th scope="col" className="num">%</th></tr></thead>
                    <tbody>
                      {att.data.map(m => (
                        <tr key={m.month}>
                          <th scope="row">{monthName(m.month)}</th>
                          <td className="num">{fmtSessions(m.hours)}</td>
                          <td className="num">{fmtSessions(m.sessions)}{m.counted ? <span className="cell-sub">of {m.counted}</span> : null}</td>
                          <td className="num">{m.pct == null ? "–" : `${m.pct}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <p className="hint">Hours: In = the whole session, Partial = the minutes attended. Sessions: a partial counts as the part attended. Excused isn't counted.</p>
          </section>

          <section className="card">
            {event
              ? <EventDetail event={event} rows={results.data ?? []} onBack={() => setEvent(null)} />
              : <PbList rows={results.data ?? []} loading={results.isLoading} error={!!results.error} onOpen={setEvent} />}
          </section>

          <StopwatchCard swimmerId={sw.id} canDelete={canEdit(sectionLevel(access, "stopwatch"))} />
          <FeedbackArchive swimmerId={sw.id} />
        </div>
      )}
    </>
  );
}

function SwitchSwimmer({ currentId, onPick }: { currentId?: string; onPick: (id: string) => void }) {
  const { club } = useClub();
  const [q, setQ] = useState("");
  const list = useQuery({ queryKey: ["fb_swimmers", club, ""], enabled: !!club, queryFn: () => loadFbSwimmers(club!, null) });
  const t = q.trim().toLowerCase();
  const hits = t ? (list.data ?? []).filter(s => s.id !== currentId && s.full_name.toLowerCase().includes(t)).slice(0, 12) : [];
  return (
    <div className="search-box switch">
      <label htmlFor="swp-search" className="sr-only">Find another swimmer</label>
      <input id="swp-search" type="search" placeholder="Find another swimmer…" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
      {t && (
        <ul className="search-results">
          {hits.length === 0 && <li className="dim">No matches</li>}
          {hits.map(s => <li key={s.id}><button type="button" onClick={() => { setQ(""); onPick(s.id); }}><span>{s.full_name}</span>{s.squad && <span className="chip">{s.squad}</span>}</button></li>)}
        </ul>
      )}
    </div>
  );
}

function PbList({ rows, loading, error, onOpen }: { rows: ResultRow[]; loading: boolean; error: boolean; onOpen: (event: string) => void }) {
  // Current PBs = rows already flagged is_pb (the same flag the rest of the app uses).
  const pbs = rows.filter(r => r.is_pb).sort((a, b) => a.event.localeCompare(b.event) || a.course.localeCompare(b.course));
  return (
    <>
      <h2 className="card-title">Personal bests <span className="dim">(tap an event for its history)</span></h2>
      {loading && <p className="dim">Loading…</p>}
      {error && <p className="msg error">Couldn't load results.</p>}
      {!loading && !error && pbs.length === 0 && <p className="dim">No personal bests on record.</p>}
      <ul className="pb-list">
        {pbs.map(r => (
          <li key={r.event + r.course}>
            <button type="button" onClick={() => onOpen(r.event)}>
              <span className="pb-event">{r.event}</span>
              <span className={"course " + r.course}>{r.course}</span>
              <span className="pb-time">{r.swim_time_display || "—"}</span>
              <span className="pb-date">{fmtDate(r.meet_date)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function EventDetail({ event, rows, onBack }: { event: string; rows: ResultRow[]; onBack: () => void }) {
  const swims = useMemo(() => rows.filter(r => r.event === event && parseTimeStr(r.swim_time_display) != null)
    .sort((a, b) => a.meet_date.localeCompare(b.meet_date)), [rows, event]);
  return (
    <>
      <button type="button" className="link-btn" onClick={onBack}>‹ Back to personal bests</button>
      <h2 className="card-title">{event}</h2>
      <Suspense fallback={<p className="dim">Loading chart…</p>}><EventChart rows={swims} /></Suspense>
      <ul className="swim-list">
        {swims.length === 0 && <li className="dim">No history for this event.</li>}
        {swims.slice().reverse().map((r, i) => (
          <li key={i}>
            <span className="fb-date">{fmtDate(r.meet_date)}</span>
            <span className={"course " + r.course}>{r.course}</span>
            {r.is_pb && <span className="pb-tag">PB</span>}
            <strong>{r.swim_time_display}</strong>
            {r.meet_name && <span className="dim">{r.meet_name}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

function StopwatchCard({ swimmerId, canDelete }: { swimmerId: string; canDelete: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["stopwatch_times", swimmerId], queryFn: () => loadStopwatchTimes(swimmerId) });
  const [confirm, setConfirm] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const del = async (id: string) => {
    setErr(null);
    try { await deleteStopwatchTime(id); setConfirm(null); qc.invalidateQueries({ queryKey: ["stopwatch_times", swimmerId] }); }
    catch (e) { setErr("Couldn't delete: " + (e as Error).message); }
  };
  return (
    <section className="card">
      <h2 className="card-title">Stopwatch times <span className="dim">(training)</span></h2>
      {q.isLoading && <p className="dim">Loading…</p>}
      {q.error && <p className="msg error">Couldn't load stopwatch times.</p>}
      {q.data && q.data.length === 0 && <p className="dim">No stopwatch times yet.</p>}
      {err && <p className="msg error" role="alert">{err}</p>}
      <ul className="swt-list">
        {q.data?.map(r => (
          <li key={r.id}>
            <div>
              <strong>{r.distance_m}m {r.stroke}</strong>
              <span className="dim">{[fmtDate(r.session_date), r.course, swTimeLabel(r)].filter(Boolean).join(" · ")}{r.note ? ` — ${r.note}` : ""}</span>
            </div>
            <div className="swt-right">
              <span className="swt-time">{r.time_display}</span>
              {canDelete && (confirm === r.id
                ? <span className="swt-confirm"><button type="button" className="btn small danger" onClick={() => del(r.id)}>Delete</button><button type="button" className="btn small" onClick={() => setConfirm(null)}>Keep</button></span>
                : <button type="button" className="link-btn swt-del" onClick={() => setConfirm(r.id)}>delete</button>)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FeedbackArchive({ swimmerId }: { swimmerId: string }) {
  const q = useQuery({ queryKey: ["fb_history", swimmerId], queryFn: () => loadFeedbackArchive(swimmerId) });
  return (
    <section className="card">
      <div className="card-head top">
        <h2 className="card-title">Feedback archive {q.data && q.data.length > 0 && <span className="dim">({q.data.length})</span>}</h2>
        <Link className="btn small" to={`/feedback?swimmer=${swimmerId}`}>Open in Feedback</Link>
      </div>
      {q.isLoading && <p className="dim">Loading…</p>}
      {q.error && <p className="msg error">Couldn't load feedback.</p>}
      {q.data && q.data.length === 0 && <p className="dim">No feedback on record.</p>}
      {q.data?.map(r => <div key={r.id} className="archive-item"><EntryBody e={r} /></div>)}
    </section>
  );
}
