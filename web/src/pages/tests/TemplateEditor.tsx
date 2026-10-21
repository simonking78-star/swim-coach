import { useEffect, useId, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { STROKES } from "../../lib/stopwatch";
import {
  blankModel, fullScore, genValues, levelKeys, levelOptions, loadTemplate, mmss, newRound, normaliseModel, parseMmss, saveTemplate, totals,
  type Round, type RoundGen, type RoundValues, type TestModel
} from "../../lib/tests";
import { NoTestAccess, TestsBack, useTestAccess } from "./Tests";

// Create / Edit a test set template. A template has one or more rounds; each
// round sets distance, repetitions and (optionally) an interval, either the
// same for everyone or varying by age from a youngest to an oldest age level.
// "Add next round" copies the previous round so a slightly different part is
// quick to define.

/** Time box: types freely, commits m:ss (or seconds) when it loses focus. Blank = no interval. */
function TimeInput({ value, onChange, label, allowBlank = true, id }: { value: number | null; onChange: (v: number | null) => void; label: string; allowBlank?: boolean; id?: string }) {
  const [text, setText] = useState(value == null ? "" : mmss(value));
  useEffect(() => { setText(value == null ? "" : mmss(value)); }, [value]);
  return (
    <input id={id} aria-label={label} className="t-in" inputMode="numeric" placeholder={allowBlank ? "none" : "m:ss"} value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => {
        const v = parseMmss(text);
        if (v == null && !allowBlank) { setText(value == null ? "" : mmss(value)); return; }
        onChange(v); setText(v == null ? "" : mmss(v));
      }} />
  );
}
/** Whole-number box: can be cleared and retyped (an empty or too-small value isn't saved
 *  until it is valid, and snaps back to the last good value when the box loses focus). */
function NumInput({ value, onChange, label, min = 0, signed = false, id }: { value: number; onChange: (v: number) => void; label: string; min?: number; signed?: boolean; id?: string }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : "");
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(Number.isFinite(value) ? String(value) : ""); }, [value, focused]);
  const valid = (t: string) => (signed ? /^-?\d+$/ : /^\d+$/).test(t) && (signed || Number(t) >= min);
  return (
    <input id={id} aria-label={label} className="n-in" type="text" inputMode={signed ? "text" : "numeric"} pattern={signed ? "-?[0-9]*" : "[0-9]*"}
      autoComplete="off" value={text}
      onFocus={e => { setFocused(true); e.currentTarget.select(); }}
      onChange={e => {
        const t = e.target.value.replace(signed ? /[^\d-]/g : /\D/g, "").replace(/(?!^)-/g, "");
        setText(t);
        if (valid(t)) onChange(Number(t));
      }}
      onBlur={() => { setFocused(false); if (!valid(text)) setText(String(value)); }} />
  );
}

function genFrom(m: TestModel, r: Round): RoundGen {
  if (r.gen) return r.gen;
  const k = levelKeys(m), a = r.values[k[0]], b = r.values[k[k.length - 1]];
  const n = Math.max(1, k.length - 1);
  return {
    reps: a?.reps ?? 4, repStep: a && b ? Math.round((b.reps - a.reps) / n) : 0,
    distance: a?.distance ?? 100, distanceStep: a && b ? Math.round((b.distance - a.distance) / n) : 0,
    interval: a?.interval ?? null, intervalStep: a && b && a.interval && b.interval ? Math.round((a.interval - b.interval) / n) : 0
  };
}

export function TemplateEditor() {
  const { id } = useParams();
  const { canBuild } = useTestAccess();
  const { club } = useClub();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ["test_template", id], enabled: !!id, queryFn: () => loadTemplate(id!) });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState<TestModel>(blankModel);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(() => ((location.state as { msg?: string } | null)?.msg ? { text: (location.state as { msg: string }).msg } : null));
  const [saving, setSaving] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const nameId = useId(), descId = useId();

  useEffect(() => {
    const t = existing.data;
    if (t && loadedId !== t.id) { setName(t.name); setDescription(t.description ?? ""); setModel(t.model); setLoadedId(t.id); }
  }, [existing.data, loadedId]);

  if (!canBuild) return <><TestsBack /><NoTestAccess /></>;
  if (id && existing.isLoading) return <><TestsBack to="/tests/edit" label="Edit" /><p className="dim">Loading…</p></>;
  if (id && !existing.data) return <><TestsBack to="/tests/edit" label="Edit" /><p className="msg error">That template wasn't found.</p></>;
  const tplClub = existing.data?.club ?? club;

  const set = (fn: (m: TestModel) => void) => setModel(prev => { const n = JSON.parse(JSON.stringify(prev)) as TestModel; fn(n); return normaliseModel(n); });
  const setRound = (i: number, fn: (r: Round, m: TestModel) => void) => set(m => fn(m.rounds[i], m));
  const setVal = (i: number, key: string, patch: Partial<RoundValues>) => setRound(i, r => { r.values[key] = { ...r.values[key], ...patch }; });

  const toBanded = (on: boolean) => set(m => {
    if (on === m.ageBanded) return;
    if (on) {
      m.ageBanded = true;
      for (const r of m.rounds) { const v = r.values.all ?? Object.values(r.values)[0]; r.values = {}; for (const k of levelKeys(m)) r.values[k] = { ...v }; }
    } else {
      const mid = String(Math.round((m.minAge + m.maxAge) / 2));
      for (const r of m.rounds) { const v = r.values[mid] ?? Object.values(r.values)[0]; r.values = { all: { ...v } }; }
      m.ageBanded = false;
    }
  });

  const save = async () => {
    setMsg(null);
    if (!name.trim()) { setMsg({ text: "Give the test set a name.", error: true }); return; }
    if (!model.rounds.length) { setMsg({ text: "Add at least one round.", error: true }); return; }
    if (model.ageBanded && model.maxAge < model.minAge) { setMsg({ text: "The oldest age must be the same as or above the youngest.", error: true }); return; }
    for (const r of model.rounds) for (const k of levelKeys(model)) {
      const v = r.values[k];
      if (!v || v.reps < 1 || v.distance < 1) { setMsg({ text: `${r.name}: every level needs at least 1 rep and a distance.`, error: true }); return; }
    }
    // Drop values for ages outside the range before saving.
    const clean = normaliseModel(model);
    for (const r of clean.rounds) for (const k of Object.keys(r.values)) if (!levelKeys(clean).includes(k)) delete r.values[k];
    setSaving(true);
    try {
      const newId = await saveTemplate({ id, club: tplClub!, name, description, model: clean, active: existing.data?.active, version: existing.data?.version });
      await qc.invalidateQueries({ queryKey: ["test_templates"] });
      await qc.invalidateQueries({ queryKey: ["test_template", newId] });
      if (!id) navigate(`/tests/templates/${newId}`, { replace: true, state: { msg: "Template created. It is now in Select." } });
      else setMsg({ text: "Saved. Tests already run keep the version they used." });
    } catch (e) {
      setMsg({ text: "Couldn't save: " + (e as Error).message, error: true });
    } finally { setSaving(false); }
  };

  const levels = levelOptions(model);
  return (
    <>
      <TestsBack to={id ? "/tests/edit" : "/tests"} label={id ? "Edit" : "Test & Assess"} />
      <div className="page-head row">
        <div><h1>{id ? "Edit test set" : "Create a test set"}</h1><p className="dim">Rounds of distance, interval and repetitions. Saved as a template you can select again.</p></div>
        {id ? <strong className="club-picker-name">{tplClub}</strong> : <ClubPicker />}
      </div>

      <section className="card">
        <label htmlFor={nameId}>Test set name</label>
        <input id={nameId} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Aerobic 100s test" />
        <label htmlFor={descId}>How it runs (optional)</label>
        <textarea id={descId} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Notes for the coach running the test" />
        <fieldset className="choice-set">
          <legend>Does the set change with age?</legend>
          <div className="seg seg-2">
            <button type="button" className={"seg-btn" + (!model.ageBanded ? " on" : "")} aria-pressed={!model.ageBanded} onClick={() => toBanded(false)}>Same for everyone</button>
            <button type="button" className={"seg-btn" + (model.ageBanded ? " on" : "")} aria-pressed={model.ageBanded} onClick={() => toBanded(true)}>Varies by age</button>
          </div>
        </fieldset>
        {model.ageBanded ? (
          <div className="field-pair">
            <label>Youngest age level<NumInput label="Youngest age level" min={4} value={model.minAge} onChange={v => set(m => { m.minAge = Math.min(v, 25); })} /></label>
            <label>Oldest age level (and above)<NumInput label="Oldest age level" min={4} value={model.maxAge} onChange={v => set(m => { m.maxAge = Math.min(v, 30); })} /></label>
          </div>
        ) : (
          <label>Level used in the score<NumInput label="Level used in the score" min={1} value={model.fixedLevel} onChange={v => set(m => { m.fixedLevel = Math.max(1, v); })} /></label>
        )}
        <p className="hint">Score = age × test level × reps completed. {model.ageBanded ? "The test level is the age set swum, normally the swimmer's own age (Swim England age on 31 December)." : "With one set for everyone, the test level is the number above."}</p>
      </section>

      {model.rounds.map((r, i) => {
        const last = i === model.rounds.length - 1;
        const g = genFrom(model, r);
        const setGen = (patch: Partial<RoundGen>) => setRound(i, rr => { rr.gen = { ...g, ...patch }; });
        return (
          <section key={r.key} className="card round-card" aria-label={r.name}>
            <div className="card-head">
              <h2>Round {i + 1}</h2>
              <div className="order-btns">
                <button type="button" className="icon-btn plain" aria-label={`Move ${r.name} up`} disabled={i === 0} onClick={() => set(m => { [m.rounds[i - 1], m.rounds[i]] = [m.rounds[i], m.rounds[i - 1]]; })}>↑</button>
                <button type="button" className="icon-btn plain" aria-label={`Move ${r.name} down`} disabled={last} onClick={() => set(m => { [m.rounds[i + 1], m.rounds[i]] = [m.rounds[i], m.rounds[i + 1]]; })}>↓</button>
                <button type="button" className="icon-btn plain" aria-label={`Remove ${r.name}`} disabled={model.rounds.length < 2} onClick={() => set(m => { m.rounds.splice(i, 1); })}>✕</button>
              </div>
            </div>
            <div className="field-pair">
              <label>Round name<input value={r.name} onChange={e => setRound(i, rr => { rr.name = e.target.value; })} /></label>
              <label>Stroke<select value={r.stroke} onChange={e => setRound(i, rr => { rr.stroke = e.target.value; })}>
                {STROKES.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
              </select></label>
            </div>
            {!model.ageBanded ? (
              <div className="trio">
                <label>Repetitions<NumInput label="Repetitions" min={1} value={r.values.all.reps} onChange={v => setVal(i, "all", { reps: v })} /></label>
                <label>Distance (m)<NumInput label="Distance in metres" min={1} value={r.values.all.distance} onChange={v => setVal(i, "all", { distance: v })} /></label>
                <label>Interval (m:ss)<TimeInput label="Interval" value={r.values.all.interval} onChange={v => setVal(i, "all", { interval: v })} /></label>
              </div>
            ) : (
              <>
                <details className="gen">
                  <summary>Fill the table from a progression</summary>
                  <div className="gen-grid">
                    <span /><span className="dim">At age {model.minAge}</span><span className="dim">Change per year</span>
                    <span>Repetitions</span><NumInput label="Repetitions at youngest age" min={1} value={g.reps} onChange={v => setGen({ reps: v })} /><NumInput label="Repetitions added per year" signed value={g.repStep} onChange={v => setGen({ repStep: v })} />
                    <span>Distance (m)</span><NumInput label="Distance at youngest age" min={1} value={g.distance} onChange={v => setGen({ distance: v })} /><NumInput label="Distance added per year" signed value={g.distanceStep} onChange={v => setGen({ distanceStep: v })} />
                    <span>Interval</span><TimeInput label="Interval at youngest age" value={g.interval} onChange={v => setGen({ interval: v })} /><NumInput label="Seconds taken off the interval per year" signed value={g.intervalStep} onChange={v => setGen({ intervalStep: v })} />
                  </div>
                  <p className="hint">Interval change is seconds taken off per year older.</p>
                  <button type="button" className="btn small" onClick={() => setRound(i, (rr, m) => { rr.gen = g; rr.values = genValues(g, m.minAge, m.maxAge); })}>Fill table</button>
                </details>
                <div className="table-wrap">
                  <table className="data round-table">
                    <thead><tr><th>Age</th><th>Reps</th><th>Distance (m)</th><th>Interval</th><th className="num">Set</th></tr></thead>
                    <tbody>{levelKeys(model).map(k => {
                      const v = r.values[k];
                      return (
                        <tr key={k}>
                          <th scope="row">{k}{k === String(model.maxAge) ? "+" : ""}</th>
                          <td><NumInput label={`Reps at age ${k}`} min={1} value={v.reps} onChange={n => setVal(i, k, { reps: n })} /></td>
                          <td><NumInput label={`Distance at age ${k}`} min={1} value={v.distance} onChange={n => setVal(i, k, { distance: n })} /></td>
                          <td><TimeInput label={`Interval at age ${k}`} value={v.interval} onChange={n => setVal(i, k, { interval: n })} /></td>
                          <td className="num dim">{(v.reps * v.distance).toLocaleString("en-GB")} m</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              </>
            )}
            {!last && (
              <label className="rest-row">Rest before the next round (m:ss)
                <TimeInput label="Rest before the next round" value={r.restAfterSec} allowBlank={false} onChange={v => setRound(i, rr => { rr.restAfterSec = v ?? 0; })} />
              </label>
            )}
          </section>
        );
      })}

      <button type="button" className="btn wide add-round" onClick={() => set(m => { m.rounds.push(newRound(m, m.rounds[m.rounds.length - 1])); })}>+ Add next round</button>

      <section className="card">
        <h2>Check the set</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>{model.ageBanded ? "Age" : "Level"}</th><th className="num">Reps</th><th className="num">Distance</th><th className="num">Set time</th><th className="num">Full-set score</th></tr></thead>
            <tbody>{levels.map(l => { const t = totals(model, l); return (
              <tr key={l}><th scope="row">{l}</th><td className="num">{t.reps}</td><td className="num">{t.dist.toLocaleString("en-GB")} m</td><td className="num">{t.secs == null ? "untimed" : mmss(t.secs)}</td>
                <td className="num">{model.ageBanded ? fullScore(model, l).toLocaleString("en-GB") : "age × " + (model.fixedLevel * t.reps)}</td></tr>
            ); })}</tbody>
          </table>
        </div>
        <p className="hint">{model.ageBanded ? "Full-set score is for a swimmer swimming their own age's set." : "Multiply by the swimmer's age."} Set time includes the rest between rounds.</p>
      </section>

      {msg && <p className={"msg" + (msg.error ? " error" : "")} role="status">{msg.text}</p>}
      <div className="done-actions">
        <button className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : id ? "Save changes" : "Save template"}</button>
        {id && <button className="btn" onClick={() => navigate(`/tests/start/${id}`)}>Use this test</button>}
      </div>
    </>
  );
}
