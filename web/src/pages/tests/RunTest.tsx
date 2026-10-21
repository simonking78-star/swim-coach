import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCoachName, logEvent } from "../../lib/util";
import { useAuth } from "../../auth/AuthProvider";
import {
  clockable, defaultLevel, levelOptions, loadClubSwimmers, loadSession, loadSessionResults, loadSwimmersByIds, mmss, phaseAt,
  removeResult, repsDone, roundLabel, saveResult, score, swimAge, updateSession, valuesFor, yobOf,
  type RoundDone, type TestModel, type TestResult, type TestSession, type TestSwimmer
} from "../../lib/tests";
import { fmtDate } from "../../lib/util";
import { NoTestAccess, TestsBack, useTestAccess } from "./Tests";
import { YobPrompt } from "./StartTest";

// The live test. A shared pace clock (started by any coach, seen by all) shows
// each swimmer's current rep for the set they swim. "Stopped now" records the
// rep they stopped on as incomplete; + / − and Full adjust any round. Every
// change saves straight away (queued if offline). Closing the test archives it.

/** Two taps to confirm, without a browser dialog. */
function ConfirmButton({ label, confirm, onConfirm, className = "btn", disabled }: { label: string; confirm: string; onConfirm: () => void; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3500); return () => clearTimeout(t); }, [armed]);
  return <button type="button" className={className + (armed ? " armed" : "")} disabled={disabled} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>{armed ? confirm : label}</button>;
}

const blankRounds = (m: TestModel, level: number | null): Record<string, RoundDone> =>
  Object.fromEntries(m.rounds.map(r => [r.key, { done: null, reps: valuesFor(m, r, level).reps }]));

export function RunTest() {
  const { id } = useParams();
  const { canRun } = useTestAccess();
  const { session: auth } = useAuth();
  const coach = useCoachName();
  const qc = useQueryClient();

  const ses = useQuery({ queryKey: ["test_session", id], enabled: !!id, queryFn: () => loadSession(id!), refetchInterval: 15000 });
  const s = ses.data;
  const live = s?.status === "live";
  const swimmersQ = useQuery({ queryKey: ["test_session_swimmers", id, s?.swimmer_ids.join(",")], enabled: !!s, queryFn: () => loadSwimmersByIds(s!.swimmer_ids) });
  const resultsQ = useQuery({ queryKey: ["test_results", id], enabled: !!s, queryFn: () => loadSessionResults(id!), refetchInterval: live ? 10000 : false });

  // Local copy of results so taps show instantly; server rows replace a swimmer's
  // local row unless it was changed here in the last few seconds.
  const [local, setLocal] = useState<Record<string, TestResult>>({});
  const touched = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!resultsQ.data) return;
    setLocal(prev => {
      const next = { ...prev };
      const now = Date.now();
      for (const r of resultsQ.data) if (!touched.current[r.swimmer_id] || now - touched.current[r.swimmer_id] > 6000) next[r.swimmer_id] = r;
      return next;
    });
  }, [resultsQ.data]);

  const [yobs, setYobs] = useState<Record<string, number>>({});
  const [saveState, setSaveState] = useState<{ text: string; error?: boolean } | null>(null);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState(Date.now());
  const running = !!s?.clock_started_at && live;
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [running]);

  // Keep the screen awake while the clock runs.
  useEffect(() => {
    if (!running || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then(l => { lock = l; }).catch(() => { /* not allowed */ });
    return () => { lock?.release().catch(() => {}); };
  }, [running]);

  const swimmers = useMemo(() => (swimmersQ.data ?? []).map(sw => ({ ...sw, year_of_birth: yobs[sw.id] ?? sw.year_of_birth })), [swimmersQ.data, yobs]);

  if (!canRun) return <><TestsBack /><NoTestAccess /></>;
  if (ses.isLoading) return <><TestsBack /><p className="dim">Loading…</p></>;
  if (!s) return <><TestsBack /><p className="msg error">That test wasn't found.</p></>;
  const m = s.model;
  const elapsed = s.clock_started_at ? Math.max(0, (now - Date.parse(s.clock_started_at)) / 1000) : 0;
  const canClock = clockable(m);

  const rowFor = (sw: TestSwimmer): TestResult => {
    const age = swimAge(yobOf(sw), s.session_date);
    const existing = local[sw.id];
    if (existing) return { ...existing, year_of_birth: existing.year_of_birth ?? yobOf(sw), level: existing.level ?? defaultLevel(m, age) };
    const level = defaultLevel(m, age);
    return { session_id: s.id, swimmer_id: sw.id, year_of_birth: yobOf(sw), level, rounds: blankRounds(m, level) };
  };

  const commit = async (row: TestResult) => {
    touched.current[row.swimmer_id] = Date.now();
    const age = swimAge(row.year_of_birth, s.session_date);
    const done = repsDone(row.rounds);
    const next = { ...row, age, reps_done: done, score: score(age, row.level, done), recorded_by: coach };
    setLocal(p => ({ ...p, [row.swimmer_id]: next }));
    setSaveState({ text: "Saving…" });
    try {
      const r = await saveResult(next);
      setSaveState({ text: r === "queued" ? "Offline — saved on this device, will sync" : "Saved" });
    } catch (e) {
      setSaveState({ text: "Couldn't save: " + (e as Error).message, error: true });
    }
  };

  const setDone = (sw: TestSwimmer, key: string, done: number | null) => {
    const row = rowFor(sw);
    const v = valuesFor(m, m.rounds.find(r => r.key === key)!, row.level);
    const clamped = done == null ? null : Math.max(0, Math.min(v.reps, done));
    commit({ ...row, rounds: { ...row.rounds, [key]: { done: clamped, reps: v.reps } } });
  };
  const setLevel = (sw: TestSwimmer, level: number) => {
    const row = rowFor(sw);
    // Rep counts follow the new level; anything recorded is kept within the new count.
    const rounds: Record<string, RoundDone> = {};
    for (const r of m.rounds) { const reps = valuesFor(m, r, level).reps; const d = row.rounds[r.key]?.done; rounds[r.key] = { reps, done: d == null ? null : Math.min(d, reps) }; }
    commit({ ...row, level, rounds });
  };

  const startClock = async () => { await updateSession(s.id, { clock_started_at: new Date().toISOString() }); qc.invalidateQueries({ queryKey: ["test_session", id] }); };
  const resetClock = async () => { await updateSession(s.id, { clock_started_at: null }); qc.invalidateQueries({ queryKey: ["test_session", id] }); };
  const close = async () => {
    await updateSession(s.id, { status: "closed", closed_at: new Date().toISOString() });
    logEvent(auth?.user.id, s.club, "core_task", "test_close", { session: s.id });
    qc.invalidateQueries({ queryKey: ["test_session", id] }); qc.invalidateQueries({ queryKey: ["test_sessions"] });
  };
  const reopen = async () => { await updateSession(s.id, { status: "live", closed_at: null }); qc.invalidateQueries({ queryKey: ["test_session", id] }); qc.invalidateQueries({ queryKey: ["test_sessions"] }); };
  const fillFull = async () => {
    for (const sw of swimmers) {
      const row = rowFor(sw);
      if (!m.rounds.some(r => row.rounds[r.key]?.done == null)) continue;
      const rounds = { ...row.rounds };
      for (const r of m.rounds) { const reps = valuesFor(m, r, row.level).reps; if (rounds[r.key]?.done == null) rounds[r.key] = { done: reps, reps }; }
      await commit({ ...row, rounds });
    }
  };
  const removeSwimmer = async (sid: string) => {
    try {
      if (local[sid]?.id || resultsQ.data?.some(r => r.swimmer_id === sid)) await removeResult(s.id, sid);
      await updateSession(s.id, { swimmer_ids: s.swimmer_ids.filter(x => x !== sid) });
      setLocal(p => { const n = { ...p }; delete n[sid]; return n; });
      qc.invalidateQueries({ queryKey: ["test_session", id] });
    } catch (e) { setSaveState({ text: "Couldn't take the swimmer off: " + (e as Error).message, error: true }); }
  };
  const addSwimmers = async (ids: string[]) => {
    await updateSession(s.id, { swimmer_ids: [...new Set([...s.swimmer_ids, ...ids])] });
    setAdding(false);
    qc.invalidateQueries({ queryKey: ["test_session", id] });
  };

  const unrecorded = swimmers.filter(sw => m.rounds.some(r => rowFor(sw).rounds[r.key]?.done == null)).length;
  const t = filter.trim().toLowerCase();
  const shown = swimmers.filter(sw => !t || sw.full_name.toLowerCase().includes(t));

  return (
    <>
      <TestsBack />
      <div className="page-head row">
        <div><h1>{s.template_name}</h1>
          <p className="dim">{fmtDate(s.session_date)} · {s.group_type === "club" ? "Whole club" : s.group_type === "squad" ? s.squad_name : "Chosen swimmers"} · {swimmers.length} swimmer{swimmers.length === 1 ? "" : "s"}</p></div>
        <span className={"chip " + (live ? "live-chip" : "")}>{live ? "Live" : "Closed"}</span>
      </div>

      {live && (
        <div className="clock-bar">
          <div><div className="clock-label">Pace clock</div><div className="clock-face" aria-live="off">{s.clock_started_at ? mmss(Math.floor(elapsed)) : "--:--"}</div></div>
          {canClock
            ? (s.clock_started_at
                ? <ConfirmButton className="btn" label="Reset clock" confirm="Tap again to reset" onConfirm={resetClock} />
                : <button className="btn primary-light" disabled={!swimmers.length} onClick={startClock}>Start clock</button>)
            : <span className="clock-note">Some rounds have no interval, so record each swimmer by hand.</span>}
        </div>
      )}
      <p className="notice"><strong>Scoring:</strong> the moment a swimmer stops or misses the swim time, that rep is incomplete. Close calls are at the coach's discretion: favour encouragement for under-12s and refinement for 12 and over. Score = age × test level × reps completed.</p>

      <div className="run-tools">
        {swimmers.length > 8 && <label className="inline">Find<input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Swimmer name" /></label>}
        {saveState && <span className={"msg" + (saveState.error ? " error" : "")} role="status">{saveState.text}</span>}
      </div>

      {!swimmers.length && !swimmersQ.isLoading && <p className="dim">No swimmers on this test yet.</p>}
      <div className="test-cards">
        {shown.map(sw => {
          const row = rowFor(sw);
          const age = swimAge(row.year_of_birth, s.session_date);
          const done = repsDone(row.rounds);
          const sc = score(age, row.level, done);
          const full = row.level != null && age != null ? score(age, row.level, m.rounds.reduce((a, r) => a + valuesFor(m, r, row.level).reps, 0)) : null;
          const ph = running && row.level != null ? phaseAt(m, row.level, elapsed) : null;
          const cur = ph?.kind === "swim" ? ph : null;
          const curDone = cur ? row.rounds[cur.key]?.done : null;
          const outOfRound = cur && curDone != null && curDone < cur.rep;
          return (
            <article key={sw.id} className="test-card" aria-label={sw.full_name}>
              <div className="tc-head">
                <strong className="tc-name">{sw.full_name}</strong>
                {live && <ConfirmButton className="link-btn" label="Take off" confirm="Tap to confirm" onConfirm={() => removeSwimmer(sw.id)} />}
              </div>
              <div className="tc-meta">
                {sw.squad && <span>{sw.squad}</span>}
                {row.year_of_birth
                  ? <span>Born {row.year_of_birth} · age {age}</span>
                  : live ? <YobPrompt s={sw} onSaved={y => { setYobs(p => ({ ...p, [sw.id]: y })); if (local[sw.id]) commit({ ...rowFor(sw), year_of_birth: y, level: rowFor(sw).level ?? defaultLevel(m, swimAge(y, s.session_date)) }); }} />
                  : <span className="dim">No year of birth</span>}
                {m.ageBanded && (live
                  ? <select aria-label={`Test level for ${sw.full_name}`} value={row.level ?? ""} onChange={e => setLevel(sw, Number(e.target.value))}>
                      {row.level == null && <option value="">Choose level</option>}
                      {levelOptions(m).map(l => <option key={l} value={l}>Age {l}{l === m.maxAge ? "+" : ""} set</option>)}
                    </select>
                  : <span>Age {row.level} set</span>)}
              </div>
              {running && (
                <div className={"tc-phase " + (ph ? ph.kind : "")}>
                  {!ph ? "Choose the level to follow the clock"
                    : ph.kind === "swim" ? (outOfRound ? `${m.rounds[ph.round].name}: stopped at rep ${curDone! + 1}` : <>{m.rounds[ph.round].name} · rep {ph.rep} of {ph.reps}<span>{mmss(Math.ceil(ph.left))} left</span></>)
                    : ph.kind === "rest" ? <>Rest<span>{mmss(Math.ceil(ph.left))}</span></>
                    : ph.kind === "done" ? "Set finished" : "Untimed round"}
                </div>
              )}
              {running && live && (
                <button className="btn stop-btn" disabled={!cur || !!outOfRound}
                  onClick={() => { if (cur) { navigator.vibrate?.(40); setDone(sw, cur.key, cur.rep - 1); } }}>
                  {cur ? `Stopped on ${m.rounds[cur.round].name} rep ${cur.rep}` : "Stopped now"}
                </button>
              )}
              {m.rounds.map(r => {
                const v = valuesFor(m, r, row.level);
                const d = row.rounds[r.key]?.done ?? null;
                return (
                  <div key={r.key} className="tc-round">
                    <div className="tc-rl"><b>{r.name}</b> {roundLabel(r, v)}
                      <span className={"tc-inc " + (d == null ? "dim" : d >= v.reps ? "ok" : "bad")}>
                        {d == null ? "Not recorded" : d >= v.reps ? "Full round completed" : `Last completed ${d} · incomplete rep ${d + 1}`}</span>
                    </div>
                    <div className="tc-ctl">
                      <div className="stepper">
                        <button type="button" aria-label={`One fewer ${r.name} rep for ${sw.full_name}`} disabled={!live} onClick={() => setDone(sw, r.key, d == null ? v.reps - 1 : d - 1)}>−</button>
                        <span className="v" aria-label={`${r.name} reps completed`}>{d ?? "–"}</span>
                        <button type="button" aria-label={`One more ${r.name} rep for ${sw.full_name}`} disabled={!live} onClick={() => setDone(sw, r.key, d == null ? v.reps : d + 1)}>+</button>
                      </div>
                      {live && <button type="button" className="link-btn" onClick={() => setDone(sw, r.key, v.reps)}>Full</button>}
                    </div>
                  </div>
                );
              })}
              <div className="tc-foot"><span>Score <strong className="tc-score">{sc ?? "–"}</strong>{full != null && <span className="dim"> / {full}</span>}</span>
                <span className="dim">{age == null ? "needs year of birth" : row.level == null ? "needs level" : `${age} × ${row.level} × ${done}`}</span></div>
            </article>
          );
        })}
      </div>

      {live ? (
        <div className="done-actions">
          <button className="btn" onClick={() => setAdding(a => !a)}>{adding ? "Cancel" : "Add swimmers"}</button>
          {unrecorded > 0 && <ConfirmButton label={`Mark ${unrecorded} unrecorded as completed`} confirm="Tap again to confirm" onConfirm={fillFull} />}
          <ConfirmButton className="btn primary" label="Close and archive test" confirm="Tap again to close" onConfirm={close} />
        </div>
      ) : (
        <div className="done-actions">
          <Link className="btn primary" to={`/statistics/tests?template=${s.template_id}&session=${s.id}`}>View results in Statistics</Link>
          <ConfirmButton label="Reopen test" confirm="Tap again to reopen" onConfirm={reopen} />
        </div>
      )}
      {adding && <AddSwimmers session={s} onAdd={addSwimmers} />}
    </>
  );
}

function AddSwimmers({ session, onAdd }: { session: TestSession; onAdd: (ids: string[]) => void }) {
  const q = useQuery({ queryKey: ["test_club_swimmers", session.club], queryFn: () => loadClubSwimmers(session.club) });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [t, setT] = useState("");
  const list = (q.data ?? []).filter(s => !session.swimmer_ids.includes(s.id) && (!t.trim() || s.full_name.toLowerCase().includes(t.trim().toLowerCase())));
  return (
    <section className="card">
      <h2>Add swimmers</h2>
      <label>Search<input value={t} onChange={e => setT(e.target.value)} placeholder="Name" /></label>
      <ul className="tick-list pick-list">
        {list.map(s => (
          <li key={s.id} className="tick-row"><label className="pick-row"><input type="checkbox" checked={picked.has(s.id)}
            onChange={() => setPicked(p => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
            <span>{s.full_name}</span><span className="dim">{s.squad ?? ""}</span></label></li>
        ))}
        {!list.length && <li className="dim">{q.isLoading ? "Loading…" : "No other swimmers."}</li>}
      </ul>
      <button className="btn primary" disabled={!picked.size} onClick={() => onAdd([...picked])}>Add {picked.size || ""}</button>
    </section>
  );
}
