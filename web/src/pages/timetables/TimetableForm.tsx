import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { canEdit, sectionLevel } from "../../lib/access";
import { DAYS_LONG, POOLS, pickSeason, saveTimetable, seasonOf, validateTimetable, type TtDraft, type TtRow } from "../../lib/season";
import { fmtDate, todayLocal, uuid } from "../../lib/util";
import { StatusMsg, useTimetablesData } from "../../components/seasonParts";
import { usePlanSquads } from "../plans/PlanList";

// Add / edit a squad's weekly timetable: sessions (day, start, finish, pool),
// the season it belongs to and the band of dates it runs.

type Row = TtRow & { k: string };
const blank = (): Row => ({ k: uuid(), id: null, day: "", start: "", end: "", pool: "" });

export function TimetableForm() {
  const { id } = useParams();
  const { access } = useAuth();
  const level = sectionLevel(access, "timetables");
  const { club } = useClub();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const data = useTimetablesData(club);
  const squads = usePlanSquads(club);
  const existing = id ? data.data?.timetables.find(t => t.id === id) : undefined;

  const [squadId, setSquadId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const savedId = useRef<string | null>(null);
  const filled = useRef(false);

  useEffect(() => {
    if (filled.current || !data.data) return;
    if (id && !existing) return;
    filled.current = true;
    const today = todayLocal().date;
    if (existing) {
      setSquadId(existing.squad_id);
      setSeasonId(seasonOf(existing, data.data.seasons)?.id ?? "");
      setStart(existing.season_start); setEnd(existing.season_end);
      const r = (existing.timetable_sessions || []).slice().sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
        .map(s => ({ k: uuid(), id: s.id, day: String(s.day_of_week), start: s.start_time.slice(0, 5), end: s.end_time?.slice(0, 5) ?? "", pool: s.pool_size || "" }));
      setRows(r.length ? r : [blank()]);
    } else {
      const s = pickSeason(data.data.seasons, today);
      if (s) { setSeasonId(s.id); setStart(s.start_date); setEnd(s.finish_date); }
    }
  }, [data.data, existing, id]);

  const crumb = <p className="crumb"><Link to="/timetables?tab=list">‹ Timetables</Link></p>;

  const stateH1 = <h1>{id ? "Edit timetable" : "Add timetable"}</h1>;
  if (!canEdit(level)) return <>{crumb}{stateH1}<p className="notice warn">Timetables are read only for your role.</p></>;
  if (data.isLoading) return <>{crumb}{stateH1}<p className="dim">Loading…</p></>;
  if (id && data.data && !existing) return <>{crumb}{stateH1}<p className="msg error">Couldn't find that timetable.</p></>;

  const seasons = data.data?.seasons ?? [];
  const season = seasons.find(s => s.id === seasonId);
  const squadName = (squads.data ?? []).find(s => s.id === squadId)?.name || existing?.squads.name || "";
  const setRow = (k: string, f: keyof TtRow, v: string) => setRows(rs => rs.map(r => (r.k === k ? { ...r, [f]: v } : r)));
  const removeRow = (k: string) => setRows(rs => {
    const r = rs.find(x => x.k === k);
    if (r?.id) setRemoved(x => [...x, r.id!]);
    const next = rs.filter(x => x.k !== k);
    return next.length ? next : [blank()];
  });
  const chooseSeason = (v: string) => {
    setSeasonId(v);
    const s = seasons.find(x => x.id === v);
    if (s) { if (!start) setStart(s.start_date); if (!end) setEnd(s.finish_date); }
  };

  const save = async () => {
    setMsg(null);
    const d: TtDraft = { id: savedId.current ?? existing?.id ?? null, squadId, squadName, seasonId, start, end, rows, removedIds: removed };
    const bad = validateTimetable(d, seasons, data.data?.timetables ?? []);
    if (bad) { setMsg({ text: bad, error: true }); return; }
    setBusy(true);
    try {
      savedId.current = await saveTimetable(d);
      setRows(d.rows.map(r => ({ ...(r as Row) })));
      setRemoved([]);
      await Promise.all([qc.invalidateQueries({ queryKey: ["tt_data", club] }), qc.invalidateQueries({ queryKey: ["att_slots"] })]);
      navigate("/timetables?tab=list", { state: { flash: "Timetable saved." } });
    } catch (e) { console.error(e); setMsg({ text: "Could not save: " + ((e as Error).message || e), error: true }); }
    finally { setBusy(false); }
  };

  return (
    <>
      {crumb}
      <div className="page-head"><h1>{id ? "Edit timetable" : "Add timetable"}</h1></div>
      <section className="card">
        <label htmlFor="tf-squad">Squad</label>
        <select id="tf-squad" value={squadId} onChange={e => setSquadId(e.target.value)}>
          <option value="">{squads.isLoading ? "Loading…" : "Choose a squad…"}</option>
          {(squads.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <p className="hint">One squad per timetable.</p>

        <fieldset className="plain-fieldset">
          <legend>Sessions <span className="dim">(day, start and finish time, pool)</span></legend>
          <p className="hint top">The finish time sets the session length, which attendance is measured against.</p>
          {rows.map((r, i) => (
            <div key={r.k} className="tt-row" role="group" aria-label={`Session ${i + 1}`}>
              <div className="tt-row-top">
                <select aria-label={`Session ${i + 1} day`} value={r.day} onChange={e => setRow(r.k, "day", e.target.value)}>
                  <option value="">Day…</option>
                  {DAYS_LONG.slice(1).map((d, k) => <option key={d} value={String(k + 1)}>{d}</option>)}
                </select>
                <button type="button" className="icon-btn plain" aria-label={`Remove session ${i + 1}`} onClick={() => removeRow(r.k)}>✕</button>
              </div>
              <div className="tt-row-times">
                <label>Start<input type="time" step={300} value={r.start} onChange={e => setRow(r.k, "start", e.target.value)} aria-label={`Session ${i + 1} start`} /></label>
                <label>Finish<input type="time" step={300} value={r.end} onChange={e => setRow(r.k, "end", e.target.value)} aria-label={`Session ${i + 1} finish`} /></label>
                <label>Pool
                  <select value={r.pool} onChange={e => setRow(r.k, "pool", e.target.value)} aria-label={`Session ${i + 1} pool`}>
                    <option value="">Optional</option>
                    {POOLS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
              </div>
            </div>
          ))}
          <button type="button" className="link-btn" onClick={() => setRows(rs => [...rs, blank()])}>+ Add another</button>
        </fieldset>

        <label htmlFor="tf-season">Season</label>
        <select id="tf-season" value={seasonId} onChange={e => chooseSeason(e.target.value)}>
          <option value="">{seasons.length ? "Choose a season…" : "No seasons yet — create one under Season planner"}</option>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.title} ({fmtDate(s.start_date)} – {fmtDate(s.finish_date)})</option>)}
        </select>
        <p className="hint">{season ? `Season runs ${fmtDate(season.start_date)} – ${fmtDate(season.finish_date)}. The band must fall inside it.` : "Seasons are set up under Season planner."}</p>

        <fieldset className="plain-fieldset">
          <legend>Band <span className="dim">(dates this timetable runs)</span></legend>
          <div className="field-pair">
            <div><label htmlFor="tf-start">Band start</label><input id="tf-start" type="date" value={start} min={season?.start_date} max={season?.finish_date} onChange={e => setStart(e.target.value)} /></div>
            <div><label htmlFor="tf-end">Band end</label><input id="tf-end" type="date" value={end} min={season?.start_date} max={season?.finish_date} onChange={e => setEnd(e.target.value)} /></div>
          </div>
        </fieldset>

        <button type="button" className="btn primary wide" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save timetable"}</button>
        <StatusMsg msg={msg} />
      </section>
    </>
  );
}
