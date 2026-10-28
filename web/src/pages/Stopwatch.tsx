import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { ClubPicker } from "../club/ClubPicker";
import { LEVEL_NOTE, sectionLevel } from "../lib/access";
import { loadFbSwimmers } from "../lib/feedback";
import { loadSquadNames } from "../lib/attendance";
import {
  DISTANCES, STROKES, blank, elapsed, entries as getEntries, fmtFace, fmtSwim, loadState, postTimes, rep, running,
  saveState, start, stop, truncMs, type PostRow, type SwState
} from "../lib/stopwatch";
import { logEvent, todayLocal } from "../lib/util";
import { clubIdOf } from "../lib/clubs";

export function Stopwatch() {
  const { access, session } = useAuth();
  const level = sectionLevel(access, "stopwatch");
  const { club } = useClub();
  const qc = useQueryClient();

  const [sw, setSwRaw] = useState<SwState>(loadState);
  const setSw = (next: SwState) => { saveState(next); setSwRaw(next); };
  const [squad, setSquad] = useState("");
  const [main, setMain] = useState<string>(() => loadState().rowSwimmer.total ?? "");
  const [mode, setMode] = useState<"lap" | "elapsed">("lap");
  const [course, setCourse] = useState<"SC" | "LC">("SC");
  const [stroke, setStroke] = useState("Freestyle");
  const [distance, setDistance] = useState("50");
  const [otherDist, setOtherDist] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [posting, setPosting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const squads = useQuery({ queryKey: ["fb_squads", club], enabled: !!club, queryFn: () => loadSquadNames(club!) });
  // All active swimmers in the club; the squad choice only filters the lists.
  const allSwimmers = useQuery({ queryKey: ["fb_swimmers", club, ""], enabled: !!club, queryFn: () => loadFbSwimmers(club!, null) });
  const swimmers = useMemo(() => (allSwimmers.data ?? []).filter(s => !squad || s.squad === squad), [allSwimmers.data, squad]);
  const byId = useMemo(() => new Map((allSwimmers.data ?? []).map(s => [s.id, s])), [allSwimmers.data]);

  const isRunning = running(sw);
  const list = getEntries(sw);
  const stopped = !isRunning && sw.stopAt != null;

  // ---- Live face: updated straight on the element, not via re-render ----
  const faceRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const paint = () => {
      const t = elapsed(sw);
      if (faceRef.current) faceRef.current.textContent = fmtFace(t);
      if (subRef.current) {
        const n = sw.taps.length, last = n ? sw.taps[n - 1] : 0;
        subRef.current.textContent = n ? `Rep ${n}: ${fmtSwim(last - (n > 1 ? sw.taps[n - 2] : 0))} · current rep ${fmtSwim(t - last)}` : " ";
      }
    };
    paint();
    if (!isRunning) return;
    let raf = 0;
    const loop = () => { paint(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sw, isRunning]);

  // ---- Keep the screen awake while the clock runs ----
  useEffect(() => {
    if (!isRunning || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const get = () => { navigator.wakeLock.request("screen").then(l => { lock = l; }).catch(() => { /* not allowed */ }); };
    const onVis = () => { if (document.visibilityState === "visible") get(); };
    get();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release().catch(() => {}); };
  }, [isRunning]);

  // A different club means a different set of swimmers.
  useEffect(() => { setSquad(""); }, [club]);

  if (level === "N") {
    return <><div className="page-head"><h1>Stopwatch</h1></div><p className="notice warn">Your role doesn't have access to the stopwatch.</p></>;
  }

  const startStop = () => { setMsg(null); setSw(isRunning ? stop(sw) : start(sw, main)); };
  const tapRep = () => { if (!isRunning) return; navigator.vibrate?.(30); setSw(rep(sw, main)); };
  const unposted = list.filter(e => !sw.posted[e.key]).length;
  const reset = () => {
    if (unposted && !confirmReset) { setConfirmReset(true); return; }
    setConfirmReset(false); setMsg(null); setSw(blank());
  };

  const pickMain = (id: string) => {
    setMain(id);
    // The main pick fills every row that hasn't been posted yet.
    const rowSwimmer: Record<string, string> = { ...sw.rowSwimmer, total: id };
    for (const e of list) if (!sw.posted[e.key]) rowSwimmer[e.key] = id;
    setSw({ ...sw, rowSwimmer });
  };
  const setRow = (key: string, id: string) => setSw({ ...sw, rowSwimmer: { ...sw.rowSwimmer, [key]: id } });
  const setTick = (key: string, on: boolean) => setSw({ ...sw, ticked: { ...sw.ticked, [key]: on } });
  const isTicked = (key: string) => !sw.posted[key] && (key === "total" ? sw.ticked.total === true : sw.ticked[key] !== false);
  const rowPick = (key: string) => sw.rowSwimmer[key] ?? main;

  const post = async () => {
    setMsg(null);
    const dist = parseInt(distance === "other" ? otherDist.trim() : distance, 10);
    if (!dist || dist <= 0) { setMsg({ text: "Enter the distance measured.", error: true }); return; }
    const keys = [...list.map(e => e.key), ...(mode === "lap" && stopped && list.length > 1 ? ["total"] : [])].filter(isTicked);
    if (!keys.length) { setMsg({ text: "Tick at least one time to post.", error: true }); return; }
    const date = todayLocal().date;
    const rows: PostRow[] = [];
    for (const key of keys) {
      const s = byId.get(rowPick(key));
      if (!s) { setMsg({ text: "Choose a swimmer for every ticked time.", error: true }); return; }
      const base = { key, swimmer_id: s.id, club_id: clubIdOf(club!), squad_id: s.squad_id, stroke, course, note: note.trim() || null, session_date: date, rep_count: list.length };
      if (key === "total") {
        const ms = truncMs(sw.stopAt!);
        rows.push({ ...base, distance_m: dist * list.length, time_ms: ms, time_display: fmtSwim(ms), time_type: "total", rep_number: null });
      } else {
        const e = list.find(x => x.key === key)!;
        const ms = truncMs(mode === "lap" ? e.lap : e.elapsed);
        if (ms <= 0) continue;
        rows.push({ ...base, distance_m: dist, time_ms: ms, time_display: fmtSwim(ms), time_type: mode, rep_number: e.n });
      }
    }
    setPosting(true);
    try {
      await postTimes(rows);
      const posted = { ...sw.posted };
      rows.forEach(r => { posted[r.key] = true; });
      setSw({ ...sw, posted });
      const names = [...new Set(rows.map(r => byId.get(r.swimmer_id)!.full_name))];
      setMsg({ text: `Posted ${rows.length} time${rows.length === 1 ? "" : "s"} (${dist}m ${stroke}) to ${names.join(", ")}.` });
      logEvent(session?.user.id, club, "core_task", "stopwatch_post", { count: rows.length });
      qc.invalidateQueries({ queryKey: ["stopwatch_times"] });
    } catch (e) {
      setMsg({ text: "Couldn't post: " + (e as Error).message, error: true });
    } finally {
      setPosting(false);
    }
  };

  const swimmerOptions = (withSquad: boolean) => (
    <>
      <option value="">— choose swimmer —</option>
      {swimmers.map(s => <option key={s.id} value={s.id}>{s.full_name}{withSquad && !squad && s.squad ? ` · ${s.squad}` : ""}</option>)}
    </>
  );

  return (
    <>
      <div className="page-head">
        <h1><span aria-hidden="true">⏱️</span> Stopwatch</h1>
        <p className="dim">Time reps, then post them to swimmers' profiles</p>
      </div>
      {LEVEL_NOTE[level] && <p className="notice">{LEVEL_NOTE[level]}</p>}

      <div className="sw-layout">
        <div className="sw-col">
          <section className="card">
            <h2 className="card-title">Who's swimming</h2>
            <ClubPicker />
            <div className="field-pair">
              <div>
                <label htmlFor="sw-squad">Squad</label>
                <select id="sw-squad" value={squad} onChange={e => setSquad(e.target.value)}>
                  <option value="">All squads</option>
                  {(squads.data ?? []).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="sw-swimmer">Swimmer</label>
                <select id="sw-swimmer" value={main} onChange={e => pickMain(e.target.value)}>{swimmerOptions(true)}</select>
              </div>
            </div>
          </section>

          <section className="card sw-clock" aria-label="Stopwatch">
            <div className="sw-face" ref={faceRef} role="timer" aria-live="off">00:00.00</div>
            <div className="sw-sub" ref={subRef}>&nbsp;</div>
            <div className="sw-btns">
              <button type="button" className={"sw-btn " + (isRunning ? "stop" : "start")} onClick={startStop}>
                {isRunning ? "Stop" : sw.acc > 0 ? "Resume" : "Start"}
              </button>
              <button type="button" className="sw-btn rep" onClick={tapRep} disabled={!isRunning}>Rep</button>
            </div>
            {(sw.acc > 0 || isRunning) && (
              confirmReset
                ? <div className="sw-confirm" role="alert">
                    <span>Clear {unposted} unposted time{unposted === 1 ? "" : "s"}?</span>
                    <button type="button" className="btn small danger" onClick={reset}>Clear</button>
                    <button type="button" className="btn small" onClick={() => setConfirmReset(false)}>Keep</button>
                  </div>
                : <button type="button" className="link-btn sw-reset" onClick={reset}>Reset &amp; clear times</button>
            )}
          </section>
        </div>

        {list.length > 0 && (
          <div className="sw-col">
            <section className="card">
              <h2 className="card-title">Recorded times <span className="dim">({list.length})</span></h2>
              <div className="seg seg-2">
                <button type="button" className={"seg-btn" + (mode === "lap" ? " on" : "")} aria-pressed={mode === "lap"} onClick={() => setMode("lap")}>Rep (lap) times</button>
                <button type="button" className={"seg-btn" + (mode === "elapsed" ? " on" : "")} aria-pressed={mode === "elapsed"} onClick={() => setMode("elapsed")}>Elapsed times</button>
              </div>
              <p className="hint">Lap = time for each rep. Elapsed = running clock at each tap (e.g. several swimmers finishing one race). Each row can go to a different swimmer.</p>
              <ul className="sw-rows">
                {list.map(e => {
                  const posted = !!sw.posted[e.key];
                  const val = mode === "lap" ? e.lap : e.elapsed, other = mode === "lap" ? e.elapsed : e.lap;
                  const label = e.isStop ? "Stop" : `Rep ${e.n}`;
                  return (
                    <li key={e.key} className={"sw-row" + (posted ? " posted" : "")}>
                      <input type="checkbox" aria-label={`Post ${label}`} checked={isTicked(e.key)} disabled={posted} onChange={ev => setTick(e.key, ev.target.checked)} />
                      <span className="sw-lbl">{label}</span>
                      <span className="sw-t">{fmtSwim(val)}<small>{mode === "lap" ? "@ " : "lap "}{fmtSwim(other)}</small>{posted && <small className="ok">✓ posted</small>}</span>
                      <select aria-label={`Swimmer for ${label}`} value={rowPick(e.key)} disabled={posted} onChange={ev => setRow(e.key, ev.target.value)}>{swimmerOptions(false)}</select>
                    </li>
                  );
                })}
                {mode === "lap" && stopped && list.length > 1 && (
                  <li className={"sw-row total" + (sw.posted.total ? " posted" : "")}>
                    <input type="checkbox" aria-label="Post total" checked={isTicked("total")} disabled={!!sw.posted.total} onChange={ev => setTick("total", ev.target.checked)} />
                    <span className="sw-lbl">Total</span>
                    <span className="sw-t">{fmtSwim(sw.stopAt!)}<small>{list.length} reps</small>{sw.posted.total && <small className="ok">✓ posted</small>}</span>
                    <select aria-label="Swimmer for total" value={rowPick("total")} disabled={!!sw.posted.total} onChange={ev => setRow("total", ev.target.value)}>{swimmerOptions(false)}</select>
                  </li>
                )}
              </ul>
            </section>

            <section className="card">
              <h2 className="card-title">Post to profile</h2>
              <div className="field-pair">
                <div>
                  <label htmlFor="sw-stroke">Stroke</label>
                  <select id="sw-stroke" value={stroke} onChange={e => setStroke(e.target.value)}>
                    {STROKES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="sw-dist">Distance measured</label>
                  <select id="sw-dist" value={distance} onChange={e => setDistance(e.target.value)}>
                    {DISTANCES.map(d => <option key={d} value={String(d)}>{d}m</option>)}
                    <option value="other">Other…</option>
                  </select>
                  {distance === "other" && <input aria-label="Distance in metres" inputMode="numeric" placeholder="metres" value={otherDist} onChange={e => setOtherDist(e.target.value)} />}
                </div>
              </div>
              <fieldset className="choice-set">
                <legend>Pool</legend>
                <div className="seg seg-2">
                  <button type="button" className={"seg-btn" + (course === "SC" ? " on" : "")} aria-pressed={course === "SC"} onClick={() => setCourse("SC")}>25m (SC)</button>
                  <button type="button" className={"seg-btn" + (course === "LC" ? " on" : "")} aria-pressed={course === "LC"} onClick={() => setCourse("LC")}>50m (LC)</button>
                </div>
              </fieldset>
              <label htmlFor="sw-note">Note <span className="dim">(optional)</span></label>
              <input id="sw-note" placeholder="e.g. 4 × 50 on 1:00, push start" value={note} onChange={e => setNote(e.target.value)} />
              <button type="button" className="btn primary wide" onClick={post} disabled={posting}>{posting ? "Posting…" : "Post ticked times"}</button>
              {msg && <p className={"msg" + (msg.error ? " error" : "")} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
            </section>
          </div>
        )}
      </div>
    </>
  );
}
