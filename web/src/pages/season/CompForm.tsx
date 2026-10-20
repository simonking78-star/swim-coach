import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { canEdit, sectionLevel } from "../../lib/access";
import { EVENTS_18, isoDiffDays, loadCompEvents, loadScrapedInSeason, saveComp, validateComp, type CompDraft, type EvState } from "../../lib/season";
import { fmtDdMm } from "../../lib/util";
import { QtModal, StatusMsg } from "../../components/seasonParts";
import { invalidateSeason, useActiveSeason, usePlanningLists } from "./Planning";

// Add / edit a season competition: pick from the scraped meets inside the
// season (or type one in), dates, venue, link, and the events offered.

const MANUAL = "__manual";

export function CompForm() {
  const { id } = useParams();
  const { access } = useAuth();
  const level = sectionLevel(access, "season");
  const { club } = useClub();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { season, isLoading } = useActiveSeason(club);
  const lists = usePlanningLists(season?.id);
  const existing = id ? lists.data?.comps.find(c => c.id === id) : undefined;
  const source = useQuery({ queryKey: ["scraped_in_season", season?.id], enabled: !!season, queryFn: () => loadScrapedInSeason(season!) });
  const events = useQuery({ queryKey: ["comp_events", id], enabled: !!id, queryFn: () => loadCompEvents(id!) });

  const [pick, setPick] = useState("");
  const [d, setD] = useState<CompDraft>({ id: null, competitionId: null, name: "", course: "", level: "", from: "", to: "", venue: "", url: "", events: {} });
  const [galaId, setGalaId] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [qtOpen, setQtOpen] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const filled = useRef(false);

  useEffect(() => {
    if (filled.current || !id || !existing || !events.data || !source.data) return;
    filled.current = true;
    setD({ id: existing.id, competitionId: existing.competition_id, name: existing.name, course: existing.course, level: existing.level ? String(existing.level) : "",
      from: existing.date_from, to: existing.date_to || "", venue: existing.venue_name || "", url: existing.venue_url || "", events: events.data });
    const src = source.data.find(c => c.id === existing.competition_id);
    setPick(src ? src.id : MANUAL); setGalaId(src?.gala_id ?? null);
  }, [id, existing, events.data, source.data]);

  const crumb = <p className="crumb"><Link to="/season/plan">‹ Planning</Link></p>;

  const stateH1 = <h1>{id ? "Edit competition" : "Add competition"}</h1>;
  if (!canEdit(level)) return <>{crumb}{stateH1}<p className="notice warn">Season planning is read only for your role.</p></>;
  if (isLoading || (id && (lists.isLoading || events.isLoading))) return <>{crumb}{stateH1}<p className="dim">Loading…</p></>;
  if (!season) return <>{crumb}{stateH1}<p className="notice warn">Save a season under Planning first.</p></>;
  if (id && !existing) return <>{crumb}{stateH1}<p className="msg error">Couldn't find that competition.</p></>;

  const set = <K extends keyof CompDraft>(k: K, v: CompDraft[K]) => setD(x => ({ ...x, [k]: v }));
  const choose = (v: string) => {
    setPick(v);
    if (!v || v === MANUAL) { setD(x => ({ ...x, competitionId: null })); setGalaId(null); return; }
    const c = source.data?.find(x => x.id === v);
    if (!c) return;
    setGalaId(c.gala_id);
    setD(x => ({ ...x, competitionId: c.id, name: c.name, level: c.level ? String(c.level) : "", course: c.course || "", from: c.date_start || "", to: c.date_end || c.date_start || "",
      venue: x.venue || c.town_city || "", url: x.url || c.website_url || "" }));
  };
  const setEv = (no: number, f: keyof EvState, v: string | boolean) => setD(x => {
    const cur = x.events[no] ?? { id: null, ticked: false, session: "", prog: "" };
    const next = { ...cur, [f]: v };
    if (f !== "ticked" && v && !cur.ticked) next.ticked = true; // typing a session or number ticks the event
    return { ...x, events: { ...x.events, [no]: next } };
  });
  const days = d.from && d.to ? (d.to < d.from ? "The To date is before the From date." : `Total days: ${isoDiffDays(d.from, d.to) + 1}`) : "";

  const save = async () => {
    setMsg(null);
    const bad = validateComp(d);
    if (bad) { setMsg({ text: bad, error: true }); return; }
    setBusy(true);
    try {
      const copy: CompDraft = { ...d, events: Object.fromEntries(Object.entries(d.events).map(([k, v]) => [k, { ...v }])) };
      await saveComp(season.id, copy);
      setD(copy);
      invalidateSeason(qc, club);
      qc.invalidateQueries({ queryKey: ["comp_events"] });
      navigate("/season/plan", { state: { flash: "Competition saved." } });
    } catch (e) { console.error(e); setMsg({ text: "Could not save: " + (e as Error).message, error: true }); }
    finally { setBusy(false); }
  };

  return (
    <>
      {crumb}
      <div className="page-head"><h1>{id ? "Edit competition" : "Add competition"}</h1><p className="dim">{season.title}</p></div>
      <section className="card">
        <label htmlFor="cf-comp">Competition</label>
        <select id="cf-comp" value={pick} onChange={e => choose(e.target.value)}>
          <option value="">{source.isLoading ? "Loading…" : "Choose a competition…"}</option>
          {(source.data ?? []).map(c => <option key={c.id} value={c.id}>{fmtDdMm(c.date_start)} · {c.name}{c.level ? ` (L${c.level} ${c.course || ""})` : ""}</option>)}
          <option value={MANUAL}>{source.error ? "Could not load list — type it in" : "Not listed — type it in"}</option>
        </select>
        <p className="hint">Meets inside the season dates, from the scraped competitions list. Choose “Not listed” to type one in.</p>
        {pick === MANUAL && (<><label htmlFor="cf-name">Competition name</label><input id="cf-name" type="text" value={d.name} onChange={e => set("name", e.target.value)} /></>)}
        <div className="field-pair">
          <div><label htmlFor="cf-level">Level</label>
            <select id="cf-level" value={d.level} onChange={e => set("level", e.target.value)}><option value="">—</option>{["1", "2", "3", "4"].map(l => <option key={l} value={l}>{l}</option>)}</select></div>
          <div><label htmlFor="cf-course">Course</label>
            <select id="cf-course" value={d.course} onChange={e => set("course", e.target.value)}><option value="">—</option><option value="SC">SC</option><option value="LC">LC</option></select></div>
        </div>
        <div className="field-pair">
          <div><label htmlFor="cf-from">From</label><input id="cf-from" type="date" value={d.from} onChange={e => setD(x => ({ ...x, from: e.target.value, to: x.to || e.target.value }))} /></div>
          <div><label htmlFor="cf-to">To</label><input id="cf-to" type="date" value={d.to} onChange={e => set("to", e.target.value)} /></div>
        </div>
        {days && <p className={"hint" + (d.to < d.from ? " warn-text" : "")}>{days}</p>}
        <label htmlFor="cf-venue">Venue name</label>
        <input id="cf-venue" type="text" value={d.venue} onChange={e => set("venue", e.target.value)} />
        <label htmlFor="cf-url">Website link</label>
        <input id="cf-url" type="url" placeholder="https://" value={d.url} onChange={e => set("url", e.target.value)} />
        <div className="btn-row gap-top">
          <button type="button" className="btn small" onClick={() => galaId ? setQtOpen(true) : setMsg({ text: "No qualifying times on file for this meet.", error: true })}>QTs</button>
          <button type="button" className="btn small" aria-expanded={showEvents} aria-controls="cf-events" onClick={() => setShowEvents(s => !s)}>Sessions &amp; events {showEvents ? "▴" : "▾"}</button>
        </div>
        {showEvents && (
          <div id="cf-events">
            <p className="hint">Tick the events offered; session and event no. are optional.</p>
            <div className="table-wrap">
              <table className="data cf-events">
                <caption className="sr-only">Events offered at this competition</caption>
                <thead><tr><th scope="col"><span className="sr-only">Offered</span></th><th scope="col">#</th><th scope="col">SC</th><th scope="col">LC</th><th scope="col">Session</th><th scope="col">Event no.</th></tr></thead>
                <tbody>
                  {EVENTS_18.map(([no, sc, lc]) => {
                    const st = d.events[no] ?? { id: null, ticked: false, session: "", prog: "" };
                    const offered = d.course === "LC" ? !!lc : true;
                    return (
                      <tr key={no} className={offered ? undefined : "off"}>
                        <td><input type="checkbox" aria-label={`Offer event ${no}, ${d.course === "LC" ? lc || sc : sc}`} checked={st.ticked && offered} disabled={!offered} onChange={e => setEv(no, "ticked", e.target.checked)} /></td>
                        <td>{no}</td>
                        <td className={d.course === "SC" ? "cur" : undefined}>{sc}</td>
                        <td className={lc ? (d.course === "LC" ? "cur" : undefined) : "dim"}>{lc || "NO EVENT"}</td>
                        <td><input type="text" aria-label={`Event ${no} session`} value={st.session} disabled={!offered} onChange={e => setEv(no, "session", e.target.value)} /></td>
                        <td><input type="text" aria-label={`Event ${no} programme number`} value={st.prog} disabled={!offered} onChange={e => setEv(no, "prog", e.target.value)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <button type="button" className="btn primary wide" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <StatusMsg msg={msg} />
      </section>
      <QtModal galaId={qtOpen ? galaId : null} name={d.name} onClose={() => setQtOpen(false)} />
    </>
  );
}
