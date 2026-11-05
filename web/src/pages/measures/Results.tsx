import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClub } from "../../club/ClubProvider";
import { ClubPicker } from "../../club/ClubPicker";
import { loadSwimmersByIds } from "../../lib/tests";
import {
  CAUTION_LABEL, FLAG_LABEL, fmtChange, fmtValue, loadProtocol, loadProtocolResults, loadProtocols, setRebaseline, unitOf, versionLabel,
  type Flag, type MmResult
} from "../../lib/measures";
import { fmtDate } from "../../lib/util";
import { MBack, NoAccess, useMeasuresAccess } from "./Measures";

// Results: each swimmer against their OWN baseline and previous result, on one
// protocol and level. Listed by name — never in order of result — with the
// change flagged against the test's typical error. Squad-level figures are
// counts (how many improved beyond noise), not a league table.

const flagChip = (f: Flag | null | undefined) => (f ? <span className={"chip mm-flag mm-" + f}>{FLAG_LABEL[f]}</span> : <span className="dim">–</span>);

export function Results() {
  const { canView, canRun } = useMeasuresAccess();
  const { club } = useClub();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const pid = params.get("protocol") ?? "";
  const level = params.get("level") ?? "";
  const swimmerId = params.get("swimmer") ?? "";
  const set = (k: string, val: string) => setParams(prev => { const n = new URLSearchParams(prev); if (val) n.set(k, val); else n.delete(k); if (k === "protocol") { n.delete("level"); n.delete("swimmer"); } return n; }, { replace: true });

  const protocols = useQuery({ queryKey: ["mm_protocols", club], enabled: !!club && canView, queryFn: () => loadProtocols(club!) });
  const detail = useQuery({ queryKey: ["mm_protocol", pid], enabled: !!pid, queryFn: () => loadProtocol(pid) });
  const results = useQuery({ queryKey: ["mm_results_all", club, pid], enabled: !!club && !!pid, queryFn: () => loadProtocolResults(club!, pid) });
  const ids = useMemo(() => [...new Set((results.data ?? []).map(r => r.swimmer_id))], [results.data]);
  const names = useQuery({ queryKey: ["mm_names", ids.join(",")], enabled: ids.length > 0, queryFn: () => loadSwimmersByIds(ids) });
  if (!canView) return <><MBack /><NoAccess /></>;

  const p = detail.data?.protocol;
  const versions = detail.data?.versions ?? [];
  const latestV = versions.find(v => v.published_at) ?? versions[0];
  const unit = p && latestV ? unitOf(p, latestV) : "";
  const levels = levelsOf(versions);
  const nameOf = new Map((names.data ?? []).map(s => [s.id, s]));
  const closed = (results.data ?? []).filter(r => r.flag);           // linked = in a closed session with a value
  const inLevel = closed.filter(r => !level || r.level_key === level);

  // Latest linked result per swimmer × major × level.
  const latest = new Map<string, MmResult>();
  for (const r of inLevel) { const k = `${r.swimmer_id}|${r.major}|${r.level_key}`; const cur = latest.get(k); if (!cur || (r.session_date ?? "") >= (cur.session_date ?? "")) latest.set(k, r); }
  const rows = [...latest.values()].sort((a, b) => (nameOf.get(a.swimmer_id)?.full_name ?? "").localeCompare(nameOf.get(b.swimmer_id)?.full_name ?? ""));
  const counts: Partial<Record<Flag, number>> = {};
  for (const r of rows) if (r.flag) counts[r.flag] = (counts[r.flag] ?? 0) + 1;
  const baselineOnly = rows.filter(r => r.flag === "baseline").length;
  const byId = new Map((results.data ?? []).map(r => [r.id!, r]));

  return (
    <>
      <MBack />
      <div className="page-head row"><div><h1>Results</h1><p className="dim">Each swimmer against their own baseline. Listed by name, never ranked.</p></div><ClubPicker /></div>
      <div className="field-pair">
        <label>Protocol<select value={pid} onChange={e => set("protocol", e.target.value)}>
          <option value="">— choose —</option>
          {(protocols.data ?? []).filter(x => x.status !== "draft").map(x => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
        </select></label>
        {pid && <label>Level<select value={level} onChange={e => set("level", e.target.value)}>
          <option value="">All levels</option>{levels.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}</select></label>}
      </div>

      {!pid ? <p className="dim">Choose a protocol.</p>
        : results.isLoading ? <p className="dim">Loading…</p>
        : !rows.length ? <p className="dim">No closed results for this protocol yet.</p>
        : swimmerId ? <SwimmerHistory all={closed.filter(r => r.swimmer_id === swimmerId)} name={nameOf.get(swimmerId)?.full_name ?? ""} unit={unit}
            levelLabel={k => levels.find(l => l.key === k)?.label ?? k} back={() => set("swimmer", "")} canRun={canRun} byId={byId}
            onRebaseline={async (rid, reason) => { await setRebaseline(rid, reason); await qc.invalidateQueries({ queryKey: ["mm_results_all"] }); }} />
        : (
          <>
            <section className="card">
              <h2>Squad picture</h2>
              <p className="hint">Latest result of each swimmer{level ? " on this level" : ""}, compared with their own previous result.</p>
              <div className="stat-row">
                {(["improved", "noise", "declined", "caution", "no_reliability"] as Flag[]).filter(f => counts[f]).map(f => (
                  <div key={f} className="stat"><span className="stat-label">{FLAG_LABEL[f]}</span><span className="stat-value">{counts[f]}</span></div>))}
                <div className="stat"><span className="stat-label">Baseline only</span><span className="stat-value">{baselineOnly}</span><span className="stat-note">Not retested yet</span></div>
              </div>
            </section>
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Swimmer</th><th>Baseline</th><th>Latest</th><th>Change</th></tr></thead>
              <tbody>{rows.map(r => {
                const n = nameOf.get(r.swimmer_id); const base = r.baseline_id ? byId.get(r.baseline_id) : r;
                return (
                  <tr key={r.id}>
                    <th scope="row"><button className="link-btn" onClick={() => set("swimmer", r.swimmer_id)}>{n?.full_name ?? "…"}</button>
                      <div className="dim">{n?.squad ?? ""}{n?.squad ? " · " : ""}{levels.find(l => l.key === r.level_key)?.label ?? r.level_key}{r.major ? ` · v${r.major}` : ""}</div>
                      <div>{flagChip(r.flag)}</div></th>
                    <td>{fmtValue(base?.value, unit)}<div className="dim">{fmtDate(base?.session_date)}</div></td>
                    <td>{fmtValue(r.value, unit)}<div className="dim">{fmtDate(r.session_date)}</div></td>
                    <td>{r.is_baseline ? <span className="dim">Baseline only</span> : <>
                      <div>{fmtChange(r.change_prev, unit)}{" "}<span className="dim">since previous{r.days_since_prev != null ? ` (${r.days_since_prev} days)` : ""}</span></div>
                      <div>{fmtChange(r.change_base, unit)}{" "}<span className="dim">since baseline{r.days_since_base ? ` (${r.days_since_base} days)` : ""}</span></div></>}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            <p className="hint">"Real" change is more than twice the test's typical error. Off-cycle, not-as-written, too-soon and pilot results are marked "compare with caution".</p>
          </>
        )}
      {latestV && <p className="hint">Current version {versionLabel(latestV)}. Results from different major versions are separate series.</p>}
    </>
  );
}

function levelsOf(versions: { levels: { key: string; label: string }[] }[]) {
  const m = new Map<string, string>();
  for (const v of versions) for (const l of v.levels) if (!m.has(l.key)) m.set(l.key, l.label);
  return [...m].map(([key, label]) => ({ key, label }));
}

function SwimmerHistory({ all, name, unit, levelLabel, back, canRun, onRebaseline, byId }: {
  all: MmResult[]; name: string; unit: string; levelLabel: (k: string) => string; back: () => void; canRun: boolean;
  onRebaseline: (id: string, reason: string | null) => Promise<void>; byId: Map<string, MmResult>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const series = new Map<string, MmResult[]>();
  for (const r of [...all].sort((a, b) => (a.session_date ?? "").localeCompare(b.session_date ?? ""))) {
    const k = `${r.level_key}|${r.major}`; (series.get(k) ?? series.set(k, []).get(k)!).push(r);
  }
  return (
    <>
      <p><button className="link-btn" onClick={back}>‹ All swimmers</button></p>
      <h2>{name}</h2>
      {[...series].map(([k, list]) => (
        <section key={k} className="card">
          <h3>{levelLabel(list[0].level_key)} <span className="dim">· v{list[0].major}</span></h3>
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Date</th><th>Result</th><th>Since previous</th><th>Since baseline</th><th>Flag</th>{canRun && <th />}</tr></thead>
            <tbody>{list.map(r => (
              <tr key={r.id}>
                <td>{fmtDate(r.session_date)}{r.days_since_prev != null && !r.is_baseline ? <div className="dim">{r.days_since_prev} days later</div> : null}</td>
                <td>{fmtValue(r.value, unit)}</td>
                <td>{r.is_baseline ? "–" : fmtChange(r.change_prev, unit)}</td>
                <td>{r.is_baseline ? "–" : fmtChange(r.change_base, unit)}{r.baseline_id && byId.get(r.baseline_id) ? <div className="dim">from {fmtDate(byId.get(r.baseline_id)!.session_date)}</div> : null}</td>
                <td>{flagChip(r.flag)}{!!r.caution?.length && <div className="dim">{r.caution.map(c => CAUTION_LABEL[c] ?? c).join("; ")}</div>}
                  {r.rebaseline_reason && <div className="dim">New baseline: {r.rebaseline_reason}</div>}</td>
                {canRun && <td>{r.rebaseline_reason
                  ? <button className="link-btn" onClick={() => onRebaseline(r.id!, null).catch(e => setErr((e as Error).message))}>Undo new baseline</button>
                  : !r.is_baseline && <button className="link-btn" onClick={() => { setEditing(r.id!); setReason(""); }}>Start new baseline here</button>}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      ))}
      {editing && (
        <section className="card">
          <h3>Start a new baseline</h3>
          <p className="hint">Use this when earlier results no longer compare fairly, e.g. after a long injury break or a major technique change.</p>
          <label>Reason<input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. back after 6 weeks injured" /></label>
          {err && <p className="msg error">{err}</p>}
          <div className="done-actions"><button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" disabled={!reason.trim()} onClick={async () => { try { await onRebaseline(editing, reason); setEditing(null); } catch (e) { setErr((e as Error).message); } }}>Save</button></div>
        </section>
      )}
    </>
  );
}
