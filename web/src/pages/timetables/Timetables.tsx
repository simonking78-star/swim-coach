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
  buildWeekCard, DAYS_SHORT, disableTimetable, fmtRange, fmtTime, loadWeekPlans, meetStatus, seasonOf, ttState,
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
                    {d.rows.map(r => (
                      <div key={r.ts.id} className="wk-sess">
                        <div className="wk-when">{fmtTime(r.ts.start_time)}{r.ts.end_time ? " – " + fmtTime(r.ts.end_time) : ""}{r.ts.pool_size && <span className="chip">{r.ts.pool_size}</span>}</div>
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
                    ))}
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
