import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { canEdit, LEVEL_NOTE, sectionLevel } from "../../lib/access";
import { fmtWhen } from "../../lib/plans";
import { fmtRange, loadPlansBetween, pickMicros, seasonForSquad } from "../../lib/season";
import { fmtDate, fmtDdMm, isoAdd, todayLocal } from "../../lib/util";
import { usePlanSquads, useSeasonCtx } from "../plans/PlanList";
import { MicroChips } from "../timetables/Timetables";
import { useMinWidth } from "../../lib/device";
import { SeasonDesktop } from "./SeasonDesktop";
import { Modal } from "../../components/Modal";

// Season overview: one panel per squad with this week's training and the
// season's forthcoming competitions. PLAN opens the season planner.

const OPEN_KEY = "snOpen";
const readOpen = (): Set<string> => { try { return new Set(JSON.parse(sessionStorage.getItem(OPEN_KEY) || "[]")); } catch { return new Set(); } };
// Squads shown on the phone planner, remembered per device and club
const shownKey = (club: string | null) => "snSquads:" + (club ?? "");
const readShown = (club: string | null): string[] | null => { try { const v = localStorage.getItem(shownKey(club)); return v ? JSON.parse(v) : null; } catch { return null; } };
const writeShown = (club: string | null, ids: string[] | null) => {
  try { if (ids) localStorage.setItem(shownKey(club), JSON.stringify(ids)); else localStorage.removeItem(shownKey(club)); } catch { /* unavailable */ }
};

export function NoSeasonAccess() {
  return <><div className="page-head"><h1>Season planner</h1></div><p className="notice warn">Your role doesn't have access to the season planner.</p></>;
}

/** Laptops and desktops get the Season Plan calendar; phones and tablets keep the squad panels. */
export function Season() {
  const { access } = useAuth();
  const desktop = useMinWidth(900);
  if (sectionLevel(access, "season") === "N") return <NoSeasonAccess />;
  return desktop ? <SeasonDesktop /> : <SeasonPhone />;
}

function SeasonPhone() {
  const { access } = useAuth();
  const level = sectionLevel(access, "season");
  const canPlan = canEdit(sectionLevel(access, "plans"));
  const { club } = useClub();
  const today = todayLocal().date;
  const ctx = useSeasonCtx(club);
  const squads = usePlanSquads(club);
  const [open, setOpenState] = useState<Set<string>>(readOpen);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shownIds, setShownIds] = useState<string[] | null>(() => readShown(club));
  useEffect(() => { setShownIds(readShown(club)); }, [club]);
  const mine = ((access?.squads ?? []) as string[]);

  const allSquads = squads.data ?? [];
  // Default: the coach's own squads if they have any, else every squad
  const defaultIds = allSquads.filter(q => mine.includes(q.id)).map(q => q.id);
  const shownSet = new Set(shownIds ?? (defaultIds.length ? defaultIds : allSquads.map(q => q.id)));
  const shown = allSquads.filter(q => shownSet.has(q.id));
  const setShown = (ids: string[] | null) => { setShownIds(ids); writeShown(club, ids); };
  const toggleShown = (id: string) => {
    const n = new Set(shownSet);
    if (n.has(id)) n.delete(id); else n.add(id);
    setShown(allSquads.filter(q => n.has(q.id)).map(q => q.id));
  };

  // Each squad follows the season plan it is linked to
  const seasonOf = (squadId: string) => (ctx.data ? seasonForSquad(ctx.data.seasons, squadId, today) : null);
  const picks: Record<string, ReturnType<typeof pickMicros>[string]> = {};
  if (ctx.data) for (const sq of shown) { const s = seasonOf(sq.id); picks[sq.id] = s ? pickMicros(ctx.data, s.id, [sq], today)[sq.id] : null; }
  const shownSeasons = [...new Map(shown.map(sq => seasonOf(sq.id)).filter(Boolean).map(s => [s!.id, s!])).values()];
  const season = shownSeasons.length === 1 ? shownSeasons[0] : null;
  const weeks = Object.values(picks).filter(Boolean).map(m => m!.week_commencing!).sort();
  const plans = useQuery({
    queryKey: ["season_plans", club, weeks[0], weeks[weeks.length - 1]], enabled: !!club && weeks.length > 0,
    queryFn: () => loadPlansBetween(club!, weeks[0], isoAdd(weeks[weeks.length - 1], 6))
  });

  if (level === "N") return <NoSeasonAccess />;

  const toggle = (id: string) => setOpenState(o => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id);
    else { if (window.matchMedia("(max-width: 767px)").matches) n.clear(); n.add(id); }
    try { sessionStorage.setItem(OPEN_KEY, JSON.stringify([...n])); } catch { /* unavailable */ }
    return n;
  });
  const compsFor = (seasonId: string | undefined) => ctx.data && seasonId ? ctx.data.comps.filter(c => c.season_id === seasonId && (c.date_to || c.date_from) >= today).sort((a, b) => a.date_from.localeCompare(b.date_from)) : [];

  return (
    <>
      <div className="page-head row">
        <div>
          <h1><span aria-hidden="true">🗓️</span> Season planner</h1>
          {season ? <p className="dim"><strong>{season.title}</strong> · {fmtDate(season.start_date)} – {fmtDate(season.finish_date)}</p>
            : shownSeasons.length > 1 ? <p className="dim">{shownSeasons.length} season plans</p>
            : ctx.data && <p className="dim">No season set up yet{canEdit(level) ? " — tap PLAN to create one" : ""}.</p>}
        </div>
        {canEdit(level) && <Link className="btn primary" to={season ? `/season/plan?season=${season.id}` : "/season/plan"}>PLAN</Link>}
      </div>
      {LEVEL_NOTE[level] && <p className="notice">{LEVEL_NOTE[level]}</p>}
      <ClubPicker />
      <div className="btn-row gap-bottom">
        {allSquads.length > 0 && (
          <button type="button" className="btn small primary-outline" onClick={() => setPickerOpen(true)} aria-haspopup="dialog">
            Squads · {shown.length === allSquads.length ? "All" : `${shown.length} of ${allSquads.length}`}
          </button>
        )}
        <Link className="btn small" to="/timetables">Timetables</Link>
        <Link className="btn small" to="/sessions">Session plans</Link>
        <Link className="btn small" to="/competitions">Competitions</Link>
      </div>
      {(ctx.isLoading || squads.isLoading) && <p className="dim">Loading season…</p>}
      {(ctx.error || squads.error) && <p className="msg error">Couldn't load the season. <button type="button" className="link-btn" onClick={() => { ctx.refetch(); squads.refetch(); }}>Try again</button></p>}
      {squads.data && !squads.data.length && <p className="dim card">No squads for this club yet — add one under Admin.</p>}
      {squads.data && allSquads.length > 0 && !shown.length && (
        <p className="dim card">No squads selected. <button type="button" className="link-btn" onClick={() => setPickerOpen(true)}>Choose squads</button></p>
      )}
      {ctx.data && shown.map(sq => {
        const isOpen = open.has(sq.id), micro = picks[sq.id];
        const sqSeason = seasonOf(sq.id);
        const comps = compsFor(sqSeason?.id);
        const rows = micro ? ctx.data!.sessions.filter(x => x.micro_id === micro.id && x.squad_id === sq.id)
          .sort((a, b) => a.session_date.localeCompare(b.session_date) || (a.start_time || "").localeCompare(b.start_time || "")) : [];
        return (
          <section key={sq.id} className="card sn-panel">
            <button type="button" className="more-btn head" aria-expanded={isOpen} aria-controls={"sn-" + sq.id} onClick={() => toggle(sq.id)}>
              <span><strong>{sq.name}</strong><span className="dim small block">{sqSeason ? sqSeason.title : "Not on a season plan"}</span></span>
              <span aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
            </button>
            {isOpen && (
              <div id={"sn-" + sq.id} className="more-body">
                <h3 className="sec-title">This week's training</h3>
                {!sqSeason ? <p className="dim">This squad isn't on a season plan yet{canEdit(level) ? " — use PLAN and tick it under “Squads on this plan”" : ""}.</p>
                  : !micro ? <p className="dim">No training week planned for this squad yet — use PLAN → Add macro.</p>
                  : (
                    <>
                      <p className="micro-line">{micro.macroTitle} · Week {micro.week_no} · w/c {fmtDdMm(micro.week_commencing!)}</p>
                      <MicroChips micro={micro} short />
                      {!rows.length && <p className="dim">No sessions recorded for this week.</p>}
                      <ul className="sn-sessions">
                        {rows.map(r => {
                          const pl = (plans.data ?? []).find(x => x.squad_id === sq.id && x.intended_date === r.session_date);
                          return (
                            <li key={r.id}>
                              <div className="micro-when">{fmtWhen(r.session_date, r.start_time, r.end_time)}</div>
                              {r.stroke_focus && <div className="small">Stroke focus: {r.stroke_focus}</div>}
                              {r.outline && <div className="dim small pre">{r.outline}</div>}
                              {canPlan && (pl
                                ? <Link className="link-btn" to={`/sessions/${pl.id}`} state={{ from: "/season" }}>View session plan</Link>
                                : <Link className="link-btn" state={{ from: "/season" }} to={`/sessions/new?squad=${sq.id}&date=${r.session_date}&session=${r.id}`}>+ Write session plan</Link>)}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="hint">Coach's discretion may result in the sessions being altered.</p>
                    </>
                  )}
                <h3 className="sec-title">Forthcoming competitions</h3>
                {comps.length ? (
                  <ul className="meet-list">
                    {comps.map(c => (
                      <li key={c.id}>
                        <div>
                          <Link className="meet-name" to={c.competition_id ? `/competitions?focus=${c.competition_id}` : `/competitions?q=${encodeURIComponent(c.name)}`}>{c.name}</Link>
                          <div className="dim small">{fmtRange(c.date_from, c.date_to)}{c.level ? " · L" + c.level : ""} · {c.course}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="dim">No forthcoming competitions in this season.</p>}
              </div>
            )}
          </section>
        );
      })}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Choose squads">
        <p className="dim small">Pick the squads to show on this phone. Your choice is remembered on this device.</p>
        <div className="btn-row">
          <button type="button" className="btn small" onClick={() => setShown(allSquads.map(q => q.id))}>All</button>
          {defaultIds.length > 0 && <button type="button" className="btn small" onClick={() => setShown(defaultIds)}>My squads</button>}
          <button type="button" className="btn small" onClick={() => setShown([])}>None</button>
        </div>
        <ul className="sq-pick">
          {allSquads.map(q => {
            const s = seasonOf(q.id);
            return (
              <li key={q.id}>
                <label>
                  <input type="checkbox" checked={shownSet.has(q.id)} onChange={() => toggleShown(q.id)} />
                  <span><strong>{q.name}</strong>{mine.includes(q.id) && <span className="chip tiny">Mine</span>}
                    <span className="dim small block">{s ? s.title : "Not on a season plan"}</span></span>
                </label>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn primary wide" onClick={() => setPickerOpen(false)}>Done</button>
      </Modal>
    </>
  );
}
