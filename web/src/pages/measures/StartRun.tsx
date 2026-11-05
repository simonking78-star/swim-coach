import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { loadClubSwimmers, loadSquads, type TestSwimmer } from "../../lib/tests";
import { CYCLE_LABEL, WINDOW_KIND, createSession, cycleWeek, levelSummary, loadRunnable, loadWindows, versionLabel } from "../../lib/measures";
import { logEvent, todayLocal, useCoachName } from "../../lib/util";
import { MBack, NoAccess, statusChip, useMeasuresAccess } from "./Measures";

// Run a test: a published protocol version, on any date (baselines happen
// whenever a swimmer is first tested). The coach confirms the group, pool and
// that the test is being run as written; the Season Planner's cycle week is
// shown against the protocol's intended week so an off-cycle test is a
// conscious choice (it is kept, but compared with caution).

type Group = "club" | "squad" | "swimmers";
const POOLS: [string, "SC" | "LC"][] = [["25m", "SC"], ["50m", "LC"], ["17m", "SC"]];

export function StartRun() {
  const { canRun, squadOnly, mySquads, canPublish } = useMeasuresAccess();
  const { club } = useClub();
  const { session } = useAuth();
  const coach = useCoachName();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const runnable = useQuery({ queryKey: ["mm_runnable", club], enabled: !!club && canRun, queryFn: () => loadRunnable(club!) });
  const swimmers = useQuery({ queryKey: ["test_club_swimmers", club], enabled: !!club && canRun, queryFn: () => loadClubSwimmers(club!) });
  const squads = useQuery({ queryKey: ["test_squads", club], enabled: !!club && canRun, queryFn: () => loadSquads(club!) });

  const windows = useQuery({ queryKey: ["mm_windows", club], enabled: !!club && canRun, queryFn: () => loadWindows(club!) });
  const [pid, setPid] = useState(params.get("protocol") ?? "");
  const [date, setDate] = useState(todayLocal().date);
  const [group, setGroup] = useState<Group | null>(squadOnly ? "squad" : null);
  const [squadId, setSquadId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [pool, setPool] = useState("25m");
  const [asWritten, setAsWritten] = useState(true);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const chosenRun = runnable.data?.find(r => r.protocol.id === pid) ?? null;
  const all = swimmers.data ?? [];
  const chosen: TestSwimmer[] = useMemo(() => {
    if (group === "club") return all;
    if (group === "squad") return all.filter(s => s.squad_id === squadId);
    if (group === "swimmers") return all.filter(s => picked.has(s.id));
    return [];
  }, [group, squadId, picked, all]);

  const cw = useQuery({ queryKey: ["mm_cycle", club, group === "squad" ? squadId : null, date], enabled: !!club && !!date,
    queryFn: () => cycleWeek(club!, group === "squad" && squadId ? squadId : null, date) });
  useEffect(() => { setMsg(null); }, [pid, group, squadId]);

  if (!canRun) return <><MBack /><NoAccess /></>;
  const intended = chosenRun?.version.intended_cycle ?? null;
  const focus = cw.data?.focus ?? null;
  const offCycle = !!intended && !!focus && focus !== intended;
  const win = (windows.data ?? []).find(w => date >= w.starts_on && date <= w.ends_on && (!w.protocol_ids.length || (chosenRun && w.protocol_ids.includes(chosenRun.protocol.id)))) ?? null;

  const start = async () => {
    setMsg(null);
    if (!chosenRun) { setMsg("Choose the test."); return; }
    if (chosenRun.protocol.fixed_date_only && !win) { setMsg("This test runs on its fixed date only, and no testing window for it covers this date. Add one in Testing windows."); return; }
    if (!group) { setMsg("Choose who the test is for."); return; }
    if (group === "squad" && !squadId) { setMsg("Choose the squad."); return; }
    if (!chosen.length) { setMsg("No swimmers are in this group."); return; }
    setStarting(true);
    try {
      const id = await createSession({
        version_id: chosenRun.version.id, window_id: win?.id ?? null, date, group_type: group, squad_id: group === "squad" ? squadId : null, swimmer_ids: chosen.map(s => s.id),
        pool, course: POOLS.find(x => x[0] === pool)?.[1] ?? null, as_protocol: asWritten, tester: coach || null, notes: notes.trim() || null
      });
      logEvent(session?.user.id, club, "core_task", "mm_start", { protocol: chosenRun.protocol.code, swimmers: chosen.length });
      qc.invalidateQueries({ queryKey: ["mm_sessions"] });
      navigate(`/measures/session/${id}`);
    } catch (e) { setMsg("Couldn't start the test: " + (e as Error).message); setStarting(false); }
  };
  const tq = search.trim().toLowerCase();

  return (
    <>
      <MBack />
      <div className="page-head row"><div><h1>Run a test</h1><p className="dim">Published protocols only. The set is fixed; you choose each swimmer's level.</p></div><ClubPicker /></div>

      <section className="card">
        <h2>Test</h2>
        {runnable.isLoading ? <p className="dim">Loading…</p>
          : runnable.error ? <LoadError e={runnable.error} />
          : !runnable.data?.length ? <NothingToRun canPublish={canPublish} />
          : <ul className="tick-list">{runnable.data.map(({ protocol: p, version: v }) => (
              <li key={p.id} className="tick-row"><label className="pick-row">
                <input type="radio" name="protocol" checked={pid === p.id} onChange={() => setPid(p.id)} />
                <span><strong>{p.code}</strong> {p.name} <span className="dim">{versionLabel(v)}</span> {statusChip(p.status)}</span></label></li>
            ))}</ul>}
        {chosenRun && (
          <ul className="mm-levels">{chosenRun.version.levels.map(l => (
            <li key={l.key}><strong>{l.label}</strong>{l.streams?.length ? <span className="dim"> · {l.streams.join(", ")}</span> : null}<br />{levelSummary(chosenRun.protocol, l)}</li>
          ))}</ul>
        )}
      </section>

      {!!runnable.data?.length && <>
      <section className="card">
        <h2>When and where</h2>
        <div className="field-pair">
          <label>Date<input type="date" value={date} max={todayLocal().date} onChange={e => setDate(e.target.value || todayLocal().date)} /></label>
          <label>Pool<select value={pool} onChange={e => setPool(e.target.value)}>{POOLS.map(([p, c]) => <option key={p} value={p}>{p} ({c === "SC" ? "short course" : "long course"})</option>)}</select></label>
        </div>
        <p className="hint">Any date is fine. A swimmer's first result on this test and level becomes their baseline.</p>
        {win && <p className="hint">In the testing window <strong>{win.name}</strong> ({WINDOW_KIND[win.kind] ?? win.kind}).</p>}
        {chosenRun?.protocol.fixed_date_only && !win && <p className="notice warn">This test runs on its fixed date only. No testing window covers this date.</p>}
        {chosenRun && (
          <p className={"notice" + (offCycle ? " warn" : "")}>
            {focus ? <>Season Planner: <strong>{CYCLE_LABEL[focus] ?? focus} week</strong>{cw.data?.week_no ? ` (week ${cw.data.week_no})` : ""}. </> : <>No cycle week found in the Season Planner for this date. </>}
            {intended ? <>This test is meant for <strong>{CYCLE_LABEL[intended]} weeks</strong>.{offCycle ? " It will be kept but compared with caution." : ""}</> : "This test can be run in any week."}
          </p>
        )}
        <label className="inline check-inline"><input type="checkbox" checked={asWritten} onChange={e => setAsWritten(e.target.checked)} /> Warm-up, position in the session and instructions are as the protocol sheet says</label>
        {!asWritten && <p className="hint">Results will be kept but compared with caution. Add a note on what was different.</p>}
        <label>Notes<input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional: conditions, anything unusual" /></label>
      </section>

      <section className="card">
        <h2>Who</h2>
        <div className="seg seg-3">
          {(([["club", "Whole club"], ["squad", "A squad"], ["swimmers", "Chosen swimmers"]] as [Group, string][]).filter(([g]) => !squadOnly || g === "squad")).map(([g, l]) => (
            <button key={g} type="button" className={"seg-btn" + (group === g ? " on" : "")} aria-pressed={group === g} onClick={() => setGroup(g)}>{l}</button>
          ))}
        </div>
        {group === "squad" && (
          <label>Squad<select value={squadId} onChange={e => setSquadId(e.target.value)}>
            <option value="">— choose squad —</option>
            {(squads.data ?? []).filter(s => !squadOnly || mySquads.has(s.id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
        )}
        {group === "swimmers" && (
          <div className="pick-box">
            <label>Search<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name" /></label>
            <ul className="tick-list pick-list">
              {all.filter(s => !tq || s.full_name.toLowerCase().includes(tq)).map(s => (
                <li key={s.id} className="tick-row"><label className="pick-row"><input type="checkbox" checked={picked.has(s.id)}
                  onChange={() => setPicked(p => { const n = new Set(p); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
                  <span>{s.full_name}</span><span className="dim">{s.squad ?? ""}</span></label></li>
              ))}
            </ul>
          </div>
        )}
        {group && <p className="hint">{chosen.length} swimmer{chosen.length === 1 ? "" : "s"}. You can add or take swimmers off once it has started.</p>}
      </section>

      {(swimmers.error || squads.error) && <LoadError e={(swimmers.error || squads.error)!} what="swimmers and squads" />}
      {msg && <p className="msg error" role="alert">{msg}</p>}
      <button className="btn primary wide" disabled={starting || !chosenRun || !group} onClick={start}>{starting ? "Starting…" : "Start test"}</button>
      </>}
    </>
  );
}

/** A load failure, said plainly. A missing table means the database hasn't been updated for this version of the app. */
export function LoadError({ e, what = "the tests" }: { e: unknown; what?: string }) {
  const m = (e as Error)?.message ?? String(e);
  const missing = /schema cache|does not exist|PGRST205|42P01/i.test(m);
  return (
    <p className="msg error" role="alert">
      {missing
        ? <>Couldn't load {what}: the database hasn't been updated for Metrics &amp; Measures yet. An admin needs to apply the Metrics &amp; Measures database update.</>
        : <>Couldn't load {what}: {m}. Check your connection and try again.</>}
    </p>
  );
}

function NothingToRun({ canPublish }: { canPublish: boolean }) {
  return (
    <div className="notice">
      <p><strong>No test is ready to run yet.</strong> A test can be run once a version of it is published and it is in <em>pilot</em> or <em>live</em>.</p>
      {canPublish
        ? <p>Open a draft in the <Link to="/measures/library">Protocol library</Link>, finish and publish its version, then move it to pilot.</p>
        : <p>Ask the head coach to publish a test in the <Link to="/measures/library">Protocol library</Link>.</p>}
    </div>
  );
}
