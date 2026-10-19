import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthProvider";
import { useClub } from "../../club/ClubProvider";
import { canEdit, sectionLevel } from "../../lib/access";
import { QES } from "../../lib/feedback";
import {
  blankBlock, blockDistance, fmtDayShort, fmtWhen, loadPlan, loadWeekDrills, microFor, parseSetLine, planDistance,
  savePlan, SKILLS, normSkill, suggestFocus, validatePlan, ZONES, type Block, type BlockType, type SetBlock
} from "../../lib/plans";
import type { FullDrill } from "../../lib/drills";
import { logEvent, uuid, useCoachName } from "../../lib/util";
import { MicroTags, SetLineInput } from "../../components/planParts";
import { DrillPickModal, useDrills } from "../../components/drillParts";
import { NoPlanAccess, usePlanSquads, useSeasonCtx } from "./PlanList";
import { backLink } from "./PlanView";

// Session plan editor — new (/sessions/new?squad=&date=&session=) or edit (/sessions/:id/edit).
// Same blocks, micro-cycle panel, focus pre-fill and save rules as the current app.

interface Item { k: string; b: Block; }
const wrap = (b: Block): Item => ({ k: uuid(), b });
const POOLS = ["17m", "25m", "50m"];
const addDrillId = (s: SetBlock, id: string): SetBlock => ({ ...s, drill_ids: [...new Set([...(s.drill_ids || []), id])] });

export function PlanEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { access, session } = useAuth();
  const level = sectionLevel(access, "plans");
  const { club } = useClub();
  const coach = useCoachName();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const from = (useLocation().state as { from?: string } | null)?.from;

  const existing = useQuery({ queryKey: ["plan", id], enabled: !!id, queryFn: () => loadPlan(id!) });
  const planClub = id ? existing.data?.club ?? null : club;
  const squads = usePlanSquads(planClub);
  const season = useSeasonCtx(planClub);
  const drills = useDrills(planClub);

  const [items, setItems] = useState<Item[]>(() => [wrap({ ...blankBlock("heading"), text: "Warm up" } as Block)]);
  const [title, setTitle] = useState("");
  const [squadId, setSquadId] = useState(params.get("squad") || "");
  const [date, setDate] = useState(params.get("date") || "");
  const [sessionId, setSessionId] = useState<string | null>(params.get("session"));
  const [scope, setScope] = useState("");
  const [pool, setPool] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [zone, setZone] = useState("");
  const [touched, setTouched] = useState(false);
  const [hint, setHint] = useState("");
  const [picking, setPicking] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);

  // Fill the form once the saved plan arrives.
  useEffect(() => {
    const p = existing.data;
    if (!p || loaded.current) return;
    loaded.current = true;
    setTitle(p.title || ""); setItems((p.content || []).map(b => wrap(structuredClone(b))));
    setSquadId(p.squad_id || ""); setDate(p.intended_date || ""); setSessionId(p.micro_session_id);
    setScope(p.squad_scope || ""); setPool(p.pool_size); setNotes(p.notes || "");
    setSkills((p.stroke_skills || []).map(normSkill)); setZone(p.training_zone || "");
    setTouched(!!((p.stroke_skills || []).length || p.training_zone));
  }, [existing.data]);

  // A validation message goes once the coach fixes the field it was about.
  useEffect(() => { setMsg(m => (m?.error ? null : m)); }, [squadId, date, title]);

  const ctx = useMemo(() => microFor(season.data, squadId, date, sessionId), [season.data, squadId, date, sessionId]);
  const squadName = (squads.data ?? []).find(s => s.id === squadId)?.name || "";
  const weekDrills = useQuery({
    queryKey: ["week_drills", ctx?.micro.id, squadId], enabled: !!ctx,
    queryFn: () => loadWeekDrills(ctx!.micro.id, squadId)
  });

  // Pre-fill focus from the micro-cycle until the coach changes it; default a new plan's title.
  useEffect(() => {
    if (id && !loaded.current) return;
    if (!ctx) { if (!touched) setHint(""); return; }
    if (!touched) {
      const sug = suggestFocus(ctx);
      setSkills(sug.skills); setZone(sug.zone);
      setHint(sug.skills.length || sug.zone ? "Pre-filled from the micro-cycle — change as needed." : "");
    }
    if (!id) setTitle(t => t.trim() ? t : [squadName, fmtDayShort(date), ctx.session?.stroke_focus || (ctx.micro.qes_focus ? QES[ctx.micro.qes_focus] : "")].filter(Boolean).join(" — "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  if (level === "N") return <NoPlanAccess />;
  const origin = backLink(from);
  const crumb = id
    ? <p className="crumb"><Link to={`/sessions/${id}`} state={{ from }}>‹ Plan</Link></p>
    : <p className="crumb"><Link to={origin.to}>‹ {origin.label}</Link></p>;
  if (!canEdit(level)) return <>{crumb}<p className="notice warn">Session plans are read only for your role.</p></>;
  if (id && existing.isLoading) return <>{crumb}<p className="dim">Loading…</p></>;
  if (id && !existing.data) return <>{crumb}<p className="msg error">Couldn't find that plan.</p></>;

  const blocks = items.map(i => i.b);
  const total = planDistance(blocks);
  const nSets = blocks.filter(b => b.type === "set").length, nReps = blocks.filter(b => b.type === "repeat_group").length;
  const breakdown = [nSets && `${nSets} set line${nSets > 1 ? "s" : ""}`, nReps && `${nReps} repeat${nReps > 1 ? "s" : ""}`].filter(Boolean).join(" · ");
  const drillList = drills.data ?? [];

  const update = (i: number, b: Block) => setItems(xs => xs.map((x, j) => (j === i ? { ...x, b } : x)));
  const move = (i: number, d: -1 | 1) => setItems(xs => { const ys = xs.slice(); const j = i + d; if (j < 0 || j >= ys.length) return xs; [ys[i], ys[j]] = [ys[j], ys[i]]; return ys; });
  const remove = (i: number) => setItems(xs => xs.filter((_, j) => j !== i));
  const add = (t: BlockType) => {
    setItems(xs => [...xs, wrap(blankBlock(t))]);
    if (t === "drill") setPicking(items.length);
    setTimeout(() => document.querySelector(".blk:last-of-type")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };
  const addDrill = (d: { drill_id: string; drill_name: string }) => setItems(xs => [...xs, wrap({ type: "drill", ...d })]);
  const focusChanged = () => { setTouched(true); setHint(""); };

  const save = async () => {
    setMsg(null);
    const bad = validatePlan({ title, squadId, date });
    if (bad) { setMsg({ text: bad, error: true }); return; }
    setSaving(true);
    try {
      const savedId = await savePlan(planClub!, id ?? null, { title, content: blocks, squadId, date, squadScope: scope, pool, notes, skills, zone, ctx, coach });
      logEvent(session?.user.id, planClub, "core_task", "session_plan_save", { plan_id: savedId, is_update: !!id });
      qc.invalidateQueries({ queryKey: ["plans", planClub] });
      qc.invalidateQueries({ queryKey: ["plan", savedId] });
      setMsg({ text: "Plan saved." });
      setTimeout(() => navigate(`/sessions/${savedId}`, { replace: true, state: { from } }), 500);
    } catch (e) {
      console.error(e);
      setMsg({ text: "Save failed — " + ((e as Error).message || "please try again."), error: true });
    } finally { setSaving(false); }
  };

  const controls = (i: number, label: string) => (
    <div className="blk-head">
      <span className="blk-type">{label}</span>
      <span className="blk-controls">
        <button type="button" className="icon-btn plain" aria-label={`Move ${label.toLowerCase()} up`} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
        <button type="button" className="icon-btn plain" aria-label={`Move ${label.toLowerCase()} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>▼</button>
        <button type="button" className="icon-btn plain" aria-label={`Delete ${label.toLowerCase()}`} onClick={() => remove(i)}>✕</button>
      </span>
    </div>
  );

  const setHintFor = (text: string) => {
    if (!text.trim()) return null;
    const p = parseSetLine(text);
    return p
      ? <p className="parsed-hint">{p.reps} × {p.dist}m = <strong>{p.distance_m}m</strong>{p.interval ? ` @ ${p.interval}` : ""}</p>
      : <p className="parsed-hint warn-text">Free text — not counted in distance total</p>;
  };

  return (
    <>
      {crumb}
      <div className="page-head"><h1>{id ? "Edit plan" : "New plan"}</h1></div>

      <section className="card">
        <div className="field-pair">
          <div>
            <label htmlFor="pe-squad">Squad</label>
            <select id="pe-squad" value={squadId} onChange={e => { setSquadId(e.target.value); setSessionId(null); }}>
              <option value="">Choose a squad…</option>
              {(squads.data ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pe-date">Session date</label>
            <input id="pe-date" type="date" value={date} onChange={e => { setDate(e.target.value); setSessionId(null); }} />
          </div>
        </div>

        <div className="micro-card" aria-live="polite">
          {!squadId || !date
            ? <p className="dim">Choose the squad and session date to pull through that week's micro-cycle.</p>
            : season.isLoading ? <p className="dim">Loading the season plan…</p>
            : !ctx ? <p className="dim">No micro-cycle covers {fmtDayShort(date)} for {squadName || "this squad"}. Add one under Season planner.</p>
            : (
              <>
                {ctx.season && <p className="micro-line">Season: <strong>{ctx.season.title}</strong></p>}
                <p className="micro-line">Macro: <strong>{ctx.micro.macroTitle}</strong> · Week {ctx.micro.week_no}{ctx.micro.week_commencing ? ` · w/c ${ctx.micro.week_commencing.slice(8, 10)}/${ctx.micro.week_commencing.slice(5, 7)}` : ""}</p>
                {ctx.isBreak && <p className="notice warn">This day is marked as a break day in the season plan.</p>}
                {ctx.daySessions.length > 1 && (
                  <>
                    <label htmlFor="pe-sess">Which session</label>
                    <select id="pe-sess" value={ctx.session?.id || ""} onChange={e => setSessionId(e.target.value)}>
                      {ctx.daySessions.map(x => <option key={x.id} value={x.id}>{fmtWhen(x.session_date, x.start_time, x.end_time)}</option>)}
                    </select>
                  </>
                )}
                <MicroTags micro={ctx.micro} />
                {ctx.session
                  ? <div className="micro-sess">
                      <p className="micro-when">{fmtWhen(ctx.session.session_date, ctx.session.start_time, ctx.session.end_time)}</p>
                      {ctx.session.stroke_focus && <p>Stroke focus: {ctx.session.stroke_focus}</p>}
                      {ctx.session.outline && <p className="dim pre">{ctx.session.outline}</p>}
                    </div>
                  : <p className="dim">No session outlined for this date in the micro-cycle.</p>}
                {ctx.comp && <p className="micro-comp">Competition this week: {ctx.comp.name} ({fmtDayShort(ctx.comp.date_from)})</p>}
                {(weekDrills.data ?? []).length > 0 && (
                  <div className="week-drills">
                    <h3>Drills to work this week · from squad feedback</h3>
                    <ul>
                      {weekDrills.data!.map(w => {
                        const inPlan = blocks.some(b => b.type === "drill" && b.drill_id === w.drill_id);
                        return (
                          <li key={w.drill_id}>
                            <div>{w.drill_name}{w.reason && <small className="dim">{w.reason}</small>}</div>
                            <button type="button" className="btn small" disabled={inPlan} onClick={() => addDrill({ drill_id: w.drill_id, drill_name: w.drill_name })}>{inPlan ? "In plan" : "+ Add"}</button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            )}
        </div>

        <label htmlFor="pe-title">Plan title</label>
        <input id="pe-title" type="text" value={title} placeholder="e.g. Platinum Mon — Aerobic threshold" onChange={e => setTitle(e.target.value)} />

        <fieldset className="plain-fieldset">
          <legend>Stroke and Skills</legend>
          <div className="skill-grid">
            {SKILLS.map(k => (
              <label key={k} className={"skill" + (skills.includes(k) ? " on" : "")}>
                <input type="checkbox" checked={skills.includes(k)} onChange={e => { focusChanged(); setSkills(s => SKILLS.filter(x => (x === k ? e.target.checked : s.includes(x)))); }} />
                {k}
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor="pe-zone">Training zone focus</label>
        <select id="pe-zone" value={zone} onChange={e => { focusChanged(); setZone(e.target.value); }}>
          <option value="">— choose a zone —</option>
          {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        {hint && <p className="hint">{hint}</p>}
      </section>

      <section className="card" aria-labelledby="pe-sets">
        <h2 id="pe-sets" className="card-title">Sets</h2>
        <div className="add-blocks">
          <button type="button" className="btn small" onClick={() => add("heading")}>+ Heading</button>
          <button type="button" className="btn small" onClick={() => add("set")}>+ Set line</button>
          <button type="button" className="btn small" onClick={() => add("repeat_group")}>+ Repeat</button>
          <button type="button" className="btn small" onClick={() => add("note")}>+ Note</button>
          <button type="button" className="btn small" onClick={() => add("drill")}>+ Drill</button>
        </div>
        {!items.length && <p className="dim">Add a heading, set line, repeat, note or drill to start.</p>}
        {items.map(({ k, b }, i) => {
          if (b.type === "heading") return (
            <div key={k} className="blk heading">
              {controls(i, "Heading")}
              <input type="text" aria-label="Heading text" value={b.text} placeholder="Section heading e.g. Main set" onChange={e => update(i, { ...b, text: e.target.value })} />
              <div className="btn-row">
                <label className="inline"><input type="checkbox" checked={b.bold} onChange={e => update(i, { ...b, bold: e.target.checked })} /> Bold</label>
                <label className="inline"><input type="checkbox" checked={b.underline} onChange={e => update(i, { ...b, underline: e.target.checked })} /> Underline</label>
              </div>
            </div>
          );
          if (b.type === "set") return (
            <div key={k} className="blk">
              {controls(i, "Set line")}
              <SetLineInput value={b.text} drills={drillList} label="Set line"
                placeholder="10 x 100 @2:00 Free — start typing a drill name for suggestions"
                onChange={v => setItems(xs => xs.map((x, j) => (j === i && x.b.type === "set" ? { ...x, b: { ...x.b, text: v } } : x)))}
                onDrill={(d: FullDrill) => setItems(xs => xs.map((x, j) => (j === i && x.b.type === "set" ? { ...x, b: addDrillId(x.b, d.id) } : x)))} />
              {setHintFor(b.text)}
            </div>
          );
          if (b.type === "repeat_group") {
            const inner = (b.children || []).reduce((s, c) => s + blockDistance(c), 0);
            const setChild = (ci: number, f: (c: SetBlock) => SetBlock) =>
              setItems(xs => xs.map((x, j) => (j === i && x.b.type === "repeat_group" ? { ...x, b: { ...x.b, children: x.b.children.map((c, cj) => (cj === ci ? f(c) : c)) } } : x)));
            return (
              <div key={k} className="blk repeat">
                {controls(i, "Repeat group")}
                <div className="repeat-reps">
                  <input type="number" min={1} inputMode="numeric" aria-label="Rounds" value={b.reps || ""} onChange={e => update(i, { ...b, reps: Number(e.target.value) || 0 })} />
                  <span>× the lines below · {inner}m/round → <strong>{(Number(b.reps) || 0) * inner}m</strong></span>
                </div>
                {(b.children || []).map((c, ci) => {
                  const p = parseSetLine(c.text);
                  return (
                    <div key={ci} className="repeat-child">
                      <SetLineInput value={c.text} drills={drillList} label={`Repeat line ${ci + 1}`}
                        placeholder="2 x 75 @1:45 IM as 25 sprint, 50 drill"
                        onChange={v => setChild(ci, x => ({ ...x, text: v }))}
                        onDrill={d => setChild(ci, x => addDrillId(x, d.id))} />
                      <span className="rc-dist">{p ? p.distance_m + "m" : "—"}</span>
                      <button type="button" className="icon-btn plain" aria-label={`Remove repeat line ${ci + 1}`}
                        onClick={() => update(i, { ...b, children: b.children.filter((_, cj) => cj !== ci) })}>✕</button>
                    </div>
                  );
                })}
                <button type="button" className="link-btn" onClick={() => update(i, { ...b, children: [...b.children, { type: "set", text: "", drill_ids: [] }] })}>+ Add line to this repeat</button>
              </div>
            );
          }
          if (b.type === "note") return (
            <div key={k} className="blk">
              {controls(i, "Note")}
              <textarea aria-label="Note" rows={2} value={b.text} placeholder="Free text — coaching note, not counted in distance" onChange={e => update(i, { ...b, text: e.target.value })} />
            </div>
          );
          return (
            <div key={k} className="blk drill">
              {controls(i, "Drill")}
              <p className="blk-drill-name">{b.drill_name || <span className="warn-text">(no drill chosen)</span>}</p>
              <button type="button" className="link-btn" onClick={() => setPicking(i)}>{b.drill_name ? "Change drill" : "Choose drill"}</button>
            </div>
          );
        })}
      </section>

      <section className="card">
        <details>
          <summary>Optional planning details</summary>
          <label htmlFor="pe-scope">Extra squad scope <span className="dim">(optional, e.g. “with Platinum Plus”)</span></label>
          <input id="pe-scope" type="text" value={scope} placeholder="e.g. Joint session with Gold" onChange={e => setScope(e.target.value)} />
          <fieldset className="plain-fieldset">
            <legend>Pool</legend>
            <div className="seg seg-3">
              {POOLS.map(x => <button key={x} type="button" className={"seg-btn" + (pool === x ? " on" : "")} aria-pressed={pool === x} onClick={() => setPool(p => (p === x ? null : x))}>{x}</button>)}
            </div>
          </fieldset>
          <label htmlFor="pe-notes">Notes <span className="dim">(optional)</span></label>
          <textarea id="pe-notes" rows={3} value={notes} placeholder="Anything else about this plan…" onChange={e => setNotes(e.target.value)} />
        </details>
        <button type="button" className="btn primary wide" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save plan"}</button>
        {msg && <p className={"msg" + (msg.error ? " error" : "")} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
      </section>

      <div className="plan-total-bar" aria-live="polite">
        <div><span className="ptb-label">Planned distance</span>{breakdown && <span className="ptb-sub">{breakdown}</span>}</div>
        <div className="ptb-num">{total.toLocaleString("en-GB")} m</div>
      </div>

      <DrillPickModal open={picking !== null} list={drillList} onClose={() => setPicking(null)}
        onPick={d => { if (picking !== null) update(picking, { type: "drill", drill_id: d.id, drill_name: d.drill_name }); setPicking(null); }} />
    </>
  );
}
