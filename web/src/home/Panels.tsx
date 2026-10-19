import { useEffect, useState } from "react";
import { fmtCount, fmtDate, useHomeStats, useSquadFeedback, type HomeStats } from "../lib/stats";
import { useClub } from "../club/ClubProvider";

function PanelShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card panel">
      <header className="panel-head">
        <h2>{title}</h2>
        {subtitle && <span className="dim">{subtitle}</span>}
      </header>
      {children}
    </section>
  );
}

function StatusLine({ loading, error }: { loading: boolean; error: unknown }) {
  if (loading) return <p className="dim">Loading…</p>;
  if (error) return <p className="msg error">Couldn't load these figures. {(error as Error).message}</p>;
  return null;
}

function StatTile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{fmtCount(value)}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

/** Superadmin / club admin: totals across everything the user can see. */
export function SystemPanel() {
  const q = useHomeStats(null);
  const s = q.data;
  return (
    <PanelShell title="System totals" subtitle="All clubs you have access to">
      <StatusLine loading={q.isLoading} error={q.error} />
      {s && (
        <div className="stat-row">
          <StatTile label="Clubs" value={s.clubs} />
          <StatTile label="Swimmers" value={s.swimmers} note="active" />
          <StatTile label="Personal bests" value={s.pbs} note="on record" />
          <StatTile label="Feedback posted" value={s.feedback} note={`${fmtCount(s.feedback_30d)} in the last 30 days`} />
        </div>
      )}
    </PanelShell>
  );
}

/** Coaches: swimmers and feedback per squad for the selected club. */
export function SquadsPanel() {
  const { club } = useClub();
  const q = useHomeStats(club);
  const squads = q.data?.squads ?? [];
  return (
    <PanelShell title="Squads at a glance">
      <StatusLine loading={q.isLoading} error={q.error} />
      {q.data && squads.length === 0 && <p className="dim">No squads you can see in this club.</p>}
      {squads.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">Swimmers and feedback posts per squad</caption>
            <thead>
              <tr>
                <th scope="col">Squad</th>
                <th scope="col" className="num">Swimmers</th>
                <th scope="col" className="num">Swimmer f/b</th>
                <th scope="col" className="num">Squad f/b</th>
                <th scope="col" className="num"><abbr title="Feedback in the last 30 days">30 days</abbr></th>
              </tr>
            </thead>
            <tbody>
              {squads.map(sq => (
                <tr key={sq.id}>
                  <th scope="row">{sq.name}</th>
                  <td className="num">{fmtCount(sq.swimmers)}</td>
                  <td className="num">{fmtCount(sq.swimmer_feedback)}</td>
                  <td className="num">{fmtCount(sq.squad_feedback)}</td>
                  <td className="num">{fmtCount(sq.swimmer_feedback_30d + sq.squad_feedback_30d)}</td>
                </tr>
              ))}
            </tbody>
            {squads.length > 1 && <Totals squads={squads} />}
          </table>
        </div>
      )}
    </PanelShell>
  );
}

function Totals({ squads }: { squads: HomeStats["squads"] }) {
  const sum = (f: (s: HomeStats["squads"][number]) => number) => squads.reduce((n, s) => n + f(s), 0);
  return (
    <tfoot>
      <tr>
        <th scope="row">All squads</th>
        <td className="num">{fmtCount(sum(s => s.swimmers))}</td>
        <td className="num">{fmtCount(sum(s => s.swimmer_feedback))}</td>
        <td className="num">{fmtCount(sum(s => s.squad_feedback))}</td>
        <td className="num">{fmtCount(sum(s => s.swimmer_feedback_30d + s.squad_feedback_30d))}</td>
      </tr>
    </tfoot>
  );
}

/** Latest squad feedback from any coach, for one squad at a time. */
export function SquadFeedbackPanel() {
  const { club } = useClub();
  const stats = useHomeStats(club);
  const squads = stats.data?.squads ?? [];
  const [squadId, setSquadId] = useState<string | null>(null);

  useEffect(() => {
    if (squads.length && !squads.some(s => s.id === squadId)) setSquadId(squads[0].id);
  }, [squads, squadId]);

  const fb = useSquadFeedback(squadId);

  return (
    <PanelShell title="Squad feedback" subtitle="From the head coach and other coaches">
      <StatusLine loading={stats.isLoading} error={stats.error} />
      {stats.data && squads.length === 0 && <p className="dim">No squads you can see in this club.</p>}
      {squads.length > 0 && (
        <>
          <label className="inline">
            Squad
            <select value={squadId ?? ""} onChange={e => setSquadId(e.target.value)}>
              {squads.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <StatusLine loading={fb.isLoading} error={fb.error} />
          {fb.data && fb.data.length === 0 && <p className="dim">No squad feedback posted yet.</p>}
          {fb.data && fb.data.length > 0 && (
            <ul className="feed">
              {fb.data.map(f => (
                <li key={f.id}>
                  <div className="feed-meta">
                    <strong>{f.coach || "Coach"}</strong>
                    <span className="dim">{fmtDate(f.session_date)}</span>
                    <span className="chip">{f.category}</span>
                  </div>
                  <p>{f.observation}</p>
                  {f.remedial_action && <p className="dim"><em>Action:</em> {f.remedial_action}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PanelShell>
  );
}

export const PANEL_COMPONENTS = {
  system: SystemPanel,
  squads: SquadsPanel,
  squadFeedback: SquadFeedbackPanel
} as const;
