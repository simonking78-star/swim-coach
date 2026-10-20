import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { ClubPicker } from "../club/ClubPicker";
import { loadPlanOptions } from "../lib/attendance";
import {
  CATEGORIES, QES, catLabel, loadDrills, loadFbSquads, loadRecentSquadFeedback, loadSquadHistory, loadSquadWeeks,
  saveSquadFeedback, searchDrills, toThreads, validateSquadDraft, weekIsNow, weekIsPast,
  type Drill, type EntryType, type SeasonWeek, type SquadFbEntry, type SquadLite, type Thread
} from "../lib/feedback";
import { fmtDate, fmtDdMm, logEvent, todayLocal, useCoachName } from "../lib/util";
import { StatusPicker, StepTabs, StrokeChips, ThreadCard, TypeToggle } from "../components/feedbackParts";

// Feedback on a squad as a whole. An entry can name a drill and the season
// weeks (micro-cycles) to work it in; those links (squad_drill_weeks) feed the
// micro-cycle cards and the session-plan editor in the current app.

type Tab = "pick" | "history" | "form";

export function SquadFeedback({ editable }: { editable: boolean }) {
  const { club } = useClub();
  const [squad, setSquad] = useState<SquadLite | null>(null);
  const [tab, setTab] = useState<Tab>("pick");
  const [updating, setUpdating] = useState<Thread<SquadFbEntry> | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const squads = useQuery({ queryKey: ["sqf_squads", club], enabled: !!club, queryFn: () => loadFbSquads(club!) });
  const history = useQuery({ queryKey: ["sqf_history", squad?.id], enabled: !!squad, queryFn: () => loadSquadHistory(squad!.id) });
  const weeks = useQuery({ queryKey: ["sqf_weeks", club, squad?.id], enabled: !!club && !!squad, queryFn: () => loadSquadWeeks(club!, squad!.id) });
  const rows = history.data ?? [];

  useEffect(() => { setSquad(null); setUpdating(null); setTab("pick"); }, [club]);

  const pick = async (s: SquadLite, goTo?: Tab) => {
    if (squad?.id !== s.id) setUpdating(null);
    setSquad(s); setFlash(null);
    setTab(goTo ?? (s.entries ? "history" : editable ? "form" : "history"));
    scrollTo(0, 0);
  };
  const startUpdate = (t: Thread<SquadFbEntry>) => { setUpdating(t); setFlash(null); setTab("form"); scrollTo(0, 0); };
  const onSaved = (text: string) => { setFlash(text); setUpdating(null); setTab("history"); scrollTo(0, 0); };

  const weekLabel = (microId: string) => {
    const w = weeks.data?.find(x => x.id === microId);
    return w ? `Wk ${w.week_no} (${fmtDdMm(w.week_commencing)})` : "Week";
  };
  const extra = (e: SquadFbEntry, latest: boolean) => {
    const wk = latest ? (e.squad_drill_weeks ?? []).filter(w => w.is_active) : [];
    if (!e.drills_library && !wk.length) return null;
    return (
      <div className="chip-row tight">
        {e.drills_library && <span className="chip drill">Drill: {e.drills_library.drill_name}</span>}
        {wk.map(w => <span key={w.micro_id} className="chip">{weekLabel(w.micro_id)}</span>)}
      </div>
    );
  };

  return (
    <>
      <StepTabs<Tab>
        value={tab}
        onChange={t => { setTab(t); scrollTo(0, 0); }}
        tabs={[
          { key: "pick", label: "Squad", num: 1 },
          { key: "history", label: "History", badge: rows.length, disabled: !squad },
          ...(editable ? [{ key: "form" as Tab, label: "Stroke / skill", num: 2, disabled: !squad }] : [])
        ]}
      />

      {tab === "pick" && (
        <>
          <div className="card">
            <h2 className="card-title">1 · Squad</h2>
            <p className="hint top">Feedback on the squad as a whole — what the group needs to work on, the drill that fixes it, and the season weeks to work it in.</p>
            <ClubPicker />
            {squads.isLoading && <p className="dim">Loading squads…</p>}
            {squads.error && <p className="msg error">Couldn't load squads.</p>}
            {squads.data && squads.data.length === 0 && <p className="dim">No squads set up for this club.</p>}
            <div className="squad-grid">
              {(squads.data ?? []).map(s => (
                <button key={s.id} type="button" className={"squad-btn" + (squad?.id === s.id ? " on" : "")} aria-pressed={squad?.id === s.id} onClick={() => pick(s)}>
                  <strong>{s.name}</strong>
                  <span>{s.entries ? `${s.entries} entr${s.entries === 1 ? "y" : "ies"}` : "No feedback yet"}</span>
                </button>
              ))}
            </div>
          </div>
          {club && <RecentSquadFeedback club={club} onOpen={id => { const s = squads.data?.find(x => x.id === id); if (s) pick(s, "history"); }} />}
        </>
      )}

      {tab === "history" && squad && (
        <SquadHistory squad={squad} rows={rows} loading={history.isLoading} error={history.error as Error | null} flash={flash}
          extra={extra} onUpdate={editable ? startUpdate : undefined} />
      )}

      {tab === "form" && squad && editable && (
        <SquadForm key={squad.id + (updating?.id ?? "")} squad={squad} history={rows} weeks={weeks.data ?? []} weeksLoading={weeks.isLoading}
          updating={updating} onCancelUpdate={() => setUpdating(null)} onSaved={onSaved} />
      )}
    </>
  );
}

function RecentSquadFeedback({ club, onOpen }: { club: string; onOpen: (squadId: string) => void }) {
  const q = useQuery({ queryKey: ["sqf_recent", club], queryFn: () => loadRecentSquadFeedback(club) });
  return (
    <section className="card">
      <h2 className="card-title">Recently logged (all squads)</h2>
      {q.isLoading && <p className="dim">Loading…</p>}
      {q.error && <p className="msg error">Couldn't load recent squad feedback.</p>}
      {q.data && q.data.length === 0 && <p className="dim">No squad feedback logged yet.</p>}
      {q.data?.map(r => (
        <button key={r.id} type="button" className="recent-squad" onClick={() => onOpen(r.squad_id)}>
          <strong>{r.squad_name} · {catLabel(r.category)}{r.criterion ? ` — ${r.criterion}` : ""}</strong>
          <span className="dim">{fmtDate(r.session_date)}{r.status ? ` · ${r.status}` : ""}{r.drill_name ? ` · Drill: ${r.drill_name}` : ""}</span>
          <span>{r.observation.slice(0, 140)}</span>
        </button>
      ))}
    </section>
  );
}

function SquadHistory({ squad, rows, loading, error, flash, extra, onUpdate }: {
  squad: SquadLite; rows: SquadFbEntry[]; loading: boolean; error: Error | null; flash: string | null;
  extra: (e: SquadFbEntry, latest: boolean) => React.ReactNode; onUpdate?: (t: Thread<SquadFbEntry>) => void;
}) {
  const [stroke, setStroke] = useState<string | null>(null);
  const cats = useMemo(() => [...new Set(rows.map(r => r.category))], [rows]);
  // Squad strings show in their own order (newest string first), filtered on any entry's stroke as today.
  const threads = useMemo(() => toThreads(stroke ? rows.filter(r => r.category === stroke) : rows, null), [rows, stroke]);
  return (
    <div className="card">
      <p className="for-line">Squad · <strong>{squad.name}</strong></p>
      {flash && <p className="msg" role="status">{flash}</p>}
      <h2 className="card-title">History {rows.length > 0 && <span className="dim">({rows.length})</span>}</h2>
      <StrokeChips categories={cats} value={stroke} onChange={setStroke} />
      {loading && <p className="dim">Loading…</p>}
      {error && <p className="msg error">Couldn't load history.</p>}
      {!loading && !error && rows.length === 0 && <p className="dim">No squad feedback yet{onUpdate ? " — add the first entry under Stroke / skill" : ""}.</p>}
      {threads.map(t => <ThreadCard key={t.id} thread={t} onUpdate={onUpdate} extra={extra} />)}
    </div>
  );
}

function SquadForm({ squad, history, weeks, weeksLoading, updating, onCancelUpdate, onSaved }: {
  squad: SquadLite; history: SquadFbEntry[]; weeks: SeasonWeek[]; weeksLoading: boolean;
  updating: Thread<SquadFbEntry> | null; onCancelUpdate: () => void; onSaved: (msg: string) => void;
}) {
  const { session } = useAuth();
  const { club } = useClub();
  const coach = useCoachName();
  const qc = useQueryClient();
  const latest = updating?.entries[0];
  const today = useMemo(() => todayLocal().date, []);

  // Continuing a string pre-fills stroke, criterion, status, fix, drill and its weeks.
  const [category, setCategory] = useState(latest?.category ?? "");
  const [entryType, setEntryType] = useState<EntryType>(latest?.entry_type === "note" ? "note" : "status");
  const [criterion, setCriterion] = useState(latest?.criterion ?? "");
  const [status, setStatus] = useState<string | null>(latest?.status ?? null);
  const [observation, setObservation] = useState("");
  const [remedial, setRemedial] = useState(latest?.remedial_action ?? "");
  const [notes, setNotes] = useState("");
  const [drill, setDrill] = useState<Drill | null>(latest?.drills_library ?? null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set((latest?.squad_drill_weeks ?? []).filter(w => w.is_active).map(w => w.micro_id)));
  const [showPast, setShowPast] = useState(false);
  const [date, setDate] = useState(today);
  const [planId, setPlanId] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const plans = useQuery({ queryKey: ["att_plans", club], enabled: !!club, queryFn: () => loadPlanOptions(club!) });
  const criteria = useMemo(() => [...new Set(history.filter(e => e.category === category && e.criterion).map(e => e.criterion as string))], [history, category]);

  const toggleWeek = (id: string) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const next4 = () => setPicked(p => { const n = new Set(p); weeks.filter(w => !weekIsPast(w, today)).slice(0, 4).forEach(w => n.add(w.id)); return n; });

  const save = async () => {
    const draft = {
      club: club!, squadId: squad.id, threadId: updating?.id ?? null, entryType, category, criterion, status, observation, remedial, notes,
      drill, weeks: [...picked], date, planId, coach,
      previousIds: updating ? updating.entries.map(e => e.id) : []
    };
    const problem = validateSquadDraft(draft);
    if (problem) { setMsg({ text: problem, error: true }); return; }
    setMsg(null); setBusy(true);
    try {
      const { weeksLinked } = await saveSquadFeedback(draft);
      logEvent(session?.user.id, club, "core_task", "squad_feedback_save", { squad_id: squad.id, is_update: !!draft.threadId });
      await qc.invalidateQueries({ queryKey: ["sqf_history", squad.id] });
      qc.invalidateQueries({ queryKey: ["sqf_recent"] });
      qc.invalidateQueries({ queryKey: ["sqf_squads"] });
      qc.invalidateQueries({ queryKey: ["squad_feedback"] });
      qc.invalidateQueries({ queryKey: ["home_stats"] });
      onSaved((draft.threadId ? "Update added to the string" : "Saved") + ` — dated ${fmtDate(date)}` +
        (weeksLinked ? ` · ${drill!.drill_name} linked to ${weeksLinked} week${weeksLinked === 1 ? "" : "s"}.` : "."));
    } catch (e) {
      setMsg({ text: "Save failed — " + (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card fb-form">
      {updating && latest && (
        <div className="updating-banner">
          <div>
            <strong>Updating: {catLabel(latest.category)}{latest.criterion ? ` — ${latest.criterion}` : ""}</strong>
            <span className="dim">New entry added to this string — earlier entries are kept.</span>
          </div>
          <button type="button" className="btn small" onClick={onCancelUpdate}>Start new instead</button>
        </div>
      )}
      <p className="for-line">Squad · <strong>{squad.name}</strong></p>
      <h2 className="card-title">2 · Stroke / skill</h2>
      <label htmlFor="sqf-cat" className="sr-only">Stroke or skill</label>
      <select id="sqf-cat" value={category} onChange={e => setCategory(e.target.value)}>
        <option value="" disabled>Choose one…</option>
        {CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
      </select>

      <TypeToggle value={entryType} onChange={setEntryType} />
      {entryType === "status" && (
        <>
          <label htmlFor="sqf-crit">Criterion</label>
          <input id="sqf-crit" list="sqf-crit-list" autoComplete="off" placeholder="e.g. Streamline off every wall" value={criterion} onChange={e => setCriterion(e.target.value)} />
          <datalist id="sqf-crit-list">{criteria.map(c => <option key={c} value={c} />)}</datalist>
          <StatusPicker label="Squad status" value={status} onChange={setStatus} />
        </>
      )}

      <label htmlFor="sqf-obs">Observation</label>
      <textarea id="sqf-obs" rows={3} placeholder="What did you see across the squad?" value={observation} onChange={e => setObservation(e.target.value)} />
      <label htmlFor="sqf-fix">Remedial action <span className="dim">(optional)</span></label>
      <textarea id="sqf-fix" rows={2} placeholder="The fix — cue, focus, set design…" value={remedial} onChange={e => setRemedial(e.target.value)} />

      <div className="link-box">
        <p className="link-box-title">🔗 Drill → season plan</p>
        <DrillPicker club={club!} drill={drill} onChange={d => { setDrill(d); if (!d) setPicked(new Set()); }} />
        {drill && (
          <div className="weeks">
            <p className="weeks-label">Weeks to work it <span className="dim">(micro-cycles in {squad.name}'s season plan)</span></p>
            {weeksLoading && <p className="dim">Loading the season plan…</p>}
            {!weeksLoading && weeks.length === 0 && (
              <p className="dim">{squad.name} isn't in a macro-cycle yet. Add it under Season planner → Plan to link drills to weeks.</p>
            )}
            {weeks.length > 0 && (
              <>
                <div className="week-tools">
                  <button type="button" className="btn small" onClick={next4}>Next 4 weeks</button>
                  <button type="button" className="btn small" onClick={() => setPicked(new Set())}>Clear</button>
                  {weeks.some(w => weekIsPast(w, today)) && (
                    <button type="button" className="btn small" onClick={() => setShowPast(s => !s)}>{showPast ? "Hide earlier weeks" : "Show earlier weeks"}</button>
                  )}
                </div>
                <WeekGrid weeks={weeks} picked={picked} showPast={showPast} today={today} onToggle={toggleWeek} />
              </>
            )}
          </div>
        )}
      </div>

      <label htmlFor="sqf-notes">Additional notes <span className="dim">(optional)</span></label>
      <textarea id="sqf-notes" rows={2} placeholder="Context — pool, numbers, effort…" value={notes} onChange={e => setNotes(e.target.value)} />
      <label htmlFor="sqf-date">Date</label>
      <input id="sqf-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
      <label htmlFor="sqf-plan">Session plan <span className="dim">(optional — the plan this was seen in)</span></label>
      <select id="sqf-plan" value={planId} onChange={e => setPlanId(e.target.value)}>
        <option value="">— none / not linked —</option>
        {(plans.data ?? []).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>

      <p className="hint">Saving always adds a new dated entry. The drill weeks of the latest entry in a string are the ones used in micro-cycles and session planning.</p>
      <button type="button" className="btn primary wide" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save squad entry"}</button>
      {msg && <p className={"msg" + (msg.error ? " error" : "")} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
    </div>
  );
}

function DrillPicker({ club, drill, onChange }: { club: string; drill: Drill | null; onChange: (d: Drill | null) => void }) {
  const [q, setQ] = useState("");
  const drills = useQuery({ queryKey: ["drills", club], queryFn: () => loadDrills(club), staleTime: 5 * 60 * 1000 });
  const hits = searchDrills(drills.data ?? [], q);
  if (drill) {
    return (
      <div className="selected-pill">
        <span><strong>{drill.drill_name}</strong>{drill.stroke && <span className="dim"> · {drill.stroke}</span>}</span>
        <button type="button" className="link-btn" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }
  return (
    <div className="search-box">
      <label htmlFor="sqf-drill">Drill <span className="dim">(from the Drills &amp; Skills library)</span></label>
      <input id="sqf-drill" type="search" autoComplete="off" placeholder="Search drills…" value={q} onChange={e => setQ(e.target.value)} />
      {q.trim() && (
        <ul className="search-results">
          {hits.length === 0 && <li className="dim">No drill matches — add it under <Link to="/drills">Drills &amp; Skills</Link> first.</li>}
          {hits.map(d => (
            <li key={d.id}><button type="button" onClick={() => { onChange(d); setQ(""); }}><span>{d.drill_name}</span>{d.stroke && <span className="chip">{d.stroke}</span>}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WeekGrid({ weeks, picked, showPast, today, onToggle }: { weeks: SeasonWeek[]; picked: Set<string>; showPast: boolean; today: string; onToggle: (id: string) => void }) {
  const shown = weeks.filter(w => showPast || !weekIsPast(w, today) || picked.has(w.id));
  if (!shown.length) return <p className="dim">No weeks left in this season plan.</p>;
  const groups: { title: string; weeks: SeasonWeek[] }[] = [];
  for (const w of shown) {
    const g = groups[groups.length - 1];
    g && g.title === w.macroTitle ? g.weeks.push(w) : groups.push({ title: w.macroTitle, weeks: [w] });
  }
  return (
    <>
      {groups.map((g, i) => (
        <div key={i}>
          <p className="macro-head">{g.title}</p>
          <div className="week-grid">
            {g.weeks.map(w => {
              const on = picked.has(w.id), now = weekIsNow(w, today), past = weekIsPast(w, today);
              return (
                <button key={w.id} type="button" aria-pressed={on} className={"week" + (on ? " on" : "") + (past ? " past" : "") + (now ? " now" : "")} onClick={() => onToggle(w.id)}>
                  <strong>Week {w.week_no}</strong>
                  <span>w/c {fmtDdMm(w.week_commencing)}</span>
                  {w.qes_focus && <span className="week-tag">{QES[w.qes_focus] ?? w.qes_focus}</span>}
                  {now && <span className="week-tag">This week</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

