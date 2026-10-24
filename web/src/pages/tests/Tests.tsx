import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { canEdit, sectionLevel } from "../../lib/access";
import { levelOptions, loadSessions, loadTemplates, mmss, roundLabel, setTemplateActive, totals, valuesFor, type Template, type TestSession } from "../../lib/tests";
import { fmtDate } from "../../lib/util";

// Test & Assess: Create a test set template, Select one to run with a group of
// swimmers, or Edit an existing template. Live tests can be resumed from here;
// archived results are viewed in Statistics → Test results.

export function useTestAccess() {
  const { access } = useAuth();
  const run = sectionLevel(access, "stopwatch");   // who runs tests poolside (incl. helpers)
  const plans = sectionLevel(access, "plans");     // who writes templates
  // Squad-level runners (helpers) can only run a test for one of their own squads.
  const mySquads = new Set((access?.squads ?? []) as string[]);
  return { canRun: canEdit(run), squadOnly: run === "SE", mySquads, canBuild: canEdit(plans), any: run !== "N" || plans !== "N" };
}

export function TestsBack({ to = "/tests", label = "Test & Assess" }: { to?: string; label?: string }) {
  return <p className="crumb"><Link to={to}>‹ {label}</Link></p>;
}

export function NoTestAccess() {
  return <><div className="page-head"><h1>Test &amp; Assess</h1></div><p className="notice warn">Your role doesn't have access to Test &amp; Assess.</p></>;
}

const groupLabel = (s: TestSession) =>
  s.group_type === "club" ? "Whole club" : s.group_type === "squad" ? (s.squad_name || "Squad") : `${s.swimmer_ids.length} selected swimmer${s.swimmer_ids.length === 1 ? "" : "s"}`;

export function TestsHub() {
  const { canRun, canBuild, any } = useTestAccess();
  const { club } = useClub();
  const live = useQuery({ queryKey: ["test_sessions", club, "live"], enabled: !!club && canRun, queryFn: () => loadSessions(club!, { status: "live" }) });
  const recent = useQuery({ queryKey: ["test_sessions", club, "closed"], enabled: !!club && canRun, queryFn: () => loadSessions(club!, { status: "closed", limit: 5 }) });
  if (!any) return <NoTestAccess />;

  const tiles = [
    ...(canBuild ? [{ to: "create", icon: "➕", title: "Create", sub: "Build a new test set template: rounds of distance, interval and repetitions" }] : []),
    ...(canRun ? [{ to: "select", icon: "▶️", title: "Select", sub: "Pick a template and run it with the whole club, a squad or chosen swimmers" }] : []),
    ...(canBuild ? [{ to: "edit", icon: "✏️", title: "Edit", sub: "Change or switch off an existing template" }] : [])
  ];
  return (
    <>
      <div className="page-head row">
        <div><h1><span aria-hidden="true">🎯</span> Test &amp; Assess</h1><p className="dim">Test set templates, live tests and the results archive</p></div>
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
            : !live.data?.length ? <p className="dim">No test is running. Use Select to start one.</p>
            : <ul className="feed card">{live.data.map(s => (
                <li key={s.id}><Link to={`run/${s.id}`}><strong>{s.template_name}</strong></Link>
                  <div className="feed-meta dim">{fmtDate(s.session_date)} · {groupLabel(s)} <span className="chip live-chip">Live</span></div></li>
              ))}</ul>}
          {!!recent.data?.length && (
            <>
              <h2 className="section-title">Recently closed</h2>
              <ul className="feed card">{recent.data.map(s => (
                <li key={s.id}><Link to={`run/${s.id}`}>{s.template_name}</Link>
                  <div className="feed-meta dim">{fmtDate(s.session_date)} · {groupLabel(s)} · <Link to={`/statistics/tests?template=${s.template_id}&session=${s.id}`}>Results</Link></div></li>
              ))}</ul>
            </>
          )}
        </>
      )}
    </>
  );
}

/** A one-line summary of a template for lists. */
export function TemplateSummary({ t }: { t: Template }) {
  const m = t.model, lv = levelOptions(m);
  const first = lv[0], last = lv[lv.length - 1];
  const tf = totals(m, first), tl = totals(m, last);
  return (
    <span className="dim tpl-sum">
      {m.rounds.length} round{m.rounds.length === 1 ? "" : "s"} · {m.ageBanded ? `ages ${m.minAge}–${m.maxAge}` : `level ${m.fixedLevel}`} ·{" "}
      {m.ageBanded ? `${tf.dist.toLocaleString("en-GB")}–${tl.dist.toLocaleString("en-GB")} m` : `${tf.dist.toLocaleString("en-GB")} m`}
      {tf.secs != null && <> · {m.ageBanded ? `${mmss(tf.secs)}–${mmss(tl.secs)}` : mmss(tf.secs)}</>}
      <br />{m.rounds.map(r => `${r.name}: ${roundLabel(r, valuesFor(m, r, first))}`).join(" · ")}{m.ageBanded ? ` (age ${first})` : ""}
    </span>
  );
}

/** Select (run) or Edit: the list of templates. */
export function TemplatePick({ mode }: { mode: "select" | "edit" }) {
  const { canRun, canBuild } = useTestAccess();
  const { club } = useClub();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showOff, setShowOff] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["test_templates", club, mode === "edit"], enabled: !!club, queryFn: () => loadTemplates(club!, mode === "edit") });
  if (mode === "select" ? !canRun : !canBuild) return <><TestsBack /><NoTestAccess /></>;

  const list = (q.data ?? []).filter(t => t.active || showOff);
  const off = (q.data ?? []).filter(t => !t.active).length;
  const toggle = async (t: Template) => {
    setBusy(t.id); setErr(null);
    try { await setTemplateActive(t.id, !t.active); await qc.invalidateQueries({ queryKey: ["test_templates"] }); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <>
      <TestsBack />
      <div className="page-head row">
        <div><h1>{mode === "select" ? "Select a test set" : "Edit a test set"}</h1>
          <p className="dim">{mode === "select" ? "Choose the template to run, then the swimmers it is for." : "Templates for this club. Switching one off hides it from Select; its results stay in the archive."}</p></div>
        <ClubPicker />
      </div>
      {err && <p className="msg error">{err}</p>}
      {q.isLoading ? <p className="dim">Loading…</p>
        : q.error ? <p className="msg error">Couldn't load templates: {(q.error as Error).message}</p>
        : !list.length ? (
          <div className="card"><p>No test set templates for {club} yet.</p>{canBuild && <Link className="btn primary" to="/tests/create">Create a template</Link>}</div>
        ) : (
          <ul className="tpl-list">
            {list.map(t => (
              <li key={t.id} className={"card tpl-card" + (t.active ? "" : " off")}>
                <div className="tpl-main">
                  <strong>{t.name}</strong>{!t.active && <span className="chip">Switched off</span>}
                  {t.description && <p className="tpl-desc">{t.description}</p>}
                  <TemplateSummary t={t} />
                </div>
                <div className="tpl-actions">
                  {mode === "select"
                    ? <button className="btn primary" onClick={() => navigate(`/tests/start/${t.id}`)}>Use this test</button>
                    : <>
                        <Link className="btn" to={`/tests/templates/${t.id}`}>Edit</Link>
                        <button className="btn" disabled={busy === t.id} onClick={() => toggle(t)}>{t.active ? "Switch off" : "Switch on"}</button>
                      </>}
                </div>
              </li>
            ))}
          </ul>
        )}
      {mode === "edit" && off > 0 && (
        <label className="inline check-inline"><input type="checkbox" checked={showOff} onChange={e => setShowOff(e.target.checked)} /> Show {off} switched-off template{off === 1 ? "" : "s"}</label>
      )}
    </>
  );
}
