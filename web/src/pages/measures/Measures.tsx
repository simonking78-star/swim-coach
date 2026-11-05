import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { canEdit, sectionLevel } from "../../lib/access";
import {
  KIND_LABEL, STATUS_LABEL, loadDeterminants, loadProtocols, loadSessions, saveProtocol,
  type Better, type Kind, type MmSession, type Status
} from "../../lib/measures";
import { fmtDate } from "../../lib/util";
import { LoadError } from "./StartRun";

// Metrics & Measures (claude/specs/metrics-and-measures.md): fixed, versioned
// test protocols graded by level. Coaches run published protocols on any date;
// only the head coach, club admin or superadmin (Season planner edit) write and
// publish protocols. There is no free-form "Create" any more.

export function useMeasuresAccess() {
  const { access } = useAuth();
  const run = sectionLevel(access, "stopwatch");
  const season = sectionLevel(access, "season");
  const stats = sectionLevel(access, "stats");
  const plans = sectionLevel(access, "plans");
  const mySquads = new Set((access?.squads ?? []) as string[]);
  return {
    canRun: canEdit(run), squadOnly: run === "SE", mySquads,
    canPublish: season === "E",
    canView: run !== "N" || stats !== "N" || plans !== "N",
    ownOnly: stats === "CR" && run === "N"
  };
}

export function MBack({ to = "/measures", label = "Metrics & Measures" }: { to?: string; label?: string }) {
  return <p className="crumb"><Link to={to}>‹ {label}</Link></p>;
}
export function NoAccess() {
  return <><div className="page-head"><h1>Metrics &amp; Measures</h1></div><p className="notice warn">Your role doesn't have access to Metrics &amp; Measures.</p></>;
}
export const statusChip = (s: Status) => <span className={"chip mm-status mm-" + s}>{STATUS_LABEL[s]}</span>;

export function MeasuresHub() {
  const { canRun, canView } = useMeasuresAccess();
  const { club } = useClub();
  const live = useQuery({ queryKey: ["mm_sessions", club, "live"], enabled: !!club && canRun, queryFn: () => loadSessions(club!, { status: "live" }) });
  const recent = useQuery({ queryKey: ["mm_sessions", club, "closed"], enabled: !!club && canRun, queryFn: () => loadSessions(club!, { status: "closed", limit: 6 }) });
  const protocols = useQuery({ queryKey: ["mm_protocols", club], enabled: !!club && canView, queryFn: () => loadProtocols(club!) });
  if (!canView) return <NoAccess />;
  const byId = new Map((protocols.data ?? []).map(p => [p.id, p]));
  const name = (s: MmSession) => { const p = byId.get(s.protocol_id); return p ? `${p.code} · ${p.name}` : "Test"; };

  const tiles = [
    ...(canRun ? [{ to: "run", icon: "▶️", title: "Run a test", sub: "Pick a published protocol and level, on any date, for a squad or chosen swimmers" }] : []),
    { to: "results", icon: "📏", title: "Results", sub: "Each swimmer against their own baseline, with change judged against the test's noise" },
    { to: "library", icon: "📚", title: "Protocol library", sub: "Fixed test protocols, their levels, versions and reliability" },
    { to: "windows", icon: "🗓️", title: "Testing windows", sub: "Planned testing dates, and the fixed T15–T30 day" },
    { to: "work", icon: "🏷️", title: "Work tags", sub: "Confirm what kind of work each session-plan line is, so results can be read against training" }
  ];
  return (
    <>
      <div className="page-head row">
        <div><h1><span aria-hidden="true">📏</span> Metrics &amp; Measures</h1><p className="dim">Fixed test protocols, results against each swimmer's own baseline</p></div>
        <ClubPicker />
      </div>
      <div className="tile-grid">
        {tiles.map(t => (
          <Link key={t.to} to={t.to} className="tile">
            <span className="tile-icon" aria-hidden="true">{t.icon}</span>
            <span className="tile-text"><strong>{t.title}</strong><span className="dim">{t.sub}</span></span>
          </Link>
        ))}
      </div>
      {canRun && (
        <>
          <h2 className="section-title">Live tests</h2>
          {live.isLoading ? <p className="dim">Loading…</p>
            : live.error ? <LoadError e={live.error} what="live tests" />
            : !live.data?.length ? <p className="dim">No test is running.</p>
            : <ul className="feed card">{live.data.map(s => (
                <li key={s.id}><Link to={`session/${s.id}`}><strong>{name(s)}</strong></Link>
                  <div className="feed-meta dim">{fmtDate(s.session_date)} · {s.swimmer_ids.length} swimmers <span className="chip live-chip">Live</span></div></li>
              ))}</ul>}
          {!!recent.data?.length && (
            <>
              <h2 className="section-title">Recently closed</h2>
              <ul className="feed card">{recent.data.map(s => (
                <li key={s.id}><Link to={`session/${s.id}`}>{name(s)}</Link>
                  <div className="feed-meta dim">{fmtDate(s.session_date)} · {s.swimmer_ids.length} swimmers · <Link to={`results?protocol=${s.protocol_id}`}>Results</Link></div></li>
              ))}</ul>
            </>
          )}
        </>
      )}
      <p className="hint">Results from the old Test &amp; Assess templates are kept in <Link to="/statistics/tests">Statistics → Legacy test sets</Link>. They aren't compared with these protocols.</p>
    </>
  );
}

const ORDER: Status[] = ["live", "pilot", "draft", "retired"];

export function Library() {
  const { canView, canPublish } = useMeasuresAccess();
  const { club } = useClub();
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ["mm_protocols", club], enabled: !!club && canView, queryFn: () => loadProtocols(club!) });
  const dets = useQuery({ queryKey: ["mm_determinants"], queryFn: loadDeterminants, staleTime: Infinity });
  if (!canView) return <><MBack /><NoAccess /></>;
  const detName = new Map((dets.data ?? []).map(d => [d.code, d.name]));
  const list = [...(q.data ?? [])].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.code.localeCompare(b.code));
  return (
    <>
      <MBack />
      <div className="page-head row">
        <div><h1>Protocol library</h1><p className="dim">Each protocol is fixed: coaches choose only the level. Changes are made as a new version.</p></div>
        <ClubPicker />
      </div>
      {canPublish && !adding && <button className="btn primary" onClick={() => setAdding(true)}>New protocol</button>}
      {adding && <NewProtocol club={club!} onDone={() => setAdding(false)} />}
      {q.isLoading ? <p className="dim">Loading…</p>
        : q.error ? <p className="msg error">{(q.error as Error).message}</p>
        : !list.length ? <p className="dim">No protocols for {club} yet.</p>
        : <ul className="tpl-list">{list.map(p => (
            <li key={p.id} className={"card tpl-card" + (p.status === "retired" ? " off" : "")}>
              <div className="tpl-main">
                <strong>{p.code}</strong> {p.name} {statusChip(p.status)}
                <p className="dim">{detName.get(p.determinant) ?? p.determinant} · {KIND_LABEL[p.kind]} · {p.better === "lower" ? "lower is better" : "higher is better"}{p.fixed_date_only ? " · fixed date only" : ""}</p>
                {p.description && <p className="tpl-desc">{p.description}</p>}
              </div>
              <div className="tpl-actions"><Link className="btn" to={`/measures/protocol/${p.id}`}>Open</Link></div>
            </li>
          ))}</ul>}
      <p className="hint"><strong>Draft</strong> is being written and can't be run. <strong>Pilot</strong> can be run; its results are kept but always marked "compare with caution". <strong>Live</strong> is part of the battery.</p>
    </>
  );
}

function NewProtocol({ club, onDone }: { club: string; onDone: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const dets = useQuery({ queryKey: ["mm_determinants"], queryFn: loadDeterminants, staleTime: Infinity });
  const [f, setF] = useState({ code: "", name: "", determinant: "turn", kind: "timed" as Kind, better: "lower" as Better, description: "", fixed_date_only: false });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null);
    if (!/^[A-Z0-9]{2,6}(-[A-Z0-9]{1,6})?$/.test(f.code.trim().toUpperCase())) { setErr("Code: letters and numbers, e.g. KCK-FL or THR-01."); return; }
    if (!f.name.trim()) { setErr("Give it a name."); return; }
    setBusy(true);
    try {
      const id = await saveProtocol(club, f);
      await qc.invalidateQueries({ queryKey: ["mm_protocols"] });
      onDone(); navigate(`/measures/protocol/${id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <section className="card">
      <h2>New protocol</h2>
      <p className="hint">Only add a test that has been through the selection method (valid, reliable, worth the pool time). It starts as a draft.</p>
      <div className="field-pair">
        <label>Code<input value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="KCK-FL" maxLength={13} /></label>
        <label>Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="25 m dolphin kick, streamline" /></label>
      </div>
      <div className="field-pair">
        <label>Measures<select value={f.determinant} onChange={e => setF({ ...f, determinant: e.target.value })}>
          {(dets.data ?? []).map(d => <option key={d.code} value={d.code}>{d.name}</option>)}</select></label>
        <label>Kind<select value={f.kind} onChange={e => { const k = e.target.value as Kind; setF({ ...f, kind: k, better: k === "timed" ? "lower" : "higher" }); }}>
          {(Object.keys(KIND_LABEL) as Kind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
        <label>Better is<select value={f.better} onChange={e => setF({ ...f, better: e.target.value as Better })}>
          <option value="lower">Lower (e.g. time)</option><option value="higher">Higher (e.g. reps, points)</option></select></label>
      </div>
      <label>What it is for<textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
      <label className="inline check-inline"><input type="checkbox" checked={f.fixed_date_only} onChange={e => setF({ ...f, fixed_date_only: e.target.checked })} /> Fixed date only (e.g. the T15–T30 day — missed it means missed for the year)</label>
      {err && <p className="msg error">{err}</p>}
      <div className="done-actions"><button className="btn" onClick={onDone}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Create draft</button></div>
    </section>
  );
}
