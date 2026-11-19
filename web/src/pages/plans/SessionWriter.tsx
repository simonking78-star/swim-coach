import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { canEdit, sectionLevel } from "../../lib/access";
import { catLabel, CATEGORIES, QES } from "../../lib/feedback";
import { fmtDayShort, fmtWhen, loadPlan, microFor, normSkill, suggestFocus, type MicroCtx } from "../../lib/plans";
import {
  analysePlan, contentToText, FOCUS, focusFromSkills, loadSeasonDetail, loadSquadFb, loadSwimmerFb, PRIMARY,
  saveExplanation, saveWritten, type AFlag, type Analysis, type Clarification, type CurrentFb
} from "../../lib/sessionWriter";
import { useMinWidth } from "../../lib/device";
import { fmtDdMm, logEvent, todayLocal, useCoachName } from "../../lib/util";
import { MicroTags } from "../../components/planParts";
import { NoPlanAccess, usePlanSquads, useSeasonCtx } from "./PlanList";
import { backLink } from "./PlanView";

// Session writer (/sessions/new, /sessions/:id/edit). Free-form planning, as in the
// Free-Text Session Planner app: write in your own shorthand, Analyse, then Save.
// Desktop (≥1100px): write on the left; season plan (top right) and current
// feedback (bottom right). Phone: one column in the planner app's order.

const POOLS = ["17m", "25m", "50m"];
const DRAFT = (id: string | null) => `ct.writer.${id || "new"}`;
const m = (n: number) => `${n.toLocaleString("en-GB")} m`;

interface Draft { text: string; title: string; squadId: string; date: string; pool: string | null; focus: string[]; primary: string; }
function readDraft(id: string | null): Draft | null {
  try { const s = localStorage.getItem(DRAFT(id)); return s ? JSON.parse(s) : null; } catch { return null; }
}
function writeDraft(id: string | null, d: Draft | null) {
  try { if (d) localStorage.setItem(DRAFT(id), JSON.stringify(d)); else localStorage.removeItem(DRAFT(id)); } catch { /* storage unavailable */ }
}

export function SessionWriter() {
  const { id = null } = useParams();
  const [params] = useSearchParams();
  const { access, session } = useAuth();
  const level = sectionLevel(access, "plans");
  const { club } = useClub();
  const coach = useCoachName();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const desktop = useMinWidth(1100);

  const existing = useQuery({ queryKey: ["plan", id], enabled: !!id, queryFn: () => loadPlan(id!) });
  const planClub = id ? existing.data?.club ?? null : club;
  const squads = usePlanSquads(planClub);
  const season = useSeasonCtx(planClub);

  // A new-plan draft comes back only when it is for the same squad and date (or none was asked for).
  const saved = useRef(id ? null : (() => {
    const d = readDraft(null), sq = params.get("squad"), dt = params.get("date");
    return d && (!sq || (d.squadId === sq && (!dt || d.date === dt))) ? d : null;
  })());
  const [text, setText] = useState(saved.current?.text ?? "");
  const [title, setTitle] = useState(saved.current?.title ?? "");
  const [squadId, setSquadId] = useState(params.get("squad") || saved.current?.squadId || "");
  const [date, setDate] = useState(params.get("date") || saved.current?.date || todayLocal().date);
  const [sessionId, setSessionId] = useState<string | null>(params.get("session"));
  const [pool, setPool] = useState<string | null>(saved.current?.pool ?? "25m");
  const [focus, setFocus] = useState<string[]>(saved.current?.focus ?? []);
  const [primary, setPrimary] = useState(saved.current?.primary ?? "");
  const [touched, setTouched] = useState(!!saved.current?.focus?.length || !!saved.current?.primary);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysedText, setAnalysedText] = useState<string | null>(null);
  const [flags, setFlags] = useState<AFlag[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [clarifications, setClarifications] = useState<Clarification[]>([]);
  const [busy, setBusy] = useState<"" | "analyse" | "save">("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const loaded = useRef(false);
  // Phone layers: which are open (kept on this device).
  const [layers, setLayers] = useState<Record<"season" | "feedback" | "write", boolean>>(() => {
    try { return { season: true, feedback: false, write: true, ...JSON.parse(localStorage.getItem("ct.writer.layers") || "{}") }; }
    catch { return { season: true, feedback: false, write: true }; }
  });
  const toggleLayer = (k: "season" | "feedback" | "write") => setLayers(l => {
    const next = { ...l, [k]: !l[k] };
    try { localStorage.setItem("ct.writer.layers", JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });

  // Fill from the saved plan (its own text, or older block plans written out as text).
  useEffect(() => {
    const p = existing.data as (typeof existing.data & { raw_text?: string | null; focus_categories?: string[] | null; flags?: AFlag[] | null; source?: string | null }) | undefined;
    if (!p || loaded.current) return;
    loaded.current = true;
    const draft = readDraft(id);
    const t = draft?.text ?? (p.raw_text || contentToText(p.content));
    setText(t); setTitle(draft?.title ?? p.title ?? ""); setSquadId(p.squad_id || ""); setDate(p.intended_date || todayLocal().date);
    setSessionId(p.micro_session_id); setPool(p.pool_size);
    setFocus(draft?.focus ?? (p.focus_categories?.length ? p.focus_categories : focusFromSkills((p.stroke_skills || []).map(normSkill))));
    setPrimary(draft?.primary ?? p.training_zone ?? ""); setTouched(true);
    setFlags(p.flags || []);
    // A plan already analysed in the planner counts as analysed until its text changes.
    if (p.source === "freetext" && p.raw_text) setAnalysedText(p.raw_text);
  }, [existing.data, id]);

  // Keep a draft on this device while writing.
  useEffect(() => {
    if (id && !loaded.current) return;
    const t = setTimeout(() => writeDraft(id, { text, title, squadId, date, pool, focus, primary }), 400);
    return () => clearTimeout(t);
  }, [id, text, title, squadId, date, pool, focus, primary]);

  const ctx = useMemo(() => microFor(season.data, squadId, date, sessionId), [season.data, squadId, date, sessionId]);
  const squadName = (squads.data ?? []).find(s => s.id === squadId)?.name || "";

  // Pre-fill the focus from the micro-cycle until the coach picks one.
  useEffect(() => {
    if (touched || !ctx) return;
    const sug = suggestFocus(ctx);
    setFocus(focusFromSkills(sug.skills));
    if (PRIMARY.includes(sug.zone)) setPrimary(sug.zone);
  }, [ctx, touched]);

  if (level === "N") return <NoPlanAccess />;
  const origin = backLink(from);
  const crumb = id
    ? <p className="crumb"><Link to={`/sessions/${id}`} state={{ from }}>‹ Plan</Link></p>
    : <p className="crumb"><Link to={origin.to}>‹ {origin.label}</Link></p>;
  if (!canEdit(level)) return <>{crumb}<h1>Write a session</h1><p className="notice warn">Session plans are read only for your role.</p></>;
  if (id && existing.isLoading) return <>{crumb}<h1>Edit session</h1><p className="dim">Loading…</p></>;
  if (id && !existing.data) return <>{crumb}<h1>Edit session</h1><p className="msg error">Couldn't find that plan.</p></>;

  const changed = analysedText === null || analysedText.trim() !== text.trim();
  const openFlags = flags.filter(f => !f.explained && !f.checked);

  const analyse = async (extra: Clarification[] = clarifications) => {
    setMsg(null);
    if (!squadId) { setMsg({ text: "Choose the squad first.", error: true }); return; }
    if (text.trim().length < 5) { setMsg({ text: "Write the session first.", error: true }); return; }
    setBusy("analyse");
    try {
      const a = await analysePlan({ text, club: planClub!, squadName, date, pool, ctx, focus, primary, clarifications: extra });
      // Keep the coach's earlier explanations visible as checked items.
      const explained: AFlag[] = extra.map(c => ({ term: c.term, text: c.term, reason: `Explained by coach: ${c.meaning}`, checked: true, explained: true }));
      const known = new Set(extra.map(c => c.term.toLowerCase()));
      setAnalysis(a); setAnalysedText(text); setFlags([...explained, ...(a.plan.flags || []).filter(f => !f.term || !known.has(f.term.toLowerCase()))]); setAnswers({});
      if (!title.trim()) setTitle(a.plan.title || [squadName, fmtDayShort(date)].join(" — "));
      if (!primary && PRIMARY.includes(a.plan.training_zone || "")) setPrimary(a.plan.training_zone!);
      logEvent(session?.user.id, planClub, "core_task", "session_writer_analyse", { flags: (a.plan.flags || []).length });
    } catch (e) {
      setMsg({ text: (e as Error).message || "Couldn't analyse the plan. Try again.", error: true });
    } finally { setBusy(""); }
  };

  const explainAndReanalyse = async () => {
    const given = Object.entries(answers).filter(([, v]) => v.trim()).map(([term, meaning]) => ({ term, meaning: meaning.trim() }));
    if (!given.length) return;
    try {
      await Promise.all(given.map(g => saveExplanation(planClub!, session?.user.id, coach, g.term, g.meaning)));
    } catch (e) { console.warn("glossary:", e); }
    const next = [...clarifications.filter(c => !given.some(g => g.term === c.term)), ...given];
    setClarifications(next);
    await analyse(next);
  };

  const save = async () => {
    setMsg(null);
    if (!squadId) { setMsg({ text: "Choose the squad this plan is for.", error: true }); return; }
    if (!date) { setMsg({ text: "Set the session date.", error: true }); return; }
    if (changed) { setMsg({ text: "Analyse the session before saving, so its distances and sets are up to date.", error: true }); return; }
    const t = title.trim() || [squadName, fmtDayShort(date)].join(" — ");
    setBusy("save");
    try {
      const savedId = await saveWritten({ id, club: planClub!, coach, title: t, text, squadId, date, pool, focus, primary, ctx, analysis, flags });
      writeDraft(id, null); if (!id) writeDraft(null, null);
      logEvent(session?.user.id, planClub, "core_task", "session_plan_save", { plan_id: savedId, is_update: !!id, writer: true });
      qc.invalidateQueries({ queryKey: ["plans", planClub] });
      qc.invalidateQueries({ queryKey: ["plan", savedId] });
      setMsg({ text: "Plan saved." });
      setTimeout(() => navigate(`/sessions/${savedId}`, { replace: true, state: { from } }), 500);
    } catch (e) {
      console.error(e);
      setMsg({ text: "Save failed — " + ((e as Error).message || "please try again."), error: true });
    } finally { setBusy(""); }
  };

  const toggleFocus = (c: string) => { setTouched(true); setFocus(f => FOCUS.filter(x => (x === c ? !f.includes(c) : f.includes(x)))); };
  const analyseBtn = (where: string) => (
    <button type="button" className="btn primary sw-analyse" onClick={() => analyse()} disabled={busy !== ""} aria-describedby={`sw-an-${where}`}>
      {busy === "analyse" ? "Analysing…" : "✨ Analyse"}
    </button>
  );

  // ---------------- Left: write ----------------
  // Date and squad drive everything else on the page (season plan, feedback and the plan itself).
  const dateSquad = (
    <>
      <div>
        <label htmlFor="sw-date">Date</label>
        <input id="sw-date" type="date" value={date} onChange={e => { setDate(e.target.value); setSessionId(null); }} />
      </div>
      <div>
        <label htmlFor="sw-squad">Squad</label>
        <select id="sw-squad" value={squadId} onChange={e => { setSquadId(e.target.value); setSessionId(null); }}>
          <option value="">Choose a squad…</option>
          {(squads.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    </>
  );

  const write = (
    <section className="card sw-write" aria-labelledby="sw-write-h">
      <h2 id="sw-write-h" className="sr-only">Write the session</h2>
      <div className={"sw-head" + (desktop ? "" : " pool-only")}>
        {desktop && dateSquad}
        <div>
          <label htmlFor="sw-pool">Pool</label>
          <select id="sw-pool" value={pool ?? ""} onChange={e => setPool(e.target.value || null)}>
            <option value="">—</option>
            {POOLS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="plain-fieldset">
        <legend>Session focus · Stroke/Skills</legend>
        <div className="sw-focus">
          {FOCUS.map(c => (
            <button key={c} type="button" className={"sw-chip" + (focus.includes(c) ? " on" : "")} aria-pressed={focus.includes(c)} onClick={() => toggleFocus(c)}>
              {catLabel(c)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="sw-primary">
        <label htmlFor="sw-primary">Primary training focus</label>
        <select id="sw-primary" value={primary} onChange={e => { setTouched(true); setPrimary(e.target.value); }}>
          <option value="">— choose —</option>
          {PRIMARY.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
      </div>

      <div className="sw-analyse-row">{analyseBtn("top")}<span id="sw-an-top" className="dim small">{changed ? "Write in your own shorthand, then analyse." : "Analysed ✓"}</span></div>

      <label htmlFor="sw-text" className="sr-only">Session plan</label>
      <textarea id="sw-text" className="sw-text" rows={desktop ? 20 : 14} spellCheck={false} value={text}
        placeholder={"Warm up\n400 FR\n4 x 50 kick @1:00\n\nMain set\n2x\n  4 x 100 FR @1:40 hold 1:20s\n  100 BK easy\n\nSwim down\n200 choice"}
        onChange={e => setText(e.target.value)} />

      <div className="sw-analyse-row">{analyseBtn("bottom")}<span id="sw-an-bottom" className="dim small">{text.trim() ? `${text.trim().split("\n").length} lines` : ""}</span></div>

      {(analysis || flags.length > 0) && <AnalysisView analysis={analysis} changed={changed} flags={flags} openFlags={openFlags}
        answers={answers} setAnswers={setAnswers} onExplain={explainAndReanalyse} busy={busy !== ""} />}

      <label htmlFor="sw-title">Plan title</label>
      <input id="sw-title" type="text" value={title} placeholder={squadName ? `${squadName} — ${fmtDayShort(date)}` : "e.g. Platinum Mon — aerobic and sprint"} onChange={e => setTitle(e.target.value)} />
      <button type="button" className="btn primary wide" onClick={save} disabled={busy !== ""}>{busy === "save" ? "Saving…" : "Save plan"}</button>
      {msg && <p className={"msg" + (msg.error ? " error" : "")} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
      {id && <p className="dim small">Prefer the block editor? <Link to={`/sessions/${id}/blocks`} state={{ from }}>Open it</Link>.</p>}
    </section>
  );

  const seasonPane = <SeasonPane season={season} ctx={ctx} squadId={squadId} squadName={squadName} date={date} planId={id} onSession={setSessionId} />;
  const fbPane = <FeedbackPane squadId={squadId} date={date} focus={focus} />;

  return (
    <>
      {crumb}
      <div className="page-head"><h1><span aria-hidden="true">✍️</span> {id ? "Edit session" : "Write a session"}</h1></div>
      {desktop
        ? <div className="sw-grid">{write}<div className="sw-right">{seasonPane}{fbPane}</div></div>
        : (
          // Phone: date and squad on top, then three layers in order — season plan, feedback to date, write plan.
          <div className="sw-stack">
            <section className="card sw-pick" aria-label="Date and squad">
              <div className="sw-head">{dateSquad}</div>
              <p className="dim small">{squadName ? `${squadName} · ${fmtDayShort(date)}` : "Choose the squad"} — sets the season plan, feedback and plan below.</p>
            </section>
            <Layer n={1} title="Season plan" note={ctx ? `${ctx.micro.macroTitle}${ctx.micro.meso ? ` · Meso ${ctx.micro.meso}` : ""} · Week ${ctx.micro.week_no}` : ""}
              open={layers.season} onToggle={() => toggleLayer("season")}>{seasonPane}</Layer>
            <Layer n={2} title="Feedback to date" note={focus.length ? `Focus: ${focus.map(catLabel).join(", ")}` : ""}
              open={layers.feedback} onToggle={() => toggleLayer("feedback")}>{fbPane}</Layer>
            <Layer n={3} title="Write plan" note={changed ? (text.trim() ? "Not analysed yet" : "") : "Analysed ✓"}
              open={layers.write} onToggle={() => toggleLayer("write")}>{write}</Layer>
          </div>
        )}
    </>
  );
}

// ---------------------------------------------------------------------------
function AnalysisView({ analysis, changed, flags, openFlags, answers, setAnswers, onExplain, busy }: {
  analysis: Analysis | null; changed: boolean; flags: AFlag[]; openFlags: AFlag[];
  answers: Record<string, string>; setAnswers: (f: (a: Record<string, string>) => Record<string, string>) => void; onExplain: () => void; busy: boolean;
}) {
  const t = analysis?.totals;
  const list = (o: Record<string, number> | undefined) => Object.entries(o ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const termFlags = openFlags.filter(f => f.term);
  return (
    <div className={"sw-result" + (changed ? " stale" : "")} aria-live="polite">
      {changed && analysis && <p className="notice warn">The text has changed since the last analysis — analyse again before saving.</p>}
      {analysis && t && (
        <>
          <div className="sw-total"><span>Total</span><strong>{m(t.total_m)}</strong></div>
          {analysis.plan.focus && <p className="sw-focus-line"><strong>Focus:</strong> {analysis.plan.focus}{analysis.plan.main_set ? <> · <strong>Main set:</strong> {analysis.plan.main_set}</> : null}</p>}
          <div className="sw-totals">
            {([["Stroke", t.by_stroke], ["Type", t.by_type], ["Effort", t.by_zone]] as const).map(([h, o]) => (
              <div key={h}><h4>{h}</h4>{list(o).map(([k, v]) => <p key={k}><span>{k}</span><span>{m(v)}</span></p>)}</div>
            ))}
          </div>
        </>
      )}
      {flags.length > 0 && (
        <div className="sw-flags">
          <h4>Please check {openFlags.length > 0 && <span className="badge warn">{openFlags.length}</span>}</h4>
          <ul>
            {flags.map((f, i) => (
              <li key={i} className={f.explained || f.checked ? "done" : ""}>
                <p><strong>{f.term || f.text}</strong> — {f.reason}</p>
                {f.term && !f.explained && !f.checked && (
                  <input type="text" aria-label={`What does ${f.term} mean?`} placeholder={`What does “${f.term}” mean?`}
                    value={answers[f.term] ?? ""} onChange={e => setAnswers(a => ({ ...a, [f.term!]: e.target.value }))} />
                )}
              </li>
            ))}
          </ul>
          {termFlags.length > 0 && (
            <button type="button" className="btn small" onClick={onExplain} disabled={busy || !Object.values(answers).some(v => v.trim())}>
              Save explanations and analyse again
            </button>
          )}
        </div>
      )}
      {analysis && (
        <details className="sw-sets">
          <summary>Set by set</summary>
          <table className="sw-table">
            <thead><tr><th>Set</th><th>Stroke</th><th>Type</th><th>Effort</th><th className="num">Metres</th></tr></thead>
            <tbody>
              {analysis.plan.blocks.flatMap((b, i) => {
                if (b.type === "heading") return [<tr key={i} className="sec"><td colSpan={5}>{b.text}</td></tr>];
                const rows = b.type === "set" && b.set ? [{ s: b.set, x: 1 }] : b.type === "repeat_group" ? (b.children ?? []).map(s => ({ s, x: b.reps || 1 })) : [];
                return rows.map(({ s, x }, j) => (
                  <tr key={`${i}-${j}`}>
                    <td>{x > 1 ? <span className="dim">{x}× </span> : null}{s.text}{s.drill_name ? <span className="plan-tag skill">{s.drill_name}</span> : null}</td>
                    <td>{s.stroke || ""}</td><td>{s.kind || ""}</td><td>{s.effort || ""}</td>
                    <td className="num">{s.distance_m ? (s.reps ?? 1) * s.distance_m * x : "—"}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function SeasonPane({ season, ctx, squadId, squadName, date, planId, onSession }: {
  season: ReturnType<typeof useSeasonCtx>; ctx: MicroCtx | null; squadId: string; squadName: string; date: string; planId: string | null;
  onSession: (id: string) => void;
}) {
  const detail = useQuery({
    queryKey: ["writer_season", ctx?.micro.id, squadId, date, planId], enabled: !!ctx && !!season.data,
    queryFn: () => loadSeasonDetail(season.data!, ctx!, squadId, date, planId)
  });
  const d = detail.data;
  const range = (a: string | null, b: string | null) => (a && b ? `${fmtDdMm(a)} – ${fmtDdMm(b)}` : "");
  return (
    <section className="card sw-pane sw-season" aria-labelledby="sw-season-h">
      <h2 id="sw-season-h" className="card-title">Season plan · {date ? fmtDayShort(date) : "choose a date"}</h2>
      {!squadId ? <p className="dim">Choose a squad to see its macro, meso and micro-cycle for this date.</p>
        : season.isLoading ? <p className="dim">Loading the season plan…</p>
        : !ctx ? <p className="dim">No micro-cycle covers {fmtDayShort(date)} for {squadName || "this squad"}. Add one under Season planner.</p>
        : (
          <>
            {ctx.isBreak && <p className="notice warn">This day is a break day in the season plan.</p>}
            <div className="sw-cycles">
              <div className="sw-cycle macro">
                <h3>Macro</h3>
                <p><strong>{ctx.micro.macroTitle}</strong></p>
                {d && <p className="dim small">Week {d.weekInMacro} of {d.macroWeeks} · {range(d.macroFrom, d.macroTo)}</p>}
                {ctx.season && <p className="dim small">{ctx.season.title}</p>}
                {d?.macroNote && <p className="sw-note">{d.macroNote}</p>}
              </div>
              <div className="sw-cycle meso">
                <h3>Meso</h3>
                {ctx.micro.meso ? <p><strong>Meso {ctx.micro.meso}</strong></p> : <p className="dim">Not set</p>}
                {d && d.mesoWeeks > 0 && <p className="dim small">Week {d.weekInMeso} of {d.mesoWeeks} · {range(d.mesoFrom, d.mesoTo)}</p>}
              </div>
              <div className="sw-cycle micro">
                <h3>Micro</h3>
                <p><strong>Week {ctx.micro.week_no}</strong>{ctx.micro.week_commencing ? <span className="dim"> · w/c {fmtDdMm(ctx.micro.week_commencing)}</span> : null}</p>
                {ctx.micro.qes_focus && <p className="small">{QES[ctx.micro.qes_focus] ?? ctx.micro.qes_focus} week</p>}
                {d && (d.plannedVolume || d.plansThisWeek > 0) && (
                  <p className="dim small">
                    {d.plansThisWeek} other plan{d.plansThisWeek === 1 ? "" : "s"} this week{d.plannedThisWeek ? ` · ${m(d.plannedThisWeek)}` : ""}
                    {d.plannedVolume ? ` of ${m(d.plannedVolume)} planned` : ""}
                  </p>
                )}
              </div>
            </div>
            <MicroTags micro={ctx.micro} />
            {ctx.daySessions.length > 1 && (
              <div className="sw-which">
                <label htmlFor="sw-sess">Which session</label>
                <select id="sw-sess" value={ctx.session?.id || ""} onChange={e => onSession(e.target.value)}>
                  {ctx.daySessions.map(x => <option key={x.id} value={x.id}>{fmtWhen(x.session_date, x.start_time, x.end_time)}</option>)}
                </select>
              </div>
            )}
            {ctx.session
              ? <div className="micro-sess">
                  <p className="micro-when">{fmtWhen(ctx.session.session_date, ctx.session.start_time, ctx.session.end_time)}</p>
                  {ctx.session.stroke_focus && <p>Stroke focus: <strong>{ctx.session.stroke_focus}</strong></p>}
                  {ctx.session.outline && <p className="dim pre">{ctx.session.outline}</p>}
                </div>
              : <p className="dim small">No session outlined for this date in the micro-cycle.</p>}
            {(d?.windows ?? []).map(w => (
              <p key={w.id} className="sw-event">
                <span className="chip">{w.kind === "test_set" ? "Test window" : w.kind === "squad_move" ? "Squad moves" : w.kind}</span>
                {w.title || ""} <span className="dim">{fmtDdMm(w.starts_on)} – {fmtDdMm(w.ends_on)}</span>
              </p>
            ))}
            {ctx.comp && <p className="micro-comp">Competition this week: {ctx.comp.name} ({fmtDayShort(ctx.comp.date_from)})</p>}
            {d?.nextComp && d.nextComp.name !== ctx.comp?.name && (
              <p className="sw-event"><span className="chip">Next competition</span>{d.nextComp.name} <span className="dim">{fmtDayShort(d.nextComp.date_from)} · in {d.nextComp.days} day{d.nextComp.days === 1 ? "" : "s"}</span></p>
            )}
            {detail.error && <p className="msg error">Couldn't load all of the season detail.</p>}
          </>
        )}
    </section>
  );
}

// ---------------------------------------------------------------------------
function FeedbackPane({ squadId, date, focus }: { squadId: string; date: string; focus: string[] }) {
  const [tab, setTab] = useState<"swimmers" | "squad">("swimmers");
  const [cat, setCat] = useState<string>("");
  const [embedded, setEmbedded] = useState(false);
  const swimmers = useQuery({ queryKey: ["writer_fb_sw", squadId, date, embedded], enabled: !!squadId && !!date, queryFn: () => loadSwimmerFb(squadId, date, embedded) });
  const squad = useQuery({ queryKey: ["writer_fb_sq", squadId, date, embedded], enabled: !!squadId && !!date, queryFn: () => loadSquadFb(squadId, date, embedded) });

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of swimmers.data ?? []) c.set(r.category, (c.get(r.category) ?? 0) + 1);
    return c;
  }, [swimmers.data]);
  // Follow the session focus: open on the first chosen Stroke/Skill that has feedback.
  const firstFocus = focus.find(c => counts.get(c)) || "";
  const shownCat = cat || firstFocus;
  const swShown = (swimmers.data ?? []).filter(r => !shownCat || r.category === shownCat);
  const cats = [...CATEGORIES, ...[...counts.keys()].filter(c => !CATEGORIES.includes(c))];

  return (
    <section className="card sw-pane sw-fb" aria-labelledby="sw-fb-h">
      <div className="sw-fb-head">
        <h2 id="sw-fb-h" className="card-title">Current feedback</h2>
        <label className="inline small"><input type="checkbox" checked={embedded} onChange={e => setEmbedded(e.target.checked)} /> Include embedded</label>
      </div>
      <div className="seg seg-2 tabs" role="tablist" aria-label="Feedback">
        <button type="button" role="tab" aria-selected={tab === "swimmers"} className={"seg-btn" + (tab === "swimmers" ? " on" : "")} onClick={() => setTab("swimmers")}>
          👤 Swimmers {swimmers.data ? <span className="dim">({swimmers.data.length})</span> : null}
        </button>
        <button type="button" role="tab" aria-selected={tab === "squad"} className={"seg-btn" + (tab === "squad" ? " on" : "")} onClick={() => setTab("squad")}>
          👥 Squad {squad.data ? <span className="dim">({squad.data.length})</span> : null}
        </button>
      </div>
      {!squadId ? <p className="dim">Choose a squad to see its feedback.</p> : tab === "swimmers" ? (
        <div role="tabpanel">
          <div className="sw-focus small" aria-label="Stroke/Skills">
            <button type="button" className={"sw-chip" + (!shownCat ? " on" : "")} aria-pressed={!shownCat} onClick={() => setCat("")}>All</button>
            {cats.map(c => (
              <button key={c} type="button" className={"sw-chip" + (shownCat === c ? " on" : "") + (focus.includes(c) ? " focus" : "")} aria-pressed={shownCat === c}
                disabled={!counts.get(c)} onClick={() => setCat(shownCat === c ? "" : c)}>
                {catLabel(c)} <span className="n">{counts.get(c) ?? 0}</span>
              </button>
            ))}
          </div>
          {swimmers.isLoading ? <p className="dim">Loading feedback…</p>
            : swimmers.error ? <p className="msg error">Couldn't load swimmer feedback.</p>
            : !swShown.length ? <p className="dim">No current feedback{shownCat ? ` for ${catLabel(shownCat)}` : ""}.</p>
            : <FbList rows={swShown} showCat={!shownCat} />}
        </div>
      ) : (
        <div role="tabpanel">
          {squad.isLoading ? <p className="dim">Loading feedback…</p>
            : squad.error ? <p className="msg error">Couldn't load squad feedback.</p>
            : !(squad.data ?? []).length ? <p className="dim">No current squad feedback.</p>
            : <FbList rows={squad.data!} showCat squad />}
        </div>
      )}
    </section>
  );
}

function FbList({ rows, showCat, squad }: { rows: CurrentFb[]; showCat: boolean; squad?: boolean }) {
  return (
    <ul className="sw-fb-list">
      {rows.map(r => (
        <li key={r.thread_id}>
          <div className="sw-fb-top">
            <strong>{squad ? catLabel(r.category) : r.who}</strong>
            {!squad && showCat && <span className="chip">{catLabel(r.category)}</span>}
            {r.status && <span className={"chip st-" + r.status.toLowerCase().replace(/\s+/g, "-")}>{r.status}</span>}
            <span className="dim small sw-fb-date">{fmtDdMm(r.session_date)}</span>
          </div>
          {r.criterion && <p className="small"><strong>{r.criterion}</strong></p>}
          {(r.observation || r.note) && <p className="small">{r.observation || r.note}</p>}
          {r.remedial_action && <p className="small dim">→ {r.remedial_action}</p>}
          {r.drill_name && <p className="small"><span className="plan-tag skill">{r.drill_name}</span></p>}
        </li>
      ))}
    </ul>
  );
}

// A collapsible layer on the phone layout.
function Layer({ n, title, note, open, onToggle, children }: { n: number; title: string; note: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const id = `sw-layer-${n}`;
  return (
    <section className={"sw-layer" + (open ? " open" : "")}>
      <h2 className="sw-layer-h">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <span className="sw-layer-n" aria-hidden="true">{n}</span>
          <span className="sw-layer-t">{title}{note && <span className="sw-layer-note">{note}</span>}</span>
          <span className="sw-layer-chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
        </button>
      </h2>
      <div id={id} className="sw-layer-body" hidden={!open}>{children}</div>
    </section>
  );
}
