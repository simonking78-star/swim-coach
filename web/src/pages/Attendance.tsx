import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { ClubPicker } from "../club/ClubPicker";
import { LEVEL_NOTE, sectionLevel } from "../lib/access";
import {
  POOLS, WHOLE_CLUB, coachName, fmtDay, loadPlanOptions, loadRegister, loadSquadNames, logEvent,
  markLabel, nextTickStatus, resolveSessionMinutes, saveMark, tally, todayLocal,
  type AttSession, type AttStatus, type AttSwimmer, type Pool, type SaveResult
} from "../lib/attendance";
import { legacyUrl } from "../sections";

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
  const [time, setTime] = useState(now.time);
  const [pool, setPool] = useState<Pool | null>(null);
  const [planId, setPlanId] = useState("");
  const [mode, setMode] = useState<"swipe" | "tick">("swipe");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const squads = useQuery({ queryKey: ["att_squads", club], enabled: !!club, queryFn: () => loadSquadNames(club!) });
  const plans = useQuery({ queryKey: ["att_plans", club], enabled: !!club, queryFn: () => loadPlanOptions(club!) });
  useEffect(() => { setSquad(WHOLE_CLUB); setPlanId(""); }, [club]);

  const startMarking = async () => {
    setMsg(null);
    if (!club) return setMsg({ text: "Choose a club.", error: true });
    if (!date) return setMsg({ text: "Set a date.", error: true });
    if (!time) return setMsg({ text: "Set a time.", error: true });
    if (!pool) return setMsg({ text: "Choose a pool size.", error: true });
    setBusy(true);
    setMsg({ text: "Loading swimmers…" });
    try {
      const [sessionMinutes, coach] = await Promise.all([
        resolveSessionMinutes(date, time, squad, club),
        coachName(auth!.user.id, auth!.user.email)
      ]);
      const s: AttSession = { club, squad, date, time, pool, planId: planId || null, sessionMinutes, mode, coach };
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

      <label htmlFor="att-squad">Squad</label>
      <select id="att-squad" value={squad} onChange={e => setSquad(e.target.value)}>
        <option value={WHOLE_CLUB}>Whole club</option>
        {(squads.data ?? []).map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      <div className="field-pair">
        <div>
          <label htmlFor="att-date">Date</label>
          <input id="att-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="att-time">Time</label>
          <input id="att-time" type="time" value={time} onChange={e => setTime(e.target.value)} />
        </div>
      </div>

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
        <button type="button" className="btn small" onClick={allIn} disabled={counts.unmarked === 0}>All In</button>
      </div>

      <div className="seg seg-2 mode-switch" role="group" aria-label="Marking method">
        <button type="button" className={"seg-btn" + (session.mode === "swipe" ? " on" : "")} aria-pressed={session.mode === "swipe"} onClick={() => switchMode("swipe")}>Card swipe</button>
        <button type="button" className={"seg-btn" + (session.mode === "tick" ? " on" : "")} aria-pressed={session.mode === "tick"} onClick={() => switchMode("tick")}>Tick list</button>
      </div>

      {saveNote === "queued" && <p className="notice">No signal — marks are stored on this phone and will sync when you're back online.</p>}
      {saveNote === "failed" && <p className="notice warn" role="alert">A mark couldn't be saved. Check your connection and that you can mark this squad, then mark that swimmer again.</p>}

      {session.mode === "swipe"
        ? <SwipeMode swimmers={swimmers} index={index} setIndex={setIndex} onMark={mark} />
        : <TickMode swimmers={swimmers} onMark={mark} />}

      <button className="btn primary wide finish" onClick={finish} disabled={finishing}>{finishing ? "Saving…" : "Finish session"}</button>
    </div>
  );
}

function sessionLine(s: AttSession) {
  return [fmtDay(s.date), s.time, s.pool, s.squad === WHOLE_CLUB ? "Whole club" : s.squad, s.club, `${s.sessionMinutes} min session`].join(" · ");
}

// ---------------------------------------------------------------------------
// Swipe mode
// ---------------------------------------------------------------------------
function SwipeMode({ swimmers, index, setIndex, onMark }: {
  swimmers: AttSwimmer[]; index: number; setIndex: (i: number) => void;
  onMark: (id: string, status: AttStatus, minutes?: number | null) => void;
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
      {partialOpen && <MinutesPicker onPick={m => { setPartialOpen(false); commit("partial", m); }} onClose={() => setPartialOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tick list mode
// ---------------------------------------------------------------------------
function TickMode({ swimmers, onMark }: { swimmers: AttSwimmer[]; onMark: (id: string, status: AttStatus, minutes?: number | null) => void }) {
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
            <MinutesPicker onPick={m => { setMinsFor(null); onMark(s.id, "partial", m); }} onClose={() => setMinsFor(null)} />
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
function MinutesPicker({ onPick, onClose }: { onPick: (m: number) => void; onClose: () => void }) {
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
      {[15, 30, 45].map(m => <button key={m} type="button" className="btn small" onClick={() => onPick(m)}>{m}m</button>)}
      <form className="mins-other" onSubmit={e => { e.preventDefault(); if (Number.isFinite(otherN) && otherN >= 0) onPick(otherN); }}>
        <input type="number" inputMode="numeric" min={0} max={300} placeholder="Other" aria-label="Other minutes" value={other} onChange={e => setOther(e.target.value)} />
        <button type="submit" className="btn small" disabled={!Number.isFinite(otherN) || otherN < 0}>Set</button>
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
      {t.pct !== null && <p className="done-pct">Session attendance: <strong>{t.pct}%</strong></p>}
      <p className="dim">What next?</p>
      <div className="next-row">
        <Link className="tile" to={session.planId ? `/feedback?plan=${session.planId}` : "/feedback"}><span className="tile-icon" aria-hidden="true">📝</span><span className="tile-text"><strong>Feedback</strong><span className="dim">{session.planId ? "Linked to this session's plan" : "Swimmer and squad feedback"}</span></span></Link>
        <a className="tile" href={legacyUrl("session")}><span className="tile-icon" aria-hidden="true">🗓️</span><span className="tile-text"><strong>Session plans</strong><span className="dim">Opens in the current app</span></span></a>
      </div>
      <div className="done-actions">
        <button className="btn" onClick={onNew}>Mark another register</button>
        <Link className="btn" to="/">Home</Link>
      </div>
    </div>
  );
}
