import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  COUNTS_LABEL, CYCLE_LABEL, KIND_LABEL, STREAMS, levelSummary, loadDeterminants, loadProtocol, newVersion, publishProblems,
  publishVersion, saveReliability, saveVersion, setProtocolStatus, unitOf, versionLabel,
  type Level, type Protocol, type Reliability, type RepsRound, type Sheet, type Status, type Version
} from "../../lib/measures";
import { ConfirmButton } from "../tests/RunTest";
import { fmtDate } from "../../lib/util";
import { MBack, NoAccess, statusChip, useMeasuresAccess } from "./Measures";

// One protocol: its sheet (guidance Appendix A), levels and reliability, version
// by version. A draft version can be edited by the head coach; publishing
// locks it for good (the database refuses later changes). Changes after that
// are a new version: minor (v1.1) keeps swimmers' baselines, major (v2.0)
// starts new ones.

const SHEET_FIELDS: [keyof Sheet, string, string][] = [
  ["equipment", "Equipment", "Stopwatches, camera, markers…"],
  ["pool_setup", "Pool set-up", "Course, lanes, markers, camera position"],
  ["warm_up", "Standard warm-up", "Same content, distance and duration each time"],
  ["position", "Position in session", "e.g. after the standard warm-up, as the first main set"],
  ["procedure", "Procedure", "Step by step, including start type"],
  ["script", "Swimmer script", "What every swimmer hears, word for word"],
  ["safety", "Safety and exclusions", "Who doesn't do a maximal test"],
  ["recorded", "What is recorded", "Fields captured and how the result is worked out"]
];

export function ProtocolPage() {
  const { id } = useParams();
  const { canView, canPublish } = useMeasuresAccess();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mm_protocol", id], enabled: !!id && canView, queryFn: () => loadProtocol(id!) });
  const dets = useQuery({ queryKey: ["mm_determinants"], queryFn: loadDeterminants, staleTime: Infinity });
  const [vid, setVid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (q.data && (!vid || !q.data.versions.some(v => v.id === vid))) setVid(q.data.versions[0]?.id ?? null); }, [q.data, vid]);

  if (!canView) return <><MBack /><NoAccess /></>;
  if (q.isLoading) return <><MBack to="/measures/library" label="Protocol library" /><p className="dim">Loading…</p></>;
  if (!q.data) return <><MBack to="/measures/library" label="Protocol library" /><p className="msg error">Protocol not found.</p></>;
  const { protocol: p, versions, reliability } = q.data;
  const v = versions.find(x => x.id === vid) ?? null;
  const published = versions.filter(x => x.published_at);
  const refresh = () => qc.invalidateQueries({ queryKey: ["mm_protocol", id] });
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await refresh(); await qc.invalidateQueries({ queryKey: ["mm_protocols"] }); } catch (e) { setErr((e as Error).message); } };

  const nextStatus: { to: Status; label: string; needs?: string }[] = canPublish ? ({
    draft: [{ to: "pilot" as Status, label: "Move to pilot", needs: published.length ? undefined : "Publish a version first." }],
    pilot: [{ to: "live" as Status, label: "Make live", needs: published.length ? undefined : "Publish a version first." }, { to: "draft" as Status, label: "Back to draft" }],
    live: [{ to: "retired" as Status, label: "Retire" }],
    retired: [{ to: "live" as Status, label: "Bring back" }]
  }[p.status]) : [];

  return (
    <>
      <MBack to="/measures/library" label="Protocol library" />
      <div className="page-head row">
        <div><h1>{p.code} · {p.name}</h1>
          <p className="dim">{dets.data?.find(d => d.code === p.determinant)?.name ?? p.determinant} · {KIND_LABEL[p.kind]} · {p.better === "lower" ? "lower is better" : "higher is better"}{p.fixed_date_only ? " · fixed date only" : ""}</p></div>
        {statusChip(p.status)}
      </div>
      {p.description && <p>{p.description}</p>}
      {err && <p className="msg error" role="alert">{err}</p>}
      {!!nextStatus.length && (
        <div className="done-actions">
          {nextStatus.map(s => s.needs
            ? <span key={s.to} className="hint">{s.label}: {s.needs}</span>
            : <ConfirmButton key={s.to} label={s.label} confirm="Tap again to confirm" onConfirm={() => act(() => setProtocolStatus(p.id, s.to))} />)}
        </div>
      )}

      <div className="seg mm-versions" role="tablist">
        {versions.map(x => (
          <button key={x.id} type="button" className={"seg-btn" + (x.id === vid ? " on" : "")} aria-pressed={x.id === vid} onClick={() => setVid(x.id)}>
            {versionLabel(x)} {x.published_at ? "" : "(draft)"}
          </button>
        ))}
      </div>

      {v && (v.published_at || !canPublish
        ? <VersionView p={p} v={v} reliability={reliability.filter(r => r.version_id === v.id)} canPublish={canPublish}
            onNewVersion={major => act(() => newVersion(p.id, v, major))} hasDraft={versions.some(x => !x.published_at)} onSaved={refresh} />
        : <VersionEditor key={v.id} p={p} v={v} onSaved={refresh} onPublish={() => act(() => publishVersion(v.id))} />)}
      {!versions.length && canPublish && <button className="btn primary" onClick={() => act(() => newVersion(p.id, null))}>Start version 1.0</button>}
    </>
  );
}

function VersionView({ p, v, reliability, canPublish, onNewVersion, hasDraft, onSaved }: {
  p: Protocol; v: Version; reliability: Reliability[]; canPublish: boolean; onNewVersion: (major: boolean) => void; hasDraft: boolean; onSaved: () => void;
}) {
  const unit = unitOf(p, v);
  return (
    <>
      <section className="card">
        <h2>{versionLabel(v)} {v.published_at ? <span className="dim">· published {fmtDate(v.published_at.slice(0, 10))} · locked</span> : <span className="dim">· draft</span>}</h2>
        <dl className="mm-dl">
          {p.kind === "timed" && <><dt>Trials</dt><dd>{v.measure.trials ?? "–"} · counts: {COUNTS_LABEL[v.measure.counts ?? "best"]}{v.measure.rest_s ? ` · ${v.measure.rest_s} s rest` : ""}</dd></>}
          <dt>Cycle week</dt><dd>{v.intended_cycle ? CYCLE_LABEL[v.intended_cycle] + " weeks" : "Any"}</dd>
          <dt>Minimum gap</dt><dd>{v.min_gap_days} days between tests</dd>
          <dt>Unit</dt><dd>{unit}</dd>
        </dl>
        <h3>Levels</h3>
        <ul className="mm-levels">{v.levels.map(l => (
          <li key={l.key}><strong>{l.label}</strong> <span className="dim">({l.key}{l.streams?.length ? ` · ${l.streams.join(", ")}` : ""})</span><br />{levelSummary(p, l)}
            {p.kind === "checklist" && <ul>{(l.criteria ?? []).map(c => <li key={c.key}>{c.label}</li>)}</ul>}</li>
        ))}</ul>
        <h3>Protocol sheet</h3>
        <dl className="mm-dl">{SHEET_FIELDS.filter(([k]) => v.sheet[k]).map(([k, label]) => <div key={k}><dt>{label}</dt><dd className="pre">{v.sheet[k]}</dd></div>)}</dl>
        {v.notes && <p className="hint">{v.notes}</p>}
        {canPublish && v.published_at && !hasDraft && (
          <div className="done-actions">
            <button className="btn" onClick={() => onNewVersion(false)}>New minor version (v{v.major}.{v.minor + 1})</button>
            <button className="btn" onClick={() => onNewVersion(true)}>New major version (v{v.major + 1}.0)</button>
          </div>
        )}
        {canPublish && v.published_at && <p className="hint">A minor version keeps swimmers' baselines. A major version is a different test: everyone starts a new baseline.</p>}
      </section>
      {v.published_at && <ReliabilityCard p={p} v={v} rows={reliability} canEdit={canPublish} onSaved={onSaved} />}
    </>
  );
}

function ReliabilityCard({ p, v, rows, canEdit, onSaved }: { p: Protocol; v: Version; rows: Reliability[]; canEdit: boolean; onSaved: () => void }) {
  const unit = unitOf(p, v);
  const [edit, setEdit] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const start = (key: string) => {
    const r = rows.find(x => x.level_key === key);
    setF({ te: r?.te?.toString() ?? "", cv_pct: r?.cv_pct?.toString() ?? "", icc: r?.icc?.toString() ?? "", swc: r?.swc?.toString() ?? "", n: r?.n?.toString() ?? "", studied_on: r?.studied_on ?? "", decision: r?.decision ?? "" });
    setEdit(key); setErr(null);
  };
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const save = async () => {
    const te = num(f.te);
    if (te == null || !(te >= 0)) { setErr("Typical error is needed."); return; }
    try {
      await saveReliability({ version_id: v.id, level_key: edit!, te, cv_pct: num(f.cv_pct), icc: num(f.icc), swc: num(f.swc), n: num(f.n), studied_on: f.studied_on || null, decision: f.decision || null });
      setEdit(null); onSaved();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <section className="card">
      <h2>Reliability</h2>
      <p className="hint">From the test–retest pilot. A change is flagged as real only when it is more than 2 × the typical error (TE). Until TE is entered, results show the change without a flag.</p>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>Level</th><th className="num">TE ({unit})</th><th className="num">CV%</th><th className="num">ICC</th><th className="num">SWC</th><th className="num">n</th><th>Decision</th>{canEdit && <th />}</tr></thead>
        <tbody>{v.levels.map(l => { const r = rows.find(x => x.level_key === l.key); return (
          <tr key={l.key}><th scope="row">{l.label}</th><td className="num">{r?.te ?? "–"}</td><td className="num">{r?.cv_pct ?? "–"}</td><td className="num">{r?.icc ?? "–"}</td>
            <td className="num">{r?.swc ?? "–"}</td><td className="num">{r?.n ?? "–"}</td><td>{r?.decision ?? "–"}</td>
            {canEdit && <td><button className="link-btn" onClick={() => start(l.key)}>Edit</button></td>}</tr>); })}</tbody>
      </table></div>
      {edit && (
        <div className="pick-box">
          <h3>{v.levels.find(l => l.key === edit)?.label}</h3>
          <div className="field-pair">
            {([["te", "Typical error"], ["cv_pct", "CV %"], ["icc", "ICC"], ["swc", "Smallest worthwhile change"], ["n", "Swimmers (n)"]] as [string, string][]).map(([k, label]) => (
              <label key={k}>{label}<input inputMode="decimal" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></label>))}
          </div>
          <div className="field-pair">
            <label>Studied on<input type="date" value={f.studied_on} onChange={e => setF({ ...f, studied_on: e.target.value })} /></label>
            <label>Decision<select value={f.decision} onChange={e => setF({ ...f, decision: e.target.value })}>
              <option value="">–</option><option value="good">Good (TE ≤ SWC)</option><option value="caution">Use with caution (TE ≤ 2 × SWC)</option>
              <option value="revise">Revise protocol</option><option value="unreliable">Unreliable for tracking (ICC &lt; 0.75)</option></select></label>
          </div>
          {err && <p className="msg error">{err}</p>}
          <div className="done-actions"><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Draft editor
// ---------------------------------------------------------------------------
const blankLevel = (p: Protocol, n: number): Level => {
  const base = { key: `L${n}`, label: `Level ${n}`, streams: [] as string[] };
  if (p.kind === "reps") return { ...base, rounds: [{ key: "r1", name: "Part A", stroke: "Freestyle", reps: 8, distance: 100, interval: 120, restAfterSec: 60 }] };
  if (p.kind === "timed") return { ...base, stroke: "Freestyle", distance_m: 25, start: "push", setup: "" };
  return { ...base, criteria: [{ key: "c1", label: "" }] };
};
const STROKES = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "Individual Medley", "Dolphin"];

function VersionEditor({ p, v: initial, onSaved, onPublish }: { p: Protocol; v: Version; onSaved: () => void; onPublish: () => void }) {
  const [v, setV] = useState<Version>(initial);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const up = (patch: Partial<Version>) => { setV(x => ({ ...x, ...patch })); setDirty(true); };
  const upLevel = (i: number, patch: Partial<Level>) => up({ levels: v.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const save = async () => {
    try { await saveVersion(v); setDirty(false); setMsg({ text: "Saved" }); onSaved(); }
    catch (e) { setMsg({ text: (e as Error).message, error: true }); }
  };
  const problems = publishProblems(p, v);

  return (
    <section className="card mm-editor">
      <h2>{versionLabel(v)} <span className="dim">· draft — you can change anything until it is published</span></h2>

      <h3>How it is run</h3>
      <div className="field-pair">
        <label>Cycle week<select value={v.intended_cycle ?? ""} onChange={e => up({ intended_cycle: (e.target.value || null) as Version["intended_cycle"] })}>
          <option value="">Any week</option>{Object.entries(CYCLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l} weeks</option>)}</select></label>
        <label>Minimum days between tests<input type="number" min={0} value={v.min_gap_days} onChange={e => up({ min_gap_days: Math.max(0, Number(e.target.value) || 0) })} /></label>
      </div>
      {p.kind === "timed" && (
        <div className="field-pair">
          <label>Trials<input type="number" min={1} max={20} value={v.measure.trials ?? 3} onChange={e => up({ measure: { ...v.measure, trials: Number(e.target.value) || 1, unit: "s" } })} /></label>
          <label>Result is<select value={v.measure.counts ?? "best"} onChange={e => up({ measure: { ...v.measure, counts: e.target.value as Version["measure"]["counts"], unit: "s" } })}>
            {Object.entries(COUNTS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>Rest between trials (s)<input type="number" min={0} value={v.measure.rest_s ?? 0} onChange={e => up({ measure: { ...v.measure, rest_s: Number(e.target.value) || 0 } })} /></label>
        </div>
      )}
      {p.kind === "timed" && (
        <fieldset className="choice-set"><legend>Splits recorded with each trial</legend>
          {[["approach", "Approach (last 5 m in)"], ["wall", "Wall time"], ["out", "Out-phase"]].map(([k, l]) => (
            <label key={k} className="inline check-inline"><input type="checkbox" checked={(v.measure.splits ?? []).includes(k)}
              onChange={e => up({ measure: { ...v.measure, splits: e.target.checked ? [...(v.measure.splits ?? []), k] : (v.measure.splits ?? []).filter(x => x !== k) } })} /> {l}</label>))}
        </fieldset>
      )}

      <h3>Levels</h3>
      <p className="hint">Each level is fixed. On the day, the coach only chooses which level a swimmer swims. The streams listed set the default level for a squad.</p>
      {v.levels.map((l, i) => (
        <div key={i} className="pick-box mm-level">
          <div className="field-pair">
            <label>Key<input value={l.key} maxLength={6} onChange={e => upLevel(i, { key: e.target.value.toUpperCase().replace(/\s/g, "") })} /></label>
            <label>Name<input value={l.label} onChange={e => upLevel(i, { label: e.target.value })} /></label>
          </div>
          <fieldset className="choice-set"><legend>Default for streams</legend>
            {STREAMS.map(s => <label key={s} className="inline check-inline"><input type="checkbox" checked={l.streams.includes(s)}
              onChange={e => upLevel(i, { streams: e.target.checked ? [...l.streams, s] : l.streams.filter(x => x !== s) })} /> {s}</label>)}
          </fieldset>
          {p.kind === "reps" && <RoundsEditor rounds={l.rounds ?? []} onChange={rounds => upLevel(i, { rounds })} />}
          {p.kind === "timed" && (
            <div className="field-pair">
              <label>Stroke<select value={l.stroke ?? "Freestyle"} onChange={e => upLevel(i, { stroke: e.target.value })}>{STROKES.map(s => <option key={s}>{s}</option>)}</select></label>
              <label>Distance (m)<input type="number" min={1} value={l.distance_m ?? ""} onChange={e => upLevel(i, { distance_m: Number(e.target.value) || undefined })} /></label>
              <label>Start<select value={l.start ?? "push"} onChange={e => upLevel(i, { start: e.target.value as Level["start"] })}><option value="push">Push</option><option value="dive">Dive</option></select></label>
              <label>Set-up<input value={l.setup ?? ""} onChange={e => upLevel(i, { setup: e.target.value })} placeholder="Markers, camera" /></label>
            </div>
          )}
          {p.kind === "checklist" && (
            <>{(l.criteria ?? []).map((c, j) => (
              <label key={j}>Criterion {j + 1}<input value={c.label} onChange={e => upLevel(i, { criteria: (l.criteria ?? []).map((x, k) => (k === j ? { ...x, label: e.target.value } : x)) })} /></label>
            ))}<button type="button" className="link-btn" onClick={() => upLevel(i, { criteria: [...(l.criteria ?? []), { key: `c${(l.criteria ?? []).length + 1}`, label: "" }] })}>+ Add criterion</button></>
          )}
          <button type="button" className="link-btn" onClick={() => up({ levels: v.levels.filter((_, j) => j !== i) })}>Remove level</button>
        </div>
      ))}
      <button type="button" className="btn" onClick={() => up({ levels: [...v.levels, blankLevel(p, v.levels.length + 1)] })}>Add level</button>

      <h3>Protocol sheet</h3>
      {SHEET_FIELDS.map(([k, label, ph]) => (
        <label key={k}>{label}<textarea rows={k === "procedure" ? 4 : 2} placeholder={ph} value={v.sheet[k] ?? ""} onChange={e => up({ sheet: { ...v.sheet, [k]: e.target.value } })} /></label>
      ))}
      <label>Notes on this version<textarea rows={2} value={v.notes ?? ""} onChange={e => up({ notes: e.target.value })} /></label>

      {msg && <p className={"msg" + (msg.error ? " error" : "")} role="status">{msg.text}</p>}
      <div className="done-actions">
        <button className="btn primary" disabled={!dirty} onClick={save}>Save draft</button>
        {problems.length || dirty
          ? <span className="hint">{dirty ? "Save before publishing." : "To publish: " + problems.join(" ")}</span>
          : <ConfirmButton className="btn" label="Publish and lock" confirm="Tap again — this can't be undone" onConfirm={onPublish} />}
      </div>
    </section>
  );
}

function RoundsEditor({ rounds, onChange }: { rounds: RepsRound[]; onChange: (r: RepsRound[]) => void }) {
  const set = (i: number, patch: Partial<RepsRound>) => onChange(rounds.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const n = (s: string) => Math.max(0, Number(s) || 0);
  return (
    <>
      {rounds.map((r, i) => (
        <div key={i} className="field-pair mm-round">
          <label>Round<input value={r.name} onChange={e => set(i, { name: e.target.value })} /></label>
          <label>Stroke<select value={r.stroke} onChange={e => set(i, { stroke: e.target.value })}>{STROKES.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Reps<input type="number" min={1} value={r.reps} onChange={e => set(i, { reps: n(e.target.value) })} /></label>
          <label>Distance<input type="number" min={1} value={r.distance} onChange={e => set(i, { distance: n(e.target.value) })} /></label>
          <label>Send-off (s)<input type="number" min={0} value={r.interval ?? ""} onChange={e => set(i, { interval: e.target.value === "" ? null : n(e.target.value) })} /></label>
          <label>Rest after (s)<input type="number" min={0} value={r.restAfterSec} onChange={e => set(i, { restAfterSec: n(e.target.value) })} /></label>
          <button type="button" className="link-btn" onClick={() => onChange(rounds.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className="link-btn" onClick={() => onChange([...rounds, { ...(rounds[rounds.length - 1] ?? { stroke: "Freestyle", reps: 4, distance: 100, interval: 120, restAfterSec: 60 }), key: `r${Math.max(0, ...rounds.map(x => Number(x.key.slice(1)) || 0)) + 1}`, name: `Part ${String.fromCharCode(65 + rounds.length)}` }])}>+ Add round</button>
    </>
  );
}
