import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import {
  createSession, loadClubSwimmers, loadSquads, loadTemplate, setBirthYear, swimAge, yobOf, type TestSwimmer
} from "../../lib/tests";
import { logEvent, todayLocal } from "../../lib/util";
import { NoTestAccess, TemplateSummary, TestsBack, useTestAccess } from "./Tests";

// Select → confirm who the test is for: the whole club, one squad, or chosen
// swimmers. Swimmers without a year of birth are asked for it here (it sets
// their age and so their test level and score); it can also be added later on
// the live test screen.

type Group = "club" | "squad" | "swimmers";

export function YobPrompt({ s, onSaved }: { s: TestSwimmer; onSaved: (year: number) => void }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const y = Number(v);
    const now = new Date().getFullYear();
    if (!/^\d{4}$/.test(v) || y < now - 90 || y > now - 3) { setErr("Enter a 4-digit year"); return; }
    setBusy(true); setErr(null);
    try { const saved = await setBirthYear(s.id, y); onSaved(saved ?? y); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <span className="yob-prompt">
      <input aria-label={`Year of birth for ${s.full_name}`} inputMode="numeric" maxLength={4} placeholder="Year of birth" value={v}
        onChange={e => setV(e.target.value.replace(/\D/g, ""))} onKeyDown={e => { if (e.key === "Enter") save(); }} />
      <button type="button" className="btn small" disabled={busy || v.length !== 4} onClick={save}>Save</button>
      {err && <span className="msg error">{err}</span>}
    </span>
  );
}

export function StartTest() {
  const { id } = useParams();
  const { canRun, squadOnly, mySquads } = useTestAccess();
  const { session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tpl = useQuery({ queryKey: ["test_template", id], enabled: !!id, queryFn: () => loadTemplate(id!) });
  const club = tpl.data?.club ?? null;
  const swimmers = useQuery({ queryKey: ["test_club_swimmers", club], enabled: !!club, queryFn: () => loadClubSwimmers(club!) });
  const squads = useQuery({ queryKey: ["test_squads", club], enabled: !!club, queryFn: () => loadSquads(club!) });

  const [date, setDate] = useState(todayLocal().date);
  const [group, setGroup] = useState<Group | null>(null);
  const [squadId, setSquadId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [pickSquad, setPickSquad] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const all = swimmers.data ?? [];
  const chosen: TestSwimmer[] = useMemo(() => {
    if (group === "club") return all;
    if (group === "squad") return all.filter(s => s.squad_id === squadId);
    if (group === "swimmers") return all.filter(s => picked.has(s.id));
    return [];
  }, [group, squadId, picked, all]);
  const missing = chosen.filter(s => yobOf(s) == null);

  if (!canRun) return <><TestsBack /><NoTestAccess /></>;
  if (tpl.isLoading) return <><TestsBack to="/tests/select" label="Select" /><p className="dim">Loading…</p></>;
  if (!tpl.data) return <><TestsBack to="/tests/select" label="Select" /><p className="msg error">That template wasn't found.</p></>;
  const t = tpl.data;

  const yobSaved = (sid: string, year: number) => {
    qc.setQueryData<TestSwimmer[]>(["test_club_swimmers", club], prev => (prev ?? []).map(s => (s.id === sid ? { ...s, year_of_birth: year } : s)));
  };
  const start = async () => {
    setMsg(null);
    if (!group) { setMsg("Choose who the test is for."); return; }
    if (group === "squad" && !squadId) { setMsg("Choose the squad."); return; }
    if (!chosen.length) { setMsg("No swimmers are in this group."); return; }
    setStarting(true);
    try {
      const sq = (squads.data ?? []).find(s => s.id === squadId);
      const sid = await createSession({
        template: t, club: t.club, date, group_type: group, squad_id: group === "squad" ? squadId : null,
        squad_name: group === "squad" ? sq?.name ?? null : null, swimmer_ids: chosen.map(s => s.id)
      });
      logEvent(session?.user.id, t.club, "core_task", "test_start", { template: t.id, swimmers: chosen.length });
      qc.invalidateQueries({ queryKey: ["test_sessions"] });
      navigate(`/tests/run/${sid}`);
    } catch (e) {
      setMsg("Couldn't start the test: " + (e as Error).message);
      setStarting(false);
    }
  };

  const tq = search.trim().toLowerCase();
  const pickList = all.filter(s => (!pickSquad || s.squad_id === pickSquad) && (!tq || s.full_name.toLowerCase().includes(tq)));
  const toggle = (sid: string) => setPicked(p => { const n = new Set(p); if (n.has(sid)) n.delete(sid); else n.add(sid); return n; });

  return (
    <>
      <TestsBack to="/tests/select" label="Select" />
      <div className="page-head"><h1>{t.name}</h1><p className="dim">{t.club}</p></div>
      <section className="card">
        <TemplateSummary t={t} />
        <label>Test date<input type="date" value={date} max={todayLocal().date} onChange={e => setDate(e.target.value || todayLocal().date)} /></label>
        <fieldset className="choice-set">
          <legend>Who is this test for?</legend>
          <div className="seg seg-3">
            {(([["club", "Whole club"], ["squad", "A squad"], ["swimmers", "Chosen swimmers"]] as [Group, string][]).filter(([g]) => !squadOnly || g === "squad")).map(([g, l]) => (
              <button key={g} type="button" className={"seg-btn" + (group === g ? " on" : "")} aria-pressed={group === g} onClick={() => setGroup(g)}>{l}</button>
            ))}
          </div>
        </fieldset>
        {group === "squad" && (
          <label>Squad<select value={squadId} onChange={e => setSquadId(e.target.value)}>
            <option value="">— choose squad —</option>
            {(squads.data ?? []).filter(s => !squadOnly || mySquads.has(s.id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
        )}
        {group === "swimmers" && (
          <div className="pick-box">
            <div className="field-pair">
              <label>Search<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name" /></label>
              <label>Squad<select value={pickSquad} onChange={e => setPickSquad(e.target.value)}>
                <option value="">All squads</option>
                {(squads.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></label>
            </div>
            <ul className="tick-list pick-list">
              {pickList.map(s => (
                <li key={s.id} className="tick-row">
                  <label className="pick-row"><input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                    <span>{s.full_name}</span><span className="dim">{s.squad ?? ""}</span></label>
                </li>
              ))}
              {!pickList.length && <li className="dim">No swimmers match.</li>}
            </ul>
          </div>
        )}
        {group && <p className="hint">{chosen.length} swimmer{chosen.length === 1 ? "" : "s"} in this test{group === "swimmers" ? " — you can add or take swimmers off once it has started." : "."}</p>}
      </section>

      {group && missing.length > 0 && (
        <section className="card">
          <h2>Year of birth needed</h2>
          <p className="hint">Age (on 31 December {date.slice(0, 4)}) sets the test level and the score. {missing.length} swimmer{missing.length === 1 ? " has" : "s have"} no year of birth on record. You can also add it during the test.</p>
          <ul className="tick-list">
            {missing.map(s => (
              <li key={s.id} className="tick-row yob-row"><span className="tick-name">{s.full_name}<span className="dim"> {s.squad ?? ""}</span></span>
                <YobPrompt s={s} onSaved={y => yobSaved(s.id, y)} /></li>
            ))}
          </ul>
        </section>
      )}
      {group && chosen.length > 0 && missing.length === 0 && (
        <p className="hint">Every swimmer has a year of birth. Ages run from {Math.min(...chosen.map(s => swimAge(yobOf(s), date)!))} to {Math.max(...chosen.map(s => swimAge(yobOf(s), date)!))}.</p>
      )}

      {msg && <p className="msg error" role="alert">{msg}</p>}
      <button className="btn primary wide" disabled={starting || !group} onClick={start}>{starting ? "Starting…" : "Start test"}</button>
    </>
  );
}
