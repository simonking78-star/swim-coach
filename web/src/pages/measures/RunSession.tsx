import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { clockable, loadClubSwimmers, loadSwimmersByIds, mmss, phaseAt, valuesFor, roundLabel, type TestSwimmer } from "../../lib/tests";
import {
  CAUTION_LABEL, CYCLE_LABEL, FLAG_LABEL, NOT_TESTED, TIMING, clubOfSession, defaultLevelKey, fmtValue, levelSummary, loadSession, loadSessionResults,
  loadSessionTrials, loadVersion, parseSeconds, removeResult, repsModel, saveResult, saveTrial, trialValue, unitOf, updateSession, versionLabel,
  type Level, type MmResult, type MmSession, type Protocol, type Trial, type Version
} from "../../lib/measures";
import { fmtDate, logEvent, useCoachName } from "../../lib/util";
import { ConfirmButton } from "../tests/RunTest";
import { MBack, NoAccess, useMeasuresAccess } from "./Measures";

// The live test. Everything that defines the test is fixed by the protocol
// version; the coach records only what happened: the level each swimmer swam,
// reps completed / trial times / checklist scores, legality, and conditions.
// "Not tested" (unwell, injured, returning) is recorded instead of a maximal
// effort. Saves are immediate (queued offline). Closing the test is what links
// each result to the swimmer's baseline and previous result in the database.

type Row = MmResult;

export function RunSession() {
  const { id } = useParams();
  const { canRun, canView } = useMeasuresAccess();
  const { session: auth } = useAuth();
  const coach = useCoachName();
  const qc = useQueryClient();

  const ses = useQuery({ queryKey: ["mm_session", id], enabled: !!id && canView, queryFn: () => loadSession(id!), refetchInterval: 15000 });
  const s = ses.data;
  const live = s?.status === "live";
  const ver = useQuery({ queryKey: ["mm_version", s?.version_id], enabled: !!s, queryFn: () => loadVersion(s!.version_id), staleTime: Infinity });
  const sw = useQuery({ queryKey: ["mm_session_swimmers", id, s?.swimmer_ids.join(",")], enabled: !!s, queryFn: () => loadSwimmersByIds(s!.swimmer_ids) });
  const res = useQuery({ queryKey: ["mm_results", id], enabled: !!s, queryFn: () => loadSessionResults(id!), refetchInterval: live ? 10000 : false });
  const tri = useQuery({ queryKey: ["mm_trials", id], enabled: !!s && ver.data?.protocol.kind === "timed", queryFn: () => loadSessionTrials(id!), refetchInterval: live ? 10000 : false });

  // Local copies so taps show instantly; server rows replace them unless changed here in the last few seconds.
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [trials, setTrials] = useState<Record<string, Trial[]>>({});
  const touched = useRef<Record<string, number>>({});
  const fresh = (k: string) => touched.current[k] && Date.now() - touched.current[k] < 6000;
  useEffect(() => { if (res.data) setRows(p => { const n = { ...p }; for (const r of res.data) if (!fresh(r.swimmer_id)) n[r.swimmer_id] = r; return n; }); }, [res.data]);
  useEffect(() => {
    if (!tri.data) return;
    setTrials(p => { const n = { ...p }; const by: Record<string, Trial[]> = {};
      for (const t of tri.data) (by[t.result_id] ??= []).push(t);
      for (const [rid, list] of Object.entries(by)) if (!fresh("t" + rid)) n[rid] = list;
      return n; });
  }, [tri.data]);

  const [timing, setTiming] = useState("video");
  const [saveState, setSaveState] = useState<{ text: string; error?: boolean } | null>(null);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState(Date.now());
  const running = !!s?.clock_started_at && live;
  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [running]);
  useEffect(() => {
    if (!running || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then(l => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [running]);

  const swimmers = useMemo(() => sw.data ?? [], [sw.data]);
  if (!canView) return <><MBack /><NoAccess /></>;
  if (ses.isLoading || ver.isLoading) return <><MBack /><p className="dim">Loading…</p></>;
  if (!s || !ver.data) return <><MBack /><p className="msg error">That test wasn't found.</p></>;
  const { protocol: p, version: v } = ver.data;
  const editable = live && canRun;
  const levelOf = (k: string | null | undefined) => v.levels.find(l => l.key === k) ?? null;
  const elapsed = s.clock_started_at ? Math.max(0, (now - Date.parse(s.clock_started_at)) / 1000) : 0;
  const canClock = p.kind === "reps" && v.levels.every(l => clockable(repsModel(l)));

  const rowFor = (x: TestSwimmer): Row => rows[x.id] ?? {
    session_id: s.id, swimmer_id: x.id, level_key: defaultLevelKey(v.levels, x.squad) ?? "", status: "recorded", raw: {},
    conditions: p.kind === "timed" ? { timing } : {}
  };

  const commit = async (row: Row): Promise<string | null> => {
    if (!row.level_key) { setSaveState({ text: "Choose the level first.", error: true }); return null; }
    touched.current[row.swimmer_id] = Date.now();
    const next = { ...row, recorded_by: coach };
    setRows(r => ({ ...r, [row.swimmer_id]: next }));
    setSaveState({ text: "Saving…" });
    try {
      const out = await saveResult(next);
      setRows(r => ({ ...r, [row.swimmer_id]: { ...r[row.swimmer_id], id: out.id } }));
      setSaveState({ text: out.queued ? "Offline — saved on this device, will sync" : "Saved" });
      return out.id;
    } catch (e) { setSaveState({ text: "Couldn't save: " + (e as Error).message, error: true }); return null; }
  };

  const setTrial = async (x: TestSwimmer, t: Trial) => {
    let rid = rows[x.id]?.id ?? null;
    if (!rid) rid = await commit(rowFor(x));
    if (!rid) return;
    const tr = { ...t, result_id: rid };
    touched.current["t" + rid] = Date.now();
    setTrials(m => ({ ...m, [rid!]: [...(m[rid!] ?? []).filter(y => y.trial_no !== tr.trial_no), tr].sort((a, b) => a.trial_no - b.trial_no) }));
    try { const r = await saveTrial(tr); setSaveState({ text: r === "queued" ? "Offline — saved on this device, will sync" : "Saved" }); }
    catch (e) { setSaveState({ text: "Couldn't save the trial: " + (e as Error).message, error: true }); }
  };

  const refresh = () => { qc.invalidateQueries({ queryKey: ["mm_session", id] }); qc.invalidateQueries({ queryKey: ["mm_sessions"] }); };
  const startClock = async () => { await updateSession(s.id, { clock_started_at: new Date().toISOString() }); refresh(); };
  const resetClock = async () => { await updateSession(s.id, { clock_started_at: null }); refresh(); };
  const close = async () => {
    await updateSession(s.id, { status: "closed", closed_at: new Date().toISOString() });
    logEvent(auth?.user.id, clubOfSession(s), "core_task", "mm_close", { session: s.id, protocol: p.code });
    refresh(); qc.invalidateQueries({ queryKey: ["mm_results"] });
  };
  const reopen = async () => { await updateSession(s.id, { status: "live", closed_at: null }); refresh(); };
  const removeSwimmer = async (sid: string) => {
    try {
      if (rows[sid]?.id) await removeResult(s.id, sid);
      await updateSession(s.id, { swimmer_ids: s.swimmer_ids.filter(x => x !== sid) });
      setRows(r => { const n = { ...r }; delete n[sid]; return n; });
      refresh();
    } catch (e) { setSaveState({ text: "Couldn't take the swimmer off: " + (e as Error).message, error: true }); }
  };
  const addSwimmers = async (ids: string[]) => { await updateSession(s.id, { swimmer_ids: [...new Set([...s.swimmer_ids, ...ids])] }); setAdding(false); refresh(); };

  const recorded = swimmers.filter(x => rows[x.id]?.id).length;
  const t = filter.trim().toLowerCase();
  const shown = swimmers.filter(x => !t || x.full_name.toLowerCase().includes(t));
  const unit = unitOf(p, v);

  return (
    <>
      <MBack />
      <div className="page-head row">
        <div><h1>{p.code} · {p.name}</h1>
          <p className="dim">{versionLabel(v)} · {fmtDate(s.session_date)} · {s.pool ?? ""} · {swimmers.length} swimmer{swimmers.length === 1 ? "" : "s"}</p></div>
        <span className={"chip " + (live ? "live-chip" : "")}>{live ? "Live" : "Closed"}</span>
      </div>
      <SessionChecks p={p} v={v} s={s} />
      {v.sheet.script && <details className="card"><summary>Swimmer script and procedure</summary><p className="pre">{v.sheet.script}</p>{v.sheet.procedure && <p className="pre">{v.sheet.procedure}</p>}{v.sheet.safety && <p className="pre dim">{v.sheet.safety}</p>}</details>}

      {live && p.kind === "reps" && (
        <div className="clock-bar">
          <div><div className="clock-label">Pace clock</div><div className="clock-face">{s.clock_started_at ? mmss(Math.floor(elapsed)) : "--:--"}</div></div>
          {editable && (canClock
            ? (s.clock_started_at ? <ConfirmButton label="Reset clock" confirm="Tap again to reset" onConfirm={resetClock} />
              : <button className="btn primary-light" disabled={!swimmers.length} onClick={startClock}>Start clock</button>)
            : <span className="clock-note">Some rounds have no send-off, so record each swimmer by hand.</span>)}
        </div>
      )}
      {live && p.kind === "timed" && (
        <label className="inline">Timing method for new results<select value={timing} onChange={e => setTiming(e.target.value)}>{TIMING.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      )}
      <div className="run-tools">
        {swimmers.length > 8 && <label className="inline">Find<input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Swimmer name" /></label>}
        {saveState && <span className={"msg" + (saveState.error ? " error" : "")} role="status">{saveState.text}</span>}
      </div>

      <div className="test-cards">
        {shown.map(x => {
          const row = rowFor(x);
          const lv = levelOf(row.level_key);
          const ts = row.id ? trials[row.id] ?? [] : [];
          const value = p.kind === "timed" ? trialValue(ts, v.measure.counts, p.better)
            : p.kind === "reps" ? Object.values(row.raw as Record<string, { done: number | null }>).reduce((a, r) => a + (r?.done ?? 0), 0)
            : Object.values(row.raw as Record<string, number>).reduce((a, n) => a + (typeof n === "number" ? n : 0), 0);
          return (
            <article key={x.id} className="test-card" aria-label={x.full_name}>
              <div className="tc-head"><strong className="tc-name">{x.full_name}</strong>
                {editable && <ConfirmButton className="link-btn" label="Take off" confirm="Tap to confirm" onConfirm={() => removeSwimmer(x.id)} />}</div>
              <div className="tc-meta">
                {x.squad && <span>{x.squad}</span>}
                {editable
                  ? <select aria-label={`Level for ${x.full_name}`} value={row.level_key} onChange={e => commit({ ...row, level_key: e.target.value, raw: {} })}>
                      {!row.level_key && <option value="">Choose level</option>}
                      {v.levels.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                    </select>
                  : <span>{lv?.label ?? row.level_key}</span>}
                {editable
                  ? <select aria-label={`Tested or not for ${x.full_name}`} value={row.status === "recorded" ? "" : row.not_tested_reason ?? "Other"}
                      onChange={e => commit({ ...row, status: e.target.value ? "not_tested" : "recorded", not_tested_reason: e.target.value || null })}>
                      <option value="">Tested</option>{NOT_TESTED.map(r => <option key={r} value={r}>Not tested: {r}</option>)}
                    </select>
                  : row.status === "not_tested" && <span className="chip">Not tested: {row.not_tested_reason}</span>}
              </div>
              {lv && <p className="dim tc-level">{levelSummary(p, lv)}</p>}

              {row.status === "recorded" && lv && p.kind === "reps" && (
                <RepsCapture lv={lv} row={row} editable={editable} running={running} elapsed={elapsed} name={x.full_name}
                  onChange={raw => commit({ ...row, raw })} />
              )}
              {row.status === "recorded" && lv && p.kind === "timed" && (
                <TimedCapture v={v} trials={ts} editable={editable} name={x.full_name} onTrial={tr => setTrial(x, tr)} />
              )}
              {row.status === "recorded" && lv && p.kind === "checklist" && (
                <ChecklistCapture lv={lv} row={row} editable={editable} onChange={raw => commit({ ...row, raw })} />
              )}
              {row.status === "recorded" && lv && (
                <div className="tc-cond">
                  {(["illness", "missed_training"] as const).map(k => (
                    <label key={k} className="inline check-inline"><input type="checkbox" disabled={!editable} checked={!!row.conditions[k]}
                      onChange={e => commit({ ...row, conditions: { ...row.conditions, [k]: e.target.checked } })} /> {k === "illness" ? "Recently ill" : "Missed training last week"}</label>))}
                </div>
              )}
              <div className="tc-foot"><span>Result <strong className="tc-score">{row.status === "not_tested" || (p.kind !== "timed" && !Object.keys(row.raw).length) ? "–" : fmtValue(value, unit)}</strong></span>
                {!live && row.flag && <span className={"chip mm-flag mm-" + row.flag}>{FLAG_LABEL[row.flag]}</span>}</div>
              {!live && !!row.caution?.length && <p className="hint">{row.caution.map(c => CAUTION_LABEL[c] ?? c).join("; ")}</p>}
            </article>
          );
        })}
      </div>

      {live && editable ? (
        <div className="done-actions">
          <button className="btn" onClick={() => setAdding(a => !a)}>{adding ? "Cancel" : "Add swimmers"}</button>
          <span className="hint">{recorded} of {swimmers.length} recorded</span>
          <ConfirmButton className="btn primary" label="Close test" confirm="Tap again to close" onConfirm={close} />
        </div>
      ) : !live && (
        <div className="done-actions">
          <Link className="btn primary" to={`/measures/results?protocol=${p.id}`}>View results</Link>
          {canRun && <ConfirmButton label="Reopen test" confirm="Tap again to reopen" onConfirm={reopen} />}
        </div>
      )}
      {live && <p className="hint">Closing the test links each result to the swimmer's own baseline and previous result. Reopening takes them out again until it is closed.</p>}
      {adding && <AddSwimmers session={s} onAdd={addSwimmers} />}
    </>
  );
}

function SessionChecks({ p, v, s }: { p: Protocol; v: Version; s: MmSession }) {
  const items: string[] = [];
  if (s.on_cycle === false) items.push(`It's a ${CYCLE_LABEL[s.cycle_focus ?? ""] ?? s.cycle_focus} week; this test is meant for ${CYCLE_LABEL[v.intended_cycle ?? ""] ?? v.intended_cycle} weeks.`);
  if (!s.as_protocol) items.push("Not run exactly as the protocol sheet says.");
  if (p.status === "pilot") items.push("This protocol is in pilot.");
  if (!items.length) return null;
  return <p className="notice warn"><strong>Compare with caution:</strong> {items.join(" ")} Results are kept and shown with that note.</p>;
}

function RepsCapture({ lv, row, editable, running, elapsed, name, onChange }: {
  lv: Level; row: MmResult; editable: boolean; running: boolean; elapsed: number; name: string; onChange: (raw: Record<string, unknown>) => void;
}) {
  const m = repsModel(lv);
  const raw = row.raw as Record<string, { done: number | null; reps: number }>;
  const set = (key: string, done: number | null) => {
    const reps = valuesFor(m, m.rounds.find(r => r.key === key)!, 1).reps;
    const next: Record<string, unknown> = {};
    for (const r of m.rounds) next[r.key] = raw[r.key] ?? { done: null, reps: valuesFor(m, r, 1).reps };
    next[key] = { done: done == null ? null : Math.max(0, Math.min(reps, done)), reps };
    onChange(next);
  };
  const ph = running ? phaseAt(m, 1, elapsed) : null;
  const cur = ph?.kind === "swim" ? ph : null;
  const curDone = cur ? raw[cur.key]?.done ?? null : null;
  const out = cur && curDone != null && curDone < cur.rep;
  return (
    <>
      {running && <div className={"tc-phase " + (ph?.kind ?? "")}>
        {ph?.kind === "swim" ? (out ? `${m.rounds[ph.round].name}: stopped at rep ${curDone! + 1}` : <>{m.rounds[ph.round].name} · rep {ph.rep} of {ph.reps}<span>{mmss(Math.ceil(ph.left))} left</span></>)
          : ph?.kind === "rest" ? <>Rest<span>{mmss(Math.ceil(ph.left))}</span></> : ph?.kind === "done" ? "Set finished" : "Untimed round"}</div>}
      {running && editable && <button className="btn stop-btn" disabled={!cur || !!out} onClick={() => { if (cur) { navigator.vibrate?.(40); set(cur.key, cur.rep - 1); } }}>
        {cur ? `Stopped on ${m.rounds[cur.round].name} rep ${cur.rep}` : "Stopped now"}</button>}
      {m.rounds.map(r => {
        const vv = valuesFor(m, r, 1); const d = raw[r.key]?.done ?? null;
        return (
          <div key={r.key} className="tc-round">
            <div className="tc-rl"><b>{r.name}</b> {roundLabel(r, vv)}
              <span className={"tc-inc " + (d == null ? "dim" : d >= vv.reps ? "ok" : "bad")}>{d == null ? "Not recorded" : d >= vv.reps ? "Full round completed" : `Last completed ${d}`}</span></div>
            <div className="tc-ctl">
              <div className="stepper">
                <button type="button" aria-label={`One fewer ${r.name} rep for ${name}`} disabled={!editable} onClick={() => set(r.key, d == null ? vv.reps - 1 : d - 1)}>−</button>
                <span className="v">{d ?? "–"}</span>
                <button type="button" aria-label={`One more ${r.name} rep for ${name}`} disabled={!editable} onClick={() => set(r.key, d == null ? vv.reps : d + 1)}>+</button>
              </div>
              {editable && <button type="button" className="link-btn" onClick={() => set(r.key, vv.reps)}>Full</button>}
            </div>
          </div>
        );
      })}
    </>
  );
}

const SPLIT_LABEL: Record<string, string> = { approach: "Approach", wall: "Wall", out: "Out" };

function TimedCapture({ v, trials, editable, name, onTrial }: { v: Version; trials: Trial[]; editable: boolean; name: string; onTrial: (t: Trial) => void }) {
  const n = v.measure.trials ?? 1;
  const splits = v.measure.splits ?? [];
  return (
    <div className="mm-trials">
      {Array.from({ length: n }, (_, i) => i + 1).map(no => {
        const t = trials.find(x => x.trial_no === no) ?? { result_id: "", trial_no: no, time_s: null, splits: {}, legal: true };
        return (
          <div key={no} className={"mm-trial" + (t.legal ? "" : " illegal")}>
            <div className="mm-trial-main">
              <span className="mm-tno">Trial {no}</span>
              <TimeInput label={`Trial ${no} time for ${name}`} value={t.time_s} disabled={!editable} onSave={val => onTrial({ ...t, time_s: val })} />
              <label className="inline check-inline"><input type="checkbox" disabled={!editable} checked={t.legal} onChange={e => onTrial({ ...t, legal: e.target.checked, illegal_reason: e.target.checked ? null : t.illegal_reason ?? "" })} /> Legal</label>
            </div>
            {!!splits.length && (
              <div className="mm-splits">
                {splits.map(k => (
                  <label key={k} className="mm-split-l"><span>{SPLIT_LABEL[k] ?? k}</span>
                    <TimeInput small label={`${SPLIT_LABEL[k] ?? k} split, trial ${no}, ${name}`} placeholder="s"
                      value={(t.splits?.[k] as number | null) ?? null} disabled={!editable} onSave={val => onTrial({ ...t, splits: { ...t.splits, [k]: val } })} /></label>
                ))}
              </div>
            )}
            {!t.legal && <input aria-label="Why illegal" placeholder="Why illegal (e.g. no touch on the back)" defaultValue={t.illegal_reason ?? ""} disabled={!editable} onBlur={e => onTrial({ ...t, illegal_reason: e.target.value })} />}
          </div>
        );
      })}
    </div>
  );
}

function TimeInput({ label, value, onSave, disabled, small, placeholder }: { label: string; value: number | null; onSave: (v: number | null) => void; disabled?: boolean; small?: boolean; placeholder?: string }) {
  const [txt, setTxt] = useState(value == null ? "" : String(value));
  const [bad, setBad] = useState(false);
  useEffect(() => { setTxt(value == null ? "" : String(value)); }, [value]);
  const done = () => {
    if (txt.trim() === "") { if (value != null) onSave(null); setBad(false); return; }
    const s = parseSeconds(txt);
    if (s == null) { setBad(true); return; }
    setBad(false); if (s !== value) onSave(s);
  };
  return <input className={(small ? "mm-split" : "mm-time") + (bad ? " invalid" : "")} aria-label={label} inputMode="decimal" placeholder={placeholder ?? "0.00"}
    value={txt} disabled={disabled} onChange={e => setTxt(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

function ChecklistCapture({ lv, row, editable, onChange }: { lv: Level; row: MmResult; editable: boolean; onChange: (raw: Record<string, unknown>) => void }) {
  const raw = row.raw as Record<string, number>;
  return (
    <ul className="tick-list">{(lv.criteria ?? []).map(c => (
      <li key={c.key} className="tick-row"><span className="tick-name">{c.label}</span>
        <span className="seg">{[1, 2, 3].map(n => (
          <button key={n} type="button" disabled={!editable} className={"seg-btn" + (raw[c.key] === n ? " on" : "")} aria-pressed={raw[c.key] === n}
            onClick={() => onChange({ ...raw, [c.key]: n })}>{n}</button>))}</span></li>
    ))}</ul>
  );
}

function AddSwimmers({ session, onAdd }: { session: MmSession; onAdd: (ids: string[]) => void }) {
  const club = clubOfSession(session);
  const q = useQuery({ queryKey: ["test_club_swimmers", club], queryFn: () => loadClubSwimmers(club) });
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
