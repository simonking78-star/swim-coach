import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { canEdit, LEVEL_NOTE, sectionLevel } from "../../lib/access";
import { QES } from "../../lib/feedback";
import { TECH_FOCUS } from "../../lib/plans";
import {
  buildWeekCard, clearOverride, COURSES, DAYS_SHORT, disableTimetable, effectiveSession, loadOverrides, POOLS, saveOverride, type TtOverride, type TtSession, fmtRange, fmtTime, loadWeekPlans, meetStatus, seasonOf, ttState,
  upcomingMeets, weekFocus, type Timetable, type TimetablesData
} from "../../lib/season";
import { fmtDate, fmtDdMm, isoAdd, todayLocal } from "../../lib/util";
import { FocusTags } from "../../components/planParts";
import { StatusMsg, useTimetablesData } from "../../components/seasonParts";
import { useSeasonCtx } from "../plans/PlanList";
import type { Micro } from "../../lib/plans";

// Timetables: "Week plan" (Mon–Sun per squad with micro-cycle and session plans)
// and "Timetables" (each squad's weekly timetable, season and upcoming meets).

const monday = (iso: string) => { const g = new Date(iso + "T00:00:00").getDay(); return isoAdd(iso, g === 0 ? -6 : 1 - g); };

export function MicroChips({ micro, short = false }: { micro: Pick<Micro, "meso" | "qes_focus" | "technical_focus">; short?: boolean }) {
  const q = micro.qes_focus;
  return (
    <div className="chip-row tight">
      {micro.meso && <span className="chip">Meso {micro.meso}</span>}
      {q && <span className={"chip qes-" + q}>{QES[q] ?? q}</span>}
      {micro.technical_focus && <span className="chip">{short ? "" : "Technical: "}{micro.technical_focus}. {TECH_FOCUS[micro.technical_focus]}</span>}
    </div>
  );
}

export function Timetables() {
  const { access } = useAuth();
  const level = sectionLevel(access, "timetables");
  const planLevel = sectionLevel(access, "plans");
  const { club } = useClub();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "list" ? "list" : "week";
  const data = useTimetablesData(club);
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;

  if (level === "N") return <><div className="page-head"><h1>Timetables</h1></div><p className="notice warn">Your role doesn't have access to timetables.</p></>;

  return (
    <>
      <div className="page-head row">
        <div>
          <h1><span aria-hidden="true">🕒</span> Timetables</h1>
          <p className="dim">Each squad's week, and the timetables behind it</p>
        </div>
        {canEdit(level) && tab === "list" && <Link className="btn primary" to="/timetables/new">+ Add timetable</Link>}
      </div>
      {LEVEL_NOTE[level] && <p className="notice">{LEVEL_NOTE[level]}</p>}
      <ClubPicker />
      <div className="seg seg-2 tabs" role="tablist" aria-label="Timetables view">
        <button type="button" role="tab" aria-selected={tab === "week"} className={"seg-btn" + (tab === "week" ? " on" : "")} onClick={() => setParams({}, { replace: true })}>Week plan</button>
        <button type="button" role="tab" aria-selected={tab === "list"} className={"seg-btn" + (tab === "list" ? " on" : "")} onClick={() => setParams({ tab: "list" }, { replace: true })}>Timetables</button>
      </div>
      {data.isLoading && <p className="dim">Loading timetables…</p>}
      {data.error && <p className="msg error">Couldn't load timetables. <button type="button" className="link-btn" onClick={() => data.refetch()}>Try again</button></p>}
      {data.data && (tab === "week"
        ? <WeekPlan data={data.data} club={club!} canPlan={canEdit(planLevel)} />
        : <TimetableList data={data.data} club={club!} editable={canEdit(level)} flash={flash} />)}
    </>
  );
}

// ---------------------------------------------------------------------------
function WeekPlan({ data, club, canPlan }: { data: TimetablesData; club: string; canPlan: boolean }) {
  const today = todayLocal().date;
  const [wk, setWk] = useState(() => monday(today));
  const [only, setOnly] = useState("");
  const end = isoAdd(wk, 6);
  const ctx = useSeasonCtx(club);
  const plans = useQuery({ queryKey: ["week_plans", club, wk], queryFn: () => loadWeekPlans(club, wk, end) });
  const touch = useRef<{ x: number; y: number } | null>(null);
  const qc = useQueryClient();
  const sessionIds = useMemo(() => data.timetables.flatMap(t => (t.timetable_sessions || []).map(x => x.id)), [data.timetables]);
  const ovs = useQuery({ queryKey: ["tt_overrides", club, wk], queryFn: () => loadOverrides(sessionIds, wk, end) });
  const ovAt = (id: string, date: string) => (ovs.data ?? []).find(o => o.timetable_session_id === id && o.session_date === date);
  const [editing, setEditing] = useState<string | null>(null); // "<session id>|<date>"
  const canSeries = canEdit(sectionLevel(useAuth().access, "timetables"));

  const squadOpts = useMemo(() => {
    const m = new Map<string, string>();
    data.timetables.forEach(t => m.set(t.squad_id, t.squads.name));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data.timetables]);

  const thisWk = monday(today);
  const sub = wk === thisWk ? "This week" : wk === isoAdd(thisWk, 7) ? "Next week" : wk === isoAdd(thisWk, -7) ? "Last week" : `${fmtDdMm(wk)} – ${fmtDdMm(end)}`;
  const shift = (n: number) => setWk(w => isoAdd(w, 7 * n));

  const groups = new Map<string, { id: string; name: string; tts: Timetable[] }>();
  data.timetables.filter(t => t.season_start <= end && t.season_end >= wk && (!only || t.squad_id === only)).forEach(t => {
    if (!groups.has(t.squad_id)) groups.set(t.squad_id, { id: t.squad_id, name: t.squads.name, tts: [] });
    groups.get(t.squad_id)!.tts.push(t);
  });
  const cards = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name)).map(g => buildWeekCard(g, g.tts, wk, ctx.data, plans.data ?? []));
  const loading = ctx.isLoading || plans.isLoading;

  return (
    <div
      onTouchStart={e => { if (e.touches.length === 1) touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={e => {
        const t0 = touch.current; touch.current = null; if (!t0) return;
        const dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
      }}
    >
      <div className="wk-nav">
        <button type="button" className="icon-btn plain" aria-label="Previous week" onClick={() => shift(-1)}>‹</button>
        <div className="wk-label" aria-live="polite"><strong>w/c {fmtDate(wk)}</strong><span className="dim">{sub}</span></div>
        <button type="button" className="icon-btn plain" aria-label="Next week" onClick={() => shift(1)}>›</button>
      </div>
      <div className="wk-tools">
        <label htmlFor="wk-squad" className="sr-only">Squad</label>
        <select id="wk-squad" value={only} onChange={e => setOnly(e.target.value)}>
          <option value="">All squads</option>
          {squadOpts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <button type="button" className="btn small" onClick={() => setWk(thisWk)} disabled={wk === thisWk}>This week</button>
      </div>
      {loading && <p className="dim">Loading the week…</p>}
      {(ctx.error || plans.error) && <p className="msg error">Couldn't load this week.</p>}
      {!loading && !cards.length && <p className="dim card">No timetable runs in this week{only ? " for this squad" : ""}. Use ‹ › to move week, or add one on the Timetables tab.</p>}
      {!loading && cards.map(c => (
        <section key={c.squadId} className="card wk-card" aria-labelledby={"wk-" + c.squadId}>
          <div className="card-head top">
            <h2 id={"wk-" + c.squadId} className="card-title">{c.name}</h2>
            {c.total > 0 && <span className={"wk-count " + (c.missing ? "warn" : "ok")}>{c.written}/{c.total} plans written{c.missing ? ` · ${c.missing} missing` : ""}</span>}
          </div>
          {c.micro ? (
            <>
              <p className="micro-line">{c.seasonTitle ? c.seasonTitle + " · " : ""}{c.micro.macroTitle} · Week {c.micro.week_no}</p>
              <MicroChips micro={c.micro} />
              {c.comp && <p className="micro-comp">🏁 {c.comp.name} · {fmtDdMm(c.comp.date_from)}</p>}
            </>
          ) : <p className="dim">No micro-cycle planned for this week — add one under Season planner.</p>}
          <ol className="wk-days">
            {c.days.map(d => {
              const isToday = d.date === today;
              return (
                <li key={d.date} className={"wk-day" + (d.brk ? " brk" : "") + (isToday ? " today" : "") + (!d.rows.length && !d.brk ? " rest" : "")}>
                  <div className="wk-date"><strong>{DAYS_SHORT[d.dow]}</strong> {fmtDdMm(d.date)}{isToday && <span className="sr-only"> (today)</span>}{d.brk && <span className="brk-pill">{d.brk}</span>}</div>
                  <div className="wk-body">
                    {!d.rows.length && <span className="dim">{d.brk ? "Rest" : "No sessions"}</span>}
                    {d.rows.map(r => { const ov = ovAt(r.ts.id, d.date); const ev = effectiveSession(r.ts, ov); const key = r.ts.id + "|" + d.date; return (
                      <div key={r.ts.id} className={"wk-sess" + (ev.cancelled ? " cancelled" : "")}>
                        <div className="wk-when">{fmtTime(ev.start_time)}{ev.end_time ? " – " + fmtTime(ev.end_time) : ""}{ev.pool_size && <span className="chip">{ev.pool_size}</span>}{ev.course && <span className="chip">{ev.course}</span>}{ev.cancelled && <span className="brk-pill">Cancelled</span>}{ov && !ev.cancelled && <span className="chip">this date only</span>}</div>
                        {(ev.location || ev.coaches) && <div className="small">{[ev.location, ev.coaches].filter(Boolean).join(" · ")}</div>}
                        {ev.note && <div className="dim small">{ev.note}</div>}
                        {canSeries && !d.brk && <button type="button" className="link-btn" aria-expanded={editing === key} onClick={() => setEditing(editing === key ? null : key)}>Edit this date</button>}
                        {editing === key && <DateEditor ts={r.ts} date={d.date} ov={ov} onDone={async () => { setEditing(null); await Promise.all([qc.invalidateQueries({ queryKey: ["tt_overrides"] }), qc.invalidateQueries({ queryKey: ["att_slots"] })]); }} />}
                        {r.m?.stroke_focus && <div className="small">Stroke focus: {r.m.stroke_focus}</div>}
                        {r.m?.outline && <div className="dim small">{r.m.outline.length > 110 ? r.m.outline.slice(0, 107) + "…" : r.m.outline}</div>}
                        {r.plan ? (
                          <Link className="wk-plan" to={`/sessions/${r.plan.id}`} state={{ from: "/timetables" }}>
                            <span>📄 {r.plan.title || "Session plan"}</span>
                            <span className="plan-tags">{!!r.plan.total_distance_m && <span className="plan-tag dist">{r.plan.total_distance_m.toLocaleString("en-GB")}m</span>}<FocusTags skills={r.plan.stroke_skills} zone={r.plan.training_zone} /></span>
                          </Link>
                        ) : !d.brk && (
                          <div className="wk-noplan">
                            <span>⚠ No session plan written</span>
                            {canPlan && <Link className="btn small" state={{ from: "/timetables" }} to={`/sessions/new?squad=${c.squadId}&date=${d.date}${r.m ? "&session=" + r.m.id : ""}`}>+ Write</Link>}
                          </div>
                        )}
                      </div>
                    ); })}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

// Change one date of a weekly session without touching the series.
function DateEditor({ ts, date, ov, onDone }: { ts: TtSession; date: string; ov: TtOverride | undefined; onDone: () => void | Promise<void> }) {
  const [cancelled, setCancelled] = useState(ov?.cancelled ?? false);
  const [start, setStart] = useState((ov?.start_time ?? ts.start_time).slice(0, 5));
  const [end, setEnd] = useState((ov?.end_time ?? ts.end_time ?? "").slice(0, 5));
  const [pool, setPool] = useState(ov?.pool_size ?? ts.pool_size ?? "");
  const [course, setCourse] = useState(ov?.course ?? ts.course ?? "");
  const [location, setLocation] = useState(ov?.location ?? ts.location ?? "");
  const [coaches, setCoaches] = useState(ov?.coaches ?? ts.coaches ?? "");
  const [note, setNote] = useState(ov?.note ?? ts.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hh = (t: string) => (t.length === 5 ? t + ":00" : t);
  // Store only what differs from the series, so later edits to the series still flow through.
  const diff = <T,>(v: T, base: T | null | undefined) => (v === (base ?? ("" as unknown as T)) || v === ("" as unknown as T) ? null : v);
  const save = async () => {
    if (!cancelled && end && end <= start) { setErr("The finish must be after the start."); return; }
    setBusy(true); setErr(null);
    try {
      await saveOverride(ts.id, date, {
        cancelled,
        start_time: diff(hh(start), ts.start_time), end_time: end ? diff(hh(end), ts.end_time) : null, pool_size: diff(pool, ts.pool_size),
        course: diff(course, ts.course), location: diff(location.trim(), ts.location), coaches: diff(coaches.trim(), ts.coaches), note: diff(note.trim(), ts.note)
      });
      await onDone();
    } catch (e) { console.error(e); setErr("Couldn't save — " + (e as Error).message); } finally { setBusy(false); }
  };
  const reset = async () => { setBusy(true); try { await clearOverride(ts.id, date); await onDone(); } catch (e) { setErr((e as Error).message); setBusy(false); } };
  return (
    <div className="card inner" role="group" aria-label={`Edit ${fmtDdMm(date)} only`}>
      <p className="hint top">Changes {fmtDdMm(date)} only. To change every week, edit the timetable.</p>
      <label className="check"><input type="checkbox" checked={cancelled} onChange={e => setCancelled(e.target.checked)} /> Cancelled on this date</label>
      {!cancelled && (
        <>
          <div className="tt-row-times">
            <label>Start<input type="time" step={300} value={start} onChange={e => setStart(e.target.value)} /></label>
            <label>Finish<input type="time" step={300} value={end} onChange={e => setEnd(e.target.value)} /></label>
            <label>Pool<select value={pool} onChange={e => setPool(e.target.value)}><option value="">—</option>{POOLS.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
          </div>
          <div className="tt-row-times">
            <label>Course<select value={course} onChange={e => setCourse(e.target.value)}><option value="">—</option>{COURSES.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
            <label>Location<input type="text" maxLength={120} value={location} onChange={e => setLocation(e.target.value)} /></label>
            <label>Coaches<input type="text" maxLength={120} value={coaches} onChange={e => setCoaches(e.target.value)} /></label>
          </div>
          <label>Note<input type="text" maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></label>
        </>
      )}
      <div className="done-actions">
        <button type="button" className="btn primary small" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save this date"}</button>
        {ov && <button type="button" className="btn small" onClick={reset} disabled={busy}>Back to the series</button>}
      </div>
      {err && <p className="msg error" role="alert">{err}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
function TimetableList({ data, club, editable, flash }: { data: TimetablesData; club: string; editable: boolean; flash?: string }) {
  const today = todayLocal().date;
  const qc = useQueryClient();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(flash ? { text: flash } : null);
  const [note, setNote] = useState<string | null>(null);

  const rank = { current: 0, upcoming: 1, past: 2 };
  const items = data.timetables.slice().sort((a, b) =>
    rank[ttState(a, today)] - rank[ttState(b, today)] || a.squads.name.localeCompare(b.squads.name) || a.season_start.localeCompare(b.season_start));

  const del = async (id: string) => {
    setBusy(true); setMsg(null);
    try {
      await disableTimetable(id);
      await qc.invalidateQueries({ queryKey: ["tt_data", club] });
      setMsg({ text: "Timetable deleted. It is disabled, not erased." });
    } catch (e) { console.error(e); setMsg({ text: "Could not delete: " + (e as Error).message, error: true }); }
    finally { setBusy(false); setConfirm(null); }
  };

  if (!items.length) return <p className="dim card">No timetables yet for {club}.{editable ? " Tap “+ Add timetable”." : ""}</p>;
  return (
    <>
      <StatusMsg msg={msg} />
      {items.map(t => {
        const state = ttState(t, today), isOpen = open.has(t.id), season = seasonOf(t, data.seasons);
        const sessions = (t.timetable_sessions || []).slice().sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
        const wf = season ? weekFocus(data.macros, t.squad_id, season.id, today) : null;
        const meets = upcomingMeets(data, season, today);
        return (
          <section key={t.id} className={"card tt-card" + (state === "past" ? " past" : "")} aria-labelledby={"tt-" + t.id}>
            <div className="card-head top">
              <div>
                <h2 id={"tt-" + t.id} className="card-title">{t.squads.name} <span className={"tt-pill " + state}>{{ current: "Current", upcoming: "Upcoming", past: "Past" }[state]}</span></h2>
                {season ? <p className="tt-sub">{season.title}</p> : <p className="tt-sub warn-text">No season linked</p>}
                <p className="tt-sub dim">Band {fmtDate(t.season_start)} – {fmtDate(t.season_end)}</p>
              </div>
              {editable && (
                <div className="btn-row nowrap">
                  <Link className="btn small" to={`/timetables/${t.id}/edit`}>Edit</Link>
                  {confirm === t.id
                    ? <button type="button" className="btn small danger" onClick={() => del(t.id)} disabled={busy}>{busy ? "Deleting…" : "Confirm"}</button>
                    : <button type="button" className="btn small" onClick={() => setConfirm(t.id)} aria-label={`Delete ${t.squads.name} timetable`}>Delete</button>}
                </div>
              )}
            </div>
            {confirm === t.id && <p className="hint">Deleting disables the timetable — it stays in the database but disappears from the app. <button type="button" className="link-btn" onClick={() => setConfirm(null)}>Cancel</button></p>}
            <ul className="tt-sessions">
              {sessions.length ? sessions.map(s => (
                <li key={s.id}><span className="tt-day">{DAYS_SHORT[s.day_of_week]}</span><span>{fmtTime(s.start_time)}{s.end_time ? " – " + fmtTime(s.end_time) : ""}</span><span className="chip">{s.pool_size || "Pool TBC"}</span></li>
              )) : <li className="dim">No sessions added yet.</li>}
            </ul>
            <button type="button" className="more-btn" aria-expanded={isOpen} aria-controls={"ttm-" + t.id}
              onClick={() => setOpen(o => { const n = new Set(o); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}>
              <span>Season, weekly focus &amp; upcoming meets</span><span aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
            </button>
            {isOpen && (
              <div id={"ttm-" + t.id} className="more-body">
                <h3 className="sec-title">Season programme</h3>
                {!season ? <p className="dim">Not linked to a season yet. Edit this timetable and choose a season to show the season programme and its meets.</p> : (
                  <>
                    <p><strong>{season.title}</strong> <span className="dim">{fmtDate(season.start_date)} – {fmtDate(season.finish_date)}</span></p>
                    <h3 className="sec-title">Focus of the week</h3>
                    {wf ? (
                      <>
                        <p className="micro-line">{wf.current ? "This week" : "Next planned week"} · Week {wf.micro.week_no} · w/c {fmtDdMm(wf.micro.week_commencing!)}</p>
                        <MicroChips micro={wf.micro} />
                      </>
                    ) : t.weekly_focus ? <p>{t.weekly_focus}</p> : <p className="dim">The focus for the week will appear here once the season programme is completed.</p>}
                  </>
                )}
                <h3 className="sec-title">Upcoming meets</h3>
                {meets.length ? (
                  <ul className="meet-list">
                    {meets.map(g => {
                      const st = meetStatus(g, today);
                      return (
                        <li key={g.id}>
                          <div>
                            <div className="meet-name">{g.name}</div>
                            <div className="dim small">{fmtRange(g.date_from, g.date_to)}{g.level ? " · L" + g.level : ""}{g.course ? " · " + g.course : ""}</div>
                          </div>
                          <div className="meet-side">
                            <span className={"meet-status " + st.key}>{st.label}</span>
                            {st.key === "open" && <button type="button" className="btn small" onClick={() => setNote(g.id)}>Enter</button>}
                          </div>
                          {note === g.id && <p className="hint full">The competition entry page hasn't been built yet. Parents will land on it from here once it is.</p>}
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="dim">{season ? "No upcoming meets in this season yet — add them under Season planner." : "Meets appear once the timetable is linked to a season."}</p>}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
