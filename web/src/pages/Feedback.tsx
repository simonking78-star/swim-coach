import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { useClub } from "../club/ClubProvider";
import { ClubPicker } from "../club/ClubPicker";
import { LEVEL_NOTE, canEdit, sectionLevel } from "../lib/access";
import { loadPlanOptions, loadSquadNames } from "../lib/attendance";
import {
  CATEGORIES, MAX_FILE_MB, catLabel, loadCriteria, loadFbSwimmers, loadRecentSwimmerFeedback, loadSwimmerHistory,
  saveSwimmerFeedback, toThreads, validateSwimmerDraft,
  type EntryType, type FbEntry, type SwimmerLite, type Thread
} from "../lib/feedback";
import { shareFeedbackPdf } from "../lib/feedbackPdf";
import { fmtDate, logEvent, todayLocal, useCoachName } from "../lib/util";
import { EntryBody, StatusBadge, StatusPicker, StepTabs, StrokeChips, ThreadCard, TypeToggle } from "../components/feedbackParts";
import { SquadFeedback } from "./SquadFeedback";

type Mode = "swimmers" | "squads";

export function Feedback() {
  const { access } = useAuth();
  const level = sectionLevel(access, "feedback");
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get("mode") === "squads" ? "squads" : "swimmers";
  // Parents and swimmers (CR) only read their own record: no squad mode.
  const squadsAllowed = level !== "CR" && level !== "N";
  const setMode = (m: Mode) => { const p = new URLSearchParams(params); m === "squads" ? p.set("mode", "squads") : p.delete("mode"); setParams(p, { replace: true }); scrollTo(0, 0); };

  if (level === "N") {
    return <><div className="page-head"><h1>Feedback</h1></div><p className="notice warn">Your role doesn't have access to feedback.</p></>;
  }

  return (
    <>
      <div className="page-head">
        <h1><span aria-hidden="true">💬</span> Feedback</h1>
        <p className="dim">Every save adds a new dated entry — nothing is overwritten</p>
      </div>
      {LEVEL_NOTE[level] && <p className="notice">{LEVEL_NOTE[level]}</p>}

      {squadsAllowed && (
        <div className="seg seg-2 fb-mode" role="tablist" aria-label="Feedback for">
          <button type="button" role="tab" aria-selected={mode === "swimmers"} className={"seg-btn" + (mode === "swimmers" ? " on" : "")} onClick={() => setMode("swimmers")}>👤 Swimmers</button>
          <button type="button" role="tab" aria-selected={mode === "squads"} className={"seg-btn" + (mode === "squads" ? " on" : "")} onClick={() => setMode("squads")}>👥 Squads</button>
        </div>
      )}

      {mode === "squads" && squadsAllowed ? <SquadFeedback editable={canEdit(level)} /> : <SwimmerFeedback editable={canEdit(level)} />}
    </>
  );
}

// ===========================================================================
// Swimmer feedback
// ===========================================================================
type Tab = "pick" | "history" | "form";

function SwimmerFeedback({ editable }: { editable: boolean }) {
  const { club } = useClub();
  const [params] = useSearchParams();
  const [squad, setSquad] = useState<string>("");
  const [swimmer, setSwimmer] = useState<SwimmerLite | null>(null);
  const [tab, setTab] = useState<Tab>("pick");
  const [updating, setUpdating] = useState<Thread | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const squads = useQuery({ queryKey: ["fb_squads", club], enabled: !!club, queryFn: () => loadSquadNames(club!) });
  const swimmers = useQuery({ queryKey: ["fb_swimmers", club, squad], enabled: !!club, queryFn: () => loadFbSwimmers(club!, squad || null) });
  const history = useQuery({ queryKey: ["fb_history", swimmer?.id], enabled: !!swimmer, queryFn: () => loadSwimmerHistory(swimmer!.id) });
  const rows = history.data ?? [];

  // A new club or squad means a different pool of swimmers.
  useEffect(() => { setSquad(""); }, [club]);
  useEffect(() => { clearSwimmer(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [club, squad]);

  // Opened from a swimmer's profile (?swimmer=<id>): go straight to their history.
  const wanted = params.get("swimmer");
  const [usedWanted, setUsedWanted] = useState(false);
  useEffect(() => {
    if (!wanted || usedWanted || !swimmers.data) return;
    const s = swimmers.data.find(x => x.id === wanted);
    if (s) { setUsedWanted(true); pick(s); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, usedWanted, swimmers.data]);

  const pick = (s: SwimmerLite) => { setSwimmer(s); setUpdating(null); setFlash(null); setTab("history"); scrollTo(0, 0); };
  function clearSwimmer() { setSwimmer(null); setUpdating(null); setTab("pick"); }

  const startUpdate = (t: Thread) => { setUpdating(t); setFlash(null); setTab("form"); scrollTo(0, 0); };
  const onSaved = (text: string) => { setFlash(text); setUpdating(null); setTab("history"); scrollTo(0, 0); };

  return (
    <>
      <StepTabs<Tab>
        value={tab}
        onChange={t => { setTab(t); scrollTo(0, 0); }}
        tabs={[
          { key: "pick", label: "Swimmer", num: 1 },
          { key: "history", label: "History", badge: rows.length, disabled: !swimmer },
          ...(editable ? [{ key: "form" as Tab, label: "Stroke / skill", num: 2, disabled: !swimmer }] : [])
        ]}
      />

      {tab === "pick" && (
        <>
          <div className="card">
            <h2 className="card-title">1 · Swimmer</h2>
            <ClubPicker />
            <label htmlFor="fb-squad">Squad</label>
            <select id="fb-squad" value={squad} onChange={e => setSquad(e.target.value)}>
              <option value="">All squads (whole club)</option>
              {(squads.data ?? []).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {swimmer
              ? <SelectedPill swimmer={swimmer} onClear={clearSwimmer} />
              : <SwimmerSearch swimmers={swimmers.data ?? []} loading={swimmers.isLoading} onPick={pick} />}
          </div>
          {!swimmer && club && <RecentSwimmerFeedback club={club} onOpen={id => { const s = swimmers.data?.find(x => x.id === id); if (s) pick(s); }} />}
        </>
      )}

      {tab === "history" && swimmer && (
        <SwimmerHistory swimmer={swimmer} rows={rows} loading={history.isLoading} error={history.error as Error | null}
          flash={flash} onClear={clearSwimmer} onUpdate={editable ? startUpdate : undefined} />
      )}

      {tab === "form" && swimmer && editable && (
        <SwimmerForm key={swimmer.id + (updating?.id ?? "")} swimmer={swimmer} history={rows} updating={updating}
          initialPlan={params.get("plan") ?? ""} onCancelUpdate={() => setUpdating(null)} onSaved={onSaved} onClear={clearSwimmer} />
      )}
    </>
  );
}

function SelectedPill({ swimmer, onClear }: { swimmer: SwimmerLite; onClear: () => void }) {
  return (
    <div className="selected-pill">
      <span><strong>{swimmer.full_name}</strong>{swimmer.squad && <span className="dim"> · {swimmer.squad}</span>}</span>
      <button type="button" className="link-btn" onClick={onClear}>Change</button>
    </div>
  );
}

function SwimmerSearch({ swimmers, loading, onPick }: { swimmers: SwimmerLite[]; loading: boolean; onPick: (s: SwimmerLite) => void }) {
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const hits = t ? swimmers.filter(s => s.full_name.toLowerCase().includes(t)).slice(0, 25) : [];
  return (
    <div className="search-box">
      <label htmlFor="fb-search">Find a swimmer</label>
      <input id="fb-search" type="search" placeholder={loading ? "Loading swimmers…" : "Start typing a name…"} autoComplete="off"
        value={q} onChange={e => setQ(e.target.value)} aria-controls={t ? "fb-search-results" : undefined} />
      {t && (
        <ul className="search-results" id="fb-search-results">
          {hits.length === 0 && <li className="dim">No matches</li>}
          {hits.map(s => (
            <li key={s.id}>
              <button type="button" onClick={() => onPick(s)}>
                <span>{s.full_name}</span>{s.squad && <span className="chip">{s.squad}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!t && !loading && <p className="hint">{swimmers.length} swimmer{swimmers.length === 1 ? "" : "s"} in this list.</p>}
    </div>
  );
}

function RecentSwimmerFeedback({ club, onOpen }: { club: string; onOpen: (swimmerId: string) => void }) {
  const q = useQuery({ queryKey: ["fb_recent", club], queryFn: () => loadRecentSwimmerFeedback(club) });
  return (
    <section className="card">
      <h2 className="card-title">Recently logged (all swimmers)</h2>
      {q.isLoading && <p className="dim">Loading…</p>}
      {q.error && <p className="msg error">Couldn't load recent entries.</p>}
      {q.data && q.data.length === 0 && <p className="dim">No entries logged yet.</p>}
      {q.data?.map(r => (
        <div key={r.id} className="recent-item">
          <button type="button" className="link-btn recent-name" onClick={() => onOpen(r.swimmer_id)}>{r.swimmer_name}</button>
          <EntryBody e={r} />
        </div>
      ))}
    </section>
  );
}

function SwimmerHistory({ swimmer, rows, loading, error, flash, onClear, onUpdate }: {
  swimmer: SwimmerLite; rows: FbEntry[]; loading: boolean; error: Error | null; flash: string | null;
  onClear: () => void; onUpdate?: (t: Thread) => void;
}) {
  const [stroke, setStroke] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ busy: boolean; msg?: string }>({ busy: false });
  const cats = useMemo(() => [...new Set(rows.map(r => r.category).filter(Boolean))], [rows]);
  const threads = useMemo(() => toThreads(rows, stroke), [rows, stroke]);

  const makePdf = async () => {
    setPdf({ busy: true });
    try { await shareFeedbackPdf(swimmer, rows); setPdf({ busy: false }); }
    catch (e) { console.error(e); setPdf({ busy: false, msg: "Couldn't create the PDF — " + (e as Error).message }); }
  };

  return (
    <div className="card">
      <SelectedPill swimmer={swimmer} onClear={onClear} />
      {flash && <p className="msg" role="status">{flash}</p>}
      <div className="card-head">
        <h2 className="card-title">History {rows.length > 0 && <span className="dim">({rows.length} entr{rows.length === 1 ? "y" : "ies"})</span>}</h2>
        <button type="button" className="btn small" onClick={makePdf} disabled={pdf.busy || rows.length === 0}>{pdf.busy ? "Making…" : "PDF"}</button>
      </div>
      {pdf.msg && <p className="msg error" role="alert">{pdf.msg}</p>}
      <StrokeChips categories={cats} value={stroke} onChange={setStroke} />
      {loading && <p className="dim">Loading…</p>}
      {error && <p className="msg error">Couldn't load history.</p>}
      {!loading && !error && rows.length === 0 && <p className="dim">No feedback on record yet for this swimmer.</p>}
      {rows.length > 0 && threads.length === 0 && <p className="dim">No feedback for that stroke.</p>}
      {threads.map(t => <ThreadCard key={t.id} thread={t} onUpdate={onUpdate} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------
function SwimmerForm({ swimmer, history, updating, initialPlan, onCancelUpdate, onSaved, onClear }: {
  swimmer: SwimmerLite; history: FbEntry[]; updating: Thread | null; initialPlan: string;
  onCancelUpdate: () => void; onSaved: (msg: string) => void; onClear: () => void;
}) {
  const { session } = useAuth();
  const { club } = useClub();
  const coach = useCoachName();
  const qc = useQueryClient();
  const latest = updating?.entries[0];

  // Updating a string: keep stroke, type, criterion, status and the fix; observation starts fresh.
  const [category, setCategory] = useState(latest?.category ?? "");
  const [entryType, setEntryType] = useState<EntryType>(latest?.entry_type === "note" ? "note" : "status");
  const [criterion, setCriterion] = useState(latest?.criterion ?? "");
  const [status, setStatus] = useState<string | null>(latest?.status ?? null);
  const [observation, setObservation] = useState("");
  const [remedial, setRemedial] = useState(latest?.remedial_action ?? "");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(todayLocal().date);
  const [planId, setPlanId] = useState(initialPlan);
  const [files, setFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const criteria = useQuery({ queryKey: ["fb_criteria", category], enabled: !!category, queryFn: () => loadCriteria(category) });
  const plans = useQuery({ queryKey: ["att_plans", club], enabled: !!club, queryFn: () => loadPlanOptions(club!) });

  // "Last reviewed" — same stroke and criterion already on this swimmer's record.
  const match = useMemo(() => {
    if (updating || entryType !== "status" || !category || !criterion.trim()) return null;
    const c = criterion.trim().toLowerCase();
    return history.find(r => r.category === category && r.criterion?.trim().toLowerCase() === c) ?? null;
  }, [updating, entryType, category, criterion, history]);

  const save = async () => {
    const draft = { swimmerId: swimmer.id, threadId: updating?.id ?? null, entryType, category, criterion, status, observation, remedial, notes, date, planId, files, coach };
    const problem = validateSwimmerDraft(draft);
    if (problem) { setMsg({ text: problem, error: true }); return; }
    setMsg(null);
    setBusy("Saving…");
    try {
      const r = await saveSwimmerFeedback(draft, (i, n) => setBusy(`Uploading ${i} of ${n}…`));
      logEvent(session?.user.id, club, "core_task", "swimmer_feedback_save", { swimmer_id: swimmer.id, is_update: !!draft.threadId });
      await qc.invalidateQueries({ queryKey: ["fb_history", swimmer.id] });
      qc.invalidateQueries({ queryKey: ["fb_recent"] });
      qc.invalidateQueries({ queryKey: ["home_stats"] });
      onSaved(r === "queued"
        ? `Saved on this phone — will sync when you're back online (dated ${fmtDate(date)}).`
        : draft.threadId ? `Update added to the string — dated ${fmtDate(date)}.` : `Saved — dated ${fmtDate(date)}.`);
    } catch (e) {
      setMsg({ text: "Save failed — " + (e as Error).message, error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card fb-form">
      <SelectedPill swimmer={swimmer} onClear={onClear} />
      {updating && latest && (
        <div className="updating-banner">
          <div>
            <strong>Updating: {catLabel(latest.category)}{latest.criterion ? ` — ${latest.criterion}` : ""}</strong>
            <span className="dim">Adds a new dated entry to this string (started {fmtDate(updating.entries[updating.entries.length - 1].session_date)})</span>
          </div>
          <button type="button" className="btn small" onClick={onCancelUpdate}>Start new instead</button>
        </div>
      )}

      <h2 className="card-title">2 · Stroke / skill</h2>
      <label htmlFor="fb-cat" className="sr-only">Stroke or skill</label>
      <select id="fb-cat" value={category} onChange={e => setCategory(e.target.value)}>
        <option value="" disabled>Choose one…</option>
        {CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
      </select>

      <TypeToggle value={entryType} onChange={setEntryType} />

      {entryType === "status" && (
        <>
          <label htmlFor="fb-crit">Criterion</label>
          <input id="fb-crit" list="fb-crit-list" autoComplete="off" placeholder="e.g. Backstroke push-off position" value={criterion} onChange={e => setCriterion(e.target.value)} />
          <datalist id="fb-crit-list">{(criteria.data ?? []).map(c => <option key={c} value={c} />)}</datalist>
          {match && (
            <div className="match-banner">
              <p><strong>Last reviewed {fmtDate(match.session_date)}</strong> <StatusBadge status={match.status} /></p>
              {(match.observation || match.note) && <p className="dim">{(match.observation || match.note)!.slice(0, 160)}</p>}
              <button type="button" className="btn small" onClick={() => {
                setObservation(match.observation || match.note || ""); setRemedial(match.remedial_action || ""); if (match.status) setStatus(match.status);
              }}>Load into fields to edit</button>
            </div>
          )}
          <StatusPicker value={status} onChange={setStatus} />
        </>
      )}

      <label htmlFor="fb-obs">Observation</label>
      <textarea id="fb-obs" rows={3} placeholder="What did you see? The fact of the session…" value={observation} onChange={e => setObservation(e.target.value)} />
      <label htmlFor="fb-fix">Remedial action <span className="dim">(optional)</span></label>
      <textarea id="fb-fix" rows={2} placeholder="What's the fix — drill, cue, focus for next time…" value={remedial} onChange={e => setRemedial(e.target.value)} />
      <label htmlFor="fb-notes">Additional notes <span className="dim">(optional)</span></label>
      <textarea id="fb-notes" rows={2} placeholder="Anything else — effort, attitude, context…" value={notes} onChange={e => setNotes(e.target.value)} />

      <MediaPicker files={files} setFiles={setFiles} onTooBig={name => setMsg({ text: `${name} is over ${MAX_FILE_MB}MB and wasn't added — try a shorter clip or a smaller photo.`, error: true })} />

      <label htmlFor="fb-date">Date</label>
      <input id="fb-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
      <label htmlFor="fb-plan">Session plan <span className="dim">(optional — the plan the swimmer worked from)</span></label>
      <select id="fb-plan" value={planId} onChange={e => setPlanId(e.target.value)}>
        <option value="">— none / not linked —</option>
        {(plans.data ?? []).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>

      <p className="hint">Saving always adds a new dated entry — it never overwrites a previous one.</p>
      <button type="button" className="btn primary wide" onClick={save} disabled={!!busy}>{busy ?? "Save entry"}</button>
      {msg && <p className={"msg" + (msg.error ? " error" : "")} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
    </div>
  );
}

function MediaPicker({ files, setFiles, onTooBig }: { files: File[]; setFiles: (f: File[]) => void; onTooBig: (name: string) => void }) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews]);

  const add = (list: FileList | null) => {
    const next = [...files];
    for (const f of Array.from(list ?? [])) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) { onTooBig(f.name); continue; }
      next.push(f);
    }
    setFiles(next);
  };

  return (
    <fieldset className="choice-set">
      <legend>Photo / video <span className="dim">(optional)</span></legend>
      <div className="seg seg-2">
        <button type="button" className="seg-btn media-btn" onClick={() => gallery.current?.click()}>🖼️ Choose from gallery</button>
        <button type="button" className="seg-btn media-btn" onClick={() => camera.current?.click()}>📷 Take photo / video</button>
      </div>
      <input ref={gallery} type="file" accept="image/*,video/*" multiple hidden onChange={e => { add(e.target.files); e.target.value = ""; }} />
      <input ref={camera} type="file" accept="image/*,video/*" capture="environment" hidden onChange={e => { add(e.target.files); e.target.value = ""; }} />
      {files.length > 0 && (
        <div className="media-grid">
          {files.map((f, i) => (
            <div key={i} className="media-item">
              {f.type.startsWith("video/") ? <video src={previews[i]} muted /> : <img src={previews[i]} alt="" />}
              {f.type.startsWith("video/") && <span className="media-play" aria-hidden="true">▶</span>}
              <button type="button" className="media-remove" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}
