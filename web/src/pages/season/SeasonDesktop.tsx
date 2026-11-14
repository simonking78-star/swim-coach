import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { canEdit as canEditLv, LEVEL_NOTE, sectionLevel } from "../../lib/access";
import { fmtDate, todayLocal } from "../../lib/util";
import { loadBoard, loadPanels } from "../../lib/seasonBoard";
import { usePlanSquads } from "../plans/PlanList";
import { chooseSeason, useActiveSeason } from "./Planning";
import { SeasonBoard } from "./SeasonBoard";
import { SeasonPanels } from "./SeasonPanels";
import { EventsEditor, RegistrationsEditor, StandardEditor, WindowsEditor } from "./BoardEditors";

// Season Plan page for laptops and desktops (claude/specs/season-plan-desktop.md).
// Phones keep the stacked squad panels in Season.tsx.

type Open = null | { kind: "test_set" | "squad_move" | "events" | "regs" | "standard"; focus?: string | null };

export function SeasonDesktop() {
  const { access } = useAuth();
  const { club, clubId } = useClub();
  const qc = useQueryClient();
  const level = sectionLevel(access, "season");
  const editable = canEditLv(level);
  const canPlan = canEditLv(sectionLevel(access, "plans"));
  const regLevel = sectionLevel(access, "registrations");
  const isAdmin = canEditLv(sectionLevel(access, "admin"));
  const mySquads = new Set((access?.squads ?? []) as string[]);
  const today = todayLocal().date;

  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const seasons = useActiveSeason(club);
  const season = seasons.season;
  const pickSeason = (id: string) => {
    if (id === "new") { navigate("/season/plan?season=new"); return; }
    chooseSeason(club, id); setParams({ season: id }, { replace: true }); setFilter(null);
  };
  const plan = season ? `?season=${season.id}` : "";
  const squads = usePlanSquads(club);
  const board = useQuery({ queryKey: ["season_board", season?.id], enabled: !!season, queryFn: () => loadBoard(season!.id, season!.start_date, season!.finish_date) });
  const panels = useQuery({ queryKey: ["season_panels", season?.id], enabled: !!season, staleTime: 60 * 1000, queryFn: () => loadPanels(season!.id) });
  const [filter, setFilter] = useState<Set<string> | null>(null);
  const [open, setOpen] = useState<Open>(null);

  // Only the squads linked to this season plan
  const allSquads = (squads.data ?? []).filter(s => !!season?.squad_ids.includes(s.id));
  const selected = filter ?? new Set(allSquads.map(s => s.id));
  const shownSquads = allSquads.filter(s => selected.has(s.id));
  const refresh = () => { qc.invalidateQueries({ queryKey: ["season_board"] }); qc.invalidateQueries({ queryKey: ["season_panels"] }); };

  const toggle = (id: string) => setFilter(f => {
    const n = new Set(f ?? allSquads.map(s => s.id));
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const eligibleSquads = (compId: string) => [...new Set((board.data?.macros ?? []).filter(m => m.comps.some(c => c.season_competition_id === compId)).flatMap(m => m.squadIds))];
  const upcoming = (board.data?.comps ?? []).filter(c => (c.date_to || c.date_from) >= today);
  const regEditable = regLevel === "E" ? null : regLevel === "SE" ? mySquads : new Set<string>();
  const canRegister = regLevel === "E" || regLevel === "SE";

  return (
    <>
      <div className="page-head row">
        <div>
          <h1><span aria-hidden="true">🗓️</span> Season plan</h1>
          {season ? <p className="dim"><strong>{season.title}</strong> · {fmtDate(season.start_date)} – {fmtDate(season.finish_date)}</p>
            : seasons.data && <p className="dim">No season set up yet{editable ? " — use Season & breaks to create one" : ""}.</p>}
        </div>
        {(seasons.data?.length || editable) ? (
          <div>
            <label htmlFor="sp-season">Season plan</label>
            <select id="sp-season" value={season?.id ?? ""} onChange={e => pickSeason(e.target.value)}>
              {!season && <option value="">Choose…</option>}
              {(seasons.data ?? []).map(s => <option key={s.id} value={s.id}>{s.title} · {s.squad_ids.length} squad{s.squad_ids.length === 1 ? "" : "s"}</option>)}
              {editable && <option value="new">+ New season plan</option>}
            </select>
          </div>
        ) : null}
      </div>
      {LEVEL_NOTE[level] && <p className="notice">{LEVEL_NOTE[level]}</p>}

      <div className="sp-toolbar">
        <div className="sp-squads" role="group" aria-label="Squads shown">
          <span className="dim small">Squads</span>
          {allSquads.map(s => (
            <label key={s.id} className={"check-chip" + (mySquads.has(s.id) ? " mine" : "")}>
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} /> {s.name}
            </label>
          ))}
          {filter && <button type="button" className="link-btn small" onClick={() => setFilter(null)}>Show all</button>}
          {mySquads.size > 0 && <button type="button" className="link-btn small" onClick={() => setFilter(new Set([...mySquads].filter(id => allSquads.some(s => s.id === id))))}>My squads</button>}
        </div>
        {(editable || canPlan || canRegister) && (
          <div className="sp-edit" role="group" aria-label="Edit the season">
            {editable && <Link className="btn small" to={`/season/plan${plan}`}>Season, squads &amp; breaks</Link>}
            {editable && <Link className="btn small" to={`/season/plan${plan}#pl-macros`}>Macros &amp; mesos</Link>}
            {editable && <Link className="btn small" to={`/season/plan${plan}#pl-comps`}>Competitions &amp; types</Link>}
            {canRegister && <button type="button" className="btn small" onClick={() => setOpen({ kind: "regs" })} disabled={!upcoming.length && !board.data?.comps.length}>Registrations</button>}
            <button type="button" className="btn small" onClick={() => setOpen({ kind: "test_set" })}>Test windows</button>
            <button type="button" className="btn small" onClick={() => setOpen({ kind: "squad_move" })}>Squad moves</button>
            <button type="button" className="btn small" onClick={() => setOpen({ kind: "events" })}>Club events</button>
            {canPlan && <Link className="btn small" to="/sessions">Session plans</Link>}
          </div>
        )}
      </div>

      {(seasons.isLoading || squads.isLoading || board.isLoading) && <p className="dim">Loading the season…</p>}
      {(board.error || squads.error) && <p className="msg error">Couldn't load the season. <button type="button" className="link-btn" onClick={() => { board.refetch(); squads.refetch(); }}>Try again</button></p>}
      {season && squads.data && !allSquads.length && (
        <p className="notice warn">No squads are linked to <strong>{season.title}</strong> yet.{" "}
          {editable ? <Link to={`/season/plan${plan}`}>Choose its squads</Link> : "Ask your head coach to choose its squads."}</p>
      )}
      {season && board.data && allSquads.length > 0 && (
        <SeasonBoard season={season} squads={shownSquads} data={board.data} today={today} mySquads={mySquads} canEdit={editable} canPlan={canPlan}
          onWindow={id => setOpen({ kind: board.data!.windows.find(w => w.id === id)?.kind ?? "test_set", focus: id })}
          onEvent={id => setOpen({ kind: "events", focus: id })} />
      )}

      {season && allSquads.length > 0 && (panels.error ? <p className="msg error">Couldn't load the season figures. <button type="button" className="link-btn" onClick={() => panels.refetch()}>Try again</button></p>
        : panels.isLoading ? <p className="dim">Working out the season figures…</p>
        : panels.data && <SeasonPanels panels={panels.data} squads={allSquads} squadFilter={selected} isAdmin={isAdmin} canRegister={canRegister}
            onStandard={() => setOpen({ kind: "standard" })} onRegister={id => setOpen({ kind: "regs", focus: id })} />)}

      {season && board.data && club && <>
        <WindowsEditor open={open?.kind === "test_set" || open?.kind === "squad_move"} kind={open?.kind === "squad_move" ? "squad_move" : "test_set"} onClose={() => setOpen(null)}
          seasonId={season.id} club={club} squads={allSquads} windows={board.data.windows} focusId={open?.focus ?? null} canEdit={editable} onSaved={refresh} />
        <EventsEditor open={open?.kind === "events"} onClose={() => setOpen(null)} seasonId={season.id} squads={allSquads} events={board.data.events}
          focusId={open?.focus ?? null} canEdit={editable} onSaved={refresh} />
        {clubId && <RegistrationsEditor open={open?.kind === "regs"} onClose={() => setOpen(null)} comps={upcoming.length ? upcoming : board.data.comps}
          compId={open?.focus ?? panels.data?.next_comp?.id ?? null} clubId={clubId} squads={allSquads} eligibleSquads={eligibleSquads}
          editableSquads={regEditable} onSaved={() => qc.invalidateQueries({ queryKey: ["season_panels"] })} />}
        {isAdmin && <StandardEditor open={open?.kind === "standard"} onClose={() => setOpen(null)} seasonId={season.id} seasonTitle={season.title}
          onSaved={() => qc.invalidateQueries({ queryKey: ["season_panels"] })} />}
      </>}
    </>
  );
}
