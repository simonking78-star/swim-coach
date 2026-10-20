import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { ClubPicker } from "../club/ClubPicker";
import { LEVEL_NOTE, sectionLevel } from "../lib/access";
import {
  POOLS, WHOLE_CLUB, coachName, fmtDay, loadPlanOptions, loadRegister, loadSquadNames, logEvent,
  loadSlots, markLabel, minutesBetween, nextTickStatus, saveMark, tally, todayLocal,
  type AttSession, type AttStatus, type AttSwimmer, type Pool, type SaveResult, type Slot
} from "../lib/attendance";

// Survives a reload mid-register; the marks themselves are re-read from the database.
const STORE_KEY = "coachToolsAttSession";
const readStored = (): { session: AttSession; stage: "mark" | "done" } | null => {
  try { const v = sessionStorage.getItem(STORE_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
};
const writeStored = (v: { session: AttSession; stage: "mark" | "done" } | null) => {
  try { v ? sessionStorage.setItem(STORE_KEY, JSON.stringify(v)) : sessionStorage.removeItem(STORE_KEY); } catch { /* unavailable */ }
};

export function Attendance() {
  const { access } = useAuth();
  const level = sectionLevel(access, "attendance");
  const stored = useMemo(readStored, []);
  const [session, setSession] = useState<AttSession | null>(stored?.session ?? null);
  const [stage, setStage] = useState<"setup" | "mark" | "done">(stored?.stage ?? "setup");
  const [swimmers, setSwimmers] = useState<AttSwimmer[]>([]);
  const [reloading, setReloading] = useState(!!stored);

  // Re-open a register after a reload.
  useEffect(() => {
    if (!stored) return;
    loadRegister(stored.session).then(setSwimmers).catch(() => { setStage("setup"); setSession(null); writeStored(null); })
      .finally(() => setReloading(false));
  }, [stored]);

  const start = (s: AttSession, list: AttSwimmer[]) => {
    setSession(s); setSwimmers(list); setStage("mark"); writeStored({ session: s, stage: "mark" });
    scrollTo(0, 0);
  };
  const finish = () => { setStage("done"); if (session) writeStored({ session, stage: "done" }); scrollTo(0, 0); };
  const newRegister = () => { setSession(null); setSwimmers([]); setStage("setup"); writeStored(null); scrollTo(0, 0); };

  if (level === "N") {
    return <><div className="page-head"><h1>Attendance</h1></div><p className="notice warn">Your role doesn't have access to attendance.</p></>;
  }
  if (reloading) return <p className="dim">Re-opening your register…</p>;

  return (
    <>
      <div className="page-head row">
        <div>
          <h1><span aria-hidden="true">✅</span> Attendance</h1>
          <p className="dim">{stage === "setup" ? "Set up the session, then mark the register" : stage === "mark" ? "Every change is saved straight away" : "Session complete"}</p>
        </div>
        {stage !== "setup" && <button className="btn small" onClick={newRegister}>New register</button>}
      </div>
      {LEVEL_NOTE[level] && <p className="notice">{LEVEL_NOTE[level]}</p>}

      {stage === "setup" && <Setup onStart={start} />}
      {stage === "mark" && session && <Register session={session} swimmers={swimmers} setSwimmers={setSwimmers} onFinish={finish} setSession={s => { setSession(s); writeStored({ session: s, stage: "mark" }); }} />}
      {stage === "done" && session && <Done session={session} swimmers={swimmers} onNew={newRegister} />}
    </>
  );
}

// ===========================================================================
// Setup
// ===========================================================================
function Setup({ onStart }: { onStart: (s: AttSession, list: AttSwimmer[]) => void }) {
  const { session: auth } = useAuth();
  const { club } = useClub();
  const now = useMemo(todayLocal, []);
  const [squad, setSquad] = useState(WHOLE_CLUB);
  const [date, setDate] = useState(now.date);
  // A timetabled slot (its id), or OFF for a session that isn't on the timetable.
  const [slotId, setSlotId] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pool, setPool] = useState<Pool | null>(null);
  const [planId, setPlanId] = useState("");
  const [mode, setMode] = useState<"swipe" | "tick">("swipe");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const squads = useQuery({ queryKey: ["att_squads", club], enabled: !!club, queryFn: () => loadSquadNames(club!) });
  const plans = useQuery({ queryKey: ["att_plans", club], enabled: !!club, queryFn: () => loadPlanOptions(club!) });
  const slots = useQuery({ queryKey: ["att_slots", club, squad, date], enabled: !!club && !!date, queryFn: () => loadSlots(club!, squad, date) });
  useEffect(() => { setSquad(WHOLE_CLUB); setPlanId(""); }, [club]);
  // A different day or squad means different timetabled sessions.
  useEffect(() => { setSlotId(null); setMsg(null); }, [club, squad, date]);

  const OFF = "off";
  const slot: Slot | undefined = slots.data?.find(x => x.id === slotId);
  const pickSlot = (s: Slot) => { setSlotId(s.id); setStart(s.start); setEnd(s.end); if (s.pool) setPool(s.pool); setMsg(null); };
  const pickOff = () => { setSlotId(OFF); setStart(""); setEnd(""); setMsg(null); };
  const offMinutes = start && end ? minutesBetween(start, end) : 0;

  const startMarking = async () => {
    setMsg(null);
    if (!club) return setMsg({ text: "Choose a club.", error: true });
    if (!date) return setMsg({ text: "Set the date.", error: true });
    if (!slotId) return setMsg({ text: "Choose the session — or “Not on the timetable” and enter its start and finish.", error: true });
    if (slotId === OFF) {
      if (!start || !end) return setMsg({ text: "Enter the session's start and finish time.", error: true });
      if (offMinutes <= 0) return setMsg({ text: "The finish time must be after the start time.", error: true });
    }
    if (!pool) return setMsg({ text: "Choose a pool size.", error: true });
    const sessionMinutes = slot ? slot.minutes : offMinutes;
    setBusy(true);
    setMsg({ text: "Loading swimmers…" });
    try {
      const coach = await coachName(auth!.user.id, auth!.user.email);
      const s: AttSession = {
        club, squad, date, time: slot ? slot.start : start, endTime: slot ? slot.end : end,
        timetableSessionId: slot ? slot.id : null, pool, planId: planId || null, sessionMinutes, mode, coach
      };
      const list = await loadRegister(s);
      if (list.length === 0) { setMsg({ text: "No active swimmers found for that squad.", error: true }); return; }
      onStart(s, list);
    } catch (e) {
      setMsg({ text: "Couldn't load swimmers — " + (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card att-setup">
      <ClubPicker />

      <div className="field-pair">
        <div>
          <label htmlFor="att-date">Date</label>
          <input id="att-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="att-squad">Squad</label>
          <select id="att-squad" value={squad} onChange={e => setSquad(e.target.value)}>
            <option value={WHOLE_CLUB}>Whole club</option>
            {(squads.data ?? []).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="choice-set">
        <legend>Session</legend>
        {slots.isLoading && <p className="dim">Checking the timetable…</p>}
        {slots.error && <p className="msg error">Couldn't read the timetable — use “Not on the timetable”.</p>}
        {slots.data && slots.data.length === 0 && (
          <p className="hint top">No timetabled sessions {squad === WHOLE_CLUB ? "for any squad" : `for ${squad}`} on {fmtDay(date)}. If you trained, choose “Not on the timetable”.</p>
        )}
        <div className="slot-list">
          {(slots.data ?? []).map(s => (
            <button key={s.id} type="button" className={"slot" + (slotId === s.id ? " on" : "")} aria-pressed={slotId === s.id} onClick={() => pickSlot(s)}>
              <strong>{s.start}–{s.end}</strong>
              <span>{s.minutes} min{s.pool ? ` · ${s.pool}` : ""}{squad === WHOLE_CLUB ? ` · ${s.squad}` : ""}</span>
            </button>
          ))}
          <button type="button" className={"slot off" + (slotId === OFF ? " on" : "")} aria-pressed={slotId === OFF} onClick={pickOff}>
            <strong>Not on the timetable</strong>
            <span>Enter the start and finish</span>
          </button>
        </div>
        {slotId === OFF && (
          <>
            <div className="field-pair">
              <div>
                <label htmlFor="att-start">Start</label>
                <input id="att-start" type="time" value={start} onChange={e => setStart(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="att-end">Finish</label>
                <input id="att-end" type="time" value={end} onChange={e => setEnd(e.target.value)} required />
              </div>
            </div>
            {start && end && <p className={"hint" + (offMinutes <= 0 ? " warn-text" : "")}>{offMinutes > 0 ? `${offMinutes} minute session on ${fmtDay(date)}.` : "The finish must be after the start."}</p>}
          </>
        )}
      </fieldset>

      <fieldset className="choice-set">
        <legend>Pool</legend>
        <div className="seg seg-3">
          {POOLS.map(p => (
            <button key={p} type="button" className={"seg-btn" + (pool === p ? " on" : "")} aria-pressed={pool === p} onClick={() => { setPool(p); setMsg(null); }}>{p}</button>
          ))}
        </div>
      </fieldset>

      <label htmlFor="att-plan">Session plan used <span className="dim">(optional)</span></label>
      <select id="att-plan" value={planId} onChange={e => setPlanId(e.target.value)}>
        <option value="">— none / not linked —</option>
        {(plans.data ?? []).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>

      <fieldset className="choice-set">
        <legend>Marking method</legend>
        <div className="seg seg-2">
          <button type="button" className={"seg-btn" + (mode === "swipe" ? " on" : "")} aria-pressed={mode === "swipe"} onClick={() => setMode("swipe")}>Card swipe</button>
          <button type="button" className={"seg-btn" + (mode === "tick" ? " on" : "")} aria-pressed={mode === "tick"} onClick={() => setMode("tick")}>Tick list</button>
        </div>
      </fieldset>
      <p className="hint">Swipe: right = In, left = Out. Tick list: tap a swimmer's mark to change it. Either way, every change is saved at once with its own time stamp.</p>

      <button className="btn primary wide" onClick={startMarking} disabled={busy}>{busy ? "Loading…" : "Start marking"}</button>
      {msg && <p className={"msg" + (msg.error ? " error" : " dim")} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
    </div>
  );
}

// ===========================================================================
// Register
// ===========================================================================
interface RegisterProps {
  session: AttSession;
  swimmers: AttSwimmer[];
  setSwimmers: React.Dispatch<React.SetStateAction<AttSwimmer[]>>;
  setSession: (s: AttSession) => void;
  onFinish: () => void;
}

function Register({ session, swimmers, setSwimmers, setSession, onFinish }: RegisterProps) {
  const [saveNote, setSaveNote] = useState<SaveResult | null>(null);
  const [finishing, setFinishing] = useState(false);
  const { session: auth } = useAuth();
  // Swipe position: first swimmer not yet marked.
  const [index, setIndex] = useState(() => { const i = swimmers.findIndex(s => s.status === null); return i < 0 ? swimmers.length : i; });

  const counts = tally(swimmers, session.sessionMinutes);

  const mark = (id: string, status: AttStatus, minutes: number | null = null) => {
    setSwimmers(list => list.map(s => s.id === id ? { ...s, status, minutes_attended: status === "partial" ? minutes : null } : s));
    saveMark(session, id, status, minutes).then(r => { if (r !== "saved") setSaveNote(r); });
  };

  const allIn = async () => {
    const todo = swimmers.filter(s => s.status === null);
    setSwimmers(list => list.map(s => s.status === null ? { ...s, status: "in" } : s));
    if (session.mode === "swipe") setIndex(swimmers.length);
    for (const s of todo) {
      const r = await saveMark(session, s.id, "in");
      if (r !== "saved") setSaveNote(r);
    }
  };

  const finish = async () => {
    setFinishing(true);
    // Anyone never marked this session counts as Out.
    const todo = swimmers.filter(s => s.status === null);
    setSwimmers(list => list.map(s => s.status === null ? { ...s, status: "out" } : s));
    for (const s of todo) await saveMark(session, s.id, "out");
    const final = swimmers.map(s => s.status === null ? { ...s, status: "out" as AttStatus } : s);
    const t = tally(final, session.sessionMinutes);
    logEvent(auth?.user.id, session.club, "core_task", "attendance_finish", { in: t.in, partial: t.partial, out: t.out, excused: t.excused });
    setFinishing(false);
    onFinish();
  };

  const switchMode = (mode: "swipe" | "tick") => {
    setSession({ ...session, mode });
    if (mode === "swipe") { const i = swimmers.findIndex(s => s.status === null); setIndex(i < 0 ? swimmers.length : i); }
  };

  return (
    <div className="card att-register">
      <p className="session-line">{sessionLine(session)}</p>

      <div className="att-bar">
        <p className="att-counts" aria-live="polite">
          <b>{counts.in}</b> In · <b>{counts.partial}</b> partial · <b>{counts.out}</b> Out · <b>{counts.excused}</b> Excused
          {counts.unmarked > 0 && <> · <b>{counts.unmarked}</b> unmarked</>}
        </p>
        <span className="att-pct" title="Attendance for this session (Excused not counted)">{counts.pct === null ? "—" : `${counts.pct}%`}</span>
        <span className="att-hours" title="Swimmer-hours trained so far in this session">{counts.hours} h</span>
        <button type="button" className="btn small" onClick={allIn} disabled={counts.unmarked === 0}>All In</button>
      </div>

      <div className="seg seg-2 mode-switch" role="group" aria-label="Marking method">
        <button type="button" className={"seg-btn" + (session.mode === "swipe" ? " on" : "")} aria-pressed={session.mode === "swipe"} onClick={() => switchMode("swipe")}>Card swipe</button>
        <button type="button" className={"seg-btn" + (session.mode === "tick" ? " on" : "")} aria-pressed={session.mode === "tick"} onClick={() => switchMode("tick")}>Tick list</button>
      </div>

      {saveNote === "queued" && <p className="notice">No signal — marks are stored on this phone and will sync when you're back online.</p>}
      {saveNote === "failed" && <p className="notice warn" role="alert">A mark couldn't be saved. Check your connection and that you can mark this squad, then mark that swimmer again.</p>}

      {session.mode === "swipe"
        ? <SwipeMode swimmers={swimmers} index={index} setIndex={setIndex} onMark={mark} max={session.sessionMinutes} />
        : <TickMode swimmers={swimmers} onMark={mark} max={session.sessionMinutes} />}

      <button className="btn primary wide finish" onClick={finish} disabled={finishing}>{finishing ? "Saving…" : "Finish session"}</button>
    </div>
  );
}

function sessionLine(s: AttSession) {
  return [fmtDay(s.date), `${s.time}–${s.endTime ?? "?"}`, `${s.sessionMinutes} min`, s.pool, s.squad === WHOLE_CLUB ? "Whole club" : s.squad, s.club, s.timetableSessionId ? "timetabled" : "not on the timetable"].join(" · ");
}

// ---------------------------------------------------------------------------
// Swipe mode
// ---------------------------------------------------------------------------
function SwipeMode({ swimmers, index, setIndex, onMark, max }: {
  swimmers: AttSwimmer[]; index: number; setIndex: (i: number) => void;
  onMark: (id: string, status: AttStatus, minutes?: number | null) => void; max: number;
}) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const start = useRef<number | null>(null);
  const partialBtn = useRef<HTMLButtonElement>(null);
  const [partialOpen, setPartialOpen] = useState(false);
  const total = swimmers.length;
  const current = swimmers[index];
  const THRESHOLD = 90;

  const commit = (status: AttStatus, minutes: number | null = null) => {
    if (!current || leaving) return;
    onMark(current.id, status, minutes);
    setLeaving(status === "out" || status === "excused" ? -1 : 1);
    setTimeout(() => { setLeaving(0); setDx(0); setIndex(index + 1); }, 200);
  };

  const onDown = (e: React.PointerEvent) => { start.current = e.clientX; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { if (start.current !== null) setDx(e.clientX - start.current); };
  const onUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (dx > THRESHOLD) commit("in");
    else if (dx < -THRESHOLD) commit("out");
    else setDx(0);
  };

  const shift = leaving ? leaving * 600 : dx;
  const amt = Math.min(Math.abs(dx) / THRESHOLD, 1);

  return (
    <div className="swipe">
      <div className="progress">
        <span>{Math.min(index + 1, total)} of {total}</span>
        {index > 0 && <button type="button" className="link-btn" onClick={() => setIndex(index - 1)}>← Previous</button>}
      </div>
      <div className="progress-track" aria-hidden="true"><div className="progress-fill" style={{ width: `${total ? (100 * index) / total : 0}%` }} /></div>

      <div className="swipe-stage">
        {current ? (
          <div
            className={"swipe-card" + (start.current !== null ? " dragging" : "") + (leaving ? " leaving" : "")}
            style={{ transform: `translateX(${shift}px) rotate(${shift / 12}deg)`, opacity: leaving ? 0 : 1 }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          >
            <span className="swipe-ov out" style={{ opacity: dx < 0 ? amt : 0 }}>OUT</span>
            <span className="swipe-ov in" style={{ opacity: dx > 0 ? amt : 0 }}>IN</span>
            <span className="swipe-name">{current.full_name}</span>
            {current.status
              ? <span className="swipe-sub">Already marked {markLabel(current)} — swipe or tap to change</span>
              : <span className="swipe-sub">Swipe right = In · Swipe left = Out</span>}
          </div>
        ) : (
          <p className="swipe-empty">All swimmers marked — tap <strong>Finish session</strong> below.</p>
        )}
      </div>

      <div className="tap-row">
        <button type="button" className="tap out" disabled={!current} onClick={() => commit("out")}>✕ Out</button>
        <button type="button" className="tap in" disabled={!current} onClick={() => commit("in")}>✓ In</button>
      </div>
      <div className="tap-row">
        <button type="button" className="tap excused" disabled={!current} onClick={() => commit("excused")}>Excused</button>
        <button type="button" className="tap partial" disabled={!current} ref={partialBtn} aria-expanded={partialOpen} onClick={() => setPartialOpen(o => !o)}>Partial (mins)</button>
      </div>
      {partialOpen && <MinutesPicker onPick={m => { setPartialOpen(false); commit("partial", m); }} onClose={() => setPartialOpen(false)} max={max} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tick list mode
// ---------------------------------------------------------------------------
function TickMode({ swimmers, onMark, max }: { swimmers: AttSwimmer[]; onMark: (id: string, status: AttStatus, minutes?: number | null) => void; max: number }) {
  const [minsFor, setMinsFor] = useState<string | null>(null);
  return (
    <ul className="tick-list">
      {swimmers.map(s => (
        <li key={s.id} className="tick-row">
          <span className="tick-name">{s.full_name}</span>
          <button
            type="button"
            className={"tick-box" + (s.status ? " st-" + s.status : "")}
            aria-label={`${s.full_name}: ${statusWord(s)}. Tap to change.`}
            onClick={() => onMark(s.id, nextTickStatus(s.status))}
          >{markLabel(s)}</button>
          <button
            type="button"
            className={"tick-mins" + (s.status === "partial" ? " set" : "")}
            aria-expanded={minsFor === s.id}
            aria-label={`Partial minutes for ${s.full_name}`}
            onClick={() => setMinsFor(minsFor === s.id ? null : s.id)}
          >mins</button>
          {minsFor === s.id && (
            <MinutesPicker onPick={m => { setMinsFor(null); onMark(s.id, "partial", m); }} onClose={() => setMinsFor(null)} max={max} />
          )}
        </li>
      ))}
    </ul>
  );
}

const statusWord = (s: AttSwimmer) =>
  !s.status ? "not marked" : s.status === "partial" ? `partial, ${s.minutes_attended || 0} minutes` : s.status === "in" ? "In" : s.status === "out" ? "Out" : "Excused";

// ---------------------------------------------------------------------------
// 15 / 30 / 45 / other minutes — a plain tap, never a long-press
// ---------------------------------------------------------------------------
function MinutesPicker({ onPick, onClose, max }: { onPick: (m: number) => void; onClose: () => void; max: number }) {
  const [other, setOther] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    addEventListener("keydown", onKey);
    const t = setTimeout(() => addEventListener("pointerdown", onDown, true), 0);
    return () => { removeEventListener("keydown", onKey); removeEventListener("pointerdown", onDown, true); clearTimeout(t); };
  }, [onClose]);
  const otherN = parseInt(other, 10);
  return (
    <div className="mins-picker" ref={box} role="group" aria-label="Minutes attended">
      {[15, 30, 45, 60, 75, 90].filter(m => m < max).slice(0, 4).map(m => <button key={m} type="button" className="btn small" onClick={() => onPick(m)}>{m}m</button>)}
      <form className="mins-other" onSubmit={e => { e.preventDefault(); if (Number.isFinite(otherN) && otherN >= 0) onPick(Math.min(max, otherN)); }}>
        <input type="number" inputMode="numeric" min={0} max={max} placeholder={`Other (≤${max})`} aria-label="Other minutes" value={other} onChange={e => setOther(e.target.value)} />
        <button type="submit" className="btn small" disabled={!Number.isFinite(otherN) || otherN < 0 || otherN > max}>Set</button>
      </form>
    </div>
  );
}

// ===========================================================================
// Done
// ===========================================================================
function Done({ session, swimmers, onNew }: { session: AttSession; swimmers: AttSwimmer[]; onNew: () => void }) {
  const t = tally(swimmers, session.sessionMinutes);
  return (
    <div className="card">
      <h2 className="card-title">Session complete</h2>
      <p className="session-line">{sessionLine(session)}</p>
      <div className="done-tally">
        <div className="done-stat in"><span className="n">{t.in}</span><span>In</span></div>
        <div className="done-stat"><span className="n">{t.partial}</span><span>Partial</span></div>
        <div className="done-stat out"><span className="n">{t.out}</span><span>Out</span></div>
        <div className="done-stat"><span className="n">{t.excused}</span><span>Excused</span></div>
      </div>
      {t.pct !== null && <p className="done-pct">Session attendance: <strong>{t.pct}%</strong> · <strong>{t.sessions}</strong> sessions attended · <strong>{t.hours}</strong> swimmer-hours trained ({session.sessionMinutes} min session)</p>}
      <p className="dim">What next?</p>
      <div className="next-row">
        <Link className="tile" to={session.planId ? `/feedback?plan=${session.planId}` : "/feedback"}><span className="tile-icon" aria-hidden="true">📝</span><span className="tile-text"><strong>Feedback</strong><span className="dim">{session.planId ? "Linked to this session's plan" : "Swimmer and squad feedback"}</span></span></Link>
        <Link className="tile" to={session.planId ? `/sessions/${session.planId}` : "/sessions"}><span className="tile-icon" aria-hidden="true">🗓️</span><span className="tile-text"><strong>Session plans</strong><span className="dim">{session.planId ? "This session's plan" : "Plan and archive sessions"}</span></span></Link>
      </div>
      <div className="done-actions">
        <button className="btn" onClick={onNew}>Mark another register</button>
        <Link className="btn" to="/">Home</Link>
      </div>
    </div>
  );
}
