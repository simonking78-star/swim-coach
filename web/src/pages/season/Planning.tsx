import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { canEdit, sectionLevel } from "../../lib/access";
import {
  disableRow, fmtRange, loadBreaks, loadPlanningLists, loadSeasons, pickSeason, saveSeason, validateSeason, type BreakRow
} from "../../lib/season";
import { todayLocal, uuid } from "../../lib/util";
import { StatusMsg } from "../../components/seasonParts";

// Season planning: title, dates and breaks, then the season's competitions and macro-cycles.

export const useSeasons = (club: string | null) => useQuery({ queryKey: ["seasons", club], enabled: !!club, queryFn: () => loadSeasons(club!) });
/** The season the planner works on (running today, else next, else latest). */
export function useActiveSeason(club: string | null) {
  const q = useSeasons(club);
  return { ...q, season: q.data ? pickSeason(q.data, todayLocal().date) : null };
}
export const usePlanningLists = (seasonId: string | null | undefined) =>
  useQuery({ queryKey: ["planning", seasonId], enabled: !!seasonId, queryFn: () => loadPlanningLists(seasonId!) });

export function invalidateSeason(qc: ReturnType<typeof useQueryClient>, club: string | null) {
  ["seasons", "season_ctx", "tt_data", "planning", "season_plans"].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
  void club;
}

type BRow = BreakRow & { k: string };

export function Planning() {
  const { access } = useAuth();
  const level = sectionLevel(access, "season");
  const { club } = useClub();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const active = useActiveSeason(club);
  const season = active.season;
  const breaksQ = useQuery({ queryKey: ["season_breaks", season?.id], enabled: !!season, queryFn: () => loadBreaks(season!.id) });
  const lists = usePlanningLists(season?.id);

  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [finish, setFinish] = useState("");
  const [breaks, setBreaks] = useState<BRow[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>((location.state as { flash?: string } | null)?.flash ? { text: (location.state as { flash: string }).flash } : null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const filledFor = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!active.data) return;
    const key = season?.id ?? null;
    if (filledFor.current === key && (key === null || breaksQ.data)) return;
    if (season && !breaksQ.data) return;
    filledFor.current = key;
    setTitle(season?.title ?? ""); setStart(season?.start_date ?? ""); setFinish(season?.finish_date ?? "");
    setBreaks((breaksQ.data ?? []).map(b => ({ ...b, k: uuid() }))); setRemoved([]);
  }, [active.data, season, breaksQ.data]);

  const crumb = <p className="crumb"><Link to="/season">‹ Season planner</Link></p>;
  if (!canEdit(level)) return <>{crumb}<p className="notice warn">Season planning is read only for your role.</p></>;
  if (active.isLoading || (season && breaksQ.isLoading)) return <>{crumb}<p className="dim">Loading…</p></>;
  if (active.error) return <>{crumb}<p className="msg error">Couldn't load the season.</p></>;

  const save = async (): Promise<string | null> => {
    setMsg(null);
    const bad = validateSeason(title, start, finish, breaks);
    if (bad) { setMsg({ text: bad, error: true }); return null; }
    setBusy(true);
    try {
      const copy = breaks.map(b => ({ ...b }));
      const id = await saveSeason(club!, season?.id ?? null, title, start, finish, copy, removed);
      setBreaks(copy); setRemoved([]);
      filledFor.current = id; // keep what's on screen
      invalidateSeason(qc, club);
      qc.invalidateQueries({ queryKey: ["season_breaks"] });
      setMsg({ text: "Season saved." });
      return id;
    } catch (e) { console.error(e); setMsg({ text: (e as Error).message.startsWith("These dates") ? (e as Error).message : "Could not save: " + (e as Error).message, error: true }); return null; }
    finally { setBusy(false); }
  };
  const addEvent = async () => { if (await save()) navigate("/season/competition/new"); };
  const addMacro = async () => {
    if (!(await save())) return;
    if (!(lists.data?.comps.length)) { setMsg({ text: "Add at least one competition to the season before building a macro.", error: true }); return; }
    navigate("/season/macro/new");
  };
  const remove = async (table: "season_competitions" | "macros", id: string) => {
    setBusy(true);
    try { await disableRow(table, id); invalidateSeason(qc, club); setMsg({ text: "Removed. It is disabled, not erased." }); }
    catch (e) { console.error(e); setMsg({ text: "Could not remove: " + (e as Error).message, error: true }); }
    finally { setBusy(false); setConfirm(null); }
  };
  const removeBtn = (table: "season_competitions" | "macros", id: string, name: string) => confirm === table + id
    ? <button type="button" className="btn small danger" onClick={() => remove(table, id)} disabled={busy}>Confirm</button>
    : <button type="button" className="btn small" onClick={() => setConfirm(table + id)} aria-label={`Remove ${name}`}>Remove</button>;

  return (
    <>
      {crumb}
      <div className="page-head"><h1>Planning</h1><p className="dim">{club}</p></div>
      <section className="card">
        <label htmlFor="pl-title">Season title</label>
        <input id="pl-title" type="text" value={title} placeholder="e.g. 2026–27 Winter Season" onChange={e => setTitle(e.target.value)} />
        <div className="field-pair">
          <div><label htmlFor="pl-start">Season start</label><input id="pl-start" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><label htmlFor="pl-finish">Season finish</label><input id="pl-finish" type="date" value={finish} onChange={e => setFinish(e.target.value)} /></div>
        </div>
        <fieldset className="plain-fieldset">
          <legend>Season breaks <span className="dim">(optional)</span></legend>
          {breaks.map((b, i) => (
            <div key={b.k} className="break-row" role="group" aria-label={`Break ${i + 1}`}>
              <input type="date" aria-label={`Break ${i + 1} start`} value={b.start} onChange={e => setBreaks(bs => bs.map(x => (x.k === b.k ? { ...x, start: e.target.value } : x)))} />
              <input type="date" aria-label={`Break ${i + 1} finish`} value={b.end} onChange={e => setBreaks(bs => bs.map(x => (x.k === b.k ? { ...x, end: e.target.value } : x)))} />
              <button type="button" className="icon-btn plain" aria-label={`Remove break ${i + 1}`} onClick={() => { if (b.id) setRemoved(r => [...r, b.id!]); setBreaks(bs => bs.filter(x => x.k !== b.k)); }}>✕</button>
            </div>
          ))}
          <button type="button" className="link-btn" onClick={() => setBreaks(bs => [...bs, { k: uuid(), id: null, start: "", end: "" }])}>+ Add break</button>
        </fieldset>
        <div className="btn-row gap-top">
          <button type="button" className="btn small" onClick={addEvent} disabled={busy}>+ Add event</button>
          <button type="button" className="btn small" onClick={addMacro} disabled={busy}>+ Add macro</button>
        </div>
        <button type="button" className="btn primary wide" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <StatusMsg msg={msg} />
      </section>

      <section className="card" aria-labelledby="pl-comps">
        <h2 id="pl-comps" className="card-title">Season competitions</h2>
        {!season ? <p className="dim">Save the season first.</p> : lists.isLoading ? <p className="dim">Loading…</p> : !lists.data?.comps.length ? <p className="dim">No competitions yet — use Add event.</p> : (
          <ul className="pl-list">
            {lists.data.comps.map(c => {
              const n = (c.competition_events || []).filter(e => e.is_active).length;
              return (
                <li key={c.id}>
                  <div>
                    <div className="meet-name">{c.name}</div>
                    <div className="dim small">{fmtRange(c.date_from, c.date_to)} · {c.total_days} day{c.total_days === 1 ? "" : "s"} · {c.level ? `L${c.level} · ` : ""}{c.course} · {n} event{n === 1 ? "" : "s"}</div>
                  </div>
                  <div className="btn-row nowrap">
                    <Link className="btn small" to={`/season/competition/${c.id}`}>Edit</Link>
                    {removeBtn("season_competitions", c.id, c.name)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="pl-macros">
        <h2 id="pl-macros" className="card-title">Macro-cycles</h2>
        {!season ? <p className="dim">Save the season first.</p> : lists.isLoading ? <p className="dim">Loading…</p> : !lists.data?.macros.length ? <p className="dim">No macro-cycles yet — use Add macro.</p> : (
          <ul className="pl-list">
            {lists.data.macros.map(m => {
              const sq = (m.macro_squads || []).filter(x => x.is_active).map(x => x.squads?.name || "").join(", ");
              return (
                <li key={m.id}>
                  <div>
                    <div className="meet-name">{m.title}</div>
                    <div className="dim small">{sq || "No squads"} · {m.micro_count} week{m.micro_count === 1 ? "" : "s"}</div>
                  </div>
                  <div className="btn-row nowrap">
                    <Link className="btn small" to={`/season/macro/${m.id}/weeks`}>Weeks</Link>
                    <Link className="btn small" to={`/season/macro/${m.id}`}>Edit</Link>
                    {removeBtn("macros", m.id, m.title)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
